#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  canonicalJson,
  canonicalManifestDigest,
  parseBoundedZip,
  sha256,
} from "./lib/generic-sensor-source-verifier.mjs";

const root = resolve("governance/generic-sensor-verification-sources");
const write = process.argv.includes("--write");
const manifestId = "generic-sensor-source-freeze-v1";

const expected = {
  "raw/stone-soup/Stone-Soup-v1.9.1.zip": [24_412_569, "728449aeac17bf2a233cd052b42f8306a7742fad26715be3f780abfbaf50abab"],
  "raw/stone-soup/zenodo-record-20830467.json": [7_178, "63095125c8a978dbac9125c29197e112c8ae7e5be80b2c60c358462af283bee0"],
  "raw/nasa/19660021027.metadata.json": [2_445, "7eced126f3df081c374d670819baa5698e1f725a0fe2c19ea978c3e887662267"],
  "raw/nasa/19660021027.pdf": [13_132_979, "2bacd3004112db0ce40bd5e3202e26fc5c880787cf072f111aa94a9c51c010de"],
  "raw/nasa/19770023372.metadata.json": [3_918, "a12f96902c6d522c9836ae343f5b269677d7d95eb406f6a0c8c0156068aaae71"],
  "raw/nasa/19770023372.pdf": [11_481_762, "a2826966045c4d293e4655d5ef70f87d59c07361fee7765415eeba4e8ea57a06"],
  "raw/nasa/19840019990.metadata.json": [2_922, "0fe15b44240eaad9b4203f2b212b231c94191176010642af5eca5be699de672a"],
  "raw/nasa/19840019990.pdf": [5_881_573, "cf94168c14cdd944cddaf22450db9405cf8a226163433d2b60ee35036ceb7747"],
  "raw/nasa/19800011044.metadata.json": [3_417, "f9b837ba6724c114389efc4c1158d27812f8be86022d4c168330a2af0bf2dda3"],
  "raw/nasa/19800011044.pdf": [1_220_660, "516547a9ea42ed46b20c348105ebbbbce1628f3e3eb96d6ec517a42647be4456"],
};

const selectedStoneMembers = [
  ["LICENSE", "LICENSE", "2462f3d8a857f601e266f048a4ff051366c1e05f098cf3a1524eaf922f879815"],
  ["CITATION.cff", "CITATION", "196887eaf79c03ebe33bbb4b8ee372c82a84f3dcae3160f01f8b8ac0c52bdbc4"],
  ["stonesoup/sensor/radar/radar.py", "SOURCE_LOCATION_ONLY", "8e926d708edcfae7cf5f9334b27dc7483875cebb8c464d38fe7b8def3d3689c6"],
  ["stonesoup/sensor/action/base.py", "SOURCE_LOCATION_ONLY", "ec3c61478e34289a5376579cffb9b21cf320923286d7522212536586dac4bcc1"],
  ["stonesoup/sensor/action/dwell_action.py", "SOURCE_LOCATION_ONLY", "82e7650bc7589f2e096625f350d1e28eb391fe1d736a6fee35e323512f4fc9f5"],
  ["stonesoup/models/measurement/nonlinear.py", "SOURCE_LOCATION_ONLY", "705328e367ade1c26fa43c0b4c22fedcdc87e58a111571ec681de8ab7e42cfdc"],
  ["stonesoup/models/clutter/clutter.py", "SOURCE_LOCATION_ONLY", "b72125e955ce6c8d37c4a0b659336115144dfd80e4eaaf27e2c91bade37d4835"],
  ["stonesoup/simulator/simple.py", "SOURCE_LOCATION_ONLY", "17a896ca25f9b063e4a98fb9bf0f4f9b9a1779a9981affe536b418d68013aba1"],
  ["stonesoup/measures/state.py", "SOURCE_LOCATION_ONLY", "89b0d26f1fa8ce5c538e13c7a0a42df35e6f2c1e6137079d2ac0355a304e202d"],
  ["stonesoup/hypothesiser/distance.py", "SOURCE_LOCATION_ONLY", "4ecd955d185a8f29074027ad02ffa9979fffcc6734f240e3b8ad0d387d4662e1"],
  ["stonesoup/dataassociator/neighbour.py", "SOURCE_LOCATION_ONLY", "bf1cde7dce3ba132cc6039248d842e2ef7cb9e4384272ca2be5c5a91251130f4"],
  ["stonesoup/dataassociator/_assignment.py", "SOURCE_LOCATION_ONLY", "a08042e9e654c74212ae0c8943f150ebaa7f93ce4924115c857a35847dc48c22"],
  ["stonesoup/predictor/kalman.py", "SOURCE_LOCATION_ONLY", "a4bbf4827c53c278b3ff764210ff1536c85e24bfbdf09eaafa429f07a278e5bf"],
  ["stonesoup/updater/kalman.py", "SOURCE_LOCATION_ONLY", "7fb3eff7972ab85da85d4ceed82d142828f164e1161f4b63c33a66042e722794"],
  ["stonesoup/models/transition/linear.py", "SOURCE_LOCATION_ONLY", "750919652bea4e9b09b704534044f9e6e83d0c6d5474e83888c4ea1a75f28fdb"],
  ["docs/tutorials/05_DataAssociation-Clutter.py", "SOURCE_LOCATION_ONLY", "461bd4a924a2c38ee0b4224b6c3d9066c211e9194ccfed5ed76b4b665cd9ce6a"],
];

