import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  computeDerivativeDigest,
  evaluateEvidenceTable1d,
  validateNasaGenericF16Reference,
  validateResearchDerivative,
  verifyArtifactBytes,
} from "../scripts/verify-nasa-generic-f16-reference.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL("../governance/nasa-generic-f16-verification-corpus.v1.json", import.meta.url),
    "utf8",
  ),
);
const aircraftRegistryText = await readFile(
  new URL("../governance/aircraft-evidence-registry.v2.json", import.meta.url),
  "utf8",
);
const aircraftRegistry = JSON.parse(aircraftRegistryText);
const runtimeSurfaces = await Promise.all(
  [
    "../lib/reference-model-pack.ts",
    "../lib/object-catalog.ts",
    "../fixtures/model-packs/vector-scalar-study-v0.9.compiled.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

function candidateTable({
  id = "synthetic-cx-alpha-test",
  axisId = "ANGLE_OF_ATTACK_DEG",
  outputId = "BODY_FORCE_COEFFICIENT_X",
} = {}) {
  return {
    id,
    sourcePageClaimId: "tp1538-table-iii-longitudinal-aerodynamics",
    sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
    capability: "AERODYNAMICS",
    pageAncestry: {
      pdfPage: 51,
      reportPage: 45,
      tableLabel: "TABLE III",
      extractionMethod: "INDEPENDENT_MANUAL_DOUBLE_ENTRY",
    },
    axes: [{ id: axisId, unit: "deg", values: [0, 5] }],
    output: {
      id: outputId,
      unit: "dimensionless",
      values: [-0.02, -0.03],
    },
    interpolation: "LINEAR_INSIDE_CLOSED_DOMAIN",
    validityDomain: { [axisId]: [0, 5] },
  };
}

function candidateDerivative(tables = [candidateTable()]) {
  const derivative = {
    schemaVersion: "vector.aircraft-verification-derivative.v1",
    id: "synthetic-nasa-generic-f16-derivative-test",
    version: "0.0.0-test",
    subjectId: "NASA_NESC_GENERIC_F16_REFERENCE",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    authority: "RESEARCH_CANDIDATE_ONLY",
    sourceArtifactIds: ["nasa-tp-1538-f16-aerodynamics-source"],
    comparisonArtifactIds: [],
    capabilityBindings: ["AERODYNAMICS"],
    tables,
  };
  return { ...derivative, sha256: computeDerivativeDigest(derivative) };
}

function withDigest(derivative) {
  derivative.sha256 = computeDerivativeDigest(derivative);
  return derivative;
}

function validateDerivative(corpus, derivative) {
  return validateResearchDerivative(corpus, derivative, { aircraftRegistry });
}

test("separate NASA generic F-16 verification corpus is exact and withheld", () => {
  assert.deepEqual(validateNasaGenericF16Reference(manifest, { aircraftRegistry }), {
    artifacts: 4,
    derivativeState: "WITHHELD",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    schemaVersion: "vector.aircraft-verification-corpus.v1",
    subjectId: "NASA_NESC_GENERIC_F16_REFERENCE",
    version: "1.0.0",
  });
});

test("published named-aircraft registry remains byte-compatible with its v2 contract", () => {
  assert.equal(aircraftRegistry.schemaVersion, "vector.aircraft-evidence-registry.v2");
  assert.equal(aircraftRegistry.artifacts.length, 11);
  assert.equal(aircraftRegistry.claims.length, 3);
  assert.equal("verificationCorpora" in aircraftRegistry, false);
  assert.equal(
    createHash("sha256").update(aircraftRegistryText).digest("hex"),
    "16a555b953c84e412ca674575659e4a1a6a1df88777415d6e6b8b11ad3028204",
  );
});

test("corpus rejects unknown keys at every governed manifest layer", () => {
  const mutations = [
    (value) => (value.unknown = true),
    (value) => (value.subject.unknown = true),
    (value) => (value.artifacts[0].unknown = true),
    (value) => (value.artifacts[0].ancestry.unknown = true),
    (value) => (value.sourcePageClaims[0].unknown = true),
    (value) => (value.case13p2.unknown = true),
    (value) => (value.legacyCase11.unknown = true),
    (value) => (value.derivativeAdmission.unknown = true),
  ];
  for (const mutate of mutations) {
    const tampered = structuredClone(manifest);
    mutate(tampered);
    assert.throws(
      () => validateNasaGenericF16Reference(tampered, { aircraftRegistry }),
      /unknown|exact keys/i,
    );
  }
});

test("wrong subject, PAF identity and sensor capability laundering fail closed", () => {
  const wrongSubject = structuredClone(manifest);
  wrongSubject.subject.id = "PAF_F16C_BLOCK52_PEACE_DRIVE_I";
  assert.throws(
    () => validateNasaGenericF16Reference(wrongSubject, { aircraftRegistry }),
    /subject/i,
  );

  const sensorCapability = structuredClone(manifest);
  sensorCapability.subject.capabilities.push("SENSORS");
  assert.throws(
    () => validateNasaGenericF16Reference(sensorCapability, { aircraftRegistry }),
    /capabilit/i,
  );

  const artifactSubject = structuredClone(manifest);
  artifactSubject.artifacts[0].subjectId = "PAF_F16C_BLOCK52_PEACE_DRIVE_I";
  assert.throws(
    () => validateNasaGenericF16Reference(artifactSubject, { aircraftRegistry }),
    /subject/i,
  );
});

test("exact Case 13.2 URI, duration, command and role cannot drift", () => {
  const mutations = [
    (value) => (value.case13p2.specificationUri = "https://example.invalid/case"),
    (value) => (value.case13p2.durationSeconds = 21),
    (value) => (value.case13p2.commandAtSeconds = 4),
    (value) => (value.case13p2.equivalentAirspeedDeltaKnots = 5),
    (value) => (value.case13p2.comparisonRole = "PHYSICAL_VALIDATION"),
    (value) => (value.case13p2.physicalValidation = true),
  ];
  for (const mutate of mutations) {
    const tampered = structuredClone(manifest);
    mutate(tampered);
    assert.throws(
      () => validateNasaGenericF16Reference(tampered, { aircraftRegistry }),
      /Case 13\.2|comparison|physical validation/i,
    );
  }
});

test("WITHHELD admission forbids embedded values, tables, paths and digests", () => {
  for (const [field, value] of [
    ["embeddedValues", [1]],
    ["tables", []],
    ["localPath", "fixtures/forbidden.json"],
    ["sha256", "a".repeat(64)],
  ]) {
    const tampered = structuredClone(manifest);
    tampered.derivativeAdmission[field] = value;
    assert.throws(
      () => validateNasaGenericF16Reference(tampered, { aircraftRegistry }),
      /WITHHELD|unknown|exact keys/i,
    );
  }
});

test("licence decisions, access/review dates and derivative decision enums are closed", () => {
  const tpDecision = structuredClone(manifest);
  tpDecision.artifacts[0].licenceDecision = "PUBLIC_USE_PERMITTED";
  assert.throws(
    () => validateNasaGenericF16Reference(tpDecision, { aircraftRegistry }),
    /licence decision/i,
  );

  const dateTamper = structuredClone(manifest);
  dateTamper.artifacts[0].accessedAt = "2026-08-23";
  assert.throws(
    () => validateNasaGenericF16Reference(dateTamper, { aircraftRegistry }),
    /access|review/i,
  );

  const derivativeDecision = structuredClone(manifest);
  derivativeDecision.derivativeAdmission.decisionCode = "ALLOW_DERIVATIVE";
  assert.throws(
    () => validateNasaGenericF16Reference(derivativeDecision, { aircraftRegistry }),
    /decision/i,
  );
});

test("legacy Case 11 descendant is reconciled without allowing a new derivative", () => {
  assert.equal(
    manifest.legacyCase11.derivativeArtifactId,
    "vector-nesc-case11-derived-fixture",
  );
  assert.equal(
    manifest.legacyCase11.newDerivativePolicy,
    "EXPLICIT_LICENCE_AND_ANCESTRY_REVIEW_REQUIRED",
  );
  const corpusDave = manifest.artifacts.find(
    (item) => item.id === manifest.legacyCase11.sourceArtifactId,
  );
  const registryDave = aircraftRegistry.artifacts.find(
    (item) => item.id === manifest.legacyCase11.sourceArtifactId,
  );
  assert.deepEqual(corpusDave.capabilities, registryDave.capabilityCoverage);
  assert.deepEqual(
    [corpusDave.id, corpusDave.authority, corpusDave.uri, corpusDave.sha256],
    [registryDave.id, registryDave.authority, registryDave.uri, registryDave.sha256],
  );

  const conflict = structuredClone(manifest);
  conflict.legacyCase11.derivativeSha256 = "a".repeat(64);
  assert.throws(
    () => validateNasaGenericF16Reference(conflict, { aircraftRegistry }),
    /legacy|descendant|Case 11/i,
  );

  const blanketBan = structuredClone(manifest);
  blanketBan.artifacts.find((item) => item.id === "nasa-nesc-2015-f16-daveml-source").licenceDecision =
    "NO_DERIVATIVES_PERMITTED";
  assert.throws(
    () => validateNasaGenericF16Reference(blanketBan, { aircraftRegistry }),
    /licence decision|legacy|descendant/i,
  );
});

test("legacy Case 11 registry projection rejects every identity and policy mutation", () => {
  const artifact = (registry, id) => registry.artifacts.find((item) => item.id === id);
  const sourceId = "nasa-nesc-2015-f16-daveml-source";
  const comparisonId = "nasa-nesc-2015-atmos11-sim04-validation";
  const derivativeId = "vector-nesc-case11-derived-fixture";
  const mutations = [
    ["source authority", (value) => (artifact(value, sourceId).authority = "NASA NESC REVIEW")],
    ["source URI", (value) => (artifact(value, sourceId).uri = "https://example.invalid/source.zip")],
    ["source SHA", (value) => (artifact(value, sourceId).sha256 = "a".repeat(64))],
    ["source kind", (value) => (artifact(value, sourceId).kind = "VALIDATION")],
    ["source licence", (value) => (artifact(value, sourceId).licenseReviewState = "PENDING")],
    ["source admission", (value) => (artifact(value, sourceId).admissionUse = "GOVERNANCE_CONTEXT_ONLY")],
    ["source capability", (value) => (artifact(value, sourceId).capabilityCoverage = ["AERODYNAMICS"])],
    ["source scope", (value) => (artifact(value, sourceId).scope = "altered source scope")],
    ["source subject claim", (value) => (artifact(value, sourceId).subjectClaimIds = ["su-30mki-performance"])],
    ["source hash state", (value) => {
      artifact(value, sourceId).hashReviewState = "PENDING";
      artifact(value, sourceId).sha256 = null;
    }],
    ["comparison authority", (value) => (artifact(value, comparisonId).authority = "NASA NESC REVIEW")],
    ["comparison URI", (value) => (artifact(value, comparisonId).uri = "https://example.invalid/comparison.csv")],
    ["comparison SHA", (value) => (artifact(value, comparisonId).sha256 = "b".repeat(64))],
    ["comparison kind", (value) => (artifact(value, comparisonId).kind = "SOURCE")],
    ["comparison licence", (value) => (artifact(value, comparisonId).licenseReviewState = "PENDING")],
    ["comparison admission", (value) => (artifact(value, comparisonId).admissionUse = "GOVERNANCE_CONTEXT_ONLY")],
    ["comparison capability", (value) => (artifact(value, comparisonId).capabilityCoverage = ["AERODYNAMICS"])],
    ["comparison scope", (value) => (artifact(value, comparisonId).scope = "altered comparison scope")],
    ["comparison subject claim", (value) => (artifact(value, comparisonId).subjectClaimIds = ["f-16c-block52-paf-performance"])],
    ["comparison hash state", (value) => {
      artifact(value, comparisonId).hashReviewState = "PENDING";
      artifact(value, comparisonId).sha256 = null;
    }],
    ["derivative authority", (value) => (artifact(value, derivativeId).authority = "VECTOR REVIEW")],
    ["derivative URI", (value) => (artifact(value, derivativeId).uri = "fixtures/public-reference/renamed.json")],
    ["derivative licence", (value) => (artifact(value, derivativeId).licenseReviewState = "PENDING")],
    ["derivative capability", (value) => (artifact(value, derivativeId).capabilityCoverage = ["AERODYNAMICS"])],
    ["derivative scope", (value) => (artifact(value, derivativeId).scope = "altered derivative scope")],
    ["derivative subject claim", (value) => (artifact(value, derivativeId).subjectClaimIds = ["f-16d-block52-paf-performance"])],
    ["derivative local path", (value) => (artifact(value, derivativeId).localPath = "fixtures/public-reference/renamed.json")],
  ];

  for (const [name, mutate] of mutations) {
    const registry = structuredClone(aircraftRegistry);
    mutate(registry);
    assert.throws(
      () => validateNasaGenericF16Reference(manifest, { aircraftRegistry: registry, verifyLocalArtifacts: false }),
      /legacy|Case 11|registry|identity|policy/i,
      name,
    );
  }
});

test("page claims have exact capability, outputs and immutable ancestry", () => {
  const mutations = [
    (value) => value.sourcePageClaims[1].capabilities.push("SENSORS"),
    (value) => value.sourcePageClaims[1].publishedOutputs.push("SENSOR_RANGE_M"),
    (value) => (value.sourcePageClaims[1].pdfPageRange[0] = 50),
    (value) => (value.sourcePageClaims[1].tableLabel = "TABLE IV"),
  ];
  for (const mutate of mutations) {
    const tampered = structuredClone(manifest);
    mutate(tampered);
    assert.throws(
      () => validateNasaGenericF16Reference(tampered, { aircraftRegistry }),
      /page claim|page ancestry|capabilit|output/i,
    );
  }
});

test("required longitudinal fields and blocker set are exact", () => {
  const fieldTamper = structuredClone(manifest);
  fieldTamper.derivativeAdmission.requiredLongitudinalFields.pop();
  assert.throws(
    () => validateNasaGenericF16Reference(fieldTamper, { aircraftRegistry }),
    /longitudinal fields/i,
  );

  const blockerTamper = structuredClone(manifest);
  blockerTamper.derivativeAdmission.blockerCodes.pop();
  assert.throws(
    () => validateNasaGenericF16Reference(blockerTamper, { aircraftRegistry }),
    /blocker/i,
  );
});

test("generic verification identity is absent from catalog and production model packs", () => {
  assert.ok(
    runtimeSurfaces.every((content) => !content.includes("NASA_NESC_GENERIC_F16_REFERENCE")),
  );
  assert.equal(manifest.subject.runtimeAuthority, "NONE");
  assert.equal(manifest.derivativeAdmission.state, "WITHHELD");
});

test("artifact byte and declared digest tampering are rejected", () => {
  const artifact = {
    id: "test-artifact",
    sha256: createHash("sha256").update("reviewed bytes").digest("hex"),
  };
  assert.doesNotThrow(() => verifyArtifactBytes(artifact, Buffer.from("reviewed bytes")));
  assert.throws(() => verifyArtifactBytes(artifact, Buffer.from("tampered bytes")), /SHA-256/i);

  const tampered = structuredClone(manifest);
  tampered.artifacts[0].sha256 = "a".repeat(64);
  assert.throws(
    () => validateNasaGenericF16Reference(tampered, { aircraftRegistry }),
    /immutable identity|SHA-256/i,
  );
});

test("research derivative rejects unknown fields at every nested layer", () => {
  const mutations = [
    (value) => (value.unknown = true),
    (value) => (value.tables[0].unknown = true),
    (value) => (value.tables[0].pageAncestry.unknown = true),
    (value) => (value.tables[0].axes[0].unknown = true),
    (value) => (value.tables[0].output.unknown = true),
    (value) => (value.tables[0].validityDomain.UNKNOWN_AXIS = [0, 1]),
  ];
  for (const mutate of mutations) {
    const derivative = candidateDerivative();
    mutate(derivative);
    withDigest(derivative);
    assert.throws(
      () => validateDerivative(manifest, derivative),
      /unknown|exact keys|validity domain/i,
    );
  }
});

test("research derivative rejects subject, capability and source-role laundering", () => {
  const wrongSubject = candidateDerivative();
  wrongSubject.subjectId = "PAF_F16C_BLOCK52_PEACE_DRIVE_I";
  withDigest(wrongSubject);
  assert.throws(() => validateDerivative(manifest, wrongSubject), /subject/i);

  const sensors = candidateDerivative();
  sensors.capabilityBindings = ["SENSORS"];
  sensors.tables[0].capability = "SENSORS";
  withDigest(sensors);
  assert.throws(() => validateDerivative(manifest, sensors), /capabilit|sensor/i);

  const comparisonSource = candidateDerivative();
  comparisonSource.sourceArtifactIds = ["nasa-nesc-2015-f16-daveml-source"];
  comparisonSource.tables[0].sourceArtifactId = "nasa-nesc-2015-f16-daveml-source";
  withDigest(comparisonSource);
  assert.throws(
    () => validateDerivative(manifest, comparisonSource),
    /comparison|source report|ancestry/i,
  );
});

test("research derivative rejects every caller-mutated corpus trust input", () => {
  assert.throws(
    () => validateResearchDerivative(manifest, candidateDerivative()),
    /published aircraft registry/i,
  );

  const mutations = [
    (value) => (value.subject.id = "PAF_F16C_BLOCK52_PEACE_DRIVE_I"),
    (value) => (value.subject.runtimeAuthority = "PRODUCTION"),
    (value) => (value.derivativeAdmission.state = "ADMITTED"),
    (value) => (value.artifacts[0].id = "nasa-nesc-2015-f16-daveml-source"),
    (value) => (value.artifacts[0].uri = value.artifacts[2].uri),
    (value) => (value.artifacts[0].fileName = value.artifacts[2].fileName),
    (value) => (value.artifacts[0].sha256 = value.artifacts[2].sha256),
    (value) =>
      (value.artifacts[0].licenceDecision = "NEW_DERIVATIVE_REQUIRES_EXPLICIT_REVIEW"),
    (value) => (value.artifacts[0].role = "COMMON_MODEL_REFERENCE"),
    (value) => (value.artifacts[0].subjectId = "PAF_F16C_BLOCK52_PEACE_DRIVE_I"),
    (value) => value.sourcePageClaims[1].capabilities.push("SENSORS"),
    (value) => value.sourcePageClaims[1].publishedOutputs.push("SENSOR_RANGE_M"),
  ];

  for (const mutate of mutations) {
    const tampered = structuredClone(manifest);
    mutate(tampered);
    assert.throws(() => validateDerivative(tampered, candidateDerivative()));
  }

  const daveMasquerade = structuredClone(manifest);
  const dave = daveMasquerade.artifacts[2];
  Object.assign(daveMasquerade.artifacts[0], {
    authority: dave.authority,
    uri: dave.uri,
    fileName: dave.fileName,
    sha256: dave.sha256,
    licenceReviewState: dave.licenceReviewState,
    licenceDecision: dave.licenceDecision,
    ancestry: structuredClone(dave.ancestry),
    scopeCode: dave.scopeCode,
  });
  assert.throws(
    () => validateDerivative(daveMasquerade, candidateDerivative()),
    /artifact|identity|licence|ancestry/i,
  );
});

test("research derivative rejects duplicate table and axis IDs", () => {
  const duplicateTable = candidateDerivative([candidateTable(), candidateTable()]);
  assert.throws(() => validateDerivative(manifest, duplicateTable), /duplicate table/i);

  const duplicateAxis = candidateDerivative();
  duplicateAxis.tables[0].axes.push({
    id: "ANGLE_OF_ATTACK_DEG",
    unit: "deg",
    values: [0, 5],
  });
  duplicateAxis.tables[0].output.values = [-0.02, -0.03, -0.04, -0.05];
  withDigest(duplicateAxis);
  assert.throws(() => validateDerivative(manifest, duplicateAxis), /duplicate axis/i);
});

test("candidate table digest, units, axes, outputs and page ancestry fail closed", () => {
  assert.doesNotThrow(() => validateDerivative(manifest, candidateDerivative()));

  const digestTamper = candidateDerivative();
  digestTamper.tables[0].output.values[0] = 99;
  assert.throws(() => validateDerivative(manifest, digestTamper), /digest/i);

  const unitTamper = candidateDerivative();
  unitTamper.tables[0].axes[0].unit = "rad";
  withDigest(unitTamper);
  assert.throws(() => validateDerivative(manifest, unitTamper), /unit/i);

  const axisTamper = candidateDerivative();
  axisTamper.tables[0].axes[0].values = [5, 0];
  withDigest(axisTamper);
  assert.throws(() => validateDerivative(manifest, axisTamper), /strictly increasing/i);

  const outputTamper = candidateDerivative();
  outputTamper.tables[0].output.id = "SENSOR_RANGE_M";
  withDigest(outputTamper);
  assert.throws(() => validateDerivative(manifest, outputTamper), /output/i);

  const pageTamper = candidateDerivative();
  pageTamper.tables[0].pageAncestry.pdfPage = 50;
  withDigest(pageTamper);
  assert.throws(() => validateDerivative(manifest, pageTamper), /page ancestry/i);
});

test("candidate tables reject non-finite axes and outputs", () => {
  const axis = candidateDerivative();
  axis.tables[0].axes[0].values[1] = Number.NaN;
  withDigest(axis);
  assert.throws(() => validateDerivative(manifest, axis), /non-finite/i);

  const output = candidateDerivative();
  output.tables[0].output.values[0] = Number.POSITIVE_INFINITY;
  withDigest(output);
  assert.throws(() => validateDerivative(manifest, output), /non-finite/i);
});

test("offline table evaluation rejects out-of-domain and non-finite inputs", () => {
  const table = candidateDerivative().tables[0];
  assert.equal(evaluateEvidenceTable1d(table, 2.5), -0.025);
  assert.throws(() => evaluateEvidenceTable1d(table, -0.1), /outside.*domain/i);
  assert.throws(() => evaluateEvidenceTable1d(table, Number.NaN), /finite/i);
});
