import assert from "node:assert/strict";
import test from "node:test";

import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  prepareSimulation,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import {
  CURRENT_AIR_COMBAT_STUDY_IDS,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";
import {
  selectCanonicalTargetEffect,
  selectDisplayFrame,
} from "../lib/frontend/selectors.ts";
import { isScenarioDefinition } from "../lib/scenario-package.ts";
import {
  RETAINED_SCENARIO_PACKAGE_REFERENCES,
  retainedScenarioPackageReference,
} from "../lib/scenario-package-reference.ts";

const EXPECTED = [
  {
    id: "a2a-crossing-intercept",
    version: "1.2.0",
    profileId: "bvr-offset-and-support",
    regime: "BVR",
    durationSeconds: 100,
    bluePoints: 4,
    redPoints: 4,
  },
  {
    id: "a2a-defensive-break",
    version: "1.2.0",
    profileId: "wvr-one-circle-defensive-break",
    regime: "WVR_BFM",
    durationSeconds: 45,
    bluePoints: 4,
    redPoints: 4,
  },
  {
    id: "a2a-high-energy-crossing-challenge",
    version: "1.2.0",
    profileId: "beam-drag-extend-recommit",
    regime: "UNRESTRICTED_TRANSITION",
    durationSeconds: 140,
    bluePoints: 4,
    redPoints: 4,
  },
];

function effect(result) {
  return selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
}

function assertCrossEngineParity(actual, expected, path = "frames") {
  if (typeof actual === "number" && typeof expected === "number") {
    assert.ok(
      Math.abs(actual - expected) <= 1e-6,
      `${path}: ${actual} differed from ${expected}`,
    );
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}: length`);
    actual.forEach((value, index) =>
      assertCrossEngineParity(value, expected[index], `${path}[${index}]`)
    );
    return;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      `${path}: keys`,
    );
    for (const key of Object.keys(actual)) {
      assertCrossEngineParity(actual[key], expected[key], `${path}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, path);
}

test("the current Air library exposes exactly three governed authored-route studies", () => {
  assert.deepEqual(CURRENT_AIR_COMBAT_STUDY_IDS, EXPECTED.map(({ id }) => id));
  const studies = SCENARIO_LIBRARY.filter(({ id }) =>
    CURRENT_AIR_COMBAT_STUDY_IDS.includes(id)
  );
  assert.equal(studies.length, 3);

  for (const expected of EXPECTED) {
    const definition = studies.find(({ id }) => id === expected.id);
    assert.ok(definition, expected.id);
    assert.equal(definition.version, expected.version);
    assert.equal(definition.authoredProfile.schemaVersion, "vector.authored-route-profile.v1");
    assert.equal(definition.authoredProfile.id, expected.profileId);
    assert.equal(definition.authoredProfile.authority, "AUTHORED_ROUTE");
    assert.equal(definition.scenario.airMission.intendedUse, "PUBLIC_EDUCATIONAL");
    assert.equal(definition.scenario.airMission.regime, expected.regime);
    assert.equal(definition.scenario.runDurationSeconds, expected.durationSeconds);
    assert.equal(definition.scenario.spatialPlan.blue.route.length, expected.bluePoints);
    assert.equal(definition.scenario.spatialPlan.red.route.length, expected.redPoints);
    assert.equal(definition.scenario.bluePlatformId, "su-30mki");
    assert.equal(definition.scenario.blueSystemId, "astra-mk1");
    assert.equal(definition.scenario.redObjectId, "f-16c-block52-paf");
    assert.equal(definition.scenario.redSystemId, "aim-120c5");
    assert.ok(definition.authoredProfile.blue.legs.length >= 3);
    assert.ok(definition.authoredProfile.red.legs.length >= 3);
    assert.match(definition.authoredProfile.limitations.join(" "), /autonomous pilot.*not modelled/i);
    assert.match(definition.scope, /generic|assumption/i);
  }
});

test("every current scenario definition resolves to the retained deployment package inventory", () => {
  const retainedKeys = new Set(RETAINED_SCENARIO_PACKAGE_REFERENCES.map(
    ([id, version, contentHash]) => `${id}@${version}:${contentHash}`,
  ));
  for (const definition of SCENARIO_LIBRARY) {
    const reference = retainedScenarioPackageReference(definition);
    assert.ok(
      retainedKeys.has(`${reference.id}@${reference.version}:${reference.contentHash}`),
      `${definition.id}@${definition.version}`,
    );
  }
});

