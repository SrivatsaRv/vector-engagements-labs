import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_REGISTRY_PATH,
  validateAircraftEvidenceRegistry,
} from "./verify-aircraft-evidence-registry.mjs";

const CORPUS_SCHEMA = "vector.aircraft-verification-corpus.v1";
const DERIVATIVE_SCHEMA = "vector.aircraft-verification-derivative.v1";
const SUBJECT = "NASA_NESC_GENERIC_F16_REFERENCE";
const INTENDED_USE = "ENGINE_VERIFICATION_ONLY";
const SHA256 = /^[a-f0-9]{64}$/u;

const EXPECTED_ARTIFACTS = Object.freeze({
  "nasa-tp-1538-f16-aerodynamics-source": Object.freeze({
    uri: "https://ntrs.nasa.gov/api/citations/19800005879/downloads/19800005879.pdf",
    sha256: "aae0ece64474291368c0b4c816d3ab327c6100329e6eb030c2f4545d0913feb3",
    fileName: "19800005879.pdf",
    kind: "SOURCE",
    licenseDecision: "PUBLIC_USE_PERMITTED",
    role: "SOURCE_REPORT",
  }),
  "nasa-tm-2003-212145-f16-simulation-source": Object.freeze({
    uri: "https://ntrs.nasa.gov/api/citations/20030013626/downloads/20030013626.pdf",
    sha256: "df7eb1a40f18c5d025de7759c4c227a36c283b8522f89dd9bed5c7d6b6aaedc9",
    fileName: "20030013626.pdf",
    kind: "SOURCE",
    licenseDecision: "PUBLIC_USE_PERMITTED",
    role: "SOURCE_REPORT",
  }),
  "nasa-nesc-2015-f16-daveml-source": Object.freeze({
    uri: "https://nescacademy.nasa.gov/workshop/FlightSim/2015/models/F16_package.zip",
    sha256: "20c60f615ae8e87d81c9d98b54fff45a2832840201499cbcfe3f45a60ef3e5b2",
    fileName: "F16_package.zip",
    kind: "SOURCE",
    licenseDecision: "REFERENCE_ONLY_NO_DERIVATIVE_COMMIT",
    role: "COMMON_MODEL_REFERENCE",
  }),
  "nasa-nesc-2015-atmos13p2-comparison": Object.freeze({
    uri: "https://nescacademy.nasa.gov/src/flightsim/Datasets/Atmos_13p2_SubsonicAirspeedChangeF16.zip",
    sha256: "b26a2f9eb4c537ea96bf73493004ae77d37b38d496b32e6d50e00b4ec9482fb1",
    fileName: "Atmos_13p2_SubsonicAirspeedChangeF16.zip",
    kind: "CONTEXT",
    licenseDecision: "REFERENCE_ONLY_NO_DERIVATIVE_COMMIT",
    role: "COMMON_MODEL_COMPARISON",
  }),
});

const REQUIRED_BLOCKERS = Object.freeze([
  "PUBLIC_REPORT_PROPULSION_TABLE_VALUES_NOT_EMBEDDED",
  "PUBLIC_REPORT_CONTROL_OUTPUT_TABLE_VALUES_NOT_EMBEDDED",
  "NESC_PACKAGE_REDISTRIBUTION_NOT_ESTABLISHED",
  "NESC_PROPULSION_INERTIA_THIRD_PARTY_BOOK_ANCESTRY",
]);

