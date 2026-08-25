import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sha256Utf8HexSync } from "../lib/geospatial/digest.ts";
import {
  SCENARIO_CAPABILITY_REGISTRY,
  SCENARIO_CAPABILITY_EVIDENCE,
  compileScenarioCapabilityRegistry,
  resolveScenarioCapability,
  scenarioCapabilityRef,
  validateScenarioCapabilityDescriptor,
} from "../lib/scenario-capabilities.ts";

function descriptorSource(id = "capability.route-authoring") {
  const descriptor = structuredClone(resolveScenarioCapability(id, "1.0.0"));
  delete descriptor.canonicalBytes;
  delete descriptor.digest;
  return descriptor;
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("the owner-controlled capability registry is immutable and content addressed", () => {
  assert.equal(deeplyFrozen(SCENARIO_CAPABILITY_REGISTRY), true);
  assert.equal(
    SCENARIO_CAPABILITY_REGISTRY.digest,
    `sha256:${sha256Utf8HexSync(SCENARIO_CAPABILITY_REGISTRY.canonicalBytes)}`,
  );
  for (const descriptor of SCENARIO_CAPABILITY_REGISTRY.descriptors) {
    assert.equal(descriptor.digest, `sha256:${sha256Utf8HexSync(descriptor.canonicalBytes)}`);
    assert.equal(descriptor.runtimeAuthority, "NONE");
    assert.equal(descriptor.evidence.length > 0, true);
  }
  for (const evidence of SCENARIO_CAPABILITY_EVIDENCE) {
    assert.equal(evidence.digest, `sha256:${sha256Utf8HexSync(evidence.canonicalBytes)}`);
    assert.match(evidence.sourcePath, /^tests\//);
    const source = readFileSync(new URL(`../${evidence.sourcePath}`, import.meta.url), "utf8");
    assert.equal(source.includes(evidence.assertionId), true, `${evidence.assertionId} must identify executable evidence`);
  }
});

test("registry compilation is order invariant and rejects missing, duplicate or cyclic dependencies", () => {
  const route = descriptorSource("capability.route-authoring");
  const observation = descriptorSource("capability.observation-inspector");
  const forward = compileScenarioCapabilityRegistry([route, observation]);
  const reverse = compileScenarioCapabilityRegistry([observation, route]);
  assert.equal(forward.canonicalBytes, reverse.canonicalBytes);
  assert.equal(forward.digest, reverse.digest);

  assert.throws(
    () => compileScenarioCapabilityRegistry([{ ...route, dependencies: [{ id: "capability.missing", version: "1.0.0" }] }]),
    /unavailable dependency/,
  );
  assert.throws(() => compileScenarioCapabilityRegistry([route, route]), /repeats/);
  assert.throws(
    () => compileScenarioCapabilityRegistry([
      { ...route, dependencies: [{ id: observation.id, version: observation.version }] },
      { ...observation, dependencies: [{ id: route.id, version: route.version }] },
    ]),
    /acyclic/,
  );
  assert.throws(
    () => compileScenarioCapabilityRegistry([
      { ...route, dependencies: [{ id: observation.id, version: observation.version }] },
      {
        ...observation,
        intendedUse: { id: "vector.intended-use.restricted-study", version: "1.0.0" },
      },
    ]),
    /different intended use/,
  );
  assert.throws(
    () => compileScenarioCapabilityRegistry(Array(10_001).fill(route)),
    /10,000-descriptor bound/,
  );
});

test("route-authoring-owner-binding and observation-inspector-owner-binding: references bind exact governed content", () => {
  const descriptor = resolveScenarioCapability("capability.route-authoring", "1.0.0");
  const reference = scenarioCapabilityRef("capability.route-authoring");
  assert.deepEqual(reference.ownerContract, descriptor.ownerContract);
  assert.deepEqual(reference.intendedUse, descriptor.intendedUse);
  assert.equal(reference.descriptorDigest, descriptor.digest);
  assert.throws(() => scenarioCapabilityRef("capability.missing"), /not registered/);
});

test("descriptor admission rejects renderer formulas, open selectors, unsupported output authority, and weak evidence", () => {
  const cases = [
    (value) => { value.rendererFormula = "entity.x + entity.y"; },
    (value) => { value.inspectors[0].selector = "world.truth.position"; },
    (value) => { value.outputs[0].availability = "AVAILABLE"; },
    (value) => { value.runtimeAuthority = "ENGINE"; },
    (value) => { value.ownerContract.id = "vector.contract.unregistered"; },
    (value) => { value.evidence = []; },
    (value) => { value.evidence[0].digest = "sha256:1234"; },
    (value) => { value.authoredFields[0].sourceCoefficient = 1.25; },
    (value) => { value.inspectors[0].localizationKey = "<script>world.truth</script>"; },
    (value) => { value.inspectors[0].componentName = "ScenarioNamedRenderer"; },
  ];
  for (const mutate of cases) {
    const source = descriptorSource();
    mutate(source);
    assert.throws(() => validateScenarioCapabilityDescriptor(source));
  }
});

test("published descriptors bind the governed intended use and the #60 adapter without claiming execution", () => {
  for (const descriptor of SCENARIO_CAPABILITY_REGISTRY.descriptors) {
    assert.deepEqual(descriptor.intendedUse, {
      id: "vector.intended-use.geometry-teaching",
      version: "1.0.0",
    });
  }
  const airMission = resolveScenarioCapability("capability.air-mission", "1.0.0");
  assert.equal(airMission.ownerContract.id, "vector.contract.mission-scenario-runtime");
  assert.equal(airMission.runtimeAuthority, "NONE");
  assert.deepEqual(airMission.outputs, []);
  assert.deepEqual(airMission.dependencies, [{ id: "capability.route-authoring", version: "1.0.0" }]);
  assert.equal(airMission.evidence[0].id, "evidence.scenario-air-mission-adapter-contract");
});

test("descriptor admission is scenario and platform neutral by construction", () => {
  const source = descriptorSource();
  source.scenarioId = "joint-study";
  assert.throws(() => validateScenarioCapabilityDescriptor(source), /keys must equal/);
  delete source.scenarioId;
  source.platformName = "Maritime test article";
  assert.throws(() => validateScenarioCapabilityDescriptor(source), /keys must equal/);
});
