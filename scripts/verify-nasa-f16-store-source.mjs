import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

export const MANIFEST_PATH = resolve(
  "governance/nasa-historical-f16-store-source/manifest.v1.json",
);

// This is an external anchor for the immutable manifest bytes. Contract changes
// require both the governed record and this verifier constant to be reviewed.
const EXPECTED_CANONICAL_DIGEST = "db4a8cd7fbdff99cc3f4653fe2d380980350afddaeba426051294963052b943a";
const EXPECTED_AUTHORITY_DIGEST = "03af846a698d6fcb461c5c82f3e2f352882edbffa2f08be2dae9523a672fa7ba";
const EXPECTED_VISUAL_REVIEW_DIGEST = "2548025eae965906ace12f40bfa3b33d1c2968155cf04dc322026f8e7b4a6ef9";
const EXPECTED_POLICY_DIGEST = "f22cf0cbebebadaea5c13e6b57ef8ccd883175cb93444cf4c77d6bac0c8e3d61";
const SHA256 = /^[a-f0-9]{64}$/;
const ROTATIONS = new Set([0, 90, 180, 270]);
const BANNED_PROMOTION = /\b(?:PAF|Block[ -]?52|Peace Drive|Su-30|DCS|War Thunder|game dump|community dump|stationCompatibility|loadout|dragCoefficient|modelPackParameter|runtimeCapability)\b/i;

const FROZEN_FILE_NAMES = new Set([
  "TM74078.pdf",
  "CR172354.pdf",
  "TM87766.pdf",
  "19780003061.json",
  "19870000632.json",
  "19860022096.json",
  "NASA_Public_Access_Plan.pdf",
]);

const FROZEN_BINARY_HASHES = new Set([
  "9daf1a24166a359731b2eb28cf6b7f3eff877de73d964ad4551cc8003ff8da78",
  "0aa427839db20133fd342f77ed2fa9bbe9907c26360a629c8ce2699921834485",
  "ce85f3664c03f6f1e1d18b57d645d60d93f19df5fbb7bb5cdaf3c8d2fbaab961",
  "14293d25ca78af273df30ed1f9891f7acd3f1999bc8af49b33e837662a6423cb",
  "c826c0626027eeb3e8ae252ac75b97f49602a903befd4bc4cb86a8578c8e03fe",
  "4274d309f1d150853a16b01a39476e48c846f02beeacd8a9a8f7b33ddd5b9f32",
  "797a273e0674be196173e685cb95e21f150e4047709fb77b4a322bf47a2374b1",
  "ad27de9fbb29686693d2636d2193ae2b403fac44aa33787ff09a7c64e9c9c451",
  "62527e076c7e1f2bdf9a8388f2de19893386364815cb9c1f0647dd3bd968e27b",
  "be664473efe34ae94903fdb116e9fe302e95066e739dd295c176b589f32cdb9c",
  "d8b2d9ba39ae9d589f7f0675db223ffa591454381f1bdaef126a8a8c1e4253c7",
  "509679436ea1b5323aacf0d2e65ca72cd166d8a7173a45dac305bbccc1b79e02",
  "dc771bc7d367156c6c1c3ab52f377ed784cc9b3e1c9773301bca699269b97ded",
  "6152ac27165b66cdfa0258c01a8f5662a64c3dd5b4930364e7b95340d3fd13b6",
  "42dceb040dcedd7951e26440e20e92617a995db8719baf329b47c03b59a95e2d",
  "02bb41101ead3bb82f5fa67141077f5ee3ff685f402b62a01a103750b4cefdf1",
  "56748df18ce1f6309b3d45f6856ab36a838239b0ba71bc5ae54c60c146acc7c1",
  "6f13acf801a84dbe1766d69d66c43cf62f182033d0f63faa47613e7b22337da0",
  "76f17879b975ed4a901e84a45e1ed3169f283418eb31dabbab1eede27b17c2dd",
  "bbe830c2e0ee85d4b765696889e0fd04f3481386141184539c87d40cafeb6950",
  "070df7beb19bfebdf72e957f7d327ce4b0b3bd52976a33da9eb2ebacd1e36a34",
  "3c559a9690802ad13f35d1e2bb18b28b7735bc85ef9c644ace155a634f13d5fb",
  "0b3bb921a25bb2e132b9631ccb1c553a30e8056d8bc8469859c1e3e293379707",
  "d64e130fe486d49b0b3f7998aee25c9338c175588a0de1a096ff5181dc6ae217",
  EXPECTED_POLICY_DIGEST,
]);

const TOP_LEVEL_KEYS = [
  "accessDate",
  "ancestry",
  "artifacts",
  "availabilityStates",
  "canonicalDigest",
  "conversionPolicy",
  "coordinateConcepts",
  "exportReviewDecision",
  "id",
  "intendedUse",
  "nonclaims",
  "permissions",
  "redistributionDecision",
  "referenceUseDecision",
  "releaseOwnerReview",
  "renderRecipe",
  "schemaVersion",
  "sourceTermsAuthority",
  "version",
];

const DECISION_KEYS = [
  "authorityKind",
  "authorityRecordId",
  "decisionDate",
  "evidenceDigest",
  "legalApproval",
  "scope",
  "value",
];

const EXPECTED_DECISIONS = {
  referenceUseDecision: {
    value: "SOURCE_TERMS_AUTHORIZED_INTERNAL_VERIFICATION_ONLY",
    scope: "EXACT_FROZEN_SOURCES_AND_DECLARED_REVIEW_RENDERS_FOR_INTERNAL_ENGINE_VERIFICATION_RESEARCH_ONLY",
  },
  redistributionDecision: {
    value: "SOURCE_TERMS_AUTHORIZED_EXACT_BYTES_AND_DECLARED_RENDERS",
    scope: "EXACT_FROZEN_NASA_BYTES_METADATA_POLICY_AND_DECLARED_FULL_PAGE_REVIEW_RENDERS_ONLY",
  },
  exportReviewDecision: {
    value: "SOURCE_METADATA_NO_RESTRICTION",
    scope: "EXACT_THREE_DIGEST_PINNED_NTRS_RECORDS_ONLY",
  },
};

