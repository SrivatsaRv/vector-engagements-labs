import { createHash, verify as verifySignature } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

const MANIFEST_SCHEMA = "vector.generic-sensor-verification-source-manifest.v1";
const REPORT_SCHEMA = "vector.generic-sensor-verification-source-report.v1";
const LEGAL_SCHEMA = "vector.generic-sensor-verification-legal-decisions.v1";
const AUTHORITY_SCHEMA = "vector.generic-sensor-verification-legal-authority-registry.v1";
const ATTESTATION_SCHEMA = "vector.generic-sensor-verification-legal-attestation-payload.v1";
const INTENDED_USE = "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE";
const WITHDRAWN_CR_160557_PREFIX = ["99cc", "854a"].join("");
const CORRECT_CR_160557_SHA256 = "516547a9ea42ed46b20c348105ebbbbce1628f3e3eb96d6ec517a42647be4456";
const STONE_ARCHIVE_SHA256 = "728449aeac17bf2a233cd052b42f8306a7742fad26715be3f780abfbaf50abab";
const STONE_COMMIT = "a4336b920a799cfe0a77ecb05867c5deeb371c7a";
const FORBIDDEN_CLAIM = /\b(?:DCS|War\s*Thunder|community\s+dump|APG-68|Su-30(?:MKI)?|F-16)\b/i;
const SHA256 = /^[0-9a-f]{64}$/;
const APPROVAL_SCOPES = new Set(["REDISTRIBUTE_FROZEN_SOURCE_BYTES", "OFFLINE_REFERENCE_EXECUTION", "ADAPT_SOURCE_FOR_VERIFICATION"]);
const PRODUCTION_ROOTS = ["app", "components", "db", "dist", "engine-rust", "fixtures/model-packs", "fixtures/vector-record", "lib", "public", "worker"];
const PRODUCTION_MARKERS = [MANIFEST_SCHEMA, LEGAL_SCHEMA, INTENDED_USE, "generic-sensor-verification-sources", "generic-sensor-source-freeze-v1"];
const NASA_IDENTITIES = {
  "nasa-cr-66097": { ntrsId: "19660021027", reportNumber: "NASA-CR-66097", pages: [143, 144], reportPages: ["134", "135"], renderPages: [1, 143, 144] },
  "nasa-cr-151497": { ntrsId: "19770023372", reportNumber: "NASA-CR-151497", pages: [53, 54, 55, 56], reportPages: ["2", "3", "4", "5"], renderPages: [1, 2, 3, 4, 53, 54, 55, 56] },
  "nasa-cr-168347": { ntrsId: "19840019990", reportNumber: "NASA-CR-168347", pages: Array.from({ length: 17 }, (_, index) => 82 + index), reportPages: Array.from({ length: 17 }, (_, index) => `5-${25 + index}`), renderPages: [1, ...Array.from({ length: 17 }, (_, index) => 82 + index)] },
  "nasa-cr-160557": { ntrsId: "19800011044", reportNumber: "NASA-CR-160557", pages: Array.from({ length: 11 }, (_, index) => 5 + index), reportPages: Array(11).fill(null), renderPages: Array.from({ length: 15 }, (_, index) => index + 1) },
};

