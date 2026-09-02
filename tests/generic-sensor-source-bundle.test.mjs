import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  assertAuthorizedDecision,
  assertNoProductionExposure,
  canonicalJson,
  canonicalManifestDigest,
  parseBoundedZip,
  sha256,
  summarizeLegalDecisionState,
  verifyGenericSensorSourceBundle,
} from "../scripts/lib/generic-sensor-source-verifier.mjs";

const root = resolve("governance/generic-sensor-verification-sources");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.v1.json"), "utf8"));
const decisions = JSON.parse(readFileSync(resolve(root, "legal-decisions.v1.json"), "utf8"));

function clone(value) {
  return structuredClone(value);
}

function assertHostedRendererProvisioning(workflow, installer, dockerfile, wrapper) {
  const setupJob = workflow.slice(workflow.indexOf("  generic_sensor_renderer:\n"), workflow.indexOf("  quality:\n"));
  assert.match(setupJob, /needs\.classify\.outputs\.web_tests == 'true'/u);
  assert.match(setupJob, /actions\/cache@0057852bfaa89a56745cba8c7296529d2fc39830/u);
  assert.match(setupJob, /Build or load the pinned renderer once/u);
  assert.match(setupJob, /scripts\/install-pinned-poppler-ubuntu\.sh/u);
  const jobSlices = [
    {
      job: workflow.slice(workflow.indexOf("  quality:\n"), workflow.indexOf("  security_js:\n")),
      verifyCommand: "npm run generic-sensor:sources:verify",
    },
    {
      job: workflow.slice(workflow.indexOf("  web_tests:\n"), workflow.indexOf("  rust_tests:\n")),
      verifyCommand: "run: npm test",
    },
    {
      job: workflow.slice(workflow.indexOf("  integration:\n"), workflow.indexOf("  container:\n")),
      verifyCommand: "npm run generic-sensor:sources:verify",
    },
  ];
  for (const { job, verifyCommand } of jobSlices) {
    const installAt = job.indexOf("run: scripts/install-pinned-poppler-ubuntu.sh");
    const verifyAt = job.indexOf(verifyCommand);
    assert.ok(installAt >= 0 && verifyAt > installAt, "each hosted verifier job must provision the renderer first");
  }
  assert.match(jobSlices[1].job, /needs: \[classify, generic_sensor_renderer\]/u);
  assert.match(installer, /readonly poppler_version="26\.05\.0"/u);
  assert.match(installer, /readonly poppler_sha256="6fef27ff04f37db43054c86bcdff6128c9fb1f6af4ef3c8b369a7e9abd68d0bb"/u);
  assert.match(installer, /sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517/u);
  assert.match(installer, /https:\/\/poppler\.freedesktop\.org\/poppler-\$\{poppler_version\}\.tar\.xz/u);
  assert.match(installer, /sha256sum --check --strict/u);
  assert.match(installer, /for tool in pdftoppm pdfinfo/u);
  assert.match(installer, /"\$\{bin_dir\}\/\$\{tool\}" -v/u);
  assert.match(
    installer,
    /s\|@@GITHUB_WORKSPACE@@\|\$\{GITHUB_WORKSPACE\}\|g/u,
    "every workspace placeholder in the generated wrapper must be replaced",
  );
  assert.match(dockerfile, /^FROM @@UBUNTU_IMAGE@@/u);
  assert.match(dockerfile, /@@POPPLER_SHA256@@/u);
  assert.match(dockerfile, /cmake --build \/tmp\/poppler\/build --target pdftoppm pdfinfo --parallel 2/u);
  assert.doesNotMatch(
    dockerfile,
    /ENTRYPOINT \["\/tmp\//u,
    "the renderer executable cannot live below /tmp because the wrapper bind-mounts that path",
  );
  assert.match(dockerfile, /cp \/tmp\/poppler\/build\/utils\/pdftoppm \/opt\/poppler\/bin\/pdftoppm/u);
  assert.match(dockerfile, /cp \/tmp\/poppler\/build\/utils\/pdfinfo \/opt\/poppler\/bin\/pdfinfo/u);
  assert.match(dockerfile, /cp -a \/tmp\/poppler\/build\/libpoppler\.so\* \/opt\/poppler\/lib\//u);
  assert.match(dockerfile, /ENV LD_LIBRARY_PATH=\/opt\/poppler\/lib/u);
  assert.match(dockerfile, /ENTRYPOINT \["\/opt\/poppler\/bin\/pdftoppm"\]/u);
  assert.match(wrapper, /docker run --rm --network none/u);
  assert.match(wrapper, /--entrypoint "\/opt\/poppler\/bin\/@@TOOL@@"/u);
  assert.match(wrapper, /--volume "\/tmp:\/tmp"/u);
  assert.equal((workflow.match(/Restore the content-keyed renderer image/gu) ?? []).length, 4);
}

function seal(value) {
  value.canonicalManifestDigest = canonicalManifestDigest(value);
  return value;
}

function artifactDescriptor(manifestValue, path) {
  const candidates = [manifestValue.visualInspection, manifestValue.legalDecisions, manifestValue.legalAuthorityRegistry, manifestValue.redistributionAuthority, manifestValue.isolationEvidence];
  for (const source of manifestValue.sources) {
    candidates.push(...source.artifacts, source.archiveInventory);
    for (const member of source.extractedMembers ?? []) candidates.push(member.extractedArtifact);
    for (const page of source.renderPages ?? []) {
      candidates.push(...Object.values(page.sourceRenders), ...Object.values(page.displayRenders ?? {}));
    }
  }
  return candidates.find((candidate) => candidate?.path === path);
}

function replaceArtifact(manifestValue, overrides, path, bytes) {
  const descriptor = artifactDescriptor(manifestValue, path);
  assert.ok(descriptor, `missing test artifact descriptor for ${path}`);
  descriptor.sizeBytes = bytes.length;
  descriptor.sha256 = sha256(bytes);
  overrides.set(path, bytes);
}

function finalizeIsolationOverride(manifestValue, overrides, mutate = () => {}) {
  const isolation = JSON.parse(readFileSync(resolve(root, manifestValue.isolationEvidence.path), "utf8"));
  mutate(isolation);
  const artifacts = new Map();
  const collect = (candidate) => {
    if (candidate?.path && Number.isInteger(candidate.sizeBytes)) artifacts.set(candidate.path, candidate);
  };
  for (const source of manifestValue.sources) {
    for (const artifact of source.artifacts) collect(artifact);
    collect(source.archiveInventory);
    for (const member of source.extractedMembers ?? []) collect(member.extractedArtifact);
    for (const page of source.renderPages ?? []) {
      for (const candidate of Object.values(page.sourceRenders)) collect(candidate);
      for (const candidate of Object.values(page.displayRenders ?? {})) collect(candidate);
    }
  }
  collect(manifestValue.visualInspection);
  collect(manifestValue.legalDecisions);
  collect(manifestValue.legalAuthorityRegistry);
  collect(manifestValue.redistributionAuthority);
  isolation.frozenArtifactCount = artifacts.size;
  isolation.frozenArtifactBytes = [...artifacts.values()].reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  const bytes = Buffer.from(`${JSON.stringify(isolation, null, 2)}\n`);
  replaceArtifact(manifestValue, overrides, manifestValue.isolationEvidence.path, bytes);
}

function mutateOneByte(bytes) {
  const changed = Buffer.from(bytes);
  changed[Math.floor(changed.length / 2)] ^= 0x01;
  return changed;
}

function callerControlledAuthorityFixture(pendingDecision) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const sourceId = pendingDecision.sourceId;
  const decisionField = "referenceExecution";
  const approval = {
    state: "APPROVED",
    reviewer: { kind: "AUTHORIZED_HUMAN", id: "reviewer-001" },
    decisionRecordId: "decision-001",
    decidedOn: "2026-08-24",
    jurisdiction: "IN",
    scope: ["OFFLINE_REFERENCE_EXECUTION"],
    conditions: ["OFFLINE_ONLY"],
    evidenceSha256: "1".repeat(64),
    blockingReason: null,
  };
  const payload = {
    schemaVersion: "vector.generic-sensor-verification-legal-attestation-payload.v1",
    registryId: "test-authority-registry",
    decisionArtifactId: decisions.decisionArtifactId,
    decisionRecordId: approval.decisionRecordId,
    sourceId,
    decisionField,
    reviewerId: approval.reviewer.id,
    decidedOn: approval.decidedOn,
    jurisdiction: approval.jurisdiction,
    scope: approval.scope,
    conditions: approval.conditions,
    evidenceSha256: approval.evidenceSha256,
  };
  const payloadBytes = Buffer.from(canonicalJson(payload));
  const authorityRegistry = {
    schemaVersion: "vector.generic-sensor-verification-legal-authority-registry.v1",
    registryId: payload.registryId,
    subjectDecisionArtifactId: decisions.decisionArtifactId,
    authorityPolicyId: "generic-sensor-legal-authority-policy-v1",
    externalTrustRootRequired: true,
    status: "SIGNED_DECISION_RECORDS_PRESENT_UNVERIFIED",
    blockingReason: "CALLER_ROOT_IS_NOT_GOVERNED",
    decisionRecords: [{
      ...payload,
      attestation: {
        algorithm: "Ed25519",
        keyId: "test-external-root",
        payloadSha256: sha256(payloadBytes),
        signatureBase64: sign(null, payloadBytes, privateKey).toString("base64"),
      },
    }],
  };
  const decision = clone(pendingDecision);
  decision[decisionField] = approval;
  return {
    decision,
    decisionField,
    authorityRegistry,
    requirement: {
      sourceId,
      jurisdiction: approval.jurisdiction,
      scope: approval.scope[0],
      authorityRegistry,
      trustedAuthorityRoots: new Map([["test-external-root", publicKey]]),
    },
  };
}

function forgedBundleWithCallerRoot({ useFieldSpecificScopes = false } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const evidencePath = "governance/generic-sensor-legal-decision-evidence/README.md";
  const evidenceBytes = readFileSync(resolve(evidencePath));
  const evidenceArtifact = { path: evidencePath, sizeBytes: evidenceBytes.length, sha256: sha256(evidenceBytes) };
  const forgedLegal = clone(decisions);
  const forgedRegistry = {
    schemaVersion: "vector.generic-sensor-verification-legal-authority-registry.v1",
    registryId: "generic-sensor-source-legal-authority-registry-v1",
    subjectDecisionArtifactId: decisions.decisionArtifactId,
    authorityPolicyId: "generic-sensor-legal-authority-policy-v1",
    externalTrustRootRequired: true,
    status: "SIGNED_DECISION_RECORDS_PRESENT_UNVERIFIED",
    blockingReason: "CALLER_ROOT_IS_NOT_GOVERNED",
    decisionRecords: [],
  };
  for (const decision of forgedLegal.decisions) {
    for (const field of ["redistribution", "referenceExecution", "adaptation"]) {
      const fieldScope = {
        redistribution: "REDISTRIBUTE_FROZEN_SOURCE_BYTES",
        referenceExecution: "OFFLINE_REFERENCE_EXECUTION",
        adaptation: "ADAPT_SOURCE_FOR_VERIFICATION",
      }[field];
      decision[field] = {
        state: "APPROVED",
        reviewer: { kind: "AUTHORIZED_HUMAN", id: "caller-controlled-reviewer" },
        decisionRecordId: `${decision.sourceId}-${field.toLowerCase()}`,
        decidedOn: "2026-08-24",
        jurisdiction: "IN",
        scope: [useFieldSpecificScopes ? fieldScope : "OFFLINE_REFERENCE_EXECUTION"],
        conditions: ["CALLER_CONTROLLED"],
        evidenceSha256: evidenceArtifact.sha256,
        blockingReason: null,
      };
      const payload = {
        schemaVersion: "vector.generic-sensor-verification-legal-attestation-payload.v1",
        registryId: forgedRegistry.registryId,
        decisionArtifactId: decisions.decisionArtifactId,
        decisionRecordId: decision[field].decisionRecordId,
        sourceId: decision.sourceId,
        decisionField: field,
        reviewerId: decision[field].reviewer.id,
        decidedOn: decision[field].decidedOn,
        jurisdiction: decision[field].jurisdiction,
        scope: decision[field].scope,
        conditions: decision[field].conditions,
        evidenceSha256: decision[field].evidenceSha256,
        evidenceArtifact,
      };
      const payloadBytes = Buffer.from(canonicalJson(payload));
      forgedRegistry.decisionRecords.push({
        ...payload,
        attestation: {
          algorithm: "Ed25519",
          keyId: "caller-controlled-root",
          payloadSha256: sha256(payloadBytes),
          signatureBase64: sign(null, payloadBytes, privateKey).toString("base64"),
        },
      });
    }
  }
  const legalBytes = Buffer.from(`${JSON.stringify(forgedLegal, null, 2)}\n`);
  const registryBytes = Buffer.from(`${JSON.stringify(forgedRegistry, null, 2)}\n`);
  const forgedManifest = clone(manifest);
  const oldLegalBytes = forgedManifest.legalDecisions.sizeBytes;
  const oldRegistryBytes = forgedManifest.legalAuthorityRegistry.sizeBytes;
  forgedManifest.legalDecisions.sizeBytes = legalBytes.length;
  forgedManifest.legalDecisions.sha256 = sha256(legalBytes);
  forgedManifest.legalAuthorityRegistry.sizeBytes = registryBytes.length;
  forgedManifest.legalAuthorityRegistry.sha256 = sha256(registryBytes);
  const isolation = JSON.parse(readFileSync(resolve(root, forgedManifest.isolationEvidence.path), "utf8"));
  isolation.frozenArtifactBytes += legalBytes.length - oldLegalBytes + registryBytes.length - oldRegistryBytes;
  const isolationBytes = Buffer.from(`${JSON.stringify(isolation, null, 2)}\n`);
  forgedManifest.isolationEvidence.sizeBytes = isolationBytes.length;
  forgedManifest.isolationEvidence.sha256 = sha256(isolationBytes);
  return {
    manifest: seal(forgedManifest),
    artifactOverrides: new Map([
      [forgedManifest.legalDecisions.path, legalBytes],
      [forgedManifest.legalAuthorityRegistry.path, registryBytes],
      [forgedManifest.isolationEvidence.path, isolationBytes],
    ]),
    trustedAuthorityRoots: new Map([["caller-controlled-root", publicKey]]),
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data ?? "", "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((entry.externalAttributes ?? (0o100644 << 16)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

test("the committed source freeze verifies exact immutable bytes and remains blocked for execution", async () => {
  const report = verifyGenericSensorSourceBundle({ root });
  assert.equal(report.schemaVersion, "vector.generic-sensor-verification-source-report.v1");
  assert.equal(report.sourceCount, 5);
  assert.equal(report.decisionState, "BLOCKED_PENDING_HUMAN_REVIEW");
  assert.equal(report.productionExposures, 0);
  assert.equal(report.withdrawnDigestPresent, false);
  for (const page of [8, 11, 14]) {
    const stem = String(page).padStart(3, "0");
    const source = readFileSync(resolve(root, `renders/19800011044/pdf-${stem}.png`));
    const display = readFileSync(resolve(root, `renders/19800011044/pdf-${stem}-display-upright.png`));
    const reproduced = await sharp(source).rotate(90).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
    assert.equal(sha256(reproduced), sha256(display));
  }
});

test("the focused gate denies network APIs before verifying frozen local bytes", () => {
  const guard = resolve("scripts/lib/generic-sensor-network-deny.cjs");
  for (const probe of [
    "require('node:net').connect(9, '127.0.0.1')",
    "require('node:http').get('http://127.0.0.1:9')",
    "require('node:dns').lookup('example.invalid', () => {})",
  ]) {
    const result = spawnSync(process.execPath, ["--require", guard, "--eval", probe], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NETWORK_ACCESS_DISABLED/);
  }

  const callbackProbe = String.raw`
    const dns = require("node:dns");
    const target = TARGET;
    const names = NAMES;
    const unblocked = [];
    for (const name of names) {
      const args = name === "lookupService"
        ? ["127.0.0.1", 80, () => {}]
        : name === "reverse"
          ? ["127.0.0.1", () => {}]
          : ["localhost", () => {}];
      try {
        target[name](...args);
        unblocked.push(name);
      } catch (error) {
        if (!String(error?.message).startsWith("NETWORK_ACCESS_DISABLED:")) throw error;
      }
    }
    if (unblocked.length > 0) throw new Error("UNBLOCKED_DNS_METHODS:" + unblocked.join(","));
  `;
  const promiseProbe = String.raw`
    const dns = require("node:dns");
    const target = TARGET;
    const names = NAMES;
    const unblocked = [];
    for (const name of names) {
      const args = name === "lookupService" ? ["127.0.0.1", 80] : name === "reverse" ? ["127.0.0.1"] : ["localhost"];
      try {
        const pending = target[name](...args);
        pending?.catch?.(() => {});
        unblocked.push(name);
      } catch (error) {
        if (!String(error?.message).startsWith("NETWORK_ACCESS_DISABLED:")) throw error;
      }
    }
    if (unblocked.length > 0) throw new Error("UNBLOCKED_DNS_PROMISE_METHODS:" + unblocked.join(","));
  `;
  const moduleMethods = "Object.getOwnPropertyNames(target).filter((name) => [\"lookup\", \"lookupService\", \"reverse\"].includes(name) || name.startsWith(\"resolve\")).filter((name) => typeof target[name] === \"function\")";
  const resolverMethods = "Object.getOwnPropertyNames(Object.getPrototypeOf(target)).filter((name) => name === \"reverse\" || name.startsWith(\"resolve\")).filter((name) => typeof target[name] === \"function\")";
  for (const [label, script] of [
    ["dns callback module", callbackProbe.replace("TARGET", "dns").replace("NAMES", moduleMethods)],
    ["dns callback Resolver", callbackProbe.replace("TARGET", "new dns.Resolver()").replace("NAMES", resolverMethods)],
    ["dns.promises module", promiseProbe.replace("TARGET", "dns.promises").replace("NAMES", moduleMethods)],
    ["node:dns/promises module", promiseProbe.replace("TARGET", "require('node:dns/promises')").replace("NAMES", moduleMethods)],
    ["dns.promises Resolver", promiseProbe.replace("TARGET", "new dns.promises.Resolver()").replace("NAMES", resolverMethods)],
  ]) {
    const result = spawnSync(process.execPath, ["--require", guard, "--eval", script], { encoding: "utf8", timeout: 3_000 });
    assert.equal(result.status, 0, `${label} escaped deny-all guard:\n${result.stderr}`);
  }

  for (const probe of [
    "import { resolveAny, resolveTxt, reverse } from 'node:dns'; for (const [fn, arg] of [[resolveAny, 'localhost'], [resolveTxt, 'localhost'], [reverse, '127.0.0.1']]) { try { fn(arg, () => {}); throw new Error('UNBLOCKED_ESM_DNS'); } catch (error) { if (!String(error?.message).startsWith('NETWORK_ACCESS_DISABLED:')) throw error; } }",
    "import { resolveAny, resolveTxt, reverse } from 'node:dns/promises'; for (const [fn, arg] of [[resolveAny, 'localhost'], [resolveTxt, 'localhost'], [reverse, '127.0.0.1']]) { try { fn(arg); throw new Error('UNBLOCKED_ESM_DNS_PROMISES'); } catch (error) { if (!String(error?.message).startsWith('NETWORK_ACCESS_DISABLED:')) throw error; } }",
  ]) {
    const result = spawnSync(process.execPath, ["--require", guard, "--input-type=module", "--eval", probe], { encoding: "utf8", timeout: 3_000 });
    assert.equal(result.status, 0, `ESM DNS export escaped deny-all guard:\n${result.stderr}`);
  }
});

test("one-byte mutation, wrong size, wrong report, wrong page, and withdrawn CR-160557 identity fail", () => {
  const pdfPath = "raw/nasa/19800011044.pdf";
  const pdf = readFileSync(resolve(root, pdfPath));
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, artifactOverrides: new Map([[pdfPath, mutateOneByte(pdf)]]) }),
    /digest mismatch/,
  );

  const wrongSize = clone(manifest);
  wrongSize.sources.find((source) => source.id === "nasa-cr-160557").artifacts[1].sizeBytes += 1;
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(wrongSize) }), /size mismatch/);

  const wrongReport = clone(manifest);
  wrongReport.sources.find((source) => source.id === "nasa-cr-160557").reportNumber = "NASA-CR-160558";
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(wrongReport) }), /wrong frozen NASA identity/);

  const wrongPage = clone(manifest);
  wrongPage.sources.find((source) => source.id === "nasa-cr-160557").relevantLocations[0].pdfPages[0] = 4;
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(wrongPage) }), /wrong relevant page mapping/);

  const wrongRenderPage = clone(manifest);
  wrongRenderPage.sources.find((source) => source.id === "nasa-cr-66097").renderPages.find((page) => page.sourcePdfPage === 143).sourcePdfPage = 142;
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(wrongRenderPage) }), /wrong render page mapping/);

  const incompleteRenderRecipe = clone(manifest);
  delete incompleteRenderRecipe.renderRecipe.uprightDisplayRender.pngEncoder;
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(incompleteRenderRecipe) }), /wrong offline render recipe/);

  const withdrawn = clone(manifest);
  withdrawn.sources.find((source) => source.id === "nasa-cr-160557").artifacts[1].sha256 =
    "99cc854a00000000000000000000000000000000000000000000000000000000";
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(withdrawn) }), /withdrawn CR-160557 digest/);
});