const EXPECTED_PAGE_CATEGORIES = new Map([
  ["tm74078-figure2-loadings", "HISTORICAL_LOADING_FIGURE_NONEXHAUSTIVE"],
  ["tm74078-nine-stations", "HISTORICAL_STATION_COUNT_CONTEXT"],
  ["tm74078-figure4-span-fractions", "HISTORICAL_NONDIMENSIONAL_SPAN_CONTEXT"],
  ["cr172354-station-map", "HISTORICAL_STATION_MAPPING_CONTEXT"],
  ["cr172354-store-configuration", "CONFIGURATION_BOUNDED_STORE_ARRANGEMENT"],
  ["cr172354-table2-qualifications", "LEGACY_TABLE_QUALIFICATIONS"],
  ["cr172354-final-pylon-force", "FINAL_PYLON_FORCE_AND_ANALYSIS_QUALIFICATION"],
  ["cr172354-table2-values", "LEGACY_TABLE_LOCATION_AND_UNIT_CONTEXT"],
  ["cr172354-figure19-side-view", "TWO_DIMENSIONAL_SOURCE_DIAGRAM_ONLY"],
  ["tm87766-fsd-configuration", "CONFIGURATION_IDENTITY"],
  ["tm87766-test-conditions-p5", "TEST_CONDITION_BOUNDARY"],
  ["tm87766-test-conditions-p6", "SINGLE_EJECTION_SETUP_CONTEXT"],
  ["tm87766-results-p7", "INITIAL_PYLON_OBSERVATION"],
  ["tm87766-results-p8", "MODIFIED_PYLON_OBSERVATION"],
  ["tm87766-results-p9", "TEST_ENVELOPE_OBSERVATION"],
  ["tm87766-single-ejection-p10", "SINGLE_EJECTION_OBSERVATION"],
]);

const ARTIFACT_KEYS = [
  "authors",
  "citationId",
  "eligibleClaims",
  "id",
  "ineligibleInferences",
  "metadata",
  "pageMaps",
  "pdf",
  "publicationDate",
  "reportNumbers",
  "rightsFacts",
  "role",
  "subject",
  "title",
];

const PAGE_KEYS = [
  "anchor",
  "appliedDisplayRotationDeg",
  "coordinateSemantics",
  "eligibleClaim",
  "id",
  "ineligibleInference",
  "literalUnits",
  "pdfPage",
  "printedPage",
  "quantitySemantics",
  "render",
  "sourceOrientationDeg",
  "uncertaintyQualification",
  "visualQa",
];

