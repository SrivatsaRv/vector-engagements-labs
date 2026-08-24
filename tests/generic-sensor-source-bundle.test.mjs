import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function mutateOneByte(bytes) {
  const changed = Buffer.from(bytes);
  changed[Math.floor(changed.length / 2)] ^= 0x01;
  return changed;
}

function approvedAuthorityFixture(pendingDecision) {
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
    externalTrustRootRequired: true,
    status: "ACTIVE_EXTERNALLY_ATTESTED_AUTHORITIES",
    authorizedReviewers: [{
      reviewerId: approval.reviewer.id,
      jurisdictions: [approval.jurisdiction],
      scopes: approval.scope,
      validFrom: "2026-01-01",
      validThrough: "2026-12-31",
    }],
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
  assert.throws(() => assertAuthorizedDecision({}, "referenceExecution", { jurisdiction: "IN" }), /invalid/);
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

  const trusted = approvedAuthorityFixture(pending);
  assert.doesNotThrow(() => assertAuthorizedDecision(trusted.decision, trusted.decisionField, trusted.requirement));
  const impostor = clone(trusted.decision);
  impostor.referenceExecution.reviewer.id = "self-declared-impostor";
  assert.throws(() => assertAuthorizedDecision(impostor, "referenceExecution", trusted.requirement), /allowlisted|authority/);
  const inventedRecord = clone(trusted.decision);
  inventedRecord.referenceExecution.decisionRecordId = "invented-record";
  assert.throws(() => assertAuthorizedDecision(inventedRecord, "referenceExecution", trusted.requirement), /decision record|attestation/);
  const inventedEvidence = clone(trusted.decision);
  inventedEvidence.referenceExecution.evidenceSha256 = "2".repeat(64);
  assert.throws(() => assertAuthorizedDecision(inventedEvidence, "referenceExecution", trusted.requirement), /evidence|attestation/);
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
});