test("caller resealing cannot rewrite the canonical source, render, claim, or policy identity", () => {
  for (const mutate of [
    (candidate) => { candidate.subjectId = "caller-resealed-subject"; },
    (candidate) => { candidate.sources[0].canonicalUrl = "https://example.test/caller-resealed-source"; },
    (candidate) => { candidate.sources[0].publisher = "CALLER"; },
    (candidate) => { candidate.sources[0].title = "Caller-resealed title"; },
    (candidate) => { candidate.sources[1].extractedTextPolicy.maySupplyNumericValues = true; },
    (candidate) => { candidate.sources[1].extractedTextPolicy.maySupplyEquations = true; },
    (candidate) => { candidate.sources[1].eligibleClaims = []; },
    (candidate) => { candidate.sources[1].ineligibleClaims = []; },
  ]) {
    const resealed = clone(manifest);
    mutate(resealed);
    assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(resealed) }), /pinned canonical manifest/);
  }

  const rewrittenIdentity = clone(manifest);
  const identityOverrides = new Map();
  rewrittenIdentity.manifestId = "caller-resealed-source-freeze-v1";
  const legal = JSON.parse(readFileSync(resolve(root, rewrittenIdentity.legalDecisions.path), "utf8"));
  legal.subjectManifestId = rewrittenIdentity.manifestId;
  replaceArtifact(rewrittenIdentity, identityOverrides, rewrittenIdentity.legalDecisions.path, Buffer.from(`${JSON.stringify(legal, null, 2)}\n`));
  finalizeIsolationOverride(rewrittenIdentity, identityOverrides, (isolation) => { isolation.subjectManifestId = rewrittenIdentity.manifestId; });
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(rewrittenIdentity), artifactOverrides: identityOverrides }),
    /release-owner visual review|source-terms authority identity|pinned canonical manifest/,
  );

  const substitutedPdf = clone(manifest);
  const pdfOverrides = new Map();
  replaceArtifact(
    substitutedPdf,
    pdfOverrides,
    "raw/nasa/19660021027.pdf",
    readFileSync(resolve(root, "raw/nasa/19770023372.pdf")),
  );
  finalizeIsolationOverride(substitutedPdf, pdfOverrides);
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(substitutedPdf), artifactOverrides: pdfOverrides }),
    /size mismatch|pinned canonical manifest/,
  );

  const communityArtifact = clone(manifest);
  const communityOverrides = new Map();
  replaceArtifact(
    communityArtifact,
    communityOverrides,
    "raw/nasa/19660021027.pdf",
    Buffer.from("DCS and War Thunder community dump substituted for an official source"),
  );
  finalizeIsolationOverride(communityArtifact, communityOverrides);
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(communityArtifact), artifactOverrides: communityOverrides }),
    /size mismatch|pinned canonical manifest/,
  );

  const relabelledRender = clone(manifest);
  const renderOverrides = new Map();
  replaceArtifact(
    relabelledRender,
    renderOverrides,
    "renders/19660021027/pdf-143.png",
    readFileSync(resolve(root, "renders/19660021027/pdf-144.png")),
  );
  finalizeIsolationOverride(relabelledRender, renderOverrides);
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(relabelledRender), artifactOverrides: renderOverrides }),
    /release-owner visual review|pinned canonical manifest/,
  );
});