function fail(message) {
  throw new Error(`NASA historical F-16 source manifest: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${label} keys differ: expected ${required.join(", ")}; received ${actual.join(", ")}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function computeCanonicalDigest(manifest) {
  const candidate = structuredClone(manifest);
  delete candidate.canonicalDigest;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(candidate)))
    .digest("hex");
}

function assertSha256(value, label) {
  if (!SHA256.test(value)) fail(`${label} must be a lowercase SHA-256`);
}

function assertAuthorizedDecision(decision, expected, label) {
  exactKeys(decision, DECISION_KEYS, label);
  if (
    decision.value !== expected.value ||
    decision.scope !== expected.scope ||
    decision.authorityKind !== "AUTHORITATIVE_SOURCE_TERMS" ||
    decision.authorityRecordId !== "nasa-historical-f16-store-source-terms-authority-20260825" ||
    decision.decisionDate !== "2026-08-25" ||
    decision.evidenceDigest !== EXPECTED_AUTHORITY_DIGEST ||
    decision.legalApproval !== false
  ) fail(`${label} is not bound to the reviewed source-terms authority`);
}

function assertRender(page, label) {
  exactKeys(page.render, [
    "displayByteLength",
    "displayHeightPx",
    "displaySha256",
    "displayWidthPx",
    "displayPath",
    "sourceByteLength",
    "sourceHeightPx",
    "sourcePath",
    "sourceSha256",
    "sourceWidthPx",
  ], `${label}.render`);
  for (const key of ["sourceByteLength", "sourceHeightPx", "sourceWidthPx", "displayByteLength", "displayHeightPx", "displayWidthPx"]) {
    if (!Number.isSafeInteger(page.render[key]) || page.render[key] <= 0) fail(`${label}.render.${key} must be a positive integer`);
  }
  assertSha256(page.render.sourceSha256, `${label}.render.sourceSha256`);
  assertSha256(page.render.displaySha256, `${label}.render.displaySha256`);
  for (const path of [page.render.sourcePath, page.render.displayPath]) {
    if (typeof path !== "string" || !path.startsWith("renders/") || path.includes("..")) fail(`${label} has an unsafe render path`);
  }
  if (!ROTATIONS.has(page.sourceOrientationDeg) || !ROTATIONS.has(page.appliedDisplayRotationDeg)) {
    fail(`${label} uses an unsupported orientation`);
  }
  const quarterTurn = page.appliedDisplayRotationDeg === 90 || page.appliedDisplayRotationDeg === 270;
  const expectedWidth = quarterTurn ? page.render.sourceHeightPx : page.render.sourceWidthPx;
  const expectedHeight = quarterTurn ? page.render.sourceWidthPx : page.render.sourceHeightPx;
  if (page.render.displayWidthPx !== expectedWidth || page.render.displayHeightPx !== expectedHeight) {
    fail(`${label} display dimensions do not match its governed pixel rotation`);
  }
  if (page.appliedDisplayRotationDeg === 0 && (
    page.render.sourceByteLength !== page.render.displayByteLength ||
    page.render.sourceSha256 !== page.render.displaySha256
  )) fail(`${label} zero-rotation display must be the exact source render`);
}

function assertVisualQa(page, label) {
  exactKeys(page.visualQa, [
    "legible",
    "note",
    "orientationReadable",
    "reviewDate",
    "reviewerRole",
    "reviewRecordPath",
    "status",
    "unclipped",
  ], `${label}.visualQa`);
  if (
    page.visualQa.status !== "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE" ||
    page.visualQa.reviewerRole !== "RELEASE_OWNER_REVIEW" ||
    page.visualQa.reviewDate !== "2026-08-25" ||
    page.visualQa.reviewRecordPath !== "release-owner-visual-review.v1.json" ||
    page.visualQa.orientationReadable !== true ||
    page.visualQa.legible !== true ||
    page.visualQa.unclipped !== true ||
    typeof page.visualQa.note !== "string" ||
    !page.visualQa.note.includes("no legal approval") ||
    !page.visualQa.note.includes("numeric transcription")
  ) fail(`${label}.visualQa is not the reviewed technical release-owner record`);
}

export function verifyManifest(manifest) {
  exactKeys(manifest, TOP_LEVEL_KEYS, "root");
  if (manifest.schemaVersion !== "vector.nasa-historical-f16-store-source-manifest.v1") fail("unsupported schema version");
  if (manifest.id !== "nasa-historical-f16-store-source-20260824" || manifest.version !== "1.0.0") fail("unexpected manifest identity");
  if (manifest.intendedUse !== "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE") fail("intended use must remain source-only");
  if (manifest.accessDate !== "2026-08-24") fail("access date differs from the reviewed acquisition");
  if (BANNED_PROMOTION.test(JSON.stringify(manifest.artifacts))) fail("named or executable promotion language is prohibited");

  const actualDigest = computeCanonicalDigest(manifest);
  if (manifest.canonicalDigest !== actualDigest) fail(`canonical digest mismatch: expected ${manifest.canonicalDigest}, received ${actualDigest}`);
  if (manifest.canonicalDigest !== EXPECTED_CANONICAL_DIGEST) fail("canonical digest is not the independently anchored reviewed value");

  if (JSON.stringify(manifest.availabilityStates) !== JSON.stringify(["REFERENCE_ONLY", "UNSUPPORTED", "MODEL_ASSUMPTION", "UNAVAILABLE"])) {
    fail("availability states differ from the closed source-only set");
  }
  assertAuthorizedDecision(manifest.referenceUseDecision, EXPECTED_DECISIONS.referenceUseDecision, "reference use decision");
  assertAuthorizedDecision(manifest.redistributionDecision, EXPECTED_DECISIONS.redistributionDecision, "redistribution decision");
  assertAuthorizedDecision(manifest.exportReviewDecision, EXPECTED_DECISIONS.exportReviewDecision, "export review decision");
  exactKeys(manifest.sourceTermsAuthority, ["path", "sha256"], "sourceTermsAuthority");
  if (manifest.sourceTermsAuthority.path !== "source-terms-authority.v1.json" || manifest.sourceTermsAuthority.sha256 !== EXPECTED_AUTHORITY_DIGEST) fail("source-terms authority reference differs");
  exactKeys(manifest.releaseOwnerReview, ["path", "reviewedPageCount", "status"], "releaseOwnerReview");
  if (manifest.releaseOwnerReview.path !== "release-owner-visual-review.v1.json" || manifest.releaseOwnerReview.status !== "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE" || manifest.releaseOwnerReview.reviewedPageCount !== 16) fail("release-owner review reference differs");
  exactKeys(manifest.permissions, ["adaptation", "execution", "modelAdmission", "numericOrEquationTranscription", "runtime"], "permissions");
  if (Object.values(manifest.permissions).some((value) => value !== false)) fail("source-only permissions must all remain false");

  exactKeys(manifest.renderRecipe, ["arguments", "displayRotation", "dpi", "format", "renderer", "rendererVersion"], "renderRecipe");
  exactKeys(manifest.renderRecipe.displayRotation, ["operation", "pngOptions", "tool", "toolVersion"], "renderRecipe.displayRotation");
  exactKeys(manifest.renderRecipe.displayRotation.pngOptions, ["compressionLevel", "palette"], "renderRecipe.displayRotation.pngOptions");
  if (manifest.renderRecipe.renderer !== "pdftoppm" || manifest.renderRecipe.rendererVersion !== "26.05.0" || manifest.renderRecipe.dpi !== 150 || manifest.renderRecipe.format !== "PNG") fail("render recipe identity differs");
  if (manifest.renderRecipe.displayRotation.tool !== "sharp" || manifest.renderRecipe.displayRotation.toolVersion !== "0.35.0" || manifest.renderRecipe.displayRotation.operation !== "LOSSLESS_PIXEL_ROTATION_WITH_PNG_REENCODE" || manifest.renderRecipe.displayRotation.pngOptions.compressionLevel !== 9 || manifest.renderRecipe.displayRotation.pngOptions.palette !== false) fail("display rotation recipe differs");

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) fail("exactly three artifacts are required");
  const expectedIds = ["nasa-tm-74078", "nasa-cr-172354", "nasa-tm-87766"];
  if (JSON.stringify(manifest.artifacts.map(({ id }) => id)) !== JSON.stringify(expectedIds)) fail("artifact order or identity differs");
  const subjects = new Set();
  const roles = new Set();
  let pageMaps = 0;
  let visualQaReviewed = 0;
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ARTIFACT_KEYS, `artifact ${artifact.id}`);
    if (subjects.has(artifact.subject) || roles.has(artifact.role)) fail(`artifact ${artifact.id} launders a subject or role`);
    subjects.add(artifact.subject);
    roles.add(artifact.role);
    exactKeys(artifact.pdf, ["byteLength", "fileName", "mediaType", "pageCount", "repositoryPath", "sha256", "url"], `${artifact.id}.pdf`);
    exactKeys(artifact.metadata, ["byteLength", "fileName", "mediaType", "repositoryPath", "sha256", "url"], `${artifact.id}.metadata`);
    if (artifact.pdf.repositoryPath !== `sources/${artifact.pdf.fileName}` || artifact.metadata.repositoryPath !== `sources/${artifact.metadata.fileName}`) fail(`${artifact.id} repository paths differ from the quarantine layout`);
    exactKeys(artifact.rightsFacts, ["containsThirdPartyMaterial", "determinationType", "distribution", "ear", "isExportControl", "itar", "repositoryLicenseInference"], `${artifact.id}.rightsFacts`);
    assertSha256(artifact.pdf.sha256, `${artifact.id}.pdf.sha256`);
    assertSha256(artifact.metadata.sha256, `${artifact.id}.metadata.sha256`);
    if (artifact.rightsFacts.distribution !== "PUBLIC" || artifact.rightsFacts.determinationType !== "GOV_PUBLIC_USE_PERMITTED" || artifact.rightsFacts.isExportControl !== "NO" || artifact.rightsFacts.ear !== "NO" || artifact.rightsFacts.itar !== "NO" || artifact.rightsFacts.containsThirdPartyMaterial !== false || artifact.rightsFacts.repositoryLicenseInference !== "UNAVAILABLE") {
      fail(`${artifact.id} rights facts differ or infer a repository licence`);
    }
    if (!Array.isArray(artifact.pageMaps) || artifact.pageMaps.length === 0) fail(`${artifact.id} page map is empty`);
    const pageIds = new Set();
    for (const page of artifact.pageMaps) {
      exactKeys(page, PAGE_KEYS, `${artifact.id}.${page.id}`);
      if (pageIds.has(page.id)) fail(`${artifact.id} repeats page-map id ${page.id}`);
      pageIds.add(page.id);
      if (!Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || page.pdfPage > artifact.pdf.pageCount) fail(`${artifact.id}.${page.id} has an invalid PDF page`);
      if (typeof page.printedPage !== "string" || typeof page.anchor !== "string") fail(`${artifact.id}.${page.id} lacks exact page identity`);
      if (!Array.isArray(page.literalUnits) || typeof page.quantitySemantics !== "string" || typeof page.coordinateSemantics !== "string") fail(`${artifact.id}.${page.id} lacks typed units or coordinate semantics`);
      if (typeof page.uncertaintyQualification !== "string" || page.uncertaintyQualification.length < 20) fail(`${artifact.id}.${page.id} lacks its uncertainty or qualification boundary`);
      assertRender(page, `${artifact.id}.${page.id}`);
      assertVisualQa(page, `${artifact.id}.${page.id}`);
      pageMaps += 1;
      visualQaReviewed += 1;
    }
  }
  if (pageMaps !== 16) fail(`expected 16 governed page maps, received ${pageMaps}`);

  const cr = manifest.artifacts[1];
  const pylonForce = cr.pageMaps.find(({ id }) => id === "cr172354-final-pylon-force");
  if (pylonForce?.pdfPage !== 28 || pylonForce?.printedPage !== "24" || pylonForce.quantitySemantics !== "FORCE_WEIGHT_REQUIRES_G0_FOR_FUTURE_MASS_CONVERSION") {
    fail("final assembled-pylon force must map to PDF page 28 / printed page 24 and remain force");
  }
  const table2 = cr.pageMaps.find(({ id }) => id === "cr172354-table2-values");
  if (!table2 || JSON.stringify(table2.literalUnits) !== JSON.stringify(["kN·m²", "lb·in²", "kN", "lb", "cm", "in."]) || !table2.quantitySemantics.includes("DIVIDE_BY_G0")) {
    fail("Table 2 must preserve literal force-times-length-squared semantics and the future g0 conversion boundary");
  }
  if (!pylonForce.eligibleClaim.includes("includes the MAU-12 rack") || !pylonForce.eligibleClaim.includes("excludes the alignment device and damper") || !pylonForce.uncertaintyQualification.includes("final-assembly component scope")) fail("final assembled-pylon source qualification is incomplete");
  const ejection = manifest.artifacts[2].pageMaps.find(({ id }) => id === "tm87766-single-ejection-p10");
  for (const required of ["loaded right modified decoupler pylon", "unloaded left decoupler pylon", "AIM-9J stores on both wingtips", "Mach 0.80", "7,500 ft"]) {
    if (!ejection?.eligibleClaim.includes(required)) fail(`single-ejection qualification omits ${required}`);
  }
  exactKeys(manifest.coordinateConcepts, ["aircraftStationNumber", "completeBodyFrameTransform", "completeStationGeometry", "forwardHookRelativeDistance", "fuselageStation", "handedness", "lateralDatum", "semiSpanFraction", "spanStation", "verticalDatum"], "coordinateConcepts");
  for (const [name, concept] of Object.entries(manifest.coordinateConcepts)) {
    exactKeys(concept, ["availability", "sameAs"], `coordinateConcepts.${name}`);
    if (concept.sameAs !== null) fail(`${name} cannot be conflated with another coordinate concept`);
  }
  for (const name of ["lateralDatum", "verticalDatum", "handedness", "completeBodyFrameTransform", "completeStationGeometry"]) {
    if (manifest.coordinateConcepts[name].availability !== "UNAVAILABLE") fail(`${name} must remain UNAVAILABLE`);
  }
  exactKeys(manifest.conversionPolicy, ["currentExecutableConversions", "futureMassFromForce", "futureMassInertiaFromLegacyForceLength2", "g0Mps2"], "conversionPolicy");
  if (manifest.conversionPolicy.g0Mps2 !== 9.80665 || manifest.conversionPolicy.currentExecutableConversions !== "NONE" || manifest.conversionPolicy.futureMassFromForce !== "mass_kg = force_N / g0" || manifest.conversionPolicy.futureMassInertiaFromLegacyForceLength2 !== "I_kg_m2 = I_source_kN_m2 * 1000 / g0") fail("conversion policy must declare the reviewed g0 formulas and admit no executable conversion");
  exactKeys(manifest.ancestry, ["designSource", "flightObservationSource", "relationship"], "ancestry");
  if (manifest.ancestry.designSource !== "nasa-cr-172354" || manifest.ancestry.flightObservationSource !== "nasa-tm-87766" || manifest.ancestry.relationship !== "BOUNDED_CONFIGURATION_ANCESTRY_NOT_INDEPENDENT_GENERAL_VALIDATION") fail("source ancestry differs");

  return {
    artifacts: manifest.artifacts.length,
    decisionsAuthorized: 3,
    id: manifest.id,
    pageMaps,
    schemaVersion: manifest.schemaVersion,
    visualQaReviewed,
  };
}

function renderedObjectDigest(value) {
  return sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

export function verifySourceTermsAuthority(manifest, authority, policyBytes, metadataFiles) {
  verifyManifest(manifest);
  exactKeys(authority, [
    "authorityKind",
    "conditions",
    "decidedOn",
    "decisions",
    "humanReviewerRequired",
    "id",
    "legalApproval",
    "metadataEvidence",
    "policyArtifact",
    "policyBasis",
    "schemaVersion",
  ], "source-terms authority");
  if (
    renderedObjectDigest(authority) !== EXPECTED_AUTHORITY_DIGEST ||
    authority.schemaVersion !== "vector.nasa-historical-f16-store-source-terms-authority.v1" ||
    authority.id !== "nasa-historical-f16-store-source-terms-authority-20260825" ||
    authority.authorityKind !== "AUTHORITATIVE_SOURCE_TERMS" ||
    authority.decidedOn !== "2026-08-25" ||
    authority.humanReviewerRequired !== false ||
    authority.legalApproval !== false
  ) fail("source-terms authority identity or digest differs");
  exactKeys(authority.policyArtifact, ["accessedOn", "byteLength", "mediaType", "pageCount", "repositoryPath", "sha256", "title", "url"], "source-terms policy artifact");
  if (
    authority.policyArtifact.title !== "NASA's public access plan" ||
    authority.policyArtifact.url !== "https://sti.nasa.gov/docs/NASA_Public_Access_Plan.pdf" ||
    authority.policyArtifact.repositoryPath !== "source-terms/NASA_Public_Access_Plan.pdf" ||
    authority.policyArtifact.mediaType !== "application/pdf" ||
    authority.policyArtifact.byteLength !== 1081214 ||
    authority.policyArtifact.sha256 !== EXPECTED_POLICY_DIGEST ||
    authority.policyArtifact.pageCount !== 27 ||
    authority.policyArtifact.accessedOn !== "2026-08-25" ||
    policyBytes.length !== authority.policyArtifact.byteLength ||
    sha256(policyBytes) !== authority.policyArtifact.sha256
  ) fail("official NASA public-access policy bytes or identity differ");
  exactKeys(authority.policyBasis, ["section", "state", "summary"], "source-terms policy basis");
  if (authority.policyBasis.section !== "Rights and Distribution" || authority.policyBasis.state !== "OFFICIAL_NASA_PUBLIC_ACCESS_PLAN" || !authority.policyBasis.summary.includes("without further NASA permission")) fail("source-terms policy basis differs");

  if (!Array.isArray(authority.metadataEvidence) || authority.metadataEvidence.length !== manifest.artifacts.length) fail("source-terms metadata evidence inventory differs");
  for (const [index, evidence] of authority.metadataEvidence.entries()) {
    exactKeys(evidence, ["citationId", "containsThirdPartyMaterial", "determinationType", "distribution", "ear", "isExportControl", "itar", "repositoryPath", "sha256"], `source-terms metadata evidence ${index}`);
    const artifact = manifest.artifacts[index];
    const bytes = metadataFiles[evidence.repositoryPath];
    if (
      evidence.citationId !== artifact.citationId ||
      evidence.repositoryPath !== artifact.metadata.repositoryPath ||
      evidence.sha256 !== artifact.metadata.sha256 ||
      evidence.distribution !== artifact.rightsFacts.distribution ||
      evidence.determinationType !== artifact.rightsFacts.determinationType ||
      evidence.containsThirdPartyMaterial !== artifact.rightsFacts.containsThirdPartyMaterial ||
      evidence.isExportControl !== artifact.rightsFacts.isExportControl ||
      evidence.ear !== artifact.rightsFacts.ear ||
      evidence.itar !== artifact.rightsFacts.itar ||
      !Buffer.isBuffer(bytes) ||
      sha256(bytes) !== evidence.sha256
    ) fail(`source-terms metadata evidence differs for ${artifact.id}`);
  }
  exactKeys(authority.decisions, ["exportReview", "redistribution", "referenceUse"], "source-terms decisions");
  for (const [authorityField, manifestField] of [
    ["referenceUse", "referenceUseDecision"],
    ["redistribution", "redistributionDecision"],
    ["exportReview", "exportReviewDecision"],
  ]) {
    exactKeys(authority.decisions[authorityField], ["scope", "value"], `source-terms decision ${authorityField}`);
    if (
      authority.decisions[authorityField].value !== manifest[manifestField].value ||
      authority.decisions[authorityField].scope !== manifest[manifestField].scope
    ) fail(`source-terms decision ${authorityField} is not bound to the manifest`);
  }
  const expectedConditions = [
    "PRESERVE_EXACT_SOURCE_AND_METADATA_DIGESTS",
    "PRESERVE_NASA_SOURCE_IDENTITY_AND_POLICY_PROVENANCE",
    "NO_NUMERIC_OR_EQUATION_TRANSCRIPTION",
    "NO_ADAPTATION_OR_EXECUTION_AUTHORITY",
    "NO_MODEL_PACK_OR_RUNTIME_ADMISSION",
  ];
  if (JSON.stringify(authority.conditions) !== JSON.stringify(expectedConditions)) fail("source-terms conditions differ");
  return { authorityKind: authority.authorityKind, legalApproval: false, metadataRecords: authority.metadataEvidence.length };
}

export function verifyReleaseOwnerVisualReview(manifest, review) {
  verifyManifest(manifest);
  exactKeys(review, ["findings", "legalApproval", "note", "numericOrEquationTranscriptionPerformed", "reviewedOn", "reviewedPages", "reviewerRole", "schemaVersion", "status", "subject"], "release-owner visual review");
  if (
    renderedObjectDigest(review) !== EXPECTED_VISUAL_REVIEW_DIGEST ||
    review.schemaVersion !== "vector.nasa-historical-f16-store-release-owner-visual-review.v1" ||
    review.status !== "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE" ||
    review.reviewerRole !== "RELEASE_OWNER_REVIEW" ||
    review.reviewedOn !== "2026-08-25" ||
    review.legalApproval !== false ||
    review.numericOrEquationTranscriptionPerformed !== false
  ) fail("release-owner visual review identity, role, boundary, or digest differs");
  exactKeys(review.subject, ["intendedUse", "manifestCanonicalDigest", "manifestId", "pageCount"], "release-owner visual review subject");
  if (
    review.subject.manifestId !== manifest.id ||
    review.subject.manifestCanonicalDigest !== manifest.canonicalDigest ||
    review.subject.intendedUse !== manifest.intendedUse ||
    review.subject.pageCount !== 16
  ) fail("release-owner visual review is bound to a different manifest");
  exactKeys(review.findings, ["declaredPageAndAnchorMapping", "eligibleContextCategory", "limitationsAndNonclaims", "orientationLegibilityAndClipping", "titleAndReportIdentity"], "release-owner visual review findings");
  if (
    review.findings.titleAndReportIdentity !== "CONSISTENT" ||
    review.findings.declaredPageAndAnchorMapping !== "CONSISTENT" ||
    review.findings.orientationLegibilityAndClipping !== "CONSISTENT" ||
    review.findings.eligibleContextCategory !== "CONSISTENT_WITH_SOURCE_LOCATION_ONLY_SCOPE" ||
    review.findings.limitationsAndNonclaims !== "CONSISTENT"
  ) fail("release-owner semantic findings differ");
  const expectedPages = manifest.artifacts.flatMap((artifact) => artifact.pageMaps.map((page) => ({ artifact, page })));
  if (!Array.isArray(review.reviewedPages) || review.reviewedPages.length !== expectedPages.length) fail("release-owner page inventory differs");
  for (const [index, reviewed] of review.reviewedPages.entries()) {
    exactKeys(reviewed, ["anchor", "artifactId", "citationId", "displayRender", "eligibleCategory", "eligibleClaimDigest", "ineligibleInferenceDigest", "legible", "limitationsAndNonclaimsConsistent", "orientationReadable", "pageId", "pageMappingConsistent", "pdfPage", "printedPage", "qualificationDigest", "reportIdentityConsistent", "reportNumbers", "sourceRender", "unclipped"], `reviewed page ${index}`);
    exactKeys(reviewed.sourceRender, ["byteLength", "heightPx", "path", "sha256", "widthPx"], `reviewed page ${index} source render`);
    exactKeys(reviewed.displayRender, ["byteLength", "heightPx", "path", "sha256", "widthPx"], `reviewed page ${index} display render`);
    const { artifact, page } = expectedPages[index];
    if (
      reviewed.artifactId !== artifact.id ||
      reviewed.citationId !== artifact.citationId ||
      JSON.stringify(reviewed.reportNumbers) !== JSON.stringify(artifact.reportNumbers) ||
      reviewed.pageId !== page.id ||
      reviewed.pdfPage !== page.pdfPage ||
      reviewed.printedPage !== page.printedPage ||
      reviewed.anchor !== page.anchor ||
      reviewed.eligibleCategory !== EXPECTED_PAGE_CATEGORIES.get(page.id) ||
      reviewed.eligibleClaimDigest !== sha256(Buffer.from(page.eligibleClaim)) ||
      reviewed.ineligibleInferenceDigest !== sha256(Buffer.from(page.ineligibleInference)) ||
      reviewed.qualificationDigest !== sha256(Buffer.from(page.uncertaintyQualification)) ||
      reviewed.sourceRender.path !== page.render.sourcePath ||
      reviewed.sourceRender.sha256 !== page.render.sourceSha256 ||
      reviewed.sourceRender.byteLength !== page.render.sourceByteLength ||
      reviewed.sourceRender.widthPx !== page.render.sourceWidthPx ||
      reviewed.sourceRender.heightPx !== page.render.sourceHeightPx ||
      reviewed.displayRender.path !== page.render.displayPath ||
      reviewed.displayRender.sha256 !== page.render.displaySha256 ||
      reviewed.displayRender.byteLength !== page.render.displayByteLength ||
      reviewed.displayRender.widthPx !== page.render.displayWidthPx ||
      reviewed.displayRender.heightPx !== page.render.displayHeightPx ||
      reviewed.orientationReadable !== true ||
      reviewed.legible !== true ||
      reviewed.unclipped !== true ||
      reviewed.reportIdentityConsistent !== true ||
      reviewed.pageMappingConsistent !== true ||
      reviewed.limitationsAndNonclaimsConsistent !== true
    ) fail(`release-owner visual review differs for ${page.id}`);
  }
  if (typeof review.note !== "string" || !review.note.includes("no value, equation, model parameter") || !review.note.includes("runtime capability")) fail("release-owner review note weakens the source-only boundary");
  return { legalApproval: false, reviewedPages: review.reviewedPages.length, reviewerRole: review.reviewerRole };
}

export function assertSourceAdmissionEligible(manifest) {
  verifyManifest(manifest);
  fail("source-only manifest cannot admit executable behavior");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function containsFrozenBinary(bytes) {
  if (FROZEN_BINARY_HASHES.has(sha256(bytes))) return true;
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    try {
      const expanded = gunzipSync(bytes, { maxOutputLength: 25_000_001 });
      return FROZEN_BINARY_HASHES.has(sha256(expanded));
    } catch {
      return false;
    }
  }
  return false;
}

function assertToolVersion(command, expected) {
  const result = spawnSync(command, ["-v"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !new RegExp(`^${command} version ${expected.replaceAll(".", "\\.")}$`, "m").test(output)) {
    fail(`${command} must be the governed ${expected} renderer`);
  }
}

function assertRegularContainedFile(directory, fileName) {
  if (basename(fileName) !== fileName) fail(`unsafe local artifact name ${fileName}`);
  const directoryReal = realpathSync(directory);
  const path = resolve(directory, fileName);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${fileName} must be a regular non-symlink file`);
  const fileReal = realpathSync(path);
  if (!fileReal.startsWith(`${directoryReal}${sep}`)) fail(`${fileName} escapes the source directory`);
  return path;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") fail("render is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function verifyRenders(manifest, sourceDirectory) {
  const directory = mkdtempSync(join(tmpdir(), "vector-f16-source-render-"));
  try {
    assertToolVersion("pdftoppm", manifest.renderRecipe.rendererVersion);
    const sharp = (await import("sharp")).default;
    if (sharp.versions.sharp !== manifest.renderRecipe.displayRotation.toolVersion) {
      fail(`sharp must be the governed ${manifest.renderRecipe.displayRotation.toolVersion} display renderer`);
    }
    let renderCount = 0;
    for (const artifact of manifest.artifacts) {
      const pdfPath = assertRegularContainedFile(sourceDirectory, artifact.pdf.fileName);
      for (const page of artifact.pageMaps) {
        const prefix = join(directory, `${artifact.id}-${String(page.pdfPage).padStart(3, "0")}`);
        const rendered = spawnSync("pdftoppm", ["-f", String(page.pdfPage), "-l", String(page.pdfPage), "-r", "150", "-png", "-singlefile", pdfPath, prefix], { encoding: "utf8" });
        if (rendered.status !== 0) fail(`pdftoppm failed for ${artifact.id} PDF page ${page.pdfPage}: ${rendered.stderr.trim()}`);
        const sourceBytes = readFileSync(`${prefix}.png`);
        const sourceDimensions = pngDimensions(sourceBytes);
        if (sourceBytes.length !== page.render.sourceByteLength || sha256(sourceBytes) !== page.render.sourceSha256 || sourceDimensions.width !== page.render.sourceWidthPx || sourceDimensions.height !== page.render.sourceHeightPx) {
          fail(`${artifact.id} PDF page ${page.pdfPage} render differs from the frozen source identity`);
        }
        let displayBytes = sourceBytes;
        if (page.appliedDisplayRotationDeg !== 0) {
          displayBytes = await sharp(sourceBytes)
            .rotate(page.appliedDisplayRotationDeg)
            .png(manifest.renderRecipe.displayRotation.pngOptions)
            .toBuffer();
        }
        const displayDimensions = pngDimensions(displayBytes);
        if (displayBytes.length !== page.render.displayByteLength || sha256(displayBytes) !== page.render.displaySha256 || displayDimensions.width !== page.render.displayWidthPx || displayDimensions.height !== page.render.displayHeightPx) {
          fail(`${artifact.id} PDF page ${page.pdfPage} display render differs from the frozen identity`);
        }
        renderCount += 1;
      }
    }
    return renderCount;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function verifySourceDirectory(manifest, sourceDirectory) {
  verifyManifest(manifest);
  assertToolVersion("pdfinfo", manifest.renderRecipe.rendererVersion);
  const directoryInfo = lstatSync(sourceDirectory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail("source directory must be a real directory");
  const expectedFiles = manifest.artifacts.flatMap(({ pdf, metadata }) => [pdf.fileName, metadata.fileName]).sort();
  const actualFiles = readdirSync(sourceDirectory).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail(`source directory inventory differs: expected ${expectedFiles.join(", ")}; received ${actualFiles.join(", ")}`);

  for (const artifact of manifest.artifacts) {
    for (const member of [artifact.pdf, artifact.metadata]) {
      const path = assertRegularContainedFile(sourceDirectory, member.fileName);
      const bytes = readFileSync(path);
      if (bytes.length !== member.byteLength || sha256(bytes) !== member.sha256) fail(`${member.fileName} size or digest mismatch`);
    }
    const metadata = JSON.parse(readFileSync(resolve(sourceDirectory, artifact.metadata.fileName), "utf8"));
    const authors = [...(metadata.authorAffiliations ?? [])]
      .sort((left, right) => left.sequence - right.sequence)
      .map((entry) => entry.meta?.author?.name);
    const publicationDates = (metadata.publications ?? []).map(({ publicationDate }) => publicationDate?.slice(0, 10));
    const reportNumbers = [...new Set((metadata.otherReportNumbers ?? [])
      .filter((value) => typeof value === "string" && !value.startsWith("Report Number: ")))]
      .sort();
    if (
      String(metadata.id) !== artifact.citationId ||
      metadata.title !== artifact.title ||
      JSON.stringify(authors) !== JSON.stringify(artifact.authors) ||
      publicationDates.length !== 1 ||
      publicationDates[0] !== artifact.publicationDate ||
      JSON.stringify(reportNumbers) !== JSON.stringify([...artifact.reportNumbers].sort())
    ) fail(`${artifact.metadata.fileName} identity differs from its manifest`);
    if (metadata.distribution !== artifact.rightsFacts.distribution || metadata.copyright?.determinationType !== artifact.rightsFacts.determinationType || metadata.copyright?.containsThirdPartyMaterial !== artifact.rightsFacts.containsThirdPartyMaterial || metadata.exportControl?.isExportControl !== artifact.rightsFacts.isExportControl || metadata.exportControl?.ear !== artifact.rightsFacts.ear || metadata.exportControl?.itar !== artifact.rightsFacts.itar) fail(`${artifact.metadata.fileName} rights/export facts differ from its manifest`);

    const pdfPath = assertRegularContainedFile(sourceDirectory, artifact.pdf.fileName);
    const info = spawnSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    if (info.status !== 0) fail(`pdfinfo failed for ${artifact.pdf.fileName}: ${info.stderr.trim()}`);
    const match = /^Pages:\s+(\d+)$/m.exec(info.stdout);
    if (!match || Number(match[1]) !== artifact.pdf.pageCount) fail(`${artifact.pdf.fileName} page count differs from its manifest`);
  }

  const renders = await verifyRenders(manifest, sourceDirectory);
  return {
    admissionEligible: false,
    artifacts: manifest.artifacts.length,
    metadataRecords: manifest.artifacts.length,
    networkAccessed: false,
    renders,
  };
}

function walkFiles(directory, excludedNames = new Set()) {
  if (!statSync(directory).isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path, excludedNames));
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink()) fail(`production boundary contains symlink ${path}`);
  }
  return files;
}

export function verifyCommittedInventory(repositoryRoot) {
  const directory = resolve(repositoryRoot, "governance/nasa-historical-f16-store-source");
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    fail("committed source directory must be a real non-symlink directory");
  }
  const repositoryReal = realpathSync(repositoryRoot);
  const directoryReal = realpathSync(directory);
  if (!directoryReal.startsWith(`${repositoryReal}${sep}`)) fail("committed source directory escapes the repository");
  const readGovernedMember = (member, expectedDigest = null) => {
    if (typeof member !== "string" || member.startsWith("/") || member.includes("..")) fail(`unsafe committed source member ${member}`);
    const path = resolve(directory, member);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || !realpathSync(path).startsWith(`${directoryReal}${sep}`)) fail(`committed source member ${member} must be a contained regular non-symlink file`);
    const bytes = readFileSync(path);
    if (expectedDigest && sha256(bytes) !== expectedDigest) fail(`committed source member ${member} digest differs`);
    return bytes;
  };
  const manifest = JSON.parse(readGovernedMember("manifest.v1.json").toString("utf8"));
  verifyManifest(manifest);
  const authority = JSON.parse(readGovernedMember(manifest.sourceTermsAuthority.path, EXPECTED_AUTHORITY_DIGEST).toString("utf8"));
  const review = JSON.parse(readGovernedMember(manifest.releaseOwnerReview.path, EXPECTED_VISUAL_REVIEW_DIGEST).toString("utf8"));
  const expectedMembers = new Map([
    ["README.md", null],
    ["manifest.v1.json", null],
    [manifest.sourceTermsAuthority.path, { sha256: EXPECTED_AUTHORITY_DIGEST }],
    [manifest.releaseOwnerReview.path, { sha256: EXPECTED_VISUAL_REVIEW_DIGEST }],
    [authority.policyArtifact.repositoryPath, authority.policyArtifact],
  ]);
  for (const artifact of manifest.artifacts) {
    expectedMembers.set(artifact.pdf.repositoryPath, artifact.pdf);
    expectedMembers.set(artifact.metadata.repositoryPath, artifact.metadata);
    for (const page of artifact.pageMaps) {
      expectedMembers.set(page.render.sourcePath, {
        byteLength: page.render.sourceByteLength,
        sha256: page.render.sourceSha256,
      });
      expectedMembers.set(page.render.displayPath, {
        byteLength: page.render.displayByteLength,
        sha256: page.render.displaySha256,
      });
    }
  }
  const files = walkFiles(directory).map((path) => relative(directory, path)).sort();
  const expected = [...expectedMembers.keys()].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    fail(`committed source directory inventory differs: expected ${expected.join(", ")}; received ${files.join(", ")}`);
  }
  for (const [file, identity] of expectedMembers) {
    const path = resolve(directory, file);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || !realpathSync(path).startsWith(`${directoryReal}${sep}`)) fail(`committed source member ${file} must be a contained regular non-symlink file`);
    if (identity) {
      const bytes = readFileSync(path);
      if ((identity.byteLength !== undefined && bytes.length !== identity.byteLength) || sha256(bytes) !== identity.sha256) fail(`committed source member ${file} size or digest differs`);
    }
  }
  const metadataFiles = Object.fromEntries(manifest.artifacts.map((artifact) => [
    artifact.metadata.repositoryPath,
    readFileSync(resolve(directory, artifact.metadata.repositoryPath)),
  ]));
  verifySourceTermsAuthority(
    manifest,
    authority,
    readFileSync(resolve(directory, authority.policyArtifact.repositoryPath)),
    metadataFiles,
  );
  verifyReleaseOwnerVisualReview(manifest, review);
  const excludedNames = new Set([".git", ".next", ".open-next", ".vercel", ".wrangler", "dist", "build", "out", "node_modules", "target"]);
  for (const path of walkFiles(repositoryRoot, excludedNames)) {
    if (path.startsWith(`${directoryReal}${sep}`)) continue;
    const info = statSync(path);
    if (FROZEN_FILE_NAMES.has(basename(path))) fail(`raw source or render identity is committed at ${relative(repositoryRoot, path)}`);
    if (info.size <= 25_000_000 && containsFrozenBinary(readFileSync(path))) {
      fail(`raw source or render identity is committed at ${relative(repositoryRoot, path)}`);
    }
  }
  return { files: files.length, governedQuarantineFiles: files.length - 2 };
}

