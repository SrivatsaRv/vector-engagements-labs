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

const registry = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v2.json", import.meta.url), "utf8"),
);
const runtimeSurfaces = await Promise.all(
  [
    "../lib/reference-model-pack.ts",
    "../lib/object-catalog.ts",
    "../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

function candidateDerivative() {
  const derivative = {
    schemaVersion: "vector.aircraft-verification-derivative.v1",
    id: "synthetic-nasa-generic-f16-derivative-test",
    subject: "NASA_NESC_GENERIC_F16_REFERENCE",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    authority: "RESEARCH_CANDIDATE_ONLY",
    sourceArtifactIds: ["nasa-tp-1538-f16-aerodynamics-source"],
    comparisonArtifactIds: [],
    tables: [
      {
        id: "synthetic-cx-alpha-test",
        sourceClaimId: "tp1538-table-iii-aerodynamics",
        sourceArtifactId: "nasa-tp-1538-f16-aerodynamics-source",
        capability: "AERODYNAMICS",
        pageAncestry: {
          pdfPage: 51,
          reportPage: 45,
          tableLabel: "TABLE III",
          extractionMethod: "INDEPENDENT_MANUAL_DOUBLE_ENTRY",
        },
        axes: [
          {
            id: "angleOfAttack",
            unit: "deg",
            values: [0, 5],
          },
        ],
        output: {
          id: "bodyForceCoefficientX",
          unit: "dimensionless",
          values: [-0.02, -0.03],
        },
        interpolation: "LINEAR_INSIDE_CLOSED_DOMAIN",
      },
    ],
  };
  return { ...derivative, sha256: computeDerivativeDigest(derivative) };
}

test("generic NASA F-16 reference corpus has exact immutable identities and remains withheld", () => {
  assert.deepEqual(validateNasaGenericF16Reference(registry), {
    artifacts: 4,
    derivativeState: "WITHHELD",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    subject: "NASA_NESC_GENERIC_F16_REFERENCE",
  });
});

test("wrong subject and intended-use promotion fail closed", () => {
  for (const [field, value] of [
    ["subject", "PAF_F16_BLOCK52"],
    ["intendedUse", "NAMED_AIRCRAFT_PERFORMANCE"],
  ]) {
    const tampered = structuredClone(registry);
    tampered.verificationCorpora[0][field] = value;
    assert.throws(() => validateNasaGenericF16Reference(tampered), /subject|intended use/i);
  }
});

test("generic verification identity is absent from catalog and production model packs", () => {
  assert.ok(
    runtimeSurfaces.every((content) => !content.includes("NASA_NESC_GENERIC_F16_REFERENCE")),
  );
  assert.equal(registry.verificationCorpora[0].runtimeAuthority, "NONE");
  assert.equal(registry.verificationCorpora[0].derivative.state, "WITHHELD");
});

test("source and common-model comparison roles cannot be laundered", () => {
  const tampered = structuredClone(registry);
  tampered.verificationCorpora[0].artifactRoles.SOURCE_REPORT.push(
    "nasa-nesc-2015-atmos13p2-comparison",
  );
  assert.throws(() => validateNasaGenericF16Reference(tampered), /role|source report/i);

  const derivative = candidateDerivative();
  derivative.sourceArtifactIds = ["nasa-nesc-2015-f16-daveml-source"];
  derivative.tables[0].sourceArtifactId = "nasa-nesc-2015-f16-daveml-source";
  derivative.sha256 = computeDerivativeDigest(derivative);
  assert.throws(
    () => validateResearchDerivative(registry.verificationCorpora[0], derivative),
    /comparison|source report|ancestry/i,
  );
});

test("artifact byte and declared digest tampering are rejected", () => {
  const artifact = {
    id: "test-artifact",
    sha256: createHash("sha256").update("reviewed bytes").digest("hex"),
  };
  assert.doesNotThrow(() => verifyArtifactBytes(artifact, Buffer.from("reviewed bytes")));
  assert.throws(() => verifyArtifactBytes(artifact, Buffer.from("tampered bytes")), /SHA-256/i);

  const tampered = structuredClone(registry);
  tampered.artifacts.find((item) => item.id === "nasa-tp-1538-f16-aerodynamics-source").sha256 =
    "a".repeat(64);
  assert.throws(() => validateNasaGenericF16Reference(tampered), /immutable identity|SHA-256/i);
});

test("candidate table digest, units, axes and page ancestry fail closed", () => {
  assert.doesNotThrow(() =>
    validateResearchDerivative(registry.verificationCorpora[0], candidateDerivative()),
  );

  const digestTamper = candidateDerivative();
  digestTamper.tables[0].output.values[0] = 99;
  assert.throws(
    () => validateResearchDerivative(registry.verificationCorpora[0], digestTamper),
    /digest/i,
  );

  const unitTamper = candidateDerivative();
  unitTamper.tables[0].axes[0].unit = "rad";
  unitTamper.sha256 = computeDerivativeDigest(unitTamper);
  assert.throws(
    () => validateResearchDerivative(registry.verificationCorpora[0], unitTamper),
    /unit/i,
  );

  const axisTamper = candidateDerivative();
  axisTamper.tables[0].axes[0].values = [5, 0];
  axisTamper.sha256 = computeDerivativeDigest(axisTamper);
  assert.throws(
    () => validateResearchDerivative(registry.verificationCorpora[0], axisTamper),
    /strictly increasing/i,
  );

  const pageTamper = candidateDerivative();
  pageTamper.tables[0].pageAncestry.pdfPage = 50;
  pageTamper.sha256 = computeDerivativeDigest(pageTamper);
  assert.throws(
    () => validateResearchDerivative(registry.verificationCorpora[0], pageTamper),
    /page ancestry/i,
  );

  const registryPageTamper = structuredClone(registry);
  registryPageTamper.verificationCorpora[0].sourcePageClaims.find(
    (item) => item.id === "tp1538-table-iii-aerodynamics",
  ).pdfPageRange[0] = 50;
  assert.throws(
    () => validateNasaGenericF16Reference(registryPageTamper),
    /page ancestry/i,
  );
});

test("offline table evaluation rejects out-of-domain and non-finite inputs", () => {
  const table = candidateDerivative().tables[0];
  assert.equal(evaluateEvidenceTable1d(table, 2.5), -0.025);
  assert.throws(() => evaluateEvidenceTable1d(table, -0.1), /outside.*domain/i);
  assert.throws(() => evaluateEvidenceTable1d(table, Number.NaN), /finite/i);
});
