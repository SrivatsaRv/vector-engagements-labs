import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const EXPECTED_MANIFEST_DIGEST = "72c6a77c66e70b7c20059a0c1dd0b64ef6a22e43121de8247aac2a4cb1f89b57";
const SOURCE_SET_DIGEST = "561f3f0760515aeb059fcc5e8929e63502ab8207f861505a217bbb132a0187f2";
const SOURCE_TERMS_SHA256 = "9bb1dfeeace5ea1b64450bd7cfcd219ae5bc8e71380cfc54c5389ae9b9253cd1";
const RELEASE_REVIEW_SHA256 = "edde94faccbec1458d37facea7af20cd0997e3f2d0c086df911a3ee84fea3c76";
const PRODUCTION_EVIDENCE_SHA256 = "bfeec03601bf53214b448a31fe25a5c499b0e11938ae1ee856a8ce321a4ae83b";
const RENDER_SET_DIGEST = "6abfb14eac2355a3be6a7836a45a6a1a5740fbfd6c72455f42be4f2cfa31ee04";

const ROOT_KEYS = [
  "schemaVersion", "id", "version", "canonicalDigest", "sourceSetDigest", "stage", "intendedUse",
  "availabilityStates", "permissions", "renderProfile", "artifacts", "rejectedAlternates",
  "excludedSources", "unresolvedAssumptionClasses", "prohibitedExecutableFields", "nonclaims", "governanceBindings",
];
const ARTIFACT_KEYS = ["id", "subject", "civilSourceFamily", "title", "role", "pdf", "metadata", "accessEvidence", "rightsFacts", "decisions", "pageMaps"];
const PDF_KEYS = ["fileName", "url", "byteLength", "sha256", "md5", "pageCount", "repositoryPath"];
const METADATA_KEYS = ["fileName", "url", "byteLength", "sha256", "repositoryPath", "accessEvidence"];
const ACCESS_KEYS = ["accessedOn", "httpStatus", "contentType", "contentLength", "etag", "lastModified"];
const RIGHTS_KEYS = ["distribution", "determinationType", "isExportControl", "ear", "itar", "visibleRightsNotice", "repositoryLicenceInference"];
const DECISIONS_KEYS = ["referenceUseDecision", "adaptationDecision", "redistributionDecision", "exportReviewDecision"];
const DECISION_KEYS = ["value", "authorityKind", "reviewerRole", "decisionDate", "scope", "permissionGranted", "evidenceDigest"];
const PAGE_KEYS = ["pdfPage", "printedPage", "anchor", "eligibleClaim", "ineligibleInference", "renderSha256"];
const PERMISSION_KEYS = ["referenceOnlyExternalVerification", "redistribution", "adaptation", "execution", "runtime", "modelPack", "production"];