export function verifyProductionIsolation(repositoryRoot) {
  const sourceRoots = ["app", "components", "config", "content", "db", "engine-rust", "fixtures", "lib", "public", "server", "worker", "dist", ".next", ".open-next", ".vercel/output", "build", "out", ".wrangler"];
  const forbidden = [
    "nasa-historical-f16-store-source",
    "vector.nasa-historical-f16-store-source-manifest.v1",
    "NASA_TM74078_F16_FSD_QUARTER_SCALE_FLUTTER_MODEL",
    "NASA_CR172354_F16_DECOUPLER_PYLON_DESIGN",
    "NASA_TM87766_FSD_F16A_DECOUPLER_FLIGHT_TEST",
    "NASA-TM-74078",
    "NASA-CR-172354",
    "NASA-TM-87766",
    "19780003061",
    "19870000632",
    "19860022096",
    ...FROZEN_BINARY_HASHES,
  ];
  let filesInspected = 0;
  const references = [];
  for (const root of sourceRoots) {
    const directory = resolve(repositoryRoot, root);
    try {
      for (const path of walkFiles(directory)) {
        const info = statSync(path);
        if (info.size > 25_000_000) continue;
        const bytes = readFileSync(path);
        filesInspected += 1;
        const text = bytes.toString("utf8");
        if (containsFrozenBinary(bytes) || forbidden.some((value) => text.includes(value)) || [...FROZEN_FILE_NAMES].some((value) => text.includes(value))) {
          references.push(relative(repositoryRoot, path));
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (references.length > 0) fail(`production boundary references source-only identities: ${references.join(", ")}`);
  return { filesInspected, forbiddenReferences: 0 };
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

async function run() {
  const manifest = loadManifest();
  const result = verifyManifest(manifest);
  const inventory = verifyCommittedInventory(resolve("."));
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== "--source-dir" || !arguments_[1]) {
    fail("CLI verification requires exactly --source-dir <committed-source-directory>");
  }
  const sources = await verifySourceDirectory(manifest, resolve(arguments_[1]));
  const isolation = verifyProductionIsolation(resolve("."));
  process.stdout.write(`${JSON.stringify({ ...result, inventory, isolation, sources })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
