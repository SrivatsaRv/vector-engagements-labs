import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findAircraftEvidenceClaim,
  validateAircraftEvidenceRegistry,
} from "../scripts/verify-aircraft-evidence-registry.mjs";

const registryV1 = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v1.json", import.meta.url), "utf8"),
);
const registry = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v2.json", import.meta.url), "utf8"),
);

test("aircraft evidence registry v1 remains readable after v2 becomes current", () => {
  assert.deepEqual(validateAircraftEvidenceRegistry(registryV1), { artifacts: 3, claims: 2 });
});

test("aircraft evidence registry validates local artifact content and explicit named-platform gaps", () => {
  const result = validateAircraftEvidenceRegistry(registry);
  assert.deepEqual(result, { artifacts: 11, claims: 3 });
  const su30 = findAircraftEvidenceClaim(registry, "su-30mki");
  assert.equal(su30?.state, "UNSUPPORTED");
  assert.equal(su30?.capabilities.length, 5);
  assert.ok(su30?.capabilities.every((item) => item.missingReason));
  assert.deepEqual(
    registry.subjects.map((subject) => [subject.id, subject.deliveredQuantity, subject.scenarioSelectable]),
    [
      ["iaf-su-30mki", null, true],
      ["paf-f-16c-block52-peace-drive-i", 12, true],
      ["paf-f-16d-block52-peace-drive-i", 6, false],
    ],
  );
  assert.equal(findAircraftEvidenceClaim(registry, "f-16d-block52-paf")?.state, "UNSUPPORTED");
});

test("expired proposals and unhashed dynamic locators cannot become runtime authority", () => {
  const proposal = registry.artifacts.find((item) => item.id === "dsca-pakistan-15-80-proposal");
  assert.equal(proposal.admissionUse, "INELIGIBLE");
  assert.equal(proposal.transactionState, "EXPIRED_WITHOUT_ACCEPTANCE");
  const expiryBasis = registry.artifacts.find((item) => item.id === "crs-pakistan-f16-rl31675");
  assert.equal(expiryBasis.sha256, null);
  assert.equal(expiryBasis.hashReviewState, "PENDING");

  const tampered = structuredClone(registry);
  const claim = tampered.claims.find((item) => item.catalogObjectId === "f-16c-block52-paf");
  claim.state = "ADMITTED";
  claim.capabilities = claim.capabilities.map((item) => ({
    ...item,
    sourceArtifactIds: ["dsca-pakistan-15-80-proposal"],
    validationArtifactIds: ["crs-pakistan-f16-rl31675"],
  }));
  assert.throws(
    () => validateAircraftEvidenceRegistry(tampered, { verifyLocalArtifacts: false }),
    /not eligible for named-performance admission|immutable SHA-256/,
  );
});

test("categorical subsystem associations remain context-only and ALQ-211 fitted state is unknown", () => {
  for (const field of ["propulsion.engineFamily", "sensor.radar", "datalink.system", "weapon.programmeAssociation"]) {
    const assertions = registry.catalogAssertions.filter((item) => item.field === field);
    assert.ok(assertions.length > 0, `missing ${field}`);
    assert.ok(assertions.every((item) => item.evidenceState === "CONTEXT_ONLY"));
    assert.ok(assertions.every((item) => item.runtimeAuthority === "NONE"));
  }
  const ew = registry.catalogAssertions.filter((item) => item.field === "defensiveEw.fittedSystem");
  assert.equal(ew.length, 2);
  assert.ok(ew.every((item) => item.evidenceState === "UNKNOWN" && item.value === null));
  assert.ok(registry.catalogAssertions.every((item) => !String(item.value).includes("ALQ-211")));
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
    /not eligible for named-performance admission|is not a VALIDATION artifact|reuses an artifact as source and validation/,
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