test("repacked or structurally unsafe archives and undeclared members fail before extraction", () => {
  const archivePath = "raw/stone-soup/Stone-Soup-v1.9.1.zip";
  const archive = readFileSync(resolve(root, archivePath));
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, artifactOverrides: new Map([[archivePath, mutateOneByte(archive)]]) }),
    /digest mismatch/,
  );
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, artifactOverrides: new Map([[archivePath, storedZip([{ name: "repacked.txt", data: "same logical source, different container" }])]]) }),
    /size mismatch|digest mismatch/,
  );

  const inventoryPath = "archive-inventory.v1.json";
  const undeclaredInventory = JSON.parse(readFileSync(resolve(root, inventoryPath), "utf8"));
  undeclaredInventory.entryCount += 1;
  const undeclaredBytes = Buffer.from(`${JSON.stringify(undeclaredInventory, null, 2)}\n`);
  const undeclaredManifest = clone(manifest);
  const inventoryArtifact = undeclaredManifest.sources.find((source) => source.id === "dstl-stone-soup-v1.9.1").archiveInventory;
  inventoryArtifact.sizeBytes = undeclaredBytes.length;
  inventoryArtifact.sha256 = sha256(undeclaredBytes);
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(undeclaredManifest), artifactOverrides: new Map([[inventoryPath, undeclaredBytes]]) }),
    /archive inventory mismatch or undeclared files/,
  );

  for (const unsafe of [
    storedZip([{ name: "../escape.txt", data: "x" }]),
    storedZip([{ name: "/absolute.txt", data: "x" }]),
    storedZip([{ name: "same.txt", data: "x" }, { name: "same.txt", data: "y" }]),
    storedZip([{ name: "link", data: "target", externalAttributes: 0o120777 << 16 }]),
  ]) {
    assert.throws(() => parseBoundedZip(unsafe), /unsafe|duplicate|symlink/i);
  }
  assert.throws(
    () => parseBoundedZip(storedZip([{ name: "huge.bin", data: "x" }]), { maxExpandedBytes: 0 }),
    /expanded-size limit/,
  );
  const mismatchedLocalHeader = storedZip([{ name: "method.txt", data: "x" }]);
  mismatchedLocalHeader.writeUInt16LE(8, 8);
  assert.throws(() => parseBoundedZip(mismatchedLocalHeader), /local\/central compression metadata mismatch/);
});