const EXPECTED_PAGE_CLAIMS = Object.freeze({
  "tp1538-table-i-mass-geometry": Object.freeze({
    sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
    tableLabel: "TABLE I",
    pdfPageRange: Object.freeze([49, 49]),
    reportPageRange: Object.freeze([43, 43]),
    pdfToReportPageOffset: 6,
  }),
  "tp1538-table-iii-aerodynamics": Object.freeze({
    sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
    tableLabel: "TABLE III",
    pdfPageRange: Object.freeze([51, 85]),
    reportPageRange: Object.freeze([45, 79]),
    pdfToReportPageOffset: 6,
  }),
  "tm212145-table-1-mass-properties": Object.freeze({
    sourceArtifactId: "nasa-tm-2003-212145-f16-simulation-source",
    tableLabel: "Table 1",
    pdfPageRange: Object.freeze([48, 48]),
    reportPageRange: Object.freeze([33, 33]),
    pdfToReportPageOffset: 15,
  }),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function equalMembers(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

export function computeDerivativeDigest(derivative) {
  const payload = structuredClone(derivative);
  delete payload.sha256;
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function verifyArtifactBytes(artifact, bytes) {
  assert(SHA256.test(artifact.sha256), `${artifact.id} requires a declared SHA-256.`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === artifact.sha256, `${artifact.id} byte SHA-256 does not match its immutable identity.`);
  return actual;
}

function validatePageClaim(claim, sourceReports) {
  assert(typeof claim.id === "string" && claim.id.length > 0, "Source page claim requires an id.");
  assert(sourceReports.has(claim.sourceArtifactId), `${claim.id} page ancestry is not bound to a source report.`);
  assert(Array.isArray(claim.capabilities) && claim.capabilities.length > 0, `${claim.id} requires capability coverage.`);
  assert(typeof claim.tableLabel === "string" && claim.tableLabel.length > 0, `${claim.id} requires a table label.`);
  for (const [name, range] of [
    ["PDF", claim.pdfPageRange],
    ["report", claim.reportPageRange],
  ]) {
    assert(
      Array.isArray(range) &&
        range.length === 2 &&
        range.every(Number.isInteger) &&
        range[0] > 0 &&
        range[1] >= range[0],
      `${claim.id} has invalid ${name} page ancestry.`,
    );
  }
  assert(Number.isInteger(claim.pdfToReportPageOffset), `${claim.id} requires an integer page offset.`);
  assert(
    claim.pdfPageRange[0] - claim.reportPageRange[0] === claim.pdfToReportPageOffset &&
      claim.pdfPageRange[1] - claim.reportPageRange[1] === claim.pdfToReportPageOffset,
    `${claim.id} PDF/report page ancestry does not match its offset.`,
  );
  assert(Array.isArray(claim.publishedAxes), `${claim.id} requires published axes.`);
  assert(Array.isArray(claim.publishedOutputs) && claim.publishedOutputs.length > 0, `${claim.id} requires published outputs.`);
}

export function validateNasaGenericF16Reference(
  registry,
  { rootDirectory = process.cwd(), verifyLocalArtifacts = true } = {},
) {
  validateAircraftEvidenceRegistry(registry, { rootDirectory, verifyLocalArtifacts });
  assert(Array.isArray(registry.verificationCorpora), "Registry requires verificationCorpora.");
  const matching = registry.verificationCorpora.filter((item) => item.id === "nasa-nesc-generic-f16-reference");
  assert(matching.length === 1, "Registry requires exactly one NASA generic F-16 verification corpus.");
  const corpus = matching[0];
  assert(corpus.schemaVersion === CORPUS_SCHEMA, "NASA generic F-16 corpus schema is unsupported.");
  assert(corpus.ownerIssue === "#135" && corpus.parentIssue === "#64", "NASA generic F-16 corpus ownership is invalid.");
  assert(corpus.subject === SUBJECT, "NASA generic F-16 corpus has the wrong subject.");
  assert(corpus.intendedUse === INTENDED_USE, "NASA generic F-16 corpus has the wrong intended use.");
  assert(corpus.runtimeAuthority === "NONE", "NASA generic F-16 corpus cannot grant runtime authority.");
  assert(corpus.namedPerformanceAdmission === false, "NASA generic F-16 corpus cannot grant named-aircraft admission.");

  const artifacts = new Map(registry.artifacts.map((artifact) => [artifact.id, artifact]));
  const roleIds = new Set();
  for (const [artifactId, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
    const artifact = artifacts.get(artifactId);
    assert(artifact, `Missing immutable identity ${artifactId}.`);
    for (const field of ["uri", "sha256", "fileName", "kind", "licenseDecision"]) {
      assert(
        artifact[field] === expected[field],
        `${artifactId} ${field} does not match its reviewed immutable identity.`,
      );
    }
    assert(artifact.hashReviewState === "VERIFIED", `${artifactId} SHA-256 review is incomplete.`);
    assert(artifact.licenseReviewState === "REVIEWED", `${artifactId} license decision is incomplete.`);
    assert(artifact.admissionUse === "REFERENCE_ONLY", `${artifactId} cannot be promoted beyond reference-only use.`);
    const idsForRole = corpus.artifactRoles?.[expected.role];
    assert(Array.isArray(idsForRole) && idsForRole.includes(artifactId), `${artifactId} has the wrong corpus role.`);
    assert(!roleIds.has(artifactId), `${artifactId} is laundered across corpus roles.`);
    roleIds.add(artifactId);
  }
  const declaredRoleIds = Object.values(corpus.artifactRoles ?? {}).flat();
  assert(
    equalMembers(declaredRoleIds, Object.keys(EXPECTED_ARTIFACTS)),
    "NASA generic F-16 corpus contains an unexpected or duplicated artifact role.",
  );

  const sourceReports = new Set(corpus.artifactRoles.SOURCE_REPORT);
  assert(Array.isArray(corpus.sourcePageClaims) && corpus.sourcePageClaims.length > 0, "Corpus requires source page claims.");
  const claimIds = new Set();
  for (const claim of corpus.sourcePageClaims) {
    assert(!claimIds.has(claim.id), `Duplicate source page claim ${claim.id}.`);
    claimIds.add(claim.id);
    validatePageClaim(claim, sourceReports);
    const expected = EXPECTED_PAGE_CLAIMS[claim.id];
    assert(expected, `${claim.id} is not a reviewed source page claim.`);
    assert(
      claim.sourceArtifactId === expected.sourceArtifactId &&
        claim.tableLabel === expected.tableLabel &&
        equalMembers(claim.pdfPageRange, expected.pdfPageRange) &&
        equalMembers(claim.reportPageRange, expected.reportPageRange) &&
        claim.pdfToReportPageOffset === expected.pdfToReportPageOffset,
      `${claim.id} does not match its reviewed page ancestry.`,
    );
  }
  assert(equalMembers([...claimIds], Object.keys(EXPECTED_PAGE_CLAIMS)), "Corpus page ancestry is incomplete.");

  assert(corpus.case13p2?.comparisonRole === "COMMON_MODEL_IMPLEMENTATION_COMPARISON_NOT_PHYSICAL_VALIDATION", "Case 13.2 role is laundered into physical validation.");
  assert(corpus.derivative?.state === "WITHHELD", "Generic F-16 derivative must remain withheld.");
  assert(corpus.derivative.localPath === null && corpus.derivative.sha256 === null, "Withheld derivative cannot identify executable bytes.");
  assert(Array.isArray(corpus.derivative.tables) && corpus.derivative.tables.length === 0, "Withheld derivative cannot contain copied tables.");
  assert(equalMembers(corpus.derivative.blockerCodes, REQUIRED_BLOCKERS), "Withheld derivative must retain every reviewed blocker.");

  return {
    artifacts: Object.keys(EXPECTED_ARTIFACTS).length,
    derivativeState: corpus.derivative.state,
    intendedUse: corpus.intendedUse,
    subject: corpus.subject,
  };
}

function validateTable(corpus, table) {
  assert(typeof table.id === "string" && table.id.length > 0, "Derivative table requires an id.");
  const claim = corpus.sourcePageClaims.find((item) => item.id === table.sourceClaimId);
  assert(claim, `${table.id} has unknown page ancestry.`);
  assert(table.sourceArtifactId === claim.sourceArtifactId, `${table.id} source ancestry does not match its page claim.`);
  assert(claim.capabilities.includes(table.capability), `${table.id} capability is outside its source claim.`);
  assert(
    table.pageAncestry?.tableLabel === claim.tableLabel &&
      Number.isInteger(table.pageAncestry?.pdfPage) &&
      Number.isInteger(table.pageAncestry?.reportPage) &&
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
  let valueCount = 1;
  for (const axis of table.axes) {
    assert(claim.publishedAxes.includes(axis.id), `${table.id} axis ${axis.id} is absent from its source claim.`);
    assert(["angleOfAttack", "sideslip", "horizontalTailDeflection"].includes(axis.id), `${table.id} has an unsupported axis.`);
    assert(axis.unit === "deg", `${table.id} axis ${axis.id} has an unsupported unit.`);
    assert(Array.isArray(axis.values) && axis.values.length >= 2, `${table.id} axis ${axis.id} is incomplete.`);
    assert(axis.values.every(Number.isFinite), `${table.id} axis ${axis.id} contains a non-finite value.`);
    assert(axis.values.every((value, index) => index === 0 || value > axis.values[index - 1]), `${table.id} axis ${axis.id} must be strictly increasing.`);
    valueCount *= axis.values.length;
  }
  assert(table.output?.unit === "dimensionless", `${table.id} output has an unsupported unit.`);
  assert(Array.isArray(table.output.values) && table.output.values.length === valueCount, `${table.id} output dimensions do not match its axes.`);
  assert(table.output.values.every(Number.isFinite), `${table.id} output contains a non-finite value.`);
  assert(table.interpolation === "LINEAR_INSIDE_CLOSED_DOMAIN", `${table.id} interpolation is unsupported.`);
}

export function validateResearchDerivative(corpus, derivative) {
  assert(derivative.schemaVersion === DERIVATIVE_SCHEMA, "Research derivative schema is unsupported.");
  assert(derivative.subject === SUBJECT, "Research derivative has the wrong subject.");
  assert(derivative.intendedUse === INTENDED_USE, "Research derivative has the wrong intended use.");
  assert(derivative.authority === "RESEARCH_CANDIDATE_ONLY", "Research derivative cannot grant runtime authority.");
  const sourceReports = new Set(corpus.artifactRoles.SOURCE_REPORT);
  assert(
    Array.isArray(derivative.sourceArtifactIds) &&
      derivative.sourceArtifactIds.length > 0 &&
      derivative.sourceArtifactIds.every((id) => sourceReports.has(id)),
    "Research derivative source ancestry must contain source reports only; comparison artifacts cannot be sources.",
  );
  assert(
    Array.isArray(derivative.comparisonArtifactIds) && derivative.comparisonArtifactIds.length === 0,
    "Research derivative cannot launder comparison artifacts into source ancestry.",
  );
  assert(Array.isArray(derivative.tables) && derivative.tables.length > 0, "Research derivative requires factual tables.");
  for (const table of derivative.tables) {
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
  const axis = table.axes[0].values;
  const values = table.output?.values;
  assert(Array.isArray(axis) && Array.isArray(values) && axis.length === values.length, "Evidence table axes and values do not match.");
  assert(axis.every(Number.isFinite) && values.every(Number.isFinite), "Evidence table contains a non-finite value.");
  assert(coordinate >= axis[0] && coordinate <= axis.at(-1), "Evidence table coordinate is outside the closed source domain.");
  if (coordinate === axis.at(-1)) return values.at(-1);
  const upperIndex = axis.findIndex((value) => value > coordinate);
  if (upperIndex === -1) return values.at(-1);
  const lowerIndex = Math.max(0, upperIndex - 1);
  const span = axis[upperIndex] - axis[lowerIndex];
  const fraction = span === 0 ? 0 : (coordinate - axis[lowerIndex]) / span;
  return values[lowerIndex] + fraction * (values[upperIndex] - values[lowerIndex]);
}

function run() {
  try {
    const args = process.argv.slice(2);
    const artifactDirectoryIndex = args.indexOf("--artifact-dir");
    const artifactDirectory = artifactDirectoryIndex >= 0 ? args[artifactDirectoryIndex + 1] : undefined;
    assert(artifactDirectoryIndex < 0 || artifactDirectory, "--artifact-dir requires a path.");
    const rootDirectory = process.cwd();
    const registry = JSON.parse(readFileSync(resolve(rootDirectory, DEFAULT_REGISTRY_PATH), "utf8"));
    const result = validateNasaGenericF16Reference(registry, { rootDirectory });
    if (artifactDirectory) {
      const artifacts = new Map(registry.artifacts.map((artifact) => [artifact.id, artifact]));
      for (const artifactId of Object.keys(EXPECTED_ARTIFACTS)) {
        const artifact = artifacts.get(artifactId);
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