const EXPECTED = Object.freeze({
  "nasa-ntrs-20190029195": {
    role: "CIVIL_SUAS_FSM_ARCHITECTURE_CONTEXT",
    pdf: { fileName: "20190029195.pdf", byteLength: 3939526, sha256: "08d6b1f2b3354449572105571cfd51108a9624fa47e925b9e36f4e9f1912f801", md5: "091986c8883a6a4daf505712747a58be", pageCount: 16 },
    metadata: { fileName: "nasa-2019-metadata.json", byteLength: 4114, sha256: "cc0f3b75b87951656f0ea623bcebc0acde2dc78b9d85318875609654a8e35ea1" },
    pages: [
      [1, "1", "57ba72904294d5d8d325ac24b6eff81f8a5e32f20b7b4ed1bc2479d09a974e57"],
      [2, "2", "d5ec864acbb7596253e45605b11fc621c38754e95a098e68efe5202bbe48e92b"],
      [5, "5", "100e9aa00b1ea87d86938134d5cee917ebec05e40bb86d4b312fa8713f692bad"],
      [6, "6", "755758040762b6d5f7c05e659c7c4aa170ac8348c2eac1a7f246c7bc8297fe3b"],
      [7, "7", "ec241b751854a6fc09fcfdffd8b4b82912c38e7befc0db140604f83a9b23eaa4"],
      [15, "15", "c37ac84036a2456ca0516fd5d212989731b4748d39b954bcbfa4eb8db5a52e88"],
    ],
  },
  "nasa-ntrs-20205011183": {
    role: "CIVIL_UAM_CONTINGENCY_CHALLENGE_AND_TOOL_ROADMAP_CONTEXT",
    pdf: { fileName: "2021_scitech_dva_Approv.pdf", byteLength: 980859, sha256: "a8994e0b3a152cfc587aedac8c8d24be4577b8d3f377df478090db9eac2161bf", md5: "61a3fafe499aa3be2d601aad9609d052", pageCount: 15 },
    metadata: { fileName: "nasa-2020-metadata.json", byteLength: 4401, sha256: "1004549fd5f797daef6af98987043e34e78a7eafb918fab835dc3ccb76d18a57" },
    pages: [
      [2, "2", "e9f9165c258ec3daa5f3a113c2b76d054715eff71fa4bbe51220924fc031ecc5"],
      [12, "12", "83a4bade5af434c2d343a8587dacf03a102e6fd7d745751224104400f38f527c"],
    ],
  },
  "faa-h-8083-2a": {
    role: "HUMAN_GENERAL_AVIATION_RISK_MANAGEMENT_TRAINING_CONTEXT",
    pdf: { fileName: "risk_management_handbook_2A.pdf", byteLength: 15344860, sha256: "519443a598eedd34c1824ad2ea482f393af0b80e52649e33c0e24a351e4c78bf", md5: "596f70fcbe1e093ef27e5721e6a5e705", pageCount: 80 },
    metadata: null,
    pages: [
      [51, "7-2", "ace8ffaeffe00462fa9a359f3033992aa52e097bb932547b502f1bb51b182d92"],
      [52, "7-3", "1387360c62a7c3132faf7819bbc9d2ef02958ed56a904ad4e5ca821375585005"],
      [53, "7-4", "854b56c62486d947d5aefdd1341e9f0f2b5f6894c6e44f87f6e8c1ece2fd46cb"],
      [54, "8-1", "404700f41788c13d9c660df8dad04c32bbceefe154471ee2fa2168219a8ad632"],
      [55, "8-2", "d09fa79c10b90ba31eb9cb01e9c3a20b380a5436543d2043dd03da5121157636"],
      [56, "8-3", "1c2eb34c005a475805480b0a19128e5d4d3e2f493fb6038a137d3b555d587dc9"],
      [57, "8-4", "e70fb47950922682fc7804f4f0bab5e3236d5f49bbaf0b408c6e91795489872f"],
    ],
  },
});