test("missing licence, wrong commit, forged approval, pending decisions, and out-of-scope approvals fail closed", () => {
  const missingLicence = clone(manifest);
  const stone = missingLicence.sources.find((source) => source.id === "dstl-stone-soup-v1.9.1");
  stone.extractedMembers = stone.extractedMembers.filter((member) => member.role !== "LICENSE");
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(missingLicence) }), /MIT licence notice missing/);

  const wrongCommit = clone(manifest);
  wrongCommit.sources.find((source) => source.id === "dstl-stone-soup-v1.9.1").vcs.resolvedCommit =
    "0000000000000000000000000000000000000000";
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(wrongCommit) }), /wrong Stone Soup archive or resolved commit/);

  const pending = decisions.decisions.find((decision) => decision.sourceId === "dstl-stone-soup-v1.9.1");
  assert.throws(() => assertAuthorizedDecision(pending, "referenceExecution", { jurisdiction: "IN" }), /PENDING_REVIEW/);
  assert.throws(() => assertAuthorizedDecision({}, "referenceExecution", { jurisdiction: "IN" }), /invalid|exact keys/);
  const rejectedDecisions = clone(decisions.decisions);
  const notApplicableDecisions = clone(decisions.decisions);
  for (const decision of rejectedDecisions) for (const field of ["redistribution", "referenceExecution", "adaptation"]) decision[field].state = "REJECTED";
  for (const decision of notApplicableDecisions) for (const field of ["redistribution", "referenceExecution", "adaptation"]) decision[field].state = "NOT_APPLICABLE";
  assert.equal(summarizeLegalDecisionState(rejectedDecisions), "BLOCKED_REJECTED");
  assert.equal(summarizeLegalDecisionState(notApplicableDecisions), "BLOCKED_NOT_APPLICABLE");
  assert.throws(() => assertAuthorizedDecision(notApplicableDecisions[0], "referenceExecution", { jurisdiction: "IN" }), /NOT_APPLICABLE/);

  const forged = clone(pending);
  forged.referenceExecution = {
    state: "APPROVED",
    reviewer: { kind: "AGENT", id: "codex" },
    decisionRecordId: "agent-assertion",
    decidedOn: "2026-08-24",
    jurisdiction: "IN",
    scope: ["OFFLINE_REFERENCE_EXECUTION"],
    conditions: [],
    evidenceSha256: "0".repeat(64),
    blockingReason: null,
  };
  assert.throws(() => assertAuthorizedDecision(forged, "referenceExecution", { jurisdiction: "IN" }), /authorized human/);

  const outOfScope = clone(forged);
  outOfScope.referenceExecution.reviewer = { kind: "AUTHORIZED_HUMAN", id: "legal-reviewer" };
  outOfScope.referenceExecution.evidenceSha256 = "1".repeat(64);
  assert.throws(
    () => assertAuthorizedDecision(outOfScope, "referenceExecution", { jurisdiction: "US" }),
    /jurisdiction|scope/,
  );
  assert.throws(
    () => assertAuthorizedDecision(outOfScope, "referenceExecution", { jurisdiction: "IN", scope: "ADAPTATION" }),
    /scope/,
  );

  const trusted = callerControlledAuthorityFixture(pending);
  assert.throws(() => assertAuthorizedDecision(trusted.decision, trusted.decisionField, trusted.requirement), /evidence artifact/);
  const impostor = clone(trusted.decision);
  impostor.referenceExecution.reviewer.id = "self-declared-impostor";
  assert.throws(() => assertAuthorizedDecision(impostor, "referenceExecution", trusted.requirement), /allowlisted|authority|policy|evidence/);
  const inventedRecord = clone(trusted.decision);
  inventedRecord.referenceExecution.decisionRecordId = "invented-record";
  assert.throws(() => assertAuthorizedDecision(inventedRecord, "referenceExecution", trusted.requirement), /decision record|attestation|policy/);
  const inventedEvidence = clone(trusted.decision);
  inventedEvidence.referenceExecution.evidenceSha256 = "2".repeat(64);
  assert.throws(() => assertAuthorizedDecision(inventedEvidence, "referenceExecution", trusted.requirement), /evidence|attestation|policy/);
  for (const invalidDate of ["2026-8-24", "2026-02-30"]) {
    const invalid = clone(trusted.decision);
    invalid.referenceExecution.decidedOn = invalidDate;
    assert.throws(() => assertAuthorizedDecision(invalid, "referenceExecution", trusted.requirement), /date/);
  }
  const forgedApprovals = clone(decisions.decisions);
  for (const decision of forgedApprovals) {
    for (const field of ["redistribution", "referenceExecution", "adaptation"]) decision[field] = clone(trusted.decision.referenceExecution);
  }
  assert.equal(summarizeLegalDecisionState(forgedApprovals), "BLOCKED_UNTRUSTED_APPROVAL");
  const taintedNonApproval = clone(pending);
  taintedNonApproval.referenceExecution.jurisdiction = "IN";
  taintedNonApproval.referenceExecution.scope = ["OFFLINE_REFERENCE_EXECUTION"];
  taintedNonApproval.referenceExecution.conditions = ["HIDDEN_AUTHORITY"];
  assert.throws(() => assertAuthorizedDecision(taintedNonApproval, "referenceExecution", trusted.requirement), /non-approval must not carry/);
  const alternateAuthorityField = clone(pending);
  alternateAuthorityField.referenceExecution.authorizedReviewer = { kind: "AUTHORIZED_HUMAN", id: "hidden-reviewer" };
  assert.throws(() => assertAuthorizedDecision(alternateAuthorityField, "referenceExecution"), /exact keys/);
  const wrongFieldScope = clone(trusted.decision);
  wrongFieldScope.redistribution = clone(trusted.decision.referenceExecution);
  assert.throws(() => assertAuthorizedDecision(wrongFieldScope, "redistribution", trusted.requirement), /field-specific scope/);
  const bundleLocalAllowlist = clone(trusted.authorityRegistry);
  bundleLocalAllowlist.authorizedReviewers = [];
  assert.throws(
    () => assertAuthorizedDecision(trusted.decision, trusted.decisionField, { ...trusted.requirement, authorityRegistry: bundleLocalAllowlist }),
    /registry identity|exact keys/,
  );

  const callerForgedBundle = forgedBundleWithCallerRoot();
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, ...callerForgedBundle }),
    /source terms|external authority policy|field-specific scope|evidence artifact/,
  );
  const fieldCorrectCallerForgedBundle = forgedBundleWithCallerRoot({ useFieldSpecificScopes: true });
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, ...fieldCorrectCallerForgedBundle }),
    /source terms|pinned external authority policy/,
  );
});