function fail(message) {
  throw new Error(`generic sensor source verification failed: ${message}`);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalManifestDigest(manifest) {
  const unsigned = structuredClone(manifest);
  delete unsigned.canonicalManifestDigest;
  return sha256(Buffer.from(canonicalJson(unsigned)));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipPathIsUnsafe(name) {
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return true;
  return name.split("/").some((part) => part === "." || part === "..");
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("ZIP end-of-central-directory record missing");
}

export function parseBoundedZip(input, limits = {}) {
  const bytes = Buffer.from(input);
  const maxArchiveBytes = limits.maxArchiveBytes ?? 32 * 1024 * 1024;
  const maxExpandedBytes = limits.maxExpandedBytes ?? 64 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 2_000;
  if (bytes.length > maxArchiveBytes) fail("ZIP archive-size limit exceeded");
  const endOffset = findEndOfCentralDirectory(bytes);
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) fail("multi-disk ZIP is unsafe");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("ZIP64 archive is unsupported");
  if (entryCount > maxEntries) fail("ZIP entry-count limit exceeded");
  if (centralOffset + centralSize > endOffset) fail("ZIP central directory is out of bounds");

  const names = new Set();
  const entries = [];
  let totalExpandedBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) fail("invalid ZIP central-directory entry");
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) fail("ZIP central-directory entry is out of bounds");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (Buffer.compare(Buffer.from(name, "utf8"), nameBytes) !== 0) fail("unsafe non-UTF-8 ZIP member name");
    if (zipPathIsUnsafe(name)) fail(`unsafe ZIP member path: ${name}`);
    if (names.has(name)) fail(`duplicate ZIP member: ${name}`);
    names.add(name);
    if ((flags & 0x1) !== 0) fail(`encrypted ZIP member is unsafe: ${name}`);
    if (method !== 0 && method !== 8) fail(`unsupported ZIP compression method for ${name}`);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) fail(`symlink ZIP member is unsafe: ${name}`);
    totalExpandedBytes += uncompressedSize;
    if (totalExpandedBytes > maxExpandedBytes) fail("ZIP expanded-size limit exceeded");
    if (localHeaderOffset + 30 > bytes.length || bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) fail(`invalid local header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const localFlags = bytes.readUInt16LE(localHeaderOffset + 6);
    const localMethod = bytes.readUInt16LE(localHeaderOffset + 8);
    if (localFlags !== flags || localMethod !== method) fail(`local/central compression metadata mismatch for ${name}`);
    const localName = bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name) fail(`local/central name mismatch for ${name}`);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.length) fail(`compressed data is out of bounds for ${name}`);
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: maxExpandedBytes });
    if (content.length !== uncompressedSize) fail(`expanded size mismatch for ${name}`);
    if (crc32(content) !== expectedCrc) fail(`CRC mismatch for ${name}`);
    entries.push({
      path: name,
      compressionMethod: method,
      compressedSize,
      uncompressedSize,
      crc32Hex: expectedCrc.toString(16).padStart(8, "0"),
      unixMode,
      localHeaderOffset,
      isDirectory: name.endsWith("/"),
      content,
    });
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) fail("ZIP central-directory size mismatch");
  return { entries, totalExpandedBytes };
}

function artifactBytes(root, artifact, overrides) {
  const bytes = overrides?.get(artifact.path) ?? readFileSync(resolve(root, artifact.path));
  if (bytes.length !== artifact.sizeBytes) fail(`size mismatch for ${artifact.path}`);
  if (sha256(bytes) !== artifact.sha256) fail(`digest mismatch for ${artifact.path}`);
  return bytes;
}

function requireStates(value, location) {
  const allowed = new Set(["REFERENCE_ONLY", "NON_AUTHORITATIVE_DISCOVERY_AID", "INELIGIBLE"]);
  if (!allowed.has(value)) fail(`invalid evidence state at ${location}`);
}

function verifyNasaMetadata(source, bytes) {
  const identity = NASA_IDENTITIES[source.id];
  if (!identity || source.ntrsId !== identity.ntrsId || source.reportNumber !== identity.reportNumber) fail(`wrong frozen NASA identity for ${source.id}`);
  const location = source.relevantLocations?.[0];
  if (canonicalJson(location?.pdfPages) !== canonicalJson(identity.pages) || canonicalJson(location?.reportPages) !== canonicalJson(identity.reportPages)) fail(`wrong relevant page mapping for ${source.id}`);
  if (canonicalJson(source.renderPages?.map((page) => page.sourcePdfPage)) !== canonicalJson(identity.renderPages)) fail(`wrong render page mapping for ${source.id}`);
  for (const page of source.renderPages) {
    const stem = String(page.sourcePdfPage).padStart(3, "0");
    const expectedSourcePath = `renders/${source.ntrsId}/pdf-${stem}.png`;
    if (page.sourceRender?.path !== expectedSourcePath) fail(`render artifact does not match source page for ${source.id}:${page.sourcePdfPage}`);
    const relevantIndex = identity.pages.indexOf(page.sourcePdfPage);
    const expectedReportPage = relevantIndex === -1 ? null : identity.reportPages[relevantIndex];
    const expectedPurpose = relevantIndex === -1 ? "IDENTITY_OR_LIMITATION_CONTEXT" : "RELEVANT_SOURCE_CONTEXT";
    if (page.reportPage !== expectedReportPage || page.purpose !== expectedPurpose) fail(`wrong source/display page context for ${source.id}:${page.sourcePdfPage}`);
    const uprightExpected = source.id === "nasa-cr-160557" && [8, 11, 14].includes(page.sourcePdfPage);
    const expectedDisplayPath = uprightExpected ? `renders/${source.ntrsId}/pdf-${stem}-display-upright.png` : null;
    if ((page.displayRender?.path ?? null) !== expectedDisplayPath) fail(`wrong upright display artifact for ${source.id}:${page.sourcePdfPage}`);
  }
  const metadata = JSON.parse(bytes.toString("utf8"));
  if (String(metadata.id) !== source.ntrsId) fail(`wrong NASA record for ${source.id}`);
  if (!metadata.otherReportNumbers?.includes(source.reportNumber)) fail(`wrong report number for ${source.id}`);
  if (metadata.title !== source.title) fail(`wrong title for ${source.id}`);
  if (metadata.distribution !== "PUBLIC" || metadata.copyright?.determinationType !== "GOV_PUBLIC_USE_PERMITTED") fail(`wrong distribution metadata for ${source.id}`);
  if (metadata.exportControl?.isExportControl !== "NO" || metadata.exportControl?.ear !== "NO" || metadata.exportControl?.itar !== "NO") fail(`wrong export metadata for ${source.id}`);
  if (!metadata.downloads?.some((download) => download.name === `${source.ntrsId}.pdf`)) fail(`wrong NASA download identity for ${source.id}`);
}

function verifyDecisionField(decision, field) {
  const value = decision[field];
  if (!value || !["PENDING_REVIEW", "APPROVED", "REJECTED", "NOT_APPLICABLE"].includes(value.state)) fail(`invalid ${field} decision for ${decision.sourceId}`);
  if (value.state === "APPROVED") {
    if (value.reviewer?.kind !== "AUTHORIZED_HUMAN" || !stableId(value.reviewer.id)) fail(`${field} approval requires an authorized human reviewer`);
    if (!stableId(value.decisionRecordId) || !canonicalDate(value.decidedOn) || !/^[A-Z]{2}$/.test(value.jurisdiction ?? "") || !closedStringArray(value.scope, APPROVAL_SCOPES) || !closedStringArray(value.conditions) || !SHA256.test(value.evidenceSha256 ?? "") || /^0{64}$/.test(value.evidenceSha256)) fail(`${field} approval is incomplete or has an invalid date/scope`);
  } else if (value.reviewer !== null || value.decisionRecordId !== null || value.decidedOn !== null || value.jurisdiction !== null || !Array.isArray(value.scope) || value.scope.length !== 0 || !Array.isArray(value.conditions) || value.conditions.length !== 0 || value.evidenceSha256 !== null) {
    fail(`${field} non-approval must not carry approval authority`);
  }
}

function canonicalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const year = Number(value.slice(0, 4));
  return year >= 1900 && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function stableId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value);
}

function closedStringArray(value, allowed) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) return false;
  return value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 128 && (!allowed || allowed.has(item)));
}

function approvalPayload(registry, decision, field) {
  const value = decision[field];
  return {
    schemaVersion: ATTESTATION_SCHEMA,
    registryId: registry.registryId,
    decisionArtifactId: registry.subjectDecisionArtifactId,
    decisionRecordId: value.decisionRecordId,
    sourceId: decision.sourceId,
    decisionField: field,
    reviewerId: value.reviewer.id,
    decidedOn: value.decidedOn,
    jurisdiction: value.jurisdiction,
    scope: value.scope,
    conditions: value.conditions,
    evidenceSha256: value.evidenceSha256,
  };
}

function validateAuthorityRegistryShape(registry) {
  if (registry?.schemaVersion !== AUTHORITY_SCHEMA || registry.externalTrustRootRequired !== true || !stableId(registry.registryId) || !stableId(registry.subjectDecisionArtifactId) || !Array.isArray(registry.authorizedReviewers) || !Array.isArray(registry.decisionRecords)) fail("wrong legal-authority registry identity");
  const expectedStatus = registry.authorizedReviewers.length === 0 && registry.decisionRecords.length === 0
    ? "NO_AUTHORIZED_REVIEWERS_OR_DECISION_RECORDS_REGISTERED"
    : "ACTIVE_EXTERNALLY_ATTESTED_AUTHORITIES";
  if (registry.status !== expectedStatus) fail("legal-authority registry status is inconsistent");
  if (new Set(registry.authorizedReviewers.map((reviewer) => reviewer.reviewerId)).size !== registry.authorizedReviewers.length || new Set(registry.decisionRecords.map((record) => record.decisionRecordId)).size !== registry.decisionRecords.length) fail("duplicate legal authority or decision-record identity");
  for (const reviewer of registry.authorizedReviewers) {
    if (!stableId(reviewer.reviewerId) || !canonicalDate(reviewer.validFrom) || !canonicalDate(reviewer.validThrough) || reviewer.validFrom > reviewer.validThrough || !closedStringArray(reviewer.jurisdictions) || !reviewer.jurisdictions.every((jurisdiction) => /^[A-Z]{2}$/.test(jurisdiction)) || !closedStringArray(reviewer.scopes, APPROVAL_SCOPES)) fail("malformed legal reviewer allowlist entry");
  }
  return registry;
}

function verifyTrustedApproval(decision, field, requirement) {
  const registry = validateAuthorityRegistryShape(requirement.authorityRegistry);
  const trustedRoots = requirement.trustedAuthorityRoots;
  if (!(trustedRoots instanceof Map)) fail(`${field} approval requires a separately governed external authority registry`);
  if (requirement.sourceId && decision.sourceId !== requirement.sourceId) fail(`${field} approval source is out of scope`);
  const value = decision[field];
  const reviewer = registry.authorizedReviewers?.find((candidate) => candidate.reviewerId === value.reviewer.id);
  if (!reviewer) fail(`${field} reviewer is not allowlisted by external authority`);
  if (!canonicalDate(reviewer.validFrom) || !canonicalDate(reviewer.validThrough) || reviewer.validFrom > value.decidedOn || reviewer.validThrough < value.decidedOn) fail(`${field} reviewer authority date is invalid or out of range`);
  if (!closedStringArray(reviewer.jurisdictions) || !reviewer.jurisdictions.includes(value.jurisdiction) || !closedStringArray(reviewer.scopes, APPROVAL_SCOPES) || value.scope.some((scope) => !reviewer.scopes.includes(scope))) fail(`${field} reviewer authority jurisdiction or scope is insufficient`);
  const record = registry.decisionRecords?.find((candidate) => candidate.decisionRecordId === value.decisionRecordId);
  if (!record) fail(`${field} decision record is not registered`);
  const payload = approvalPayload(registry, decision, field);
  const { attestation, ...registeredPayload } = record;
  if (canonicalJson(registeredPayload) !== canonicalJson(payload)) fail(`${field} decision record/evidence does not match the approval`);
  const payloadBytes = Buffer.from(canonicalJson(payload));
  if (attestation?.algorithm !== "Ed25519" || !attestation.keyId || attestation.payloadSha256 !== sha256(payloadBytes)) fail(`${field} detached attestation identity is invalid`);
  const trustedKey = trustedRoots.get(attestation.keyId);
  if (!trustedKey) fail(`${field} detached attestation has no external trust root`);
  const signature = Buffer.from(attestation.signatureBase64 ?? "", "base64");
  if (!attestation.signatureBase64 || signature.toString("base64") !== attestation.signatureBase64 || !verifySignature(null, payloadBytes, trustedKey, signature)) fail(`${field} detached attestation signature is invalid`);
  return value;
}

export function assertAuthorizedDecision(decision, field, requirement = {}) {
  verifyDecisionField(decision, field);
  const value = decision[field];
  if (value.state !== "APPROVED") fail(`${field} decision is ${value.state}`);
  if (requirement.jurisdiction && value.jurisdiction !== requirement.jurisdiction) fail(`${field} approval jurisdiction is out of scope`);
  if (requirement.scope && !value.scope.includes(requirement.scope)) fail(`${field} approval scope is insufficient`);
  return verifyTrustedApproval(decision, field, requirement);
}

function walkFiles(path, rootPath, files) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) walkFiles(entryPath, rootPath, files);
    else if (entry.isFile()) files.set(relative(rootPath, entryPath).split(sep).join("/"), readFileSync(entryPath));
  }
}

export function assertNoProductionExposure({ repositoryRoot, virtualFiles, forbiddenArtifactDigests = new Set() } = {}) {
  const root = resolve(repositoryRoot ?? ".");
  const files = new Map();
  for (const productionRoot of PRODUCTION_ROOTS) walkFiles(resolve(root, productionRoot), root, files);
  for (const [path, bytes] of virtualFiles ?? []) files.set(path, Buffer.from(bytes));
  for (const [path, bytes] of files) {
    if (PRODUCTION_MARKERS.some((marker) => bytes.includes(Buffer.from(marker)))) fail(`production exposure marker in ${path}`);
    if (forbiddenArtifactDigests.has(sha256(bytes))) fail(`production exposure frozen artifact in ${path}`);
  }
  return { filesScanned: files.size, exposures: 0 };
}

function verifyVisualInspection(root, manifest, overrides) {
  const record = manifest.visualInspection;
  artifactBytes(root, record, overrides);
  const inspection = JSON.parse((overrides?.get(record.path) ?? readFileSync(resolve(root, record.path))).toString("utf8"));
  if (inspection.schemaVersion !== "vector.generic-sensor-verification-visual-inspection.v1") fail("wrong visual-inspection schema");
  if (inspection.status !== "PRIMARY_INSPECTION_COMPLETE_INDEPENDENT_REVIEW_REQUIRED") fail("visual inspection must preserve independent-review requirement");
  const inspected = new Map(inspection.pages.map((page) => [`${page.sourceId}:${page.sourcePdfPage}`, page]));
  const expectedPageCount = manifest.sources.reduce((sum, source) => sum + (source.renderPages?.length ?? 0), 0);
  if (inspection.pages.length !== expectedPageCount || inspected.size !== expectedPageCount) fail("visual-inspection page coverage is not exact");
  for (const source of manifest.sources.filter((candidate) => candidate.publisher === "NASA")) {
    for (const page of source.renderPages) {
      artifactBytes(root, page.sourceRender, overrides);
      if (page.displayRender) artifactBytes(root, page.displayRender, overrides);
      const inspectedPage = inspected.get(`${source.id}:${page.sourcePdfPage}`);
      if (!inspectedPage) fail(`uninspected source page ${source.id}:${page.sourcePdfPage}`);
      if (inspectedPage.reportPage !== page.reportPage || inspectedPage.purpose !== page.purpose || inspectedPage.titleAndReportIdentityChecked !== true || inspectedPage.equationContextChecked !== true || inspectedPage.limitationsChecked !== true || inspectedPage.result !== "CONSISTENT_WITH_DECLARED_SOURCE_ONLY_SCOPE") fail(`visual-inspection mapping mismatch for ${source.id}:${page.sourcePdfPage}`);
      const uprightExpected = source.id === "nasa-cr-160557" && [8, 11, 14].includes(page.sourcePdfPage);
      if (uprightExpected !== Boolean(page.displayRender) || (uprightExpected && page.displayTransform !== "ROTATE_90_DEGREES_CLOCKWISE") || (!uprightExpected && page.displayTransform !== "NONE")) fail(`wrong display mapping for ${source.id}:${page.sourcePdfPage}`);
    }
  }
}

function verifyIsolationEvidence(root, manifest, overrides) {
  const record = manifest.isolationEvidence;
  const content = artifactBytes(root, record, overrides);
  const evidence = JSON.parse(content.toString("utf8"));
  if (evidence.schemaVersion !== "vector.generic-sensor-verification-production-isolation-evidence.v1" || evidence.subjectManifestId !== manifest.manifestId || evidence.expectedProductionExposures !== 0 || evidence.productionBuildImportPolicy !== "FORBIDDEN" || evidence.omissionReason !== "STAGE_0_ADDS_NO_RUNTIME_BEHAVIOR") fail("invalid production-isolation evidence");
  const artifacts = new Map();
  const collect = (candidate) => {
    if (candidate?.path && Number.isInteger(candidate.sizeBytes) && SHA256.test(candidate.sha256 ?? "")) artifacts.set(candidate.path, candidate);
  };
  for (const source of manifest.sources) {
    for (const artifact of source.artifacts) collect(artifact);
    collect(source.archiveInventory);
    for (const member of source.extractedMembers ?? []) collect(member.extractedArtifact);
    for (const page of source.renderPages ?? []) {
      collect(page.sourceRender);
      collect(page.displayRender);
    }
  }
  collect(manifest.visualInspection);
  collect(manifest.legalDecisions);
  collect(manifest.legalAuthorityRegistry);
  const measuredBytes = [...artifacts.values()].reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  if (evidence.frozenArtifactCount !== artifacts.size || evidence.frozenArtifactBytes !== measuredBytes) fail("production-isolation size evidence mismatch");
}

function verifyStoneSource(root, source, archiveBytes, overrides) {
  if (source.archiveSha256 !== STONE_ARCHIVE_SHA256 || source.vcs.resolvedCommit !== STONE_COMMIT) fail("wrong Stone Soup archive or resolved commit");
  if (source.vcs.annotatedTagObject !== "d9e6fb16f5ae176817aeb6a6fc3a39f544694408" || source.vcs.annotatedTagSigned !== false || source.vcs.resolvedCommitSignature !== "VERIFIED") fail("Stone Soup tag and commit identity are not independently represented");
  const metadataArtifact = source.artifacts.find((artifact) => artifact.role === "OFFICIAL_METADATA");
  const metadata = JSON.parse(artifactBytes(root, metadataArtifact, overrides).toString("utf8"));
  if (metadata.id !== 20830467 || metadata.doi !== source.doi || metadata.metadata?.version !== "v1.9.1" || metadata.metadata?.license?.id !== "mit-license") fail("wrong Stone Soup Zenodo identity");
  const zipFile = metadata.files?.find((file) => file.key === "dstl/Stone-Soup-v1.9.1.zip");
  if (!zipFile || zipFile.size !== archiveBytes.length || zipFile.checksum !== "md5:5551faf19954c7400821e7616f1199ff") fail("wrong Stone Soup Zenodo archive record");
  const parsed = parseBoundedZip(archiveBytes, source.archiveLimits);
  const inventoryBytes = artifactBytes(root, source.archiveInventory, overrides);
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  const actualInventory = parsed.entries.map((entry) => ({
    path: entry.path,
    compressionMethod: entry.compressionMethod,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    crc32Hex: entry.crc32Hex,
    unixMode: entry.unixMode,
    localHeaderOffset: entry.localHeaderOffset,
  }));
  if (inventory.entryCount !== parsed.entries.length || canonicalJson(actualInventory) !== canonicalJson(inventory.entries) || inventory.totalExpandedBytes !== parsed.totalExpandedBytes || inventory.archiveSha256 !== STONE_ARCHIVE_SHA256) fail("archive inventory mismatch or undeclared files");
  const entries = new Map(parsed.entries.map((entry) => [entry.path, entry]));
  for (const member of source.extractedMembers) {
    const entry = entries.get(member.archivePath);
    if (!entry || entry.isDirectory) fail(`missing declared Stone Soup member ${member.archivePath}`);
    const extracted = artifactBytes(root, member.extractedArtifact, overrides);
    if (sha256(entry.content) !== member.extractedArtifact.sha256 || !entry.content.equals(extracted)) fail(`extracted member mismatch for ${member.archivePath}`);
  }
  const licence = source.extractedMembers.find((member) => member.role === "LICENSE");
  if (!licence || licence.extractedArtifact.sha256 !== "2462f3d8a857f601e266f048a4ff051366c1e05f098cf3a1524eaf922f879815") fail("MIT licence notice missing or changed");
}

export function verifyGenericSensorSourceBundle(options = {}) {
  const root = resolve(options.root ?? "governance/generic-sensor-verification-sources");
  const manifest = options.manifest ?? JSON.parse(readFileSync(resolve(root, "manifest.v1.json"), "utf8"));
  const serialized = JSON.stringify(manifest);
  if (serialized.toLowerCase().includes(WITHDRAWN_CR_160557_PREFIX)) fail("withdrawn CR-160557 digest is invalid");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA || manifest.intendedUse !== INTENDED_USE) fail("wrong manifest schema or intended use");
  if (manifest.canonicalManifestDigest !== canonicalManifestDigest(manifest)) fail("manifest digest mismatch");
  if (manifest.sources?.length !== 5 || new Set(manifest.sources.map((source) => source.id)).size !== 5) fail("source set must contain exactly five unique records");
  if (manifest.status !== "BLOCKED_PENDING_HUMAN_REVIEW" || manifest.sourcePolicy?.productionRuntimeUsePermitted !== false || manifest.sourcePolicy?.stoneSoupExecutionPermitted !== false || manifest.sourcePolicy?.stoneSoupAdaptationPermitted !== false || manifest.sourcePolicy?.numericModelTranscriptionPermitted !== false || manifest.sourcePolicy?.namedSystemClaimsPermitted !== false || manifest.sourcePolicy?.redistributionPermitted !== false) fail("source-only policy must fail closed");
  const sharpRecipe = manifest.renderRecipe?.uprightDisplayRender;
  if (manifest.renderRecipe?.sourceRender?.tool !== "pdftoppm" || manifest.renderRecipe.sourceRender.version !== "26.05.0" || manifest.renderRecipe.sourceRender.dpi !== 150 || manifest.renderRecipe.sourceRender.extent !== "FULL_PAGE" || sharpRecipe?.tool !== "sharp" || sharpRecipe.version !== "0.35.0" || sharpRecipe.pngEncoder?.compressionLevel !== 9 || sharpRecipe.pngEncoder?.adaptiveFiltering !== false || sharpRecipe.pngEncoder?.palette !== false || manifest.renderRecipe.state !== "NON_AUTHORITATIVE_DISCOVERY_AID") fail("wrong offline render recipe");
  if (FORBIDDEN_CLAIM.test(serialized)) fail("forbidden named, community, or game claim in manifest");
  for (const source of manifest.sources) {
    if (!source.canonicalUrl || /(?:\/latest\b|[?&](?:latest|version)=latest)/i.test(source.canonicalUrl)) fail(`dynamic source URL for ${source.id}`);
    requireStates(source.state, source.id);
    for (const claim of source.eligibleClaims ?? []) {
      if (claim.state !== "REFERENCE_ONLY" || claim.kind !== "BIBLIOGRAPHIC_OR_SOURCE_LOCATION_ONLY") fail(`eligible claim exceeds source-location scope for ${source.id}`);
    }
    for (const claim of source.ineligibleClaims ?? []) if (claim.state !== "INELIGIBLE") fail(`ineligible claim state missing for ${source.id}`);
    for (const artifact of source.artifacts) artifactBytes(root, artifact, options.artifactOverrides);
    if (source.publisher === "NASA") {
      if (canonicalJson(source.rights) !== canonicalJson({ distribution: "PUBLIC", publicUse: "GOV_PUBLIC_USE_PERMITTED", exportControl: "NO", ear: "NO", itar: "NO" })) fail(`wrong declared NASA rights for ${source.id}`);
      const metadataArtifact = source.artifacts.find((artifact) => artifact.role === "OFFICIAL_METADATA");
      verifyNasaMetadata(source, options.artifactOverrides?.get(metadataArtifact.path) ?? readFileSync(resolve(root, metadataArtifact.path)));
      if (source.id === "nasa-cr-160557" && source.artifacts.find((artifact) => artifact.role === "SOURCE_PDF")?.sha256 !== CORRECT_CR_160557_SHA256) fail("wrong CR-160557 digest");
    }
  }
  const stone = manifest.sources.find((source) => source.id === "dstl-stone-soup-v1.9.1");
  const archiveArtifact = stone?.artifacts.find((artifact) => artifact.role === "SOURCE_ARCHIVE");
  if (!stone || !archiveArtifact) fail("Stone Soup source is missing");
  if (canonicalJson(stone.rights) !== canonicalJson({ licence: "MIT", access: "OPEN", exportControl: "NOT_STATED", ear: "NOT_STATED", itar: "NOT_STATED" })) fail("wrong declared Stone Soup rights");
  verifyStoneSource(root, stone, artifactBytes(root, archiveArtifact, options.artifactOverrides), options.artifactOverrides);
  verifyVisualInspection(root, manifest, options.artifactOverrides);
  verifyIsolationEvidence(root, manifest, options.artifactOverrides);

  const legalArtifact = manifest.legalDecisions;
  const legalBytes = artifactBytes(root, legalArtifact, options.artifactOverrides);
  const legal = JSON.parse(legalBytes.toString("utf8"));
  if (legal.schemaVersion !== LEGAL_SCHEMA || legal.intendedUse !== INTENDED_USE || legal.subjectManifestId !== manifest.manifestId) fail("wrong legal-decision artifact identity");
  const authorityArtifact = manifest.legalAuthorityRegistry;
  const authorityBytes = artifactBytes(root, authorityArtifact, options.artifactOverrides);
  const authorityRegistry = validateAuthorityRegistryShape(JSON.parse(authorityBytes.toString("utf8")));
  if (authorityRegistry.subjectDecisionArtifactId !== legal.decisionArtifactId) fail("legal-authority registry is bound to the wrong decision artifact");
  if (legal.decisions?.length !== manifest.sources.length || new Set(legal.decisions.map((decision) => decision.sourceId)).size !== manifest.sources.length) fail("legal decisions do not cover the frozen source set");
  const approvedCount = legal.decisions.reduce((sum, decision) => sum + ["redistribution", "referenceExecution", "adaptation"].filter((field) => decision[field]?.state === "APPROVED").length, 0);
  if (authorityRegistry.decisionRecords.length !== approvedCount) fail("legal authority registry does not exactly cover approved decisions");
  for (const source of manifest.sources) {
    const decision = legal.decisions.find((candidate) => candidate.sourceId === source.id);
    if (!decision) fail(`missing legal decision for ${source.id}`);
    for (const field of ["redistribution", "referenceExecution", "adaptation"]) {
      verifyDecisionField(decision, field);
      if (decision[field].state === "APPROVED") assertAuthorizedDecision(decision, field, {
        sourceId: source.id,
        authorityRegistry,
        trustedAuthorityRoots: options.trustedAuthorityRoots ?? new Map(),
      });
    }
    const reference = manifest.decisionReferences?.find((candidate) => candidate.sourceId === source.id);
    if (!reference || reference.decisionArtifactId !== legal.decisionArtifactId || reference.authorityRegistryId !== authorityRegistry.registryId || canonicalJson(reference.fields) !== canonicalJson(["redistribution", "referenceExecution", "adaptation"])) fail(`missing per-source legal decision reference for ${source.id}`);
  }
  const decisionState = summarizeLegalDecisionState(legal.decisions, {
    authorityRegistry,
    trustedAuthorityRoots: options.trustedAuthorityRoots ?? new Map(),
  });
  const frozenArtifactDigests = new Set();
  const collectDigest = (candidate) => {
    if (candidate?.path && SHA256.test(candidate.sha256 ?? "")) frozenArtifactDigests.add(candidate.sha256);
  };
  for (const source of manifest.sources) {
    for (const artifact of source.artifacts) collectDigest(artifact);
    collectDigest(source.archiveInventory);
    for (const member of source.extractedMembers ?? []) collectDigest(member.extractedArtifact);
    for (const page of source.renderPages ?? []) {
      collectDigest(page.sourceRender);
      collectDigest(page.displayRender);
    }
  }
  collectDigest(manifest.visualInspection);
  collectDigest(manifest.legalDecisions);
  collectDigest(manifest.legalAuthorityRegistry);
  collectDigest(manifest.isolationEvidence);
  const exposure = assertNoProductionExposure({ repositoryRoot: resolve(root, "../.."), forbiddenArtifactDigests: frozenArtifactDigests });
  return {
    schemaVersion: REPORT_SCHEMA,
    manifestId: manifest.manifestId,
    manifestDigest: manifest.canonicalManifestDigest,
    sourceCount: manifest.sources.length,
    decisionState,
    productionExposures: exposure.exposures,
    withdrawnDigestPresent: false,
  };
}

export function summarizeLegalDecisionState(decisions, authority = {}) {
  const states = decisions.flatMap((decision) => ["redistribution", "referenceExecution", "adaptation"].map((field) => decision[field]?.state));
  if (states.includes("REJECTED")) return "BLOCKED_REJECTED";
  if (states.includes("PENDING_REVIEW")) return "BLOCKED_PENDING_HUMAN_REVIEW";
  if (states.includes("NOT_APPLICABLE")) return "BLOCKED_NOT_APPLICABLE";
  if (states.length > 0 && states.every((state) => state === "APPROVED")) {
    try {
      for (const decision of decisions) {
        for (const field of ["redistribution", "referenceExecution", "adaptation"]) assertAuthorizedDecision(decision, field, {
          sourceId: decision.sourceId,
          authorityRegistry: authority.authorityRegistry,
          trustedAuthorityRoots: authority.trustedAuthorityRoots ?? new Map(),
        });
      }
      return "AUTHORIZED_DECISIONS_PRESENT";
    } catch {
      return "BLOCKED_UNTRUSTED_APPROVAL";
    }
  }
  return "BLOCKED_MISSING_OR_INVALID_DECISION";
}
