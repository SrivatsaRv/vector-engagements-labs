import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function seal(value) {
  value.canonicalManifestDigest = canonicalManifestDigest(value);
  return value;
}

function artifactDescriptor(manifestValue, path) {
  const candidates = [manifestValue.visualInspection, manifestValue.legalDecisions, manifestValue.legalAuthorityRegistry, manifestValue.isolationEvidence];
  for (const source of manifestValue.sources) {
    candidates.push(...source.artifacts, source.archiveInventory);
    for (const member of source.extractedMembers ?? []) candidates.push(member.extractedArtifact);
    for (const page of source.renderPages ?? []) candidates.push(page.sourceRender, page.displayRender);
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
      collect(page.sourceRender);
      collect(page.displayRender);
    }
  }
  collect(manifestValue.visualInspection);
  collect(manifestValue.legalDecisions);
  collect(manifestValue.legalAuthorityRegistry);
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
    /pinned canonical manifest/,
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
    /pinned canonical manifest/,
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
    /pinned canonical manifest/,
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
    /pinned canonical manifest/,
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
    /external authority policy|field-specific scope|evidence artifact/,
  );
  const fieldCorrectCallerForgedBundle = forgedBundleWithCallerRoot({ useFieldSpecificScopes: true });
  assert.throws(
    () => verifyGenericSensorSourceBundle({ root, ...fieldCorrectCallerForgedBundle }),
    /pinned external authority policy/,
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