test("source-terms redistribution authority is exact, scoped, and fail closed", () => {
  const sourceTerms = JSON.parse(readFileSync(resolve(root, manifest.redistributionAuthority.path), "utf8"));
  const rewritten = clone(manifest);
  const overrides = new Map();
  sourceTerms.authorizations.find((entry) => entry.sourceId === "nasa-cr-168347").basis = "CALLER_ASSERTED_PUBLIC_USE";
  const sourceTermsBytes = Buffer.from(`${JSON.stringify(sourceTerms, null, 2)}\n`);
  replaceArtifact(rewritten, overrides, rewritten.redistributionAuthority.path, sourceTermsBytes);
  const rewrittenDecisions = clone(decisions);
  for (const decision of rewrittenDecisions.decisions) decision.redistribution.evidenceSha256 = sha256(sourceTermsBytes);
  replaceArtifact(rewritten, overrides, rewritten.legalDecisions.path, Buffer.from(`${JSON.stringify(rewrittenDecisions, null, 2)}\n`));
  finalizeIsolationOverride(rewritten, overrides);
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, manifest: seal(rewritten), artifactOverrides: overrides }),
    /NASA source-terms basis is incomplete/,
  );

  const executionBySourceTerms = clone(decisions.decisions[0]);
  executionBySourceTerms.referenceExecution = clone(executionBySourceTerms.redistribution);
  assert.throws(
    () => assertAuthorizedDecision(executionBySourceTerms, "referenceExecution"),
    /source terms may authorize redistribution only/,
  );
});