test("all three exact studies terminate deterministically with complete TypeScript and Rust parity", () => {
  const capabilities = (backend) => createVerificationDeploymentCapabilities(backend, ["A2A"]);
  const studies = EXPECTED.map(({ id }) =>
    SCENARIO_LIBRARY.find((definition) => definition.id === id)
  );
  for (const definition of studies) {
    assert.ok(definition);
    const typescript = simulateWithCapabilitiesForVerification(
      definition.scenario,
      capabilities("typescript"),
    );
    const rust = simulateWithCapabilitiesForVerification(
      definition.scenario,
      capabilities("rust-wasm"),
    );
    assert.equal(typescript.termination, "weapon_intercept", definition.id);
    assert.equal(rust.termination, typescript.termination, definition.id);
    assertCrossEngineParity(rust.engineRun.frames, typescript.engineRun.frames, definition.id);
    assertCrossEngineParity(rust.engineRun.events, typescript.engineRun.events, `${definition.id}: events`);
  }
});

test("the WVR study records a canonical KILL and a release-time-only control does not", () => {
  const definition = SCENARIO_LIBRARY.find(({ id }) => id === "a2a-defensive-break");
  assert.ok(definition);
  const baseline = simulateWithCapabilitiesForVerification(
    definition.scenario,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  );
  const baselineEffect = effect(baseline);
  assert.equal(baselineEffect.presentation.effectClass, "KILL");
  assert.equal(baselineEffect.presentation.killClaimAuthorized, true);
  assert.equal(
    baseline.frames.at(-1).entities.find(({ id }) => id === "red-object-1")?.lifecycle,
    "TERMINATED",
  );

  const control = structuredClone(definition.scenario);
  const request = control.airMission.assignments[0].storeTransferPlan.requests[0];
  assert.equal(request.requestedTimeSeconds, 20);
  request.requestedTimeSeconds = 20.65;
  const controlled = simulateWithCapabilitiesForVerification(
    control,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  );
  const controlledEffect = effect(controlled);
  assert.equal(controlledEffect.presentation.effectClass, "NO_EFFECT");
  assert.equal(controlledEffect.presentation.killClaimAuthorized, false);
  assert.equal(
    controlled.frames.at(-1).entities.find(({ id }) => id === "red-object-1")?.lifecycle,
    "ACTIVE",
  );
});

test("authored profile labels cannot change canonical engine state", () => {
  const definition = SCENARIO_LIBRARY.find(({ id }) => id === "a2a-crossing-intercept");
  assert.ok(definition);
  const baseline = simulateWithCapabilitiesForVerification(
    definition.scenario,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  );
  const relabelled = structuredClone(definition);
  relabelled.title = "Arbitrary presentation label";
  relabelled.authoredProfile.label = "Arbitrary non-causal profile wording";
  const repeated = simulateWithCapabilitiesForVerification(
    relabelled.scenario,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  );
  assert.deepEqual(repeated.engineRun.frames, baseline.engineRun.frames);
  assert.deepEqual(repeated.engineRun.events, baseline.engineRun.events);

  const relabelledLegs = structuredClone(definition.scenario);
  relabelledLegs.airMission.flightPlans[0].legs = relabelledLegs.airMission
    .flightPlans[0].legs.map((leg) => ({ ...leg, role: "TRANSIT" }));
  const legLabelRun = simulateWithCapabilitiesForVerification(
    relabelledLegs,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  );
  assert.deepEqual(
    legLabelRun.engineRun.frames,
    baseline.engineRun.frames,
    "descriptive flight-leg roles must not branch aircraft or weapon dynamics",
  );
});

test("authored duration is causal, precision-bounded, and legacy omission keeps the domain default", () => {
  const definition = SCENARIO_LIBRARY.find(
    ({ id }) => id === "a2a-high-energy-crossing-challenge",
  );
  assert.ok(definition);
  const authored = structuredClone(definition.scenario);
  authored.runDurationSeconds = 140.125;
  assert.equal(prepareSimulation(authored).engineScenario.durationSeconds, 140.125);

  const malformed = structuredClone(authored);
  malformed.runDurationSeconds = 140.1234;
  assert.throws(() => prepareSimulation(malformed), /CONTROL_NUMBER_PRECISION/);

  delete authored.runDurationSeconds;
  assert.equal(prepareSimulation(authored).engineScenario.durationSeconds, 140);
});

test("authored profile metadata is an exact-key closed contract", () => {
  const definition = structuredClone(SCENARIO_LIBRARY.find(
    ({ id }) => id === "a2a-crossing-intercept",
  ));
  assert.ok(definition && isScenarioDefinition(definition));
  definition.authoredProfile.blue.legs[0] = "UNDECLARED_TACTIC";
  assert.equal(isScenarioDefinition(definition), false);

  const extraKey = structuredClone(SCENARIO_LIBRARY.find(
    ({ id }) => id === "a2a-crossing-intercept",
  ));
  extraKey.authoredProfile.runtimePolicy = "LABEL_DRIVEN";
  assert.equal(isScenarioDefinition(extraKey), false);
});
