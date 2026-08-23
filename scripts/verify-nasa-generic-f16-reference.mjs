import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateAircraftEvidenceRegistry } from "./verify-aircraft-evidence-registry.mjs";

export const DEFAULT_CORPUS_PATH = "governance/nasa-generic-f16-verification-corpus.v1.json";
const DEFAULT_REGISTRY_PATH = "governance/aircraft-evidence-registry.v2.json";
const CORPUS_SCHEMA = "vector.aircraft-verification-corpus.v1";
const DERIVATIVE_SCHEMA = "vector.aircraft-verification-derivative.v1";
const SUBJECT = "NASA_NESC_GENERIC_F16_REFERENCE";
const INTENDED_USE = "ENGINE_VERIFICATION_ONLY";
const REVIEW_DATE = "2026-08-24";
const SHA256 = /^[a-f0-9]{64}$/u;

const SUBJECT_CAPABILITIES = Object.freeze([
  "AERODYNAMICS",
  "PROPULSION",
  "FLIGHT_CONTROLS",
  "MASS_AND_INERTIA",
]);
const EXCLUDED_CAPABILITIES = Object.freeze(["SENSORS", "WEAPONS", "EW", "DATALINK", "TACTICS"]);
const EXCLUDED_SUBJECTS = Object.freeze([
  "IAF_SU_30MKI",
  "PAF_F16C_BLOCK52_PEACE_DRIVE_I",
  "PAF_F16D_BLOCK52_PEACE_DRIVE_I",
]);
const AERODYNAMIC_OUTPUTS = new Set([
  "BODY_FORCE_COEFFICIENT_X",
  "BODY_FORCE_COEFFICIENT_Z",
  "PITCHING_MOMENT_COEFFICIENT",
]);

const EXPECTED_ARTIFACTS = Object.freeze({
  "nasa-tp-1538-f16-aerodynamics-source": Object.freeze({
    role: "SOURCE_REPORT",
    authority: "NASA",
    uri: "https://ntrs.nasa.gov/api/citations/19800005879/downloads/19800005879.pdf",
    fileName: "19800005879.pdf",
    sha256: "aae0ece64474291368c0b4c816d3ab327c6100329e6eb030c2f4545d0913feb3",
    licenceReviewState: "REVIEWED",
    licenceDecision: "GOV_PUBLIC_USE_PERMITTED",
    capabilities: ["AERODYNAMICS", "FLIGHT_CONTROLS", "MASS_AND_INERTIA"],
    ancestry: {
      state: "PRIMARY_PUBLIC_REPORT",
      sourceArtifactIds: [],
      externalLineage: [],
    },
    scopeCode: "TP1538_FACTUAL_TABLES_AND_DOCUMENTED_EQUATIONS",
  }),
  "nasa-tm-2003-212145-f16-simulation-source": Object.freeze({
    role: "SOURCE_REPORT",
    authority: "NASA",
    uri: "https://ntrs.nasa.gov/api/citations/20030013626/downloads/20030013626.pdf",
    fileName: "20030013626.pdf",
    sha256: "df7eb1a40f18c5d025de7759c4c227a36c283b8522f89dd9bed5c7d6b6aaedc9",
    licenceReviewState: "REVIEWED",
    licenceDecision: "PUBLIC_USE_PERMITTED",
    capabilities: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS", "MASS_AND_INERTIA"],
    ancestry: {
      state: "PRIMARY_PUBLIC_REPORT",
      sourceArtifactIds: [],
      externalLineage: [],
    },
    scopeCode: "TM212145_MODEL_DESCRIPTION_AND_PUBLISHED_MASS_PROPERTIES",
  }),
  "nasa-nesc-2015-f16-daveml-source": Object.freeze({
    role: "COMMON_MODEL_REFERENCE",
    authority: "NASA NESC",
    uri: "https://nescacademy.nasa.gov/workshop/FlightSim/2015/models/F16_package.zip",
    fileName: "F16_package.zip",
    sha256: "20c60f615ae8e87d81c9d98b54fff45a2832840201499cbcfe3f45a60ef3e5b2",
    licenceReviewState: "REVIEWED_WITH_NEW_DERIVATIVE_RESTRICTION",
    licenceDecision: "NEW_DERIVATIVE_REQUIRES_EXPLICIT_REVIEW",
    capabilities: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS"],
    ancestry: {
      state: "COMMON_MODEL_REFERENCE_WITH_MIXED_ANCESTRY",
      sourceArtifactIds: [
        "nasa-tp-1538-f16-aerodynamics-source",
        "nasa-tm-2003-212145-f16-simulation-source",
      ],
      externalLineage: [
        "MORELLI_MODEL_COPYRIGHT_NOTICE_PRESENT",
        "STEVENS_AND_LEWIS_PROPULSION_AND_INERTIA_LINEAGE",
      ],
    },
    scopeCode: "REFERENCE_AND_COMPARISON_ONLY_NO_NEW_TABLE_PROMOTION",
  }),
  "nasa-nesc-2015-atmos13p2-comparison": Object.freeze({
    role: "COMMON_MODEL_COMPARISON",
    authority: "NASA NESC",
    uri: "https://nescacademy.nasa.gov/src/flightsim/Datasets/Atmos_13p2_SubsonicAirspeedChangeF16.zip",
    fileName: "Atmos_13p2_SubsonicAirspeedChangeF16.zip",
    sha256: "b26a2f9eb4c537ea96bf73493004ae77d37b38d496b32e6d50e00b4ec9482fb1",
    licenceReviewState: "REVIEWED_WITH_NEW_DERIVATIVE_RESTRICTION",
    licenceDecision: "NEW_DERIVATIVE_REQUIRES_EXPLICIT_REVIEW",
    capabilities: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS", "MASS_AND_INERTIA"],
    ancestry: {
      state: "COMMON_MODEL_OUTPUT_COMPARISON",
      sourceArtifactIds: ["nasa-nesc-2015-f16-daveml-source"],
      externalLineage: [],
    },
    scopeCode: "CASE13P2_IMPLEMENTATION_COMPARISON_NOT_PHYSICAL_VALIDATION",
  }),
});

