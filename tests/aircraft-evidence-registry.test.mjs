import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findAircraftEvidenceClaim,
  validateAircraftEvidenceRegistry,
} from "../scripts/verify-aircraft-evidence-registry.mjs";

const registry = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v1.json", import.meta.url), "utf8"),
);

test("aircraft evidence registry validates local artifact content and explicit named-platform gaps", () => {
  const result = validateAircraftEvidenceRegistry(registry);
  assert.deepEqual(result, { artifacts: 3, claims: 2 });
  const su30 = findAircraftEvidenceClaim(registry, "su-30mki");
  assert.equal(su30?.state, "UNSUPPORTED");
  assert.equal(su30?.capabilities.length, 5);
  assert.ok(su30?.capabilities.every((item) => item.missingReason));
});

test("tampered committed source artifact is rejected before it can support an admission", () => {
  const tampered = structuredClone(registry);
  tampered.artifacts.find((item) => item.id === "vector-nesc-case11-derived-fixture").sha256 = "a".repeat(64);
  assert.throws(
    () => validateAircraftEvidenceRegistry(tampered),
    /local artifact SHA-256 does not match/,
  );
});

test("registry rejects provenance laundering between source and validation roles", () => {
  const tampered = structuredClone(registry);
  const claim = tampered.claims[0];
  claim.state = "ADMITTED";
  claim.capabilities = claim.capabilities.map((item) => ({
    ...item,
    sourceArtifactIds: ["nasa-nesc-2015-f16-daveml-source"],
    validationArtifactIds: ["nasa-nesc-2015-f16-daveml-source"],
  }));
  assert.throws(
    () => validateAircraftEvidenceRegistry(tampered),
    /is not a VALIDATION artifact|reuses an artifact as source and validation/,
  );
});

test("registry rejects a named admission with a capability coverage gap", () => {
  const tampered = structuredClone(registry);
  const claim = tampered.claims[1];
  claim.state = "ADMITTED";
  claim.capabilities = claim.capabilities.map((item) => ({
    ...item,
    sourceArtifactIds: ["nasa-nesc-2015-f16-daveml-source"],
    validationArtifactIds: ["nasa-nesc-2015-atmos11-sim04-validation"],
  }));
  claim.capabilities.pop();
  assert.throws(
    () => validateAircraftEvidenceRegistry(tampered),
    /must account for every performance capability/,
  );
});