const PRODUCTION_ROOTS = [
  "app", "components", "lib", "server", "worker", "engine-rust/src", "public", "dist", ".next", ".open-next",
  "fixtures/model-packs", "fixtures/vector-record", "fixtures/public-reference", "fixtures/performance",
];
const FORBIDDEN_MARKERS = [
  "vector.generic-mission-policy-verification-source-manifest.v1",
  "generic-mission-policy-verification-source-freeze-20260826",
  "NASA_CIVIL_SUAS_DECISION_ARCHITECTURE_RESEARCH",
  "NASA_CIVIL_UAM_CONTINGENCY_RESEARCH",
  "FAA_HUMAN_GENERAL_AVIATION_RISK_MANAGEMENT_TRAINING",
  "CIVIL_SUAS_FSM_ARCHITECTURE_CONTEXT",
  "CIVIL_UAM_CONTINGENCY_CHALLENGE_AND_TOOL_ROADMAP_CONTEXT",
  "HUMAN_GENERAL_AVIATION_RISK_MANAGEMENT_TRAINING_CONTEXT",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with exact keys.`);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must have exact keys.`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalManifestDigest(manifest) {
  const payload = structuredClone(manifest);
  delete payload.canonicalDigest;
  return sha256(Buffer.from(JSON.stringify(canonicalize(payload))));
}

function governedFile(path, label) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file.`);
  return readFileSync(resolved);
}

function governedExternalFile(root, fileName, label) {
  if (typeof fileName !== "string" || fileName.length === 0 || isAbsolute(fileName) || basename(fileName) !== fileName) throw new Error(`${label} path is invalid.`);
  const rootPath = resolve(root);
  const rootStat = lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("External source root must be a regular non-symlink directory.");
  const rootReal = realpathSync(rootPath);
  const path = resolve(rootPath, fileName);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file.`);
  const rel = relative(rootReal, realpathSync(path));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes the external source root.`);
  return { bytes: readFileSync(path), path };
}

export function verifyExactBytes(value, expected, label) {
  const bytes = Buffer.isBuffer(value) ? value : governedFile(value, label);
  if (bytes.length !== expected.byteLength) throw new Error(`${label} byte length mismatch.`);
  if (sha256(bytes) !== expected.sha256) throw new Error(`${label} SHA-256 mismatch.`);
  return bytes;
}

function verifyDecisionSet(decisions, artifactId) {
  exactKeys(decisions, DECISIONS_KEYS, `${artifactId} decisions`);
  for (const [name, decision] of Object.entries(decisions)) {
    exactKeys(decision, DECISION_KEYS, `${artifactId} ${name}`);
    if (decision.reviewerRole !== "RELEASE_OWNER_REVIEW" || decision.decisionDate !== "2026-08-26" || decision.evidenceDigest !== SOURCE_TERMS_SHA256 || decision.authorityKind.includes("LEGAL_APPROVAL")) throw new Error(`${artifactId} ${name} decision authority is invalid.`);
    if (name === "referenceUseDecision") {
      if (decision.value !== "CLOSED_EXTERNAL_REFERENCE_ONLY_NO_COPY" || decision.permissionGranted !== true || decision.authorityKind !== "RELEASE_OWNER_GOVERNANCE_DECISION_NON_LEGAL") throw new Error(`${artifactId} reference decision must remain external-only.`);
    } else if (name === "exportReviewDecision") {
      const expected = artifactId === "faa-h-8083-2a" ? "NOT_ESTABLISHED_BY_SOURCE_TERMS" : "SOURCE_METADATA_NO_EAR_ITAR_RESTRICTION_RECORDED";
      if (decision.value !== expected || decision.permissionGranted !== false || decision.authorityKind !== "SOURCE_TERMS_EVIDENCE_NON_LEGAL") throw new Error(`${artifactId} export decision mismatch.`);
    } else if (decision.value !== "CLOSED_DENIED_NOT_AUTHORIZED" || decision.permissionGranted !== false || decision.authorityKind !== "SOURCE_TERMS_EVIDENCE_NON_LEGAL") {
      throw new Error(`${artifactId} ${name} decision must remain denied.`);
    }
  }
}

export function verifyGenericMissionPolicyManifest(manifest) {
  exactKeys(manifest, ROOT_KEYS, "Generic mission-policy manifest");
  if (manifest.schemaVersion !== "vector.generic-mission-policy-verification-source-manifest.v1" || manifest.id !== "generic-mission-policy-verification-source-freeze-20260826" || manifest.version !== "1.0.0" || manifest.stage !== "STAGE_0_SOURCE_ONLY" || manifest.intendedUse !== "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE") throw new Error("Manifest identity or Stage-0 boundary mismatch.");
  if (manifest.sourceSetDigest !== SOURCE_SET_DIGEST) throw new Error("Source-set digest mismatch.");
  exactKeys(manifest.permissions, PERMISSION_KEYS, "Manifest permissions");
  if (manifest.permissions.referenceOnlyExternalVerification !== true || Object.entries(manifest.permissions).some(([key, value]) => key !== "referenceOnlyExternalVerification" && value !== false)) throw new Error("Manifest permission boundary permits promotion.");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3 || JSON.stringify(manifest.artifacts.map(({ id }) => id)) !== JSON.stringify(Object.keys(EXPECTED))) throw new Error("Exact three-artifact inventory mismatch.");
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ARTIFACT_KEYS, `${artifact.id} artifact`);
    const expected = EXPECTED[artifact.id];
    if (!expected || artifact.role !== expected.role || !artifact.civilSourceFamily.includes("CIVIL") && !artifact.civilSourceFamily.includes("FAA_GENERAL_AVIATION")) throw new Error(`${artifact.id} role or civil source family mismatch.`);
    exactKeys(artifact.pdf, PDF_KEYS, `${artifact.id} PDF`);
    for (const [key, value] of Object.entries(expected.pdf)) if (artifact.pdf[key] !== value) throw new Error(`${artifact.id} PDF identity mismatch.`);
    if (artifact.pdf.repositoryPath !== null) throw new Error(`${artifact.id} PDF must remain external.`);
    if (expected.metadata === null) {
      if (artifact.metadata !== null) throw new Error(`${artifact.id} metadata must remain unavailable.`);
    } else {
      exactKeys(artifact.metadata, METADATA_KEYS, `${artifact.id} metadata`);
      for (const [key, value] of Object.entries(expected.metadata)) if (artifact.metadata[key] !== value) throw new Error(`${artifact.id} metadata identity mismatch.`);
      if (artifact.metadata.repositoryPath !== null) throw new Error(`${artifact.id} metadata must remain external.`);
      exactKeys(artifact.metadata.accessEvidence, ACCESS_KEYS, `${artifact.id} metadata access evidence`);
    }
    exactKeys(artifact.accessEvidence, ACCESS_KEYS, `${artifact.id} access evidence`);
    exactKeys(artifact.rightsFacts, RIGHTS_KEYS, `${artifact.id} rights facts`);
    if (artifact.rightsFacts.repositoryLicenceInference !== "NONE") throw new Error(`${artifact.id} rights inference is forbidden.`);
    if (artifact.id.startsWith("nasa-") && (artifact.rightsFacts.distribution !== "PUBLIC" || artifact.rightsFacts.determinationType !== "PUBLIC_USE_PERMITTED" || artifact.rightsFacts.isExportControl !== "NO" || artifact.rightsFacts.ear !== "NO" || artifact.rightsFacts.itar !== "NO")) throw new Error(`${artifact.id} NASA rights facts mismatch.`);
    if (artifact.id === "faa-h-8083-2a" && [artifact.rightsFacts.determinationType, artifact.rightsFacts.isExportControl, artifact.rightsFacts.ear, artifact.rightsFacts.itar].some((value) => value !== "NOT_ESTABLISHED_BY_SOURCE_TERMS")) throw new Error("FAA rights/export facts must remain unestablished.");
    verifyDecisionSet(artifact.decisions, artifact.id);
    if (!Array.isArray(artifact.pageMaps) || artifact.pageMaps.length !== expected.pages.length) throw new Error(`${artifact.id} page map count mismatch.`);
    artifact.pageMaps.forEach((page, index) => {
      exactKeys(page, PAGE_KEYS, `${artifact.id} page map ${index}`);
      const [pdfPage, printedPage, renderSha256] = expected.pages[index];
      if (page.pdfPage !== pdfPage || page.printedPage !== printedPage || page.renderSha256 !== renderSha256 || !SHA256.test(page.renderSha256)) throw new Error(`${artifact.id} page map mismatch.`);
      if (!/^[A-Z0-9_]+$/u.test(page.anchor) || !/^[A-Z0-9_]+$/u.test(page.eligibleClaim) || !/^[A-Z0-9_]+$/u.test(page.ineligibleInference)) throw new Error(`${artifact.id} page anchor or claim encoding mismatch.`);
      if (/(?:^|_)(?:ACTION|COMBAT|WEAPON|TARGET|ENGAGEMENT|DOCTRINE|TACTIC|ROE|INTERCEPT|SWEEP|ESCORT|RECOMMIT|F16|SU30|ASTRA)(?:_|$)/u.test(page.eligibleClaim)) throw new Error(`${artifact.id} eligible claim contains prohibited military, named-platform, or action authority.`);
    });
  }
  if (manifest.renderProfile.id !== "darwin-arm64-poppler-26.05.0-150dpi-rgb8-png" || manifest.renderProfile.renderer !== "pdftoppm" || manifest.renderProfile.rendererVersion !== "26.05.0" || manifest.renderProfile.dpi !== 150 || manifest.renderProfile.format !== "PNG" || manifest.renderProfile.crossPlatformByteIdentityClaimed !== false || manifest.renderProfile.renderSetDigest !== RENDER_SET_DIGEST) throw new Error("Render profile identity mismatch.");
  if (!Array.isArray(manifest.rejectedAlternates) || manifest.rejectedAlternates.length !== 1 || manifest.rejectedAlternates[0].sha256 !== "91648a0c709cae3c1072d1dd80a3ced748687350635146d9e18f00ec1f40e558" || manifest.rejectedAlternates[0].byteLength !== 4205732 || manifest.rejectedAlternates[0].status !== "REJECTED_NOT_BYTE_IDENTICAL_NOT_SEPARATELY_GOVERNED" || manifest.rejectedAlternates[0].repositoryPath !== null) throw new Error("Alternate-copy rejection mismatch.");
  if (!Array.isArray(manifest.excludedSources) || manifest.excludedSources.length !== 4) throw new Error("Excluded-source inventory mismatch.");
  for (const excluded of manifest.excludedSources) {
    if (excluded.contentAcquired !== false || !Array.isArray(excluded.eligibleClaims) || excluded.eligibleClaims.length !== 0) throw new Error(`${excluded.id} excluded content must remain unacquired and claim-free.`);
    if (excluded.id.startsWith("AFDP") && excluded.availability !== "UNVERIFIED_DISCOVERY_ONLY") throw new Error(`${excluded.id} must remain discovery-only.`);
    if (!excluded.id.startsWith("AFDP") && excluded.availability !== "PERMANENTLY_INELIGIBLE") throw new Error(`${excluded.id} must remain permanently ineligible.`);
  }
  const assumptionClasses = ["CADENCE", "THRESHOLD", "PRIORITY", "TIE_BREAK", "HYSTERESIS", "TIMEOUT", "FUEL_VALUE", "RESERVE_VALUE", "ROUTE_GEOMETRY", "ACTION_MAPPING", "COMMAND_BOUND", "DOCTRINE", "RULES_OF_ENGAGEMENT"];
  if (JSON.stringify(manifest.unresolvedAssumptionClasses.map(({ class: name }) => name)) !== JSON.stringify(assumptionClasses) || manifest.unresolvedAssumptionClasses.some((entry) => entry.availability !== "MODEL_ASSUMPTION" || entry.valuePresent !== false || Object.keys(entry).length !== 3)) throw new Error("Model-assumption inventory contains an executable value or is incomplete.");
  if (manifest.governanceBindings.sourceTermsEvidenceSha256 !== SOURCE_TERMS_SHA256 || manifest.governanceBindings.issue !== "https://github.com/SrivatsaRv/vector-engagements-labs/issues/151") throw new Error("Governance binding mismatch.");
  const digest = canonicalManifestDigest(manifest);
  if (!SHA256.test(manifest.canonicalDigest) || manifest.canonicalDigest !== digest || manifest.canonicalDigest !== EXPECTED_MANIFEST_DIGEST) throw new Error("Canonical manifest digest mismatch.");
  return manifest;
}

function verifySourceTerms(root, manifest) {
  const path = join(root, manifest.governanceBindings.sourceTermsEvidencePath);
  const bytes = governedFile(path, "Source-terms evidence");
  if (sha256(bytes) !== SOURCE_TERMS_SHA256) throw new Error("Source-terms evidence byte identity mismatch.");
  const evidence = JSON.parse(bytes.toString("utf8"));
  if (evidence.schemaVersion !== "vector.generic-mission-policy-source-terms-evidence.v1" || evidence.evidenceClass !== "SOURCE_TERMS_EVIDENCE" || evidence.legalAdvice !== false || evidence.boundary !== "AUTHORITATIVE_FACTS_ONLY_NON_LEGAL_NO_REDISTRIBUTION_OR_ADAPTATION_GRANT") throw new Error("Source-terms evidence boundary mismatch.");
  return evidence;
}

function verifyReleaseReview(root, manifest) {
  const bytes = governedFile(join(root, manifest.governanceBindings.releaseOwnerReviewPath), "Release-owner visual review");
  if (sha256(bytes) !== RELEASE_REVIEW_SHA256) throw new Error("Release-owner technical review byte identity mismatch.");
  const review = JSON.parse(bytes.toString("utf8"));
  if (review.schemaVersion !== "vector.generic-mission-policy-release-owner-visual-review.v1" || review.status !== "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE" || review.reviewerRole !== "RELEASE_OWNER_REVIEW" || review.reviewKind !== "TECHNICAL_SEMANTIC_NON_LEGAL" || review.reviewedOn !== "2026-08-26") throw new Error("Release-owner technical review is incomplete or has invented authority.");
  if (review.subject.manifestId !== manifest.id || review.subject.manifestCanonicalDigest !== manifest.canonicalDigest || review.subject.sourceSetDigest !== SOURCE_SET_DIGEST || review.subject.renderProfileId !== manifest.renderProfile.id || review.subject.renderSetDigest !== RENDER_SET_DIGEST || review.subject.pageCount !== 15) throw new Error("Release-owner technical review subject binding mismatch.");
  const requiredTrue = ["exactSourceIdentityConsistent", "reportAndTitleIdentityConsistent", "declaredPageMappingConsistent", "printedAndPdfPageNumberingConsistent", "legible", "orientationReadable", "visibleRightsNoticeRecorded", "limitationsAndNonclaimsConsistent"];
  if (requiredTrue.some((field) => review.attestations[field] !== true) || review.attestations.numericValuesOrEquationsTranscribed !== false || review.attestations.legalApprovalGranted !== false) throw new Error("Release-owner technical review attestations are incomplete or exceed authority.");
  if (review.contactSheets.length !== 3 || review.contactSheets.some((entry) => entry.committed !== false || !SHA256.test(entry.sha256))) throw new Error("External contact-sheet review binding mismatch.");
  return review;
}

function verifyProductionEvidence(root, manifest) {
  const bytes = governedFile(join(root, manifest.governanceBindings.productionIsolationEvidencePath), "Production-isolation evidence");
  if (sha256(bytes) !== PRODUCTION_EVIDENCE_SHA256) throw new Error("Production-isolation evidence byte identity mismatch.");
  const evidence = JSON.parse(bytes.toString("utf8"));
  if (evidence.schemaVersion !== "vector.generic-mission-policy-production-isolation-evidence.v1" || evidence.status !== "PASS" || evidence.executedOn !== "2026-08-26" || evidence.command !== "npm run policy:generic-mission-policy-source:verify" || evidence.exactCommitBinding !== "PR_AND_ISSUE_COMPLETION_EVIDENCE_REQUIRED_AFTER_COMMIT" || evidence.manifestCanonicalDigest !== manifest.canonicalDigest) throw new Error("Production-isolation evidence scope or manifest binding mismatch.");
  if (JSON.stringify(evidence.scannedRoots) !== JSON.stringify(PRODUCTION_ROOTS) || JSON.stringify(evidence.forbiddenMarkers) !== JSON.stringify(FORBIDDEN_MARKERS)) throw new Error("Production-isolation evidence coverage mismatch.");
  return evidence;
}

export function loadAndVerifyGenericMissionPolicyGovernance(rootDirectory = resolve("governance/generic-mission-policy-verification-source"), { requireProductionEvidence = true } = {}) {
  const root = resolve(rootDirectory);
  const manifest = verifyGenericMissionPolicyManifest(JSON.parse(governedFile(join(root, "manifest.v1.json"), "Generic mission-policy manifest").toString("utf8")));
  const sourceTerms = verifySourceTerms(root, manifest);
  const review = verifyReleaseReview(root, manifest);
  let productionEvidence = null;
  if (requireProductionEvidence) productionEvidence = verifyProductionEvidence(root, manifest);
  return { manifest, sourceTerms, review, productionEvidence };
}

function pdfPageCount(path) {
  const result = spawnSync("pdfinfo", [path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`pdfinfo failed for ${basename(path)}: ${result.stderr.trim()}`);
  const match = /^Pages:\s+(\d+)$/mu.exec(result.stdout);
  if (!match) throw new Error(`pdfinfo did not report a page count for ${basename(path)}.`);
  return Number(match[1]);
}

function verifyRendererVersion() {
  const result = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 || !output.includes("pdftoppm version 26.05.0")) throw new Error("pdftoppm version 26.05.0 is required for the governed render profile.");
}

function renderPage(pdfPath, page, outputRoot) {
  const prefix = join(outputRoot, `page-${String(page.pdfPage).padStart(3, "0")}`);
  const result = spawnSync("pdftoppm", ["-f", String(page.pdfPage), "-l", String(page.pdfPage), "-r", "150", "-png", "-singlefile", pdfPath, prefix], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`pdftoppm failed for ${basename(pdfPath)} page ${page.pdfPage}: ${result.stderr.trim()}`);
  const bytes = governedFile(`${prefix}.png`, `Rendered page ${page.pdfPage}`);
  if (sha256(bytes) !== page.renderSha256) throw new Error(`Rendered page ${page.pdfPage} digest mismatch for ${basename(pdfPath)}.`);
  return page.renderSha256;
}

export function verifyExternalSourceBundle(sourceDirectory, governanceRoot = resolve("governance/generic-mission-policy-verification-source")) {
  if (!sourceDirectory) throw new Error("VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR or --source-dir must identify exact user-supplied source bytes.");
  const { manifest } = loadAndVerifyGenericMissionPolicyGovernance(governanceRoot);
  verifyRendererVersion();
  const renderedPages = [];
  for (const artifact of manifest.artifacts) {
    const pdf = governedExternalFile(sourceDirectory, artifact.pdf.fileName, `${artifact.id} PDF`);
    verifyExactBytes(pdf.bytes, artifact.pdf, `${artifact.id} PDF`);
    if (createHash("md5").update(pdf.bytes).digest("hex") !== artifact.pdf.md5) throw new Error(`${artifact.id} PDF MD5/ETag mismatch.`);
    if (pdfPageCount(pdf.path) !== artifact.pdf.pageCount) throw new Error(`${artifact.id} PDF page count mismatch.`);
    if (artifact.metadata) {
      const metadata = governedExternalFile(sourceDirectory, artifact.metadata.fileName, `${artifact.id} metadata`);
      verifyExactBytes(metadata.bytes, artifact.metadata, `${artifact.id} metadata`);
      const parsed = JSON.parse(metadata.bytes.toString("utf8"));
      if (parsed.distribution !== artifact.rightsFacts.distribution || parsed.copyright?.determinationType !== artifact.rightsFacts.determinationType || parsed.exportControl?.isExportControl !== artifact.rightsFacts.isExportControl || parsed.exportControl?.ear !== artifact.rightsFacts.ear || parsed.exportControl?.itar !== artifact.rightsFacts.itar) throw new Error(`${artifact.id} metadata rights/export facts mismatch.`);
    }
    const outputRoot = mkdtempSync(join(tmpdir(), "vector-mission-policy-render-"));
    try {
      for (const page of artifact.pageMaps) {
        renderedPages.push({
          orderKey: `${artifact.id}:${String(page.pdfPage).padStart(3, "0")}`,
          digest: renderPage(pdf.path, page, outputRoot),
        });
      }
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  }
  const alternate = manifest.rejectedAlternates[0];
  const alternateBytes = governedExternalFile(sourceDirectory, alternate.fileName, "Rejected NASA alternate PDF");
  verifyExactBytes(alternateBytes.bytes, alternate, "Rejected NASA alternate PDF");
  if (alternate.sha256 === manifest.artifacts[0].pdf.sha256 || alternate.byteLength === manifest.artifacts[0].pdf.byteLength) throw new Error("Alternate NASA copy was laundered into the admitted identity.");
  const sourceDigest = sha256(Buffer.from([
    manifest.artifacts[0].metadata.sha256,
    manifest.artifacts[0].pdf.sha256,
    manifest.artifacts[1].metadata.sha256,
    manifest.artifacts[1].pdf.sha256,
    manifest.artifacts[2].pdf.sha256,
    alternate.sha256,
  ].join("\n") + "\n"));
  const renderDigests = renderedPages.sort((left, right) => left.orderKey < right.orderKey ? -1 : left.orderKey > right.orderKey ? 1 : 0).map(({ digest }) => digest);
  const renderDigest = sha256(Buffer.from(`${renderDigests.join("\n")}\n`));
  if (sourceDigest !== SOURCE_SET_DIGEST || renderDigest !== RENDER_SET_DIGEST) throw new Error("Source-set or render-set digest mismatch.");
  return { artifactsVerified: 3, metadataSnapshotsVerified: 2, md5DigestsVerified: 3, pagesVerified: renderDigests.length, alternateCopiesRejected: 1, sourceSetDigest: sourceDigest, renderSetDigest: renderDigest };
}

export function verifyProductionIsolation(repositoryRoot = process.cwd()) {
  const examined = [];
  for (const relativeRoot of PRODUCTION_ROOTS) {
    const root = resolve(repositoryRoot, relativeRoot);
    try {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        examined.push(path);
        const bytes = readFileSync(path);
        if (FORBIDDEN_MARKERS.some((marker) => bytes.includes(Buffer.from(marker)))) throw new Error(`${relativeRoot.startsWith("fixtures/") ? "Runtime fixture" : "Production"} source-only mission-policy evidence leaked into ${relative(repositoryRoot, path)}.`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return examined.length;
}

export const GENERIC_MISSION_POLICY_CONSTANTS = Object.freeze({
  sourceSetDigest: SOURCE_SET_DIGEST,
  sourceTermsSha256: SOURCE_TERMS_SHA256,
  renderSetDigest: RENDER_SET_DIGEST,
  productionRoots: PRODUCTION_ROOTS,
  forbiddenMarkers: FORBIDDEN_MARKERS,
});