const EXPECTED_LEGACY_CASE11_REGISTRY_ARTIFACTS = Object.freeze({
  "nasa-nesc-2015-f16-daveml-source": Object.freeze({
    id: "nasa-nesc-2015-f16-daveml-source",
    kind: "SOURCE",
    authority: "NASA NESC",
    uri: "https://nescacademy.nasa.gov/workshop/FlightSim/2015/models/F16_package.zip",
    sha256: "20c60f615ae8e87d81c9d98b54fff45a2832840201499cbcfe3f45a60ef3e5b2",
    retrievalState: "DECLARED_REMOTE",
    hashReviewState: "VERIFIED",
    licenseReviewState: "REVIEWED",
    admissionUse: "REFERENCE_ONLY",
    subjectClaimIds: [],
    eligibleClaimIds: [],
    capabilityCoverage: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS"],
    scope: "NASA NESC F-16 DAVE-ML verification model; not an IAF Su-30MKI or PAF Peace Drive I F-16C/D model.",
  }),
  "nasa-nesc-2015-atmos11-sim04-validation": Object.freeze({
    id: "nasa-nesc-2015-atmos11-sim04-validation",
    kind: "VALIDATION",
    authority: "NASA NESC",
    uri: "https://nescacademy.nasa.gov/workshop/FlightSim/2015/atmos_scn_11/Atmos_11_sim_04.csv",
    sha256: "c6b8c1210c31fa440d271297ad219b5ad89264f4bb8a25f636c14f53d9b04a07",
    retrievalState: "DECLARED_REMOTE",
    hashReviewState: "VERIFIED",
    licenseReviewState: "REVIEWED",
    admissionUse: "REFERENCE_ONLY",
    subjectClaimIds: [],
    eligibleClaimIds: [],
    capabilityCoverage: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS"],
    scope: "One 180-second subsonic wings-level trim trajectory; not a manoeuvre, sensor, store, or operational validation corpus.",
  }),
  "vector-nesc-case11-derived-fixture": Object.freeze({
    id: "vector-nesc-case11-derived-fixture",
    kind: "DERIVED_FIXTURE",
    authority: "VECTOR",
    uri: "fixtures/public-reference/nasa-nesc-2015-f16-case11.json",
    sha256: "85f14b1d28e0d839f6f75cc03e1ff7d577c181809f38d1b30a2f5f83e3bd3602",
    localPath: "fixtures/public-reference/nasa-nesc-2015-f16-case11.json",
    retrievalState: "COMMITTED_DERIVATIVE",
    hashReviewState: "VERIFIED",
    licenseReviewState: "REVIEWED",
    admissionUse: "REFERENCE_ONLY",
    subjectClaimIds: [],
    eligibleClaimIds: [],
    capabilityCoverage: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS"],
    derivedFromArtifactIds: [
      "nasa-nesc-2015-f16-daveml-source",
      "nasa-nesc-2015-atmos11-sim04-validation",
    ],
    scope: "SI-normalized NESC Case 11 checkpoints used only by the isolated public-reference verifier.",
  }),
});