test("release-owner semantic review is non-legal and bound to the exact render set", () => {
  for (const mutate of [
    (review) => { review.reviewerRole = "AUTHORIZED_HUMAN"; },
    (review) => { review.legalApproval = true; },
    (review) => { review.subject.renderProfiles[0].renderSetSha256 = "1".repeat(64); },
    (review) => { review.reviewedContactSheets[0].sha256 = "2".repeat(64); },
    (review) => { review.numericOrEquationTranscriptionPerformed = true; },
  ]) {
    const candidate = clone(manifest);
    const overrides = new Map();
    const inspection = JSON.parse(readFileSync(resolve(root, candidate.visualInspection.path), "utf8"));
    mutate(inspection.releaseOwnerReview);
    replaceArtifact(candidate, overrides, candidate.visualInspection.path, Buffer.from(`${JSON.stringify(inspection, null, 2)}\n`));
    finalizeIsolationOverride(candidate, overrides);
    assert.throws(
      () => verifyGenericSensorSourceBundle({ root, manifest: seal(candidate), artifactOverrides: overrides }),
      /release-owner visual review is missing, altered, or bound to a different render set/,
    );
  }
});

test("hosted jobs provision the exact renderer before entering the offline gate", () => {
  const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
  const deploymentWorkflow = readFileSync(resolve(".github/workflows/deploy-cloudflare.yml"), "utf8");
  const installerPath = resolve("scripts/install-pinned-poppler-ubuntu.sh");
  const installer = readFileSync(installerPath, "utf8");
  const dockerfile = readFileSync(resolve("scripts/pinned-poppler-ubuntu.Dockerfile"), "utf8");
  const wrapper = readFileSync(resolve("scripts/pinned-pdftoppm-wrapper.sh.in"), "utf8");
  assertHostedRendererProvisioning(workflow, installer, dockerfile, wrapper);
  const deploymentVerifyJob = deploymentWorkflow.slice(
    deploymentWorkflow.indexOf("  verify:\n"),
    deploymentWorkflow.indexOf("  migrate:\n"),
  );
  const deploymentCacheAt = deploymentVerifyJob.indexOf("uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830");
  const deploymentInstallAt = deploymentVerifyJob.indexOf("run: scripts/install-pinned-poppler-ubuntu.sh");
  const deploymentVerifyAt = deploymentVerifyJob.indexOf("run: make ci-local");
  assert.ok(deploymentCacheAt >= 0, "deployment verification must restore the governed renderer cache");
  assert.ok(deploymentInstallAt > deploymentCacheAt, "deployment verification must install the governed renderer after cache restore");
  assert.ok(deploymentVerifyAt > deploymentInstallAt, "deployment verification must provision the renderer before the offline gate");
  assert.ok((statSync(installerPath).mode & 0o111) !== 0, "the hosted renderer bootstrap must be executable");

  assert.throws(
    () => assertHostedRendererProvisioning(workflow, installer.replace("26.05.0", "26.05.1"), dockerfile, wrapper),
    /poppler_version/,
  );
  const qualityWithLateInstall = workflow.replace(
    "      - name: Install the pinned offline PDF renderer\n        run: scripts/install-pinned-poppler-ubuntu.sh",
    "      - name: Enter the offline gate too early\n        run: npm run generic-sensor:sources:verify\n      - name: Install the pinned offline PDF renderer\n        run: scripts/install-pinned-poppler-ubuntu.sh",
  );
  assert.throws(
    () => assertHostedRendererProvisioning(qualityWithLateInstall, installer, dockerfile, wrapper),
    /provision the renderer first/,
  );
  assert.throws(
    () => assertHostedRendererProvisioning(workflow, installer.replace("33ceb719", "03ceb719"), dockerfile, wrapper),
    /33ceb719/,
  );
  assert.throws(
    () => assertHostedRendererProvisioning(workflow.replace("actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830", "actions/cache@main"), installer, dockerfile, wrapper),
    /actions\/cache/,
  );
  assert.throws(
    () => assertHostedRendererProvisioning(
      workflow,
      installer,
      dockerfile.replace(
        'ENTRYPOINT ["/opt/poppler/bin/pdftoppm"]',
        'ENTRYPOINT ["/tmp/poppler/build/utils/pdftoppm"]',
      ),
      wrapper,
    ),
    /renderer executable cannot live below \/tmp/,
  );
  assert.throws(
    () => assertHostedRendererProvisioning(
      workflow,
      installer,
      dockerfile.replace(
        "cp /tmp/poppler/build/utils/pdftoppm /opt/poppler/bin/pdftoppm",
        "cp /tmp/poppler/build/utils/pdftoppm /opt/poppler/bin/unbound-renderer",
      ),
      wrapper,
    ),
    /cp \/tmp\/poppler\/build\/utils\/pdftoppm/,
  );
  assert.throws(
    () => assertHostedRendererProvisioning(
      workflow,
      installer.replace(
        's|@@GITHUB_WORKSPACE@@|${GITHUB_WORKSPACE}|g',
        's|@@GITHUB_WORKSPACE@@|${GITHUB_WORKSPACE}|',
      ),
      dockerfile,
      wrapper,
    ),
    /every workspace placeholder/,
  );
});

