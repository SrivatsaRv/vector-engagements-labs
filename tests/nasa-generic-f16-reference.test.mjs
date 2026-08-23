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
const aircraftRegistry = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v2.json", import.meta.url), "utf8"),
);
const runtimeSurfaces = await Promise.all(
  [
    "../lib/reference-model-pack.ts",
    "../lib/object-catalog.ts",
    "../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json",
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
      () => validateResearchDerivative(manifest, derivative),
      /unknown|exact keys|validity domain/i,
    );
  }
});

test("research derivative rejects subject, capability and source-role laundering", () => {
  const wrongSubject = candidateDerivative();
  wrongSubject.subjectId = "PAF_F16C_BLOCK52_PEACE_DRIVE_I";
  withDigest(wrongSubject);
  assert.throws(() => validateResearchDerivative(manifest, wrongSubject), /subject/i);

  const sensors = candidateDerivative();
  sensors.capabilityBindings = ["SENSORS"];
  sensors.tables[0].capability = "SENSORS";
  withDigest(sensors);
  assert.throws(() => validateResearchDerivative(manifest, sensors), /capabilit|sensor/i);

  const comparisonSource = candidateDerivative();
  comparisonSource.sourceArtifactIds = ["nasa-nesc-2015-f16-daveml-source"];
  comparisonSource.tables[0].sourceArtifactId = "nasa-nesc-2015-f16-daveml-source";
  withDigest(comparisonSource);
  assert.throws(
    () => validateResearchDerivative(manifest, comparisonSource),
    /comparison|source report|ancestry/i,
  );
});

test("research derivative rejects duplicate table and axis IDs", () => {
  const duplicateTable = candidateDerivative([candidateTable(), candidateTable()]);
  assert.throws(() => validateResearchDerivative(manifest, duplicateTable), /duplicate table/i);

  const duplicateAxis = candidateDerivative();
  duplicateAxis.tables[0].axes.push({
    id: "ANGLE_OF_ATTACK_DEG",
    unit: "deg",
    values: [0, 5],
  });
  duplicateAxis.tables[0].output.values = [-0.02, -0.03, -0.04, -0.05];
  withDigest(duplicateAxis);
  assert.throws(() => validateResearchDerivative(manifest, duplicateAxis), /duplicate axis/i);
});

test("candidate table digest, units, axes, outputs and page ancestry fail closed", () => {
  assert.doesNotThrow(() => validateResearchDerivative(manifest, candidateDerivative()));

  const digestTamper = candidateDerivative();
  digestTamper.tables[0].output.values[0] = 99;
  assert.throws(() => validateResearchDerivative(manifest, digestTamper), /digest/i);

  const unitTamper = candidateDerivative();
  unitTamper.tables[0].axes[0].unit = "rad";
  withDigest(unitTamper);
  assert.throws(() => validateResearchDerivative(manifest, unitTamper), /unit/i);

  const axisTamper = candidateDerivative();
  axisTamper.tables[0].axes[0].values = [5, 0];
  withDigest(axisTamper);
  assert.throws(() => validateResearchDerivative(manifest, axisTamper), /strictly increasing/i);

  const outputTamper = candidateDerivative();
  outputTamper.tables[0].output.id = "SENSOR_RANGE_M";
  withDigest(outputTamper);
  assert.throws(() => validateResearchDerivative(manifest, outputTamper), /output/i);

  const pageTamper = candidateDerivative();
  pageTamper.tables[0].pageAncestry.pdfPage = 50;
  withDigest(pageTamper);
  assert.throws(() => validateResearchDerivative(manifest, pageTamper), /page ancestry/i);
});

test("candidate tables reject non-finite axes and outputs", () => {
  const axis = candidateDerivative();
  axis.tables[0].axes[0].values[1] = Number.NaN;
  withDigest(axis);
  assert.throws(() => validateResearchDerivative(manifest, axis), /non-finite/i);

  const output = candidateDerivative();
  output.tables[0].output.values[0] = Number.POSITIVE_INFINITY;
  withDigest(output);
  assert.throws(() => validateResearchDerivative(manifest, output), /non-finite/i);
});

test("offline table evaluation rejects out-of-domain and non-finite inputs", () => {
  const table = candidateDerivative().tables[0];
  assert.equal(evaluateEvidenceTable1d(table, 2.5), -0.025);
  assert.throws(() => evaluateEvidenceTable1d(table, -0.1), /outside.*domain/i);
  assert.throws(() => evaluateEvidenceTable1d(table, Number.NaN), /finite/i);
});