const EXPECTED_PAGE_CLAIMS = Object.freeze({
  "tp1538-table-i-mass-geometry": Object.freeze({
    sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
    capabilities: ["MASS_AND_INERTIA"],
    tableLabel: "TABLE I",
    pdfPageRange: [49, 49],
    reportPageRange: [43, 43],
    pdfToReportPageOffset: 6,
    publishedAxes: [],
    publishedOutputs: [
      "WEIGHT_LB",
      "INERTIA_XX_SLUG_FT2",
      "INERTIA_YY_SLUG_FT2",
      "INERTIA_ZZ_SLUG_FT2",
      "INERTIA_XZ_SLUG_FT2",
      "REFERENCE_WING_SPAN_FT",
      "REFERENCE_WING_AREA_FT2",
      "REFERENCE_MEAN_AERODYNAMIC_CHORD_FT",
    ],
  }),
  "tp1538-table-iii-longitudinal-aerodynamics": Object.freeze({
    sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
    capabilities: ["AERODYNAMICS", "FLIGHT_CONTROLS"],
    tableLabel: "TABLE III",
    pdfPageRange: [51, 85],
    reportPageRange: [45, 79],
    pdfToReportPageOffset: 6,
    publishedAxes: [
      "ANGLE_OF_ATTACK_DEG",
      "SIDESLIP_DEG",
      "HORIZONTAL_TAIL_DEFLECTION_DEG",
    ],
    publishedOutputs: [
      "BODY_FORCE_COEFFICIENT_X",
      "BODY_FORCE_COEFFICIENT_Z",
      "PITCHING_MOMENT_COEFFICIENT",
    ],
  }),
  "tm212145-table-1-mass-properties": Object.freeze({
    sourceArtifactId: "nasa-tm-2003-212145-f16-simulation-source",
    capabilities: ["MASS_AND_INERTIA"],
    tableLabel: "Table 1",
    pdfPageRange: [48, 48],
    reportPageRange: [33, 33],
    pdfToReportPageOffset: 15,
    publishedAxes: [],
    publishedOutputs: [
      "WEIGHT_LB",
      "INERTIA_XX_SLUG_FT2",
      "INERTIA_YY_SLUG_FT2",
      "INERTIA_ZZ_SLUG_FT2",
      "INERTIA_XZ_SLUG_FT2",
    ],
  }),
});

const REQUIRED_LONGITUDINAL_FIELDS = Object.freeze([
  "BODY_FORCE_COEFFICIENT_X",
  "BODY_FORCE_COEFFICIENT_Z",
  "PITCHING_MOMENT_COEFFICIENT",
  "PROPULSION_THRUST_TABLE",
  "CONSTANT_MASS",
  "CONSTANT_INERTIA",
  "THROTTLE_CONTROL_OUTPUT",
  "ELEVATOR_CONTROL_OUTPUT",
  "AXES_UNITS_DOMAINS_INTERPOLATION",
]);
const REQUIRED_BLOCKERS = Object.freeze([
  "PUBLIC_REPORT_PROPULSION_TABLE_VALUES_NOT_EMBEDDED",
  "PUBLIC_REPORT_CONTROL_OUTPUT_TABLE_VALUES_NOT_EMBEDDED",
  "NESC_NEW_DERIVATIVE_EXPLICIT_REVIEW_REQUIRED",
  "NESC_PROPULSION_INERTIA_THIRD_PARTY_BOOK_ANCESTRY",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactKeys(value, expectedKeys, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} must have exact keys; unknown or missing fields are forbidden.`,
  );
}

function assertExactArray(actual, expected, label) {
  assert(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${label} does not match its reviewed exact values.`,
  );
}