test("community/game artifacts, dynamic sources, model claims, and production exposure are rejected", () => {
  for (const token of ["DCS", "War Thunder", "community dump", "APG-68", "Su-30MKI", "F-16"] ) {
    const substituted = clone(manifest);
    substituted.sources[0].title = token;
    assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(substituted) }), /forbidden/);
  }
  const dynamic = clone(manifest);
  dynamic.sources[0].canonicalUrl = "https://example.test/latest";
  assert.throws(() => verifyGenericSensorSourceBundle({ root, manifest: seal(dynamic) }), /dynamic/);

  assert.doesNotThrow(() => assertNoProductionExposure({ repositoryRoot: resolve(".") }));
  assert.throws(
    () => assertNoProductionExposure({
      repositoryRoot: resolve("."),
      virtualFiles: new Map([["lib/engine/forbidden.ts", "import '../../governance/generic-sensor-verification-sources/manifest.v1.json'" ]]),
    }),
    /production exposure/,
  );
  assert.throws(
    () => assertNoProductionExposure({
      repositoryRoot: resolve("."),
      virtualFiles: new Map([["engine-rust/target/forbidden.wasm", Buffer.from("binary vector.generic-sensor-verification-source-manifest.v1 marker")]]),
    }),
    /production exposure marker/,
  );
  const frozenPdf = readFileSync(resolve(root, "raw/nasa/19800011044.pdf"));
  assert.throws(
    () => assertNoProductionExposure({
      repositoryRoot: resolve("."),
      virtualFiles: new Map([["public/forbidden-reference.pdf", frozenPdf]]),
      forbiddenArtifactDigests: new Set([sha256(frozenPdf)]),
    }),
    /production exposure frozen artifact/,
  );
  assert.throws(
    () => assertNoProductionExposure({
      repositoryRoot: resolve("."),
      virtualFiles: new Map([[".next/server/wrapped-reference.bin", Buffer.concat([Buffer.from("prefix"), frozenPdf, Buffer.from("suffix")])]]),
      forbiddenArtifactBytes: [frozenPdf],
    }),
    /embedded frozen artifact/,
  );
  for (const previouslyOmittedRuntimeFixture of [
    "fixtures/public-reference/forbidden-reference.pdf",
    "fixtures/performance/forbidden-reference.bin",
  ]) {
    assert.throws(
      () => assertNoProductionExposure({
        repositoryRoot: resolve("."),
        virtualFiles: new Map([[previouslyOmittedRuntimeFixture, frozenPdf]]),
        forbiddenArtifactDigests: new Set([sha256(frozenPdf)]),
      }),
      /production exposure frozen artifact/,
    );
    assert.throws(
      () => assertNoProductionExposure({
        repositoryRoot: resolve("."),
        virtualFiles: new Map([[previouslyOmittedRuntimeFixture, Buffer.concat([Buffer.from("prefix"), frozenPdf, Buffer.from("suffix")])]]),
        forbiddenArtifactBytes: [frozenPdf],
      }),
      /production exposure embedded frozen artifact/,
    );
  }

  const temporaryRepository = mkdtempSync(join(tmpdir(), "vector-source-quarantine-"));
  try {
    mkdirSync(resolve(temporaryRepository, ".next/server"), { recursive: true });
    writeFileSync(resolve(temporaryRepository, ".next/server/copied-reference.pdf"), frozenPdf);
    mkdirSync(resolve(temporaryRepository, "public"), { recursive: true });
    writeFileSync(resolve(temporaryRepository, "linked-reference.pdf"), frozenPdf);
    symlinkSync(resolve(temporaryRepository, "linked-reference.pdf"), resolve(temporaryRepository, "public/reference-link.pdf"));
    assert.throws(
      () => assertNoProductionExposure({ repositoryRoot: temporaryRepository, forbiddenArtifactBytes: [frozenPdf] }),
      /production exposure/,
    );
    rmSync(resolve(temporaryRepository, ".next"), { recursive: true, force: true });
    assert.throws(
      () => assertNoProductionExposure({ repositoryRoot: temporaryRepository, forbiddenArtifactBytes: [frozenPdf] }),
      /production exposure/,
    );
  } finally {
    rmSync(temporaryRepository, { recursive: true, force: true });
  }
});