function bytes(path) {
  return readFileSync(resolve(root, path));
}

function artifact(path, role, state = "REFERENCE_ONLY") {
  const content = bytes(path);
  const known = expected[path];
  if (known && (content.length !== known[0] || sha256(content) !== known[1])) throw new Error(`frozen artifact mismatch: ${path}`);
  return { path, role, state, sizeBytes: content.length, sha256: sha256(content) };
}

function renderArtifact(path) {
  return artifact(path, "OFFLINE_FULL_PAGE_RENDER", "NON_AUTHORITATIVE_DISCOVERY_AID");
}

function renderPages(ntrsId, pages, relevantPages, reportPage) {
  return pages.map((sourcePdfPage) => {
    const stem = String(sourcePdfPage).padStart(3, "0");
    const sourceRender = renderArtifact(`renders/${ntrsId}/pdf-${stem}.png`);
    const displayPath = `renders/${ntrsId}/pdf-${stem}-display-upright.png`;
    const result = {
      sourcePdfPage,
      reportPage: reportPage(sourcePdfPage),
      purpose: relevantPages.includes(sourcePdfPage) ? "RELEVANT_SOURCE_CONTEXT" : "IDENTITY_OR_LIMITATION_CONTEXT",
      sourceRender,
      displayTransform: "NONE",
      displayRender: null,
    };
    try {
      result.displayRender = artifact(displayPath, "OFFLINE_UPRIGHT_DISPLAY_RENDER", "NON_AUTHORITATIVE_DISCOVERY_AID");
      result.displayTransform = "ROTATE_90_DEGREES_CLOCKWISE";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return result;
  });
}

function sourceClaim(text, state = "REFERENCE_ONLY") {
  return { kind: "BIBLIOGRAPHIC_OR_SOURCE_LOCATION_ONLY", state, text };
}

function nasaSource({ id, ntrsId, reportNumber, title, metadataPath, pdfPath, pages, relevantPages, reportPage, eligible, ineligible, negativeScopeOnly = false }) {
  return {
    id,
    publisher: "NASA",
    title,
    ntrsId,
    reportNumber,
    canonicalUrl: `https://ntrs.nasa.gov/citations/${ntrsId}`,
    state: "REFERENCE_ONLY",
    rights: { distribution: "PUBLIC", publicUse: "GOV_PUBLIC_USE_PERMITTED", exportControl: "NO", ear: "NO", itar: "NO" },
    artifacts: [artifact(metadataPath, "OFFICIAL_METADATA"), artifact(pdfPath, "SOURCE_PDF")],
    relevantLocations: [{ pdfPages: relevantPages, reportPages: relevantPages.map(reportPage) }],
    renderPages: renderPages(ntrsId, pages, relevantPages, reportPage),
    eligibleClaims: eligible.map((text) => sourceClaim(text)),
    ineligibleClaims: ineligible.map((text) => ({ state: "INELIGIBLE", text })),
    negativeScopeOnly,
    extractedTextPolicy: {
      state: "NON_AUTHORITATIVE_DISCOVERY_AID",
      maySupplyNumericValues: false,
      maySupplyEquations: false,
    },
  };
}

const archiveArtifact = artifact("raw/stone-soup/Stone-Soup-v1.9.1.zip", "SOURCE_ARCHIVE");
const parsed = parseBoundedZip(bytes(archiveArtifact.path));
const inventory = {
  schemaVersion: "vector.generic-sensor-verification-archive-inventory.v1",
  archivePath: archiveArtifact.path,
  archiveSha256: archiveArtifact.sha256,
  entryCount: parsed.entries.length,
  totalExpandedBytes: parsed.totalExpandedBytes,
  entries: parsed.entries.map((entry) => ({
    path: entry.path,
    compressionMethod: entry.compressionMethod,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    crc32Hex: entry.crc32Hex,
    unixMode: entry.unixMode,
    localHeaderOffset: entry.localHeaderOffset,
  })),
};

const visualPages = [];
const visualInspection = {
  schemaVersion: "vector.generic-sensor-verification-visual-inspection.v1",
  status: "PRIMARY_INSPECTION_COMPLETE_INDEPENDENT_REVIEW_REQUIRED",
  inspectionDate: "2026-08-24",
  inspectionMethod: "FULL_PAGE_RENDER_VISUAL_REVIEW",
  reviewerRole: "PRIMARY_SOURCE_FREEZE_IMPLEMENTER",
  limitations: [
    "This record is not an authorized human legal or export decision.",
    "An independent exact-commit review remains required before publication.",
    "Rendered images and any OCR are navigation aids; source PDF bytes remain authoritative.",
  ],
  pages: visualPages,
};

const legalDecision = (sourceId) => ({
  sourceId,
  redistribution: pending("AUTHORIZED_HUMAN_REDISTRIBUTION_REVIEW_REQUIRED"),
  referenceExecution: pending("AUTHORIZED_HUMAN_REFERENCE_EXECUTION_REVIEW_REQUIRED"),
  adaptation: pending("AUTHORIZED_HUMAN_ADAPTATION_REVIEW_REQUIRED"),
});

function pending(blockingReason) {
  return {
    state: "PENDING_REVIEW",
    reviewer: null,
    decisionRecordId: null,
    decidedOn: null,
    jurisdiction: null,
    scope: [],
    conditions: [],
    evidenceSha256: null,
    blockingReason,
  };
}

const nasaSources = [
  nasaSource({
    id: "nasa-cr-66097",
    ntrsId: "19660021027",
    reportNumber: "NASA-CR-66097",
    title: "An analytical investigation of radio frequency interference and acquisition probability for a combination radar and telemetry system  Final report, May 14, 1965 - May 31, 1965",
    metadataPath: "raw/nasa/19660021027.metadata.json",
    pdfPath: "raw/nasa/19660021027.pdf",
    pages: [1, 143, 144],
    relevantPages: [143, 144],
    reportPage: (page) => ({ 143: "134", 144: "135" })[page] ?? null,
    eligible: ["Source-location evidence for conditional single-look detection and false-alarm concepts."],
    ineligible: ["Spatial false-plot generation, calibrated detection behavior, parameters, applicability, and model implementation."],
  }),
  nasaSource({
    id: "nasa-cr-151497",
    ntrsId: "19770023372",
    reportNumber: "NASA-CR-151497",
    title: "Study to investigate and evaluate means of optimizing the Ku-band combined radar/communication functions for the space shuttle",
    metadataPath: "raw/nasa/19770023372.metadata.json",
    pdfPath: "raw/nasa/19770023372.pdf",
    pages: [1, 2, 3, 4, 53, 54, 55, 56],
    relevantPages: [53, 54, 55, 56],
    reportPage: (page) => ({ 53: "2", 54: "3", 55: "4", 56: "5" })[page] ?? null,
    eligible: ["Source-location evidence for the monostatic inverse-fourth-power range relation and its defined terms."],
    ineligible: ["Every Shuttle-specific value, parameter, result, installation claim, calibration, applicability claim, and model behavior."],
  }),
  nasaSource({
    id: "nasa-cr-168347",
    ntrsId: "19840019990",
    reportNumber: "NASA-CR-168347",
    title: "Radar data smoothing filter study",
    metadataPath: "raw/nasa/19840019990.metadata.json",
    pdfPath: "raw/nasa/19840019990.pdf",
    pages: [1, ...Array.from({ length: 17 }, (_, index) => 82 + index)],
    relevantPages: Array.from({ length: 17 }, (_, index) => 82 + index),
    reportPage: (page) => page >= 82 ? `5-${page - 57}` : null,
    eligible: ["Source-location evidence for coordinate-transform, covariance, innovation, and Kalman-equation context."],
    ineligible: ["Site-specific radar values, payload data, error statistics, tuning, calibration, applicability, and model behavior."],
  }),
  nasaSource({
    id: "nasa-cr-160557",
    ntrsId: "19800011044",
    reportNumber: "NASA-CR-160557",
    title: "Ku-band radar threshold analysis",
    metadataPath: "raw/nasa/19800011044.metadata.json",
    pdfPath: "raw/nasa/19800011044.pdf",
    pages: Array.from({ length: 15 }, (_, index) => index + 1),
    relevantPages: Array.from({ length: 11 }, (_, index) => index + 5),
    reportPage: () => null,
    eligible: ["Negative-scope source-location evidence for unresolved threshold-analysis limitations."],
    ineligible: ["CFAR implementation, threshold behavior, detection-probability consequence, numeric parameters, calibration, applicability, and model behavior."],
    negativeScopeOnly: true,
  }),
];

for (const source of nasaSources) {
  for (const page of source.renderPages) {
    visualPages.push({
      sourceId: source.id,
      sourcePdfPage: page.sourcePdfPage,
      reportPage: page.reportPage,
      purpose: page.purpose,
      titleAndReportIdentityChecked: true,
      equationContextChecked: true,
      limitationsChecked: true,
      result: "CONSISTENT_WITH_DECLARED_SOURCE_ONLY_SCOPE",
    });
  }
}

const output = (path, value) => {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (write) writeFileSync(resolve(root, path), rendered);
  else if (readFileSync(resolve(root, path), "utf8") !== rendered) throw new Error(`${path} is stale; run this script with --write`);
};

output("archive-inventory.v1.json", inventory);
output("visual-inspection.v1.json", visualInspection);

const sourceIds = ["dstl-stone-soup-v1.9.1", ...nasaSources.map((source) => source.id)];
const decisions = {
  schemaVersion: "vector.generic-sensor-verification-legal-decisions.v1",
  decisionArtifactId: "generic-sensor-source-legal-decisions-v1",
  subjectManifestId: manifestId,
  intendedUse: "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE",
  authorityBoundary: "APPROVAL_REQUIRES_AN_ALLOWLISTED_HUMAN_AND_AN_EXTERNALLY_ROOTED_DETACHED_ATTESTATION",
  decisions: sourceIds.map(legalDecision),
};
output("legal-decisions.v1.json", decisions);

const authorityRegistry = {
  schemaVersion: "vector.generic-sensor-verification-legal-authority-registry.v1",
  registryId: "generic-sensor-source-legal-authority-registry-v1",
  subjectDecisionArtifactId: decisions.decisionArtifactId,
  authorityPolicyId: "generic-sensor-legal-authority-policy-v1",
  externalTrustRootRequired: true,
  status: "NO_SIGNED_DECISION_RECORDS_REGISTERED",
  decisionRecords: [],
  blockingReason: "PINNED_EXTERNAL_AUTHORITY_POLICY_SIGNED_RECORD_AND_RESOLVABLE_EVIDENCE_REQUIRED",
};
output("legal-authority-registry.v1.json", authorityRegistry);

const inventoryArtifact = artifact("archive-inventory.v1.json", "COMPLETE_ARCHIVE_INVENTORY");
const visualArtifact = artifact("visual-inspection.v1.json", "PRIMARY_VISUAL_INSPECTION_RECORD", "NON_AUTHORITATIVE_DISCOVERY_AID");
const legalArtifact = artifact("legal-decisions.v1.json", "LEGAL_AND_EXPORT_DECISIONS", "REFERENCE_ONLY");
const authorityArtifact = artifact("legal-authority-registry.v1.json", "SIGNED_LEGAL_DECISION_RECORD_REGISTRY", "REFERENCE_ONLY");
const prefix = "dstl-Stone-Soup-d9e6fb1/";
const stoneSource = {
  id: "dstl-stone-soup-v1.9.1",
  publisher: "Defence Science and Technology Laboratory (Dstl)",
  title: "Stone Soup",
  version: "v1.9.1",
  doi: "10.5281/zenodo.20830467",
  canonicalUrl: "https://zenodo.org/records/20830467",
  state: "REFERENCE_ONLY",
  archiveSha256: archiveArtifact.sha256,
  rights: { licence: "MIT", access: "OPEN", exportControl: "NOT_STATED", ear: "NOT_STATED", itar: "NOT_STATED" },
  artifacts: [archiveArtifact, artifact("raw/stone-soup/zenodo-record-20830467.json", "OFFICIAL_METADATA")],
  archiveLimits: { maxArchiveBytes: 33_554_432, maxExpandedBytes: 67_108_864, maxEntries: 2_000 },
  archiveInventory: inventoryArtifact,
  vcs: {
    annotatedTag: "v1.9.1",
    annotatedTagObject: "d9e6fb16f5ae176817aeb6a6fc3a39f544694408",
    annotatedTagSigned: false,
    resolvedCommit: "a4336b920a799cfe0a77ecb05867c5deeb371c7a",
    resolvedCommitSignature: "VERIFIED",
  },
  extractedMembers: selectedStoneMembers.map(([path, role, expectedSha]) => {
    const extractedArtifact = artifact(`extracted/stone-soup-v1.9.1/${path}`, role);
    if (extractedArtifact.sha256 !== expectedSha) throw new Error(`selected member mismatch: ${path}`);
    return { archivePath: `${prefix}${path}`, role, state: "REFERENCE_ONLY", extractedArtifact };
  }),
  eligibleClaims: [sourceClaim("Source-location pointers to public generic sensor, measurement, filtering, and association reference material.")],
  ineligibleClaims: [
    { state: "INELIGIBLE", text: "Execution, import, translation, adaptation, generated vectors, parameters, calibration, applicability, and production model behavior." },
  ],
  extractedTextPolicy: { state: "NON_AUTHORITATIVE_DISCOVERY_AID", maySupplyNumericValues: false, maySupplyEquations: false },
};

const frozenArtifacts = new Map();
const collectArtifact = (candidate) => {
  if (candidate?.path && Number.isInteger(candidate.sizeBytes) && candidate.sha256) frozenArtifacts.set(candidate.path, candidate);
};
for (const source of [stoneSource, ...nasaSources]) {
  for (const candidate of source.artifacts) collectArtifact(candidate);
  collectArtifact(source.archiveInventory);
  for (const member of source.extractedMembers ?? []) collectArtifact(member.extractedArtifact);
  for (const page of source.renderPages ?? []) {
    collectArtifact(page.sourceRender);
    collectArtifact(page.displayRender);
  }
}
collectArtifact(visualArtifact);
collectArtifact(legalArtifact);
collectArtifact(authorityArtifact);
const isolationEvidence = {
  schemaVersion: "vector.generic-sensor-verification-production-isolation-evidence.v1",
  subjectManifestId: manifestId,
  measuredOn: "2026-08-25",
  frozenArtifactCount: frozenArtifacts.size,
  frozenArtifactBytes: [...frozenArtifacts.values()].reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
  productionRootsScannedByVerifier: [".next", ".output", "app", "build", "components", "db", "dist", "engine-rust", "fixtures/model-packs", "fixtures/vector-record", "lib", "out", "public", "worker"],
  expectedProductionExposures: 0,
  productionBuildImportPolicy: "FORBIDDEN",
  networkPolicy: "DENY_ALL_NODE_NETWORK_APIS",
  regressionCommand: "npm run generic-sensor:sources:verify",
  productionBuildCommand: "npm run build",
  postBuildRegressionCommand: "npm run generic-sensor:sources:verify",
  omittedRuntimeLayers: ["BROWSER", "DATABASE", "MIGRATION", "NUMERICAL_PARITY", "PERFORMANCE"],
  omissionReason: "STAGE_0_ADDS_NO_RUNTIME_BEHAVIOR",
};
output("production-isolation-evidence.v1.json", isolationEvidence);
const isolationArtifact = artifact("production-isolation-evidence.v1.json", "PRODUCTION_ISOLATION_SIZE_EVIDENCE");

const manifest = {
  schemaVersion: "vector.generic-sensor-verification-source-manifest.v1",
  manifestId,
  subjectId: "generic-sensor-verification-reference-sources",
  intendedUse: "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE",
  status: "BLOCKED_PENDING_HUMAN_REVIEW",
  generatedBy: { script: basename(import.meta.filename), mode: "OFFLINE_ONLY" },
  sourcePolicy: {
    immutableContentAddressingRequired: true,
    redistributionPermitted: false,
    productionRuntimeUsePermitted: false,
    stoneSoupExecutionPermitted: false,
    stoneSoupAdaptationPermitted: false,
    numericModelTranscriptionPermitted: false,
    namedSystemClaimsPermitted: false,
  },
  renderRecipe: {
    sourceRender: { tool: "pdftoppm", version: "26.05.0", dpi: 150, colourMode: "GRAYSCALE", extent: "FULL_PAGE", arguments: ["-r", "150", "-gray", "-f", "${PDF_PAGE}", "-l", "${PDF_PAGE}", "-singlefile", "-png"] },
    uprightDisplayRender: {
      tool: "sharp",
      version: "0.35.0",
      operation: "ROTATE_90_DEGREES_CLOCKWISE",
      pngEncoder: { compressionLevel: 9, adaptiveFiltering: false, palette: false },
      sourcePreserved: true,
    },
    state: "NON_AUTHORITATIVE_DISCOVERY_AID",
  },
  visualInspection: visualArtifact,
  legalDecisions: legalArtifact,
  legalAuthorityRegistry: authorityArtifact,
  decisionReferences: sourceIds.map((sourceId) => ({
    sourceId,
    decisionArtifactId: decisions.decisionArtifactId,
    authorityRegistryId: authorityRegistry.registryId,
    fields: ["redistribution", "referenceExecution", "adaptation"],
  })),
  isolationEvidence: isolationArtifact,
  sources: [stoneSource, ...nasaSources],
};
manifest.canonicalManifestDigest = canonicalManifestDigest(manifest);
output("manifest.v1.json", manifest);

if (!write) process.stdout.write(`${canonicalJson({ manifestId, digest: manifest.canonicalManifestDigest })}\n`);