function assertExactValue(actual, expected, label) {
  assert(canonicalize(actual) === canonicalize(expected), `${label} does not match its reviewed exact value.`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeDerivativeDigest(derivative) {
  const payload = structuredClone(derivative);
  delete payload.sha256;
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function verifyArtifactBytes(artifact, bytes) {
  assert(artifact && typeof artifact.id === "string", "Artifact byte verification requires an identity.");
  assert(SHA256.test(artifact.sha256), `${artifact.id} requires a declared SHA-256.`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === artifact.sha256, `${artifact.id} byte SHA-256 does not match its immutable identity.`);
  return actual;
}

function validateArtifact(artifact, expected, seenIds) {
  assertExactKeys(
    artifact,
    [
      "id",
      "role",
      "authority",
      "uri",
      "fileName",
      "sha256",
      "accessedAt",
      "reviewedAt",
      "hashReviewState",
      "licenceReviewState",
      "licenceDecision",
      "subjectId",
      "intendedUse",
      "capabilities",
      "ancestry",
      "scopeCode",
    ],
    `Artifact ${artifact?.id ?? "<missing>"}`,
  );
  assert(!seenIds.has(artifact.id), `Duplicate artifact id ${artifact.id}.`);
  seenIds.add(artifact.id);
  assert(SHA256.test(artifact.sha256), `${artifact.id} requires a valid SHA-256 immutable identity.`);
  assert(artifact.accessedAt === REVIEW_DATE && artifact.reviewedAt === REVIEW_DATE, `${artifact.id} access/review dates do not match the reviewed decision.`);
  assert(artifact.hashReviewState === "VERIFIED", `${artifact.id} SHA-256 review is incomplete.`);
  assert(artifact.subjectId === SUBJECT, `${artifact.id} has the wrong subject binding.`);
  assert(artifact.intendedUse === INTENDED_USE, `${artifact.id} has the wrong intended-use binding.`);
  for (const field of [
    "role",
    "authority",
    "uri",
    "fileName",
    "sha256",
    "licenceReviewState",
    "licenceDecision",
    "scopeCode",
  ]) {
    assert(artifact[field] === expected[field], `${artifact.id} ${field} / licence decision does not match its reviewed immutable identity.`);
  }
  assertExactArray(artifact.capabilities, expected.capabilities, `${artifact.id} capabilities`);
  assert(!artifact.capabilities.some((value) => EXCLUDED_CAPABILITIES.includes(value)), `${artifact.id} capability laundering is forbidden.`);
  assertExactKeys(artifact.ancestry, ["state", "sourceArtifactIds", "externalLineage"], `${artifact.id} ancestry`);
  assertExactValue(artifact.ancestry, expected.ancestry, `${artifact.id} ancestry`);
}

function validatePageClaim(claim, expected, seenIds) {
  assertExactKeys(
    claim,
    [
      "id",
      "sourceArtifactId",
      "capabilities",
      "tableLabel",
      "pdfPageRange",
      "reportPageRange",
      "pdfToReportPageOffset",
      "publishedAxes",
      "publishedOutputs",
    ],
    `Source page claim ${claim?.id ?? "<missing>"}`,
  );
  assert(!seenIds.has(claim.id), `Duplicate source page claim ${claim.id}.`);
  seenIds.add(claim.id);
  assertExactValue(
    { ...claim, id: undefined },
    { ...expected, id: undefined },
    `${claim.id} page claim and page ancestry`,
  );
  assert(!claim.capabilities.some((value) => EXCLUDED_CAPABILITIES.includes(value)), `${claim.id} capability laundering is forbidden.`);
  assert(
    claim.pdfPageRange[0] - claim.reportPageRange[0] === claim.pdfToReportPageOffset &&
      claim.pdfPageRange[1] - claim.reportPageRange[1] === claim.pdfToReportPageOffset,
    `${claim.id} page ancestry does not match the reviewed offset.`,
  );
}

function findRegistryArtifact(registry, id) {
  const matches = registry.artifacts.filter((artifact) => artifact.id === id);
  assert(matches.length === 1, `Legacy Case 11 registry requires exactly one ${id} artifact.`);
  return matches[0];
}

function validateLegacyCase11(legacy, aircraftRegistry, corpusDaveArtifact) {
  assertExactKeys(
    legacy,
    [
      "registryPath",
      "registrySchemaVersion",
      "sourceArtifactId",
      "comparisonArtifactId",
      "derivativeArtifactId",
      "derivativeSha256",
      "ancestryState",
      "licenceReviewState",
      "scopeCode",
      "newDerivativePolicy",
      "runtimeAuthority",
    ],
    "Legacy Case 11 reconciliation",
  );
  const expected = {
    registryPath: DEFAULT_REGISTRY_PATH,
    registrySchemaVersion: "vector.aircraft-evidence-registry.v2",
    sourceArtifactId: "nasa-nesc-2015-f16-daveml-source",
    comparisonArtifactId: "nasa-nesc-2015-atmos11-sim04-validation",
    derivativeArtifactId: "vector-nesc-case11-derived-fixture",
    derivativeSha256: "85f14b1d28e0d839f6f75cc03e1ff7d577c181809f38d1b30a2f5f83e3bd3602",
    ancestryState: "LEGACY_REVIEWED_COMMON_MODEL_FIXTURE",
    licenceReviewState: "REVIEWED_IN_PUBLISHED_REGISTRY_V2",
    scopeCode: "CASE11_SI_NORMALIZED_CHECKPOINTS_ONLY",
    newDerivativePolicy: "EXPLICIT_LICENCE_AND_ANCESTRY_REVIEW_REQUIRED",
    runtimeAuthority: "NONE",
  };
  assertExactValue(legacy, expected, "Legacy Case 11 descendant policy");
  assert(aircraftRegistry.schemaVersion === legacy.registrySchemaVersion, "Legacy Case 11 registry schema changed.");
  const source = findRegistryArtifact(aircraftRegistry, legacy.sourceArtifactId);
  const comparison = findRegistryArtifact(aircraftRegistry, legacy.comparisonArtifactId);
  const derivative = findRegistryArtifact(aircraftRegistry, legacy.derivativeArtifactId);
  for (const artifact of [source, comparison, derivative]) {
    assertExactValue(
      artifact,
      EXPECTED_LEGACY_CASE11_REGISTRY_ARTIFACTS[artifact.id],
      `Legacy Case 11 immutable registry projection ${artifact.id}`,
    );
  }
  assertExactValue(
    {
      id: corpusDaveArtifact.id,
      role: corpusDaveArtifact.role,
      authority: corpusDaveArtifact.authority,
      uri: corpusDaveArtifact.uri,
      sha256: corpusDaveArtifact.sha256,
      intendedUse: corpusDaveArtifact.intendedUse,
      licenceReviewState: corpusDaveArtifact.licenceReviewState,
      licenceDecision: corpusDaveArtifact.licenceDecision,
      capabilities: corpusDaveArtifact.capabilities,
    },
    {
      id: source.id,
      role: "COMMON_MODEL_REFERENCE",
      authority: source.authority,
      uri: source.uri,
      sha256: source.sha256,
      intendedUse: "ENGINE_VERIFICATION_ONLY",
      licenceReviewState: "REVIEWED_WITH_NEW_DERIVATIVE_RESTRICTION",
      licenceDecision: "NEW_DERIVATIVE_REQUIRES_EXPLICIT_REVIEW",
      capabilities: source.capabilityCoverage,
    },
    "Legacy Case 11 standalone DAVE and published registry source identity",
  );
}

export function validateNasaGenericF16Reference(
  corpus,
  { aircraftRegistry, rootDirectory = process.cwd(), verifyLocalArtifacts = true } = {},
) {
  assert(aircraftRegistry, "NASA generic F-16 verification requires the published aircraft registry.");
  validateAircraftEvidenceRegistry(aircraftRegistry, { rootDirectory, verifyLocalArtifacts });
  assertExactKeys(
    corpus,
    [
      "schemaVersion",
      "id",
      "version",
      "ownerIssue",
      "parentIssue",
      "dependentIssues",
      "accessedAt",
      "reviewedAt",
      "subject",
      "artifacts",
      "sourcePageClaims",
      "case13p2",
      "legacyCase11",
      "derivativeAdmission",
    ],
    "NASA generic F-16 verification corpus",
  );
  assert(corpus.schemaVersion === CORPUS_SCHEMA, "NASA generic F-16 corpus schema is unsupported.");
  assert(corpus.id === "nasa-nesc-generic-f16-reference" && corpus.version === "1.0.0", "NASA generic F-16 corpus identity/version is invalid.");
  assert(corpus.ownerIssue === "#135" && corpus.parentIssue === "#64", "NASA generic F-16 corpus ownership is invalid.");
  assertExactArray(corpus.dependentIssues, ["#134", "#39"], "NASA generic F-16 dependent issues");
  assert(corpus.accessedAt === REVIEW_DATE && corpus.reviewedAt === REVIEW_DATE, "Corpus access/review dates are invalid.");

  assertExactKeys(
    corpus.subject,
    [
      "id",
      "intendedUse",
      "runtimeAuthority",
      "namedPerformanceAdmission",
      "capabilities",
      "excludedCapabilities",
      "excludedNamedSubjects",
    ],
    "NASA generic F-16 subject",
  );
  assert(corpus.subject.id === SUBJECT, "NASA generic F-16 corpus has the wrong subject.");
  assert(corpus.subject.intendedUse === INTENDED_USE, "NASA generic F-16 corpus has the wrong intended use.");
  assert(corpus.subject.runtimeAuthority === "NONE", "NASA generic F-16 corpus cannot grant runtime authority.");
  assert(corpus.subject.namedPerformanceAdmission === false, "NASA generic F-16 corpus cannot grant named-aircraft admission.");
  assertExactArray(corpus.subject.capabilities, SUBJECT_CAPABILITIES, "NASA generic F-16 subject capabilities");
  assertExactArray(corpus.subject.excludedCapabilities, EXCLUDED_CAPABILITIES, "NASA generic F-16 excluded capabilities");
  assertExactArray(corpus.subject.excludedNamedSubjects, EXCLUDED_SUBJECTS, "NASA generic F-16 excluded named subjects");

  assert(Array.isArray(corpus.artifacts) && corpus.artifacts.length === 4, "Corpus requires exactly four immutable artifact identities.");
  const artifactIds = new Set();
  for (const artifact of corpus.artifacts) {
    const expected = EXPECTED_ARTIFACTS[artifact.id];
    assert(expected, `${artifact.id} is an unknown artifact identity.`);
    validateArtifact(artifact, expected, artifactIds);
  }
  assertExactArray([...artifactIds], Object.keys(EXPECTED_ARTIFACTS), "Corpus artifact identities");

  assert(Array.isArray(corpus.sourcePageClaims) && corpus.sourcePageClaims.length === 3, "Corpus requires exactly three source page claims.");
  const claimIds = new Set();
  for (const claim of corpus.sourcePageClaims) {
    const expected = EXPECTED_PAGE_CLAIMS[claim.id];
    assert(expected, `${claim.id} is an unknown page claim.`);
    validatePageClaim(claim, expected, claimIds);
  }
  assertExactArray([...claimIds], Object.keys(EXPECTED_PAGE_CLAIMS), "Corpus page claims");

  assertExactKeys(
    corpus.case13p2,
    [
      "artifactId",
      "specificationUri",
      "durationSeconds",
      "commandAtSeconds",
      "equivalentAirspeedDeltaKnots",
      "comparisonRole",
      "physicalValidation",
    ],
    "Case 13.2 contract",
  );
  assertExactValue(
    corpus.case13p2,
    {
      artifactId: "nasa-nesc-2015-atmos13p2-comparison",
      specificationUri: "https://nescacademy.nasa.gov/flightsim/2015/atmospheric/acc13_p2",
      durationSeconds: 20,
      commandAtSeconds: 5,
      equivalentAirspeedDeltaKnots: -5,
      comparisonRole: "COMMON_MODEL_IMPLEMENTATION_COMPARISON_NOT_PHYSICAL_VALIDATION",
      physicalValidation: false,
    },
    "Case 13.2 specification, command, comparison role and physical validation",
  );

  validateLegacyCase11(
    corpus.legacyCase11,
    aircraftRegistry,
    corpus.artifacts.find((artifact) => artifact.id === corpus.legacyCase11.sourceArtifactId),
  );
  assertExactKeys(
    corpus.derivativeAdmission,
    ["state", "decisionCode", "requiredLongitudinalFields", "blockerCodes"],
    "WITHHELD derivative admission",
  );
  assert(corpus.derivativeAdmission.state === "WITHHELD", "Generic F-16 derivative must remain WITHHELD.");
  assert(
    corpus.derivativeAdmission.decisionCode ===
      "NEW_DERIVATIVE_REQUIRES_EXPLICIT_LICENCE_AND_ANCESTRY_REVIEW",
    "Generic F-16 derivative decision is not a reviewed closed enum.",
  );
  assertExactArray(
    corpus.derivativeAdmission.requiredLongitudinalFields,
    REQUIRED_LONGITUDINAL_FIELDS,
    "Required longitudinal fields",
  );
  assertExactArray(corpus.derivativeAdmission.blockerCodes, REQUIRED_BLOCKERS, "Derivative blocker codes");

  return {
    artifacts: 4,
    derivativeState: "WITHHELD",
    intendedUse: INTENDED_USE,
    schemaVersion: CORPUS_SCHEMA,
    subjectId: SUBJECT,
    version: "1.0.0",
  };
}

function validateTable(corpus, table) {
  assertExactKeys(
    table,
    [
      "id",
      "sourcePageClaimId",
      "sourceArtifactId",
      "capability",
      "pageAncestry",
      "axes",
      "output",
      "interpolation",
      "validityDomain",
    ],
    `Derivative table ${table?.id ?? "<missing>"}`,
  );
  assert(typeof table.id === "string" && table.id.length > 0, "Derivative table requires an id.");
  const claim = corpus.sourcePageClaims.find((item) => item.id === table.sourcePageClaimId);
  assert(claim, `${table.id} has unknown page ancestry.`);
  assert(claim.id === "tp1538-table-iii-longitudinal-aerodynamics", `${table.id} is not bound to the governed aerodynamic page claim.`);
  assert(table.sourceArtifactId === claim.sourceArtifactId, `${table.id} source ancestry does not match its page claim.`);
  assert(table.capability === "AERODYNAMICS" && claim.capabilities.includes(table.capability), `${table.id} capability is outside the governed aerodynamic claim.`);
  assertExactKeys(
    table.pageAncestry,
    ["pdfPage", "reportPage", "tableLabel", "extractionMethod"],
    `${table.id} page ancestry`,
  );
  assert(
    Number.isInteger(table.pageAncestry.pdfPage) &&
      Number.isInteger(table.pageAncestry.reportPage) &&
      table.pageAncestry.tableLabel === claim.tableLabel &&
      table.pageAncestry.pdfPage >= claim.pdfPageRange[0] &&
      table.pageAncestry.pdfPage <= claim.pdfPageRange[1] &&
      table.pageAncestry.reportPage >= claim.reportPageRange[0] &&
      table.pageAncestry.reportPage <= claim.reportPageRange[1] &&
      table.pageAncestry.pdfPage - table.pageAncestry.reportPage === claim.pdfToReportPageOffset,
    `${table.id} page ancestry does not match the reviewed report table.`,
  );
  assert(
    table.pageAncestry.extractionMethod === "INDEPENDENT_MANUAL_DOUBLE_ENTRY",
    `${table.id} requires independently double-entered extraction.`,
  );

  assert(Array.isArray(table.axes) && table.axes.length > 0, `${table.id} requires axes.`);
  const axisIds = new Set();
  let valueCount = 1;
  for (const axis of table.axes) {
    assertExactKeys(axis, ["id", "unit", "values"], `${table.id} axis`);
    assert(!axisIds.has(axis.id), `${table.id} has duplicate axis id ${axis.id}.`);
    axisIds.add(axis.id);
    assert(claim.publishedAxes.includes(axis.id), `${table.id} axis ${axis.id} is absent from its source claim.`);
    assert(axis.unit === "deg", `${table.id} axis ${axis.id} has an unsupported unit.`);
    assert(Array.isArray(axis.values) && axis.values.length >= 2, `${table.id} axis ${axis.id} is incomplete.`);
    assert(axis.values.every(Number.isFinite), `${table.id} axis ${axis.id} contains a non-finite value.`);
    assert(
      axis.values.every((value, index) => index === 0 || value > axis.values[index - 1]),
      `${table.id} axis ${axis.id} must be strictly increasing.`,
    );
    valueCount *= axis.values.length;
  }

  assertExactKeys(table.output, ["id", "unit", "values"], `${table.id} output`);
  assert(
    AERODYNAMIC_OUTPUTS.has(table.output.id) && claim.publishedOutputs.includes(table.output.id),
    `${table.id} output is outside the governed aerodynamic outputs.`,
  );
  assert(table.output.unit === "dimensionless", `${table.id} output has an unsupported unit.`);
  assert(
    Array.isArray(table.output.values) && table.output.values.length === valueCount,
    `${table.id} output dimensions do not match its axes.`,
  );
  assert(table.output.values.every(Number.isFinite), `${table.id} output contains a non-finite value.`);
  assert(table.interpolation === "LINEAR_INSIDE_CLOSED_DOMAIN", `${table.id} interpolation is unsupported.`);
  assertExactKeys(table.validityDomain, [...axisIds], `${table.id} validity domain`);
  for (const axis of table.axes) {
    assertExactArray(
      table.validityDomain[axis.id],
      [axis.values[0], axis.values.at(-1)],
      `${table.id} validity domain for ${axis.id}`,
    );
  }
}

export function validateResearchDerivative(
  corpus,
  derivative,
  { aircraftRegistry, rootDirectory = process.cwd() } = {},
) {
  assert(
    aircraftRegistry,
    "Research derivative validation requires the published aircraft registry.",
  );
  validateNasaGenericF16Reference(corpus, {
    aircraftRegistry,
    rootDirectory,
    verifyLocalArtifacts: true,
  });
  assertExactKeys(
    derivative,
    [
      "schemaVersion",
      "id",
      "version",
      "subjectId",
      "intendedUse",
      "authority",
      "sourceArtifactIds",
      "comparisonArtifactIds",
      "capabilityBindings",
      "tables",
      "sha256",
    ],
    "Research derivative",
  );
  assert(derivative.schemaVersion === DERIVATIVE_SCHEMA, "Research derivative schema is unsupported.");
  assert(typeof derivative.id === "string" && derivative.id.length > 0, "Research derivative requires an id.");
  assert(typeof derivative.version === "string" && derivative.version.length > 0, "Research derivative requires a version.");
  assert(derivative.subjectId === SUBJECT, "Research derivative has the wrong subject.");
  assert(derivative.intendedUse === INTENDED_USE, "Research derivative has the wrong intended use.");
  assert(derivative.authority === "RESEARCH_CANDIDATE_ONLY", "Research derivative cannot grant runtime authority.");
  assertExactArray(derivative.capabilityBindings, ["AERODYNAMICS"], "Research derivative capability bindings");

  const sourceReports = new Set(
    corpus.artifacts.filter((artifact) => artifact.role === "SOURCE_REPORT").map((artifact) => artifact.id),
  );
  assert(
    Array.isArray(derivative.sourceArtifactIds) &&
      derivative.sourceArtifactIds.length > 0 &&
      derivative.sourceArtifactIds.every((id) => sourceReports.has(id)),
    "Research derivative source ancestry must contain source reports only; comparison artifacts cannot be sources.",
  );
  assertExactArray(
    derivative.sourceArtifactIds,
    ["nasa-tp-1538-f16-aerodynamics-source"],
    "Research derivative source-report ancestry",
  );
  assertExactArray(derivative.comparisonArtifactIds, [], "Research derivative comparison ancestry");
  assert(Array.isArray(derivative.tables) && derivative.tables.length > 0, "Research derivative requires factual tables.");
  const tableIds = new Set();
  for (const table of derivative.tables) {
    assert(!tableIds.has(table.id), `Research derivative has duplicate table id ${table.id}.`);
    tableIds.add(table.id);
    assert(derivative.sourceArtifactIds.includes(table.sourceArtifactId), `${table.id} table source is absent from derivative ancestry.`);
    validateTable(corpus, table);
  }
  assert(SHA256.test(derivative.sha256), "Research derivative requires a SHA-256 digest.");
  assert(computeDerivativeDigest(derivative) === derivative.sha256, "Research derivative digest does not match its tables.");
  return { tables: derivative.tables.length, sha256: derivative.sha256 };
}

export function evaluateEvidenceTable1d(table, coordinate) {
  assert(Number.isFinite(coordinate), "Evidence table coordinate must be finite.");
  assert(table.axes?.length === 1, "Only one-dimensional evidence-table checks are supported by this offline verifier.");
  const axisDefinition = table.axes[0];
  const axis = axisDefinition.values;
  const values = table.output?.values;
  assert(Array.isArray(axis) && Array.isArray(values) && axis.length === values.length, "Evidence table axes and values do not match.");
  assert(axis.every(Number.isFinite) && values.every(Number.isFinite), "Evidence table contains a non-finite value.");
  assert(
    Array.isArray(table.validityDomain?.[axisDefinition.id]) &&
      coordinate >= table.validityDomain[axisDefinition.id][0] &&
      coordinate <= table.validityDomain[axisDefinition.id][1],
    "Evidence table coordinate is outside the closed source domain.",
  );
  if (coordinate === axis.at(-1)) return values.at(-1);
  const upperIndex = axis.findIndex((value) => value > coordinate);
  assert(upperIndex > 0, "Evidence table coordinate is outside the closed source domain.");
  const lowerIndex = upperIndex - 1;
  const fraction = (coordinate - axis[lowerIndex]) / (axis[upperIndex] - axis[lowerIndex]);
  return values[lowerIndex] + fraction * (values[upperIndex] - values[lowerIndex]);
}

function run() {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 2 && args[0] === "--artifact-dir"), "Usage: verify-nasa-generic-f16-reference.mjs [--artifact-dir <directory>]");
    const artifactDirectory = args[0] === "--artifact-dir" ? args[1] : undefined;
    assert(!args[0] || artifactDirectory, "--artifact-dir requires a path.");
    const rootDirectory = process.cwd();
    const corpus = JSON.parse(readFileSync(resolve(rootDirectory, DEFAULT_CORPUS_PATH), "utf8"));
    const aircraftRegistry = JSON.parse(readFileSync(resolve(rootDirectory, DEFAULT_REGISTRY_PATH), "utf8"));
    const result = validateNasaGenericF16Reference(corpus, { aircraftRegistry, rootDirectory });
    if (artifactDirectory) {
      for (const artifact of corpus.artifacts) {
        verifyArtifactBytes(artifact, readFileSync(resolve(artifactDirectory, artifact.fileName)));
      }
    }
    process.stdout.write(`${JSON.stringify({ ...result, artifactBytesVerified: Boolean(artifactDirectory) })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) run();
