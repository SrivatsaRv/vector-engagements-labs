import assert from "node:assert/strict";
import test from "node:test";
import { runEngine as runGovernedEngine } from "../lib/engine/core.ts";
import { bindVerificationTrackModelPack } from "../lib/engine/verification-track-fixture.ts";
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "../lib/engine/runtime-model-pack.ts";
import {
  createTargetEffectAuthority,
  resolveTargetEffectAuthority,
} from "../lib/engine/target-effect-authority.ts";
import { CURRENT_TARGET_EFFECT_AUTHORITY } from "../lib/engine/retained-target-effect-authority.ts";
import { assertSimulationEventStream } from "../lib/engine/simulation-events.ts";

const baseEntity = {
  lifecycle: "ACTIVE",
  provenance: {
    sourceObjectId: "test",
    modelId: "test-model",
    modelVersion: "test-v1",
    modelPackDigest: "1111111111111111111111111111111111111111111111111111111111111111",
    valueState: "MODEL_ASSUMPTION",
  },
};

function testScenario() {
  return {
    id: "generic-entity-test",
    version: "1.0.0",
    domain: "A2A",
    name: "Generic entity engine test",
    seed: 42,
    durationSeconds: 12,
    fixedStepSeconds: 0.05,
    modelPack: {
      digest: "1111111111111111111111111111111111111111111111111111111111111111",
    },
    environment: {
      gravityMps2: 9.80665,
      temperatureOffsetC: 0,
      windMps: { x: 3, y: -2, z: 0 },
      atmosphere: "NASA_EDUCATIONAL_STANDARD",
    },
    completion: { distanceMeters: 100 },
    events: [],
    entities: [
      {
        ...baseEntity,
        id: "aircraft-blue",
        rddfId: "rddf://platform/aircraft/test-blue",
        designation: "Test blue aircraft",
        callsign: "BLUE 1",
        affiliation: "BLUE",
        kind: "AIRCRAFT",
        symbolRole: "FIGHTER",
        initial: {
          position: { x: 0, y: 0, z: 8000 },
          velocity: { x: 250, y: 0, z: 0 },
          headingRad: 0,
          massKg: 18180,
          fuelKg: 4000,
        },
      },
      {
        ...baseEntity,
        id: "aircraft-red",
        rddfId: "rddf://platform/aircraft/test-red",
        designation: "Test red aircraft",
        callsign: "RED 1",
        affiliation: "RED",
        kind: "AIRCRAFT",
        symbolRole: "FIGHTER",
        initial: {
          position: { x: 10000, y: 1500, z: 8500 },
          velocity: { x: -220, y: 0, z: 0 },
          headingRad: Math.PI,
          massKg: 16500,
          fuelKg: 2500,
        },
      },
      {
        ...baseEntity,
        id: "weapon-blue",
        rddfId: "rddf://component/guided-weapon/test",
        designation: "Test guided vehicle",
        callsign: "BLUE WEAPON 1",
        affiliation: "BLUE",
        kind: "GUIDED_WEAPON",
        symbolRole: "GUIDED_MISSILE",
        lifecycle: "STOWED",
        initial: {
          position: { x: 0, y: 0, z: 8000 },
          velocity: { x: 250, y: 0, z: 0 },
          headingRad: 0,
          massKg: 180,
          fuelKg: 70,
        },
        weapon: {
          launchPlatformId: "aircraft-blue",
          targetEntityId: "aircraft-red",
          guidance: "direct",
          launchTimeSeconds: 0,
          burnSeconds: 5,
          launchMassKg: 180,
          dryMassKg: 110,
          thrustNewtons: 28000,
          thrustTaperSpeedMps: 1000,
          referenceAreaM2: 0.06,
          dragCoefficient: 0.28,
          navigationConstant: 3.5,
          maximumCommandG: 28,
          seekerActivationRangeM: 5000,
          datalinkUpdateSeconds: 0.2,
          admission: {
            modelPackDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            weaponModelId: "test-model",
            stationId: "test-station",
            compatibilityRuleId: "test-compatibility",
            seekerMode: "UNAVAILABLE",
            supportRequirement: "UNAVAILABLE",
            launchAuthorization: "SCHEDULED_TEST_ONLY",
          },
          termination: {
            schemaVersion: "vector.weapon-termination-model.v1",
            intendedUse: "ENGINE_VERIFICATION_ONLY",
            criterion: "GEOMETRIC_CLOSEST_APPROACH",
            interceptRadiusM: 25,
            maximumFlightTimeSeconds: 10,
          },
        },
      },
    ],
  };
}

const testAircraftModel = {
  emptyMassKg: 14000,
  fuelCapacityKg: 5000,
  referenceAreaM2: 62,
  zeroLiftDragByMach: { id: "test-zero-lift", axis: [0, 2], values: [0.025, 0.025] },
  inducedDragByAngleOfAttackRad: { id: "test-induced", axis: [-0.2, 0.4], values: [0.055, 0.055] },
  thrustByThrottle: { id: "test-thrust", axis: [0, 1], values: [0, 240000] },
  fuelFlowByThrottle: { id: "test-fuel", axis: [0, 1], values: [0.00001, 0.000022] },
  maximumCommandG: 9,
};

function admitTestAircraft(scenario) {
  for (const entity of scenario.entities) {
    if (entity.kind === "AIRCRAFT") entity.aircraft = structuredClone(testAircraftModel);
  }
  return scenario;
}

const testAuthority = await bindVerificationTrackModelPack(testScenario());
const testWeaponModel = testAuthority.pack.weapons.find(
  (weapon) => weapon.id === "astra-mk1-study-v05",
);
assert.ok(testWeaponModel?.termination);

function bindEngineTestAuthority(input) {
  const scenario = structuredClone(input);
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon?.termination);
  weapon.provenance.modelId = testWeaponModel.id;
  weapon.provenance.modelVersion = testWeaponModel.version;
  weapon.provenance.modelPackDigest = testAuthority.pack.digest;
  weapon.weapon.admission.modelPackDigest = testAuthority.pack.digest;
  weapon.weapon.admission.weaponModelId = testWeaponModel.id;

  const patches = [];
  const addPatch = (fieldPath, oldValue, newValue, unit) => {
    if (Object.is(oldValue, newValue) || !Number.isFinite(newValue)) return;
    patches.push({
      schemaVersion: "vector.model-patch.v1",
      id: `engine-test-${patches.length + 1}`,
      modelPackDigest: testAuthority.pack.digest,
      modelId: testWeaponModel.id,
      fieldPath,
      oldValue,
      newValue,
      unit,
      reason: "Bounded low-level engine verification fixture.",
      provenance: {
        authorId: "vector-engine-test",
        authoredAt: "2026-08-27T00:00:00.000Z",
        evidenceRefIds: ["current-scalar-model-assumptions"],
      },
    });
  };
  addPatch(
    "/termination/interceptRadiusM",
    testWeaponModel.termination.interceptRadiusM,
    weapon.weapon.termination.interceptRadiusM,
    "m",
  );
  addPatch(
    "/termination/maximumFlightTimeS",
    testWeaponModel.termination.maximumFlightTimeS,
    weapon.weapon.termination.maximumFlightTimeSeconds,
    "s",
  );
  const projection = structuredClone(testAuthority.scenario.modelPack);
  projection.scenarioPatches = patches;
  projection.weaponTerminations = runtimeWeaponTerminations(testAuthority.pack, patches);
  delete projection.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest(projection);
  return scenario;
}

function runTestEngine(scenario) {
  return runGovernedEngine(bindEngineTestAuthority(scenario), testAuthority.pack);
}

function bindTestTargetEffectAuthority(scenario) {
  const target = scenario.entities.find((entity) => entity.id === "aircraft-red");
  target.provenance = {
    ...target.provenance,
    modelVersion: "1.0.0",
  };
  const effectModel = structuredClone(CURRENT_TARGET_EFFECT_AUTHORITY.models[0]);
  scenario.targetEffectAuthority = createTargetEffectAuthority({
    schemaVersion: "vector.target-effect-authority.v1",
    id: "engine-test-target-effects",
    version: "1.0.0",
    intendedUse: structuredClone(CURRENT_TARGET_EFFECT_AUTHORITY.intendedUse),
    models: [effectModel],
    bindings: [{
      id: "engine-test-weapon-target-binding",
      effectModelId: effectModel.id,
      effectModelVersion: effectModel.version,
      effectModelDigest: effectModel.digest,
      weaponModelId: testWeaponModel.id,
      weaponModelVersion: testWeaponModel.version,
      weaponModelPackDigest: testAuthority.pack.digest,
      targetModelId: target.provenance.modelId,
      targetModelVersion: target.provenance.modelVersion,
      targetModelPackDigest: target.provenance.modelPackDigest,
      targetProfileId: effectModel.targetProfile.id,
      targetProfileVersion: effectModel.targetProfile.version,
    }],
  });
  return scenario;
}

// Deliberately local: this oracle must not import the production evaluator.
function linearInterpolationOracle(axis, values, input) {
  if (input < axis[0] || input > axis.at(-1)) throw new RangeError("outside coverage");
  for (let index = 1; index < axis.length; index += 1) {
    if (input <= axis[index]) {
      const fraction = (input - axis[index - 1]) / (axis[index] - axis[index - 1]);
      return values[index - 1] + (values[index] - values[index - 1]) * fraction;
    }
  }
  return values.at(-1);
}

test("generic engine updates every spawned entity deterministically", () => {
  const first = runTestEngine(admitTestAircraft(testScenario()));
  const second = runTestEngine(admitTestAircraft(testScenario()));
  assert.deepEqual(first, second);
  assert.ok(first.frames.length > 10);
  assert.equal(first.frames[0].entities.length, 3);
  assert.equal(
    first.frames[0].entities.find((entity) => entity.id === "aircraft-blue")
      .symbolRole,
    "FIGHTER",
  );
  assert.equal(first.diagnostics.nonFiniteStateCount, 0);
  const firstWeapon = first.frames[0].entities.find((item) => item.id === "weapon-blue");
  const lastWeapon = first.frames.at(-1).entities.find((item) => item.id === "weapon-blue");
  assert.ok(lastWeapon.massKg < firstWeapon.massKg);
  assert.equal(firstWeapon.weaponFlightState, "BOOST");
  assert.ok(first.closestApproachM < 10000);
});

test("nonconstant admitted aircraft tables change achieved thrust, fuel, drag, and trajectory", () => {
  const baseline = runTestEngine(admitTestAircraft(testScenario()));
  const contrastedScenario = admitTestAircraft(testScenario());
  const blue = contrastedScenario.entities.find((entity) => entity.id === "aircraft-blue");
  blue.aircraft = {
    ...blue.aircraft,
    zeroLiftDragByMach: { id: "contrast-drag", axis: [0, 2], values: [0.015, 0.06] },
    inducedDragByAngleOfAttackRad: { id: "contrast-induced", axis: [-0.2, 0.4], values: [0.02, 0.11] },
    thrustByThrottle: { id: "contrast-thrust", axis: [0, 0.5, 1], values: [0, 60000, 180000] },
    fuelFlowByThrottle: { id: "contrast-fuel", axis: [0, 0.5, 1], values: [0.00001, 0.00002, 0.00004] },
  };
  const contrasted = runTestEngine(contrastedScenario);
  const baselineBlue = baseline.frames.at(-1).entities.find((entity) => entity.id === "aircraft-blue");
  const contrastedBlue = contrasted.frames.at(-1).entities.find((entity) => entity.id === "aircraft-blue");
  assert.notEqual(contrastedBlue.thrustNewtons, baselineBlue.thrustNewtons);
  assert.notEqual(contrastedBlue.dragNewtons, baselineBlue.dragNewtons);
  assert.notEqual(contrastedBlue.fuelKg, baselineBlue.fuelKg);
  assert.notDeepEqual(contrastedBlue.position, baselineBlue.position);
  // Independent linear-interpolation oracle for declared table values; it does not import core.
  assert.equal(linearInterpolationOracle([0, 0.5, 1], [0, 60000, 180000], 0.5), 60000);
  assert.ok(Math.abs(linearInterpolationOracle([0, 0.5, 1], [0.00001, 0.00002, 0.00004], 0.75) - 0.00003) < 1e-12);
  assert.throws(() => linearInterpolationOracle([0, 1], [0, 1], 1.01), RangeError);
});

test("aircraft execution rejects a state outside admitted table coverage instead of extrapolating", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  blue.aircraft.zeroLiftDragByMach = { id: "narrow-drag", axis: [0, 0.1], values: [0.02, 0.03] };
  assert.throws(() => runTestEngine(scenario), /outside admitted table narrow-drag coverage/);
});

test("TypeScript engine rejects an unknown weapon support declaration", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities.find((entity) => entity.weapon).weapon.admission.supportRequirement = "TYPO_SUPPORT";
  assert.throws(() => runTestEngine(scenario), /no valid compiled admission/);
});

test("weapon flight state is a closed achieved-state contract", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.durationSeconds = 8;
  const run = runTestEngine(scenario);
  const states = new Set(
    run.frames
      .flatMap((frame) => frame.entities)
      .filter((entity) => entity.id === "weapon-blue")
      .map((entity) => entity.weaponFlightState),
  );
  assert.deepEqual([...states].sort(), ["BOOST", "COAST", "TERMINAL_GUIDANCE"]);
  assert.ok(
    run.frames
      .flatMap((frame) => frame.entities)
      .filter((entity) => entity.kind !== "GUIDED_WEAPON")
      .every((entity) => entity.weaponFlightState === undefined),
  );
});

test("engine owns geometric intercept termination and records no target-effect claim", () => {
  const scenarioWithLegacyAllowance = (distanceMeters) => {
    const scenario = admitTestAircraft(testScenario());
    scenario.completion.distanceMeters = distanceMeters;
    const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
    const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
    red.initial.position = { x: 20, y: 0, z: 8000 };
    red.initial.velocity = { ...blue.initial.velocity };
    return scenario;
  };
  const run = runTestEngine(scenarioWithLegacyAllowance(1));
  const permissiveLegacyRun = runTestEngine(scenarioWithLegacyAllowance(10_000));
  assert.equal(run.termination, "weapon_intercept");
  assert.equal(permissiveLegacyRun.termination, "weapon_intercept");
  assert.equal(
    permissiveLegacyRun.closestApproachM,
    run.closestApproachM,
    "legacy scenario distance allowance must not author weapon termination",
  );
  assert.ok(run.closestApproachM <= 25);
  const terminal = run.events.items.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  assert.equal(terminal.payload.to, "INTERCEPT");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  assert.equal(terminal.payload.targetEffect, "NOT_MODELLED");
  assert.ok(terminal.payload.occurrenceTimeSeconds >= 0 && terminal.payload.occurrenceTimeSeconds <= 0.05);
  const finalWeapon = run.frames.at(-1).entities.find((entity) => entity.id === "weapon-blue");
  const finalTarget = run.frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");
  assert.equal(finalWeapon.lifecycle, "TERMINATED");
  assert.equal(finalWeapon.weaponFlightState, "INTERCEPT");
  assert.equal(finalTarget.lifecycle, "ACTIVE", "geometric intercept must not invent target damage or kill");
});

test("governed target effect owns the exact target lifecycle transition after weapon termination", () => {
  const scenario = bindTestTargetEffectAuthority(admitTestAircraft(testScenario()));
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  red.initial.position = { x: 2, y: 0, z: 8000 };
  red.initial.velocity = { ...blue.initial.velocity };

  const boundScenario = bindEngineTestAuthority(scenario);
  const boundWeapon = boundScenario.entities.find((entity) => entity.id === "weapon-blue");
  const boundTarget = boundScenario.entities.find((entity) => entity.id === "aircraft-red");
  const effectBinding = boundScenario.targetEffectAuthority.bindings[0];
  assert.deepEqual(
    {
      weaponModelPackDigest: boundWeapon.provenance.modelPackDigest,
      weaponModelId: boundWeapon.provenance.modelId,
      weaponModelVersion: boundWeapon.provenance.modelVersion,
      targetModelPackDigest: boundTarget.provenance.modelPackDigest,
      targetModelId: boundTarget.provenance.modelId,
      targetModelVersion: boundTarget.provenance.modelVersion,
    },
    {
      weaponModelPackDigest: effectBinding.weaponModelPackDigest,
      weaponModelId: effectBinding.weaponModelId,
      weaponModelVersion: effectBinding.weaponModelVersion,
      targetModelPackDigest: effectBinding.targetModelPackDigest,
      targetModelId: effectBinding.targetModelId,
      targetModelVersion: effectBinding.targetModelVersion,
    },
  );
  assert.ok(resolveTargetEffectAuthority(
    boundScenario.targetEffectAuthority,
    boundWeapon,
    boundTarget,
  ));
  const run = runGovernedEngine(boundScenario, testAuthority.pack);
  const terminationIndex = run.events.items.findIndex(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  const effectIndex = run.events.items.findIndex(
    (event) => event.payload.kind === "TARGET_EFFECT_COMMITTED",
  );
  const termination = run.events.items[terminationIndex];
  const effect = run.events.items[effectIndex];
  const finalTarget = run.frames.at(-1).entities.find(
    (entity) => entity.id === "aircraft-red",
  );

  assert.equal(run.termination, "weapon_intercept");
  assert.ok(terminationIndex >= 0 && effectIndex > terminationIndex);
  assert.deepEqual(effect.causeEventIds, [termination.id]);
  assert.equal(effect.payload.commit.terminationReceipt.tick, termination.tick);
  assert.equal(effect.payload.commit.terminationReceipt.localKey, termination.localKey);
  assert.equal(effect.payload.commit.reason, "THRESHOLD_BAND");
  assert.equal(effect.payload.commit.result, "KILL");
  assert.equal(effect.payload.commit.targetLifecycleBefore, "ACTIVE");
  assert.equal(effect.payload.commit.targetLifecycleAfter, "TERMINATED");
  assert.equal(finalTarget.lifecycle, "TERMINATED");
  assert.deepEqual(finalTarget.targetEffect, {
    commitId: effect.payload.commit.commitId,
    state: "KILL",
  });
  assert.equal(
    run.events.items.filter((event) =>
      event.payload.kind === "ENTITY_LIFECYCLE_CHANGED" &&
      event.producer.entityId === "aircraft-red"
    ).length,
    0,
    "the governed effect event, not a duplicate generic event, owns target termination",
  );
});

test("target-effect event admission rejects duplicate and reordered application", () => {
  const scenario = bindTestTargetEffectAuthority(admitTestAircraft(testScenario()));
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  red.initial.position = { x: 2, y: 0, z: 8000 };
  red.initial.velocity = { ...blue.initial.velocity };
  const boundScenario = bindEngineTestAuthority(scenario);
  const run = runGovernedEngine(boundScenario, testAuthority.pack);
  const events = structuredClone(run.events.items);
  const effectIndex = events.findIndex(
    (event) => event.payload.kind === "TARGET_EFFECT_COMMITTED",
  );
  const terminationIndex = events.findIndex(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(effectIndex > terminationIndex && events.at(-1).payload.kind === "RUN_COMPLETED");

  const duplicated = structuredClone(events);
  const duplicate = structuredClone(duplicated[effectIndex]);
  const completed = duplicated.pop();
  duplicate.localKey = `${duplicate.localKey}:duplicate`;
  duplicate.sequence = duplicated.length;
  duplicate.id = `event-${duplicate.sequence.toString().padStart(6, "0")}`;
  completed.sequence = duplicate.sequence + 1;
  completed.id = `event-${completed.sequence.toString().padStart(6, "0")}`;
  duplicated.push(duplicate, completed);
  assert.throws(
    () => assertSimulationEventStream(
      duplicated,
      run.frames,
      boundScenario,
      run.termination,
      run.closestApproachM,
      { primaryWeaponId: run.primaryWeaponId, primaryTargetId: run.primaryTargetId },
    ),
    /duplicate transition|exact governed target effect/,
  );

  const reordered = structuredClone(events);
  [reordered[terminationIndex], reordered[effectIndex]] = [
    reordered[effectIndex],
    reordered[terminationIndex],
  ];
  const oldToNewId = new Map(
    reordered.map((event, sequence) => [
      event.id,
      `event-${sequence.toString().padStart(6, "0")}`,
    ]),
  );
  reordered.forEach((event, sequence) => {
    event.sequence = sequence;
    event.id = `event-${sequence.toString().padStart(6, "0")}`;
    event.causeEventIds = event.causeEventIds.map((id) => oldToNewId.get(id));
  });
  assert.throws(
    () => assertSimulationEventStream(
      reordered,
      run.frames,
      boundScenario,
      run.termination,
      run.closestApproachM,
      { primaryWeaponId: run.primaryWeaponId, primaryTargetId: run.primaryTargetId },
    ),
    /missing or future causal reference|canonical order/,
  );
});

test("maximum admitted flight time terminates the weapon as expired", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities.find((entity) => entity.weapon).weapon.termination.maximumFlightTimeSeconds = 0.1;
  const run = runTestEngine(scenario);
  assert.equal(run.termination, "weapon_expired");
  const terminal = run.events.items.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal?.payload.to, "EXPIRED");
  assert.equal(terminal?.payload.cause, "FLIGHT_TIME_EXPIRED");
});

test("an in-step expiry excludes later geometric closest approach", () => {
  const scenarioAtLifetime = (maximumFlightTimeSeconds) => {
    const scenario = admitTestAircraft(testScenario());
    const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
    red.initial.position = { x: 100, y: 0, z: 8000 };
    red.initial.velocity = { x: -600, y: 0, z: 0 };
    scenario.entities.find((entity) => entity.weapon)
      .weapon.termination.maximumFlightTimeSeconds = maximumFlightTimeSeconds;
    return scenario;
  };

  const expired = runTestEngine(scenarioAtLifetime(0.075));
  const longerLived = runTestEngine(scenarioAtLifetime(0.1));
  assert.equal(expired.termination, "weapon_expired");
  assert.equal(longerLived.termination, "weapon_intercept");
  const terminal = expired.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.equal(terminal?.payload.occurrenceTimeSeconds, 0.075);
  assert.ok(
    expired.closestApproachM > expired.scenario.entities.find((entity) => entity.weapon)
      .weapon.termination.interceptRadiusM,
    "post-expiry geometry must not reduce the recorded closest approach",
  );
});

test("off-grid weapon lifetime starts at the achieved activation boundary", () => {
  const scenario = admitTestAircraft(testScenario());
  const weapon = scenario.entities.find((entity) => entity.weapon);
  weapon.weapon.launchTimeSeconds = 0.025;
  weapon.weapon.termination.interceptRadiusM = 0.1;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.01;

  const run = runTestEngine(scenario);
  const entry = run.events.items.find(
    (event) => event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id,
  );
  const terminal = run.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.equal(run.termination, "weapon_expired");
  assert.equal(entry?.modelTimeSeconds, 0.05);
  assert.equal(terminal?.payload.occurrenceTimeSeconds, 0.06);
});

test("a non-intercept termination event records the lifetime closest approach", () => {
  const scenario = admitTestAircraft(testScenario());
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  red.initial.position = { x: 200, y: 100, z: 8000 };
  red.initial.velocity = { x: -300, y: 300, z: 0 };
  const termination = scenario.entities.find((entity) => entity.weapon).weapon.termination;
  termination.interceptRadiusM = 0.1;
  termination.maximumFlightTimeSeconds = 0.5;

  const run = runTestEngine(scenario);
  const terminal = run.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  const final = run.frames.at(-1);
  const weapon = final.entities.find((entity) => entity.id === run.primaryWeaponId);
  const target = final.entities.find((entity) => entity.id === run.primaryTargetId);
  const terminalSeparationM = Math.hypot(
    target.position.x - weapon.position.x,
    target.position.y - weapon.position.y,
    target.position.z - weapon.position.z,
  );

  assert.equal(run.termination, "weapon_expired");
  assert.equal(terminal?.payload.closestApproachM, Number(run.closestApproachM.toFixed(6)));
  assert.ok(run.closestApproachM < terminalSeparationM);
});

test("stowed pre-launch geometry cannot reduce the weapon-lifetime closest approach", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  const weapon = scenario.entities.find((entity) => entity.weapon);
  red.initial.position = { x: 250, y: 0, z: 8000 };
  red.initial.velocity = { x: -250, y: 0, z: 0 };
  weapon.initial.position = { ...blue.initial.position };
  weapon.weapon.launchTimeSeconds = 1;
  weapon.weapon.termination.interceptRadiusM = 0.1;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.1;

  const run = runTestEngine(scenario);
  assert.equal(run.termination, "weapon_expired");
  assert.ok(
    run.closestApproachM > 100,
    `pre-launch crossing leaked into the lifetime minimum: ${run.closestApproachM}`,
  );
});

test("weapon termination admission fails closed before integration", () => {
  const cases = [
    ["schema", (value) => { value.schemaVersion = "vector.weapon-termination-model.v0"; }],
    ["intended use", (value) => { value.intendedUse = "OPERATIONAL"; }],
    ["criterion", (value) => { value.criterion = "RENDERER_DISTANCE"; }],
    ["intercept radius", (value) => { value.interceptRadiusM = Number.NaN; }],
    ["maximum flight time", (value) => { value.maximumFlightTimeSeconds = 0; }],
  ];
  for (const [name, mutate] of cases) {
    const scenario = admitTestAircraft(testScenario());
    mutate(scenario.entities.find((entity) => entity.weapon).weapon.termination);
    assert.throws(() => runTestEngine(scenario), /no valid termination admission/, name);
  }
});

test("engine rejects removed and malformed runtime events", () => {
  const removed = admitTestAircraft(testScenario());
  removed.events = [{
    id: "removed-condition",
    type: "GUIDANCE_HOLD",
    startSeconds: 1,
    durationSeconds: 8,
    vectorMps: { x: 0, y: 0, z: 0 },
  }];
  assert.throws(() => runTestEngine(removed), /Unsupported engine event type/);

  const malformed = admitTestAircraft(testScenario());
  malformed.events = [{
    id: "bad-wind-shift",
    type: "WIND_SHIFT",
    startSeconds: 1,
    durationSeconds: 0,
    vectorMps: { x: 8, y: 0, z: 0 },
  }];
  assert.throws(() => runTestEngine(malformed), /positive duration/);
});

test("engine entity count is supplied by the scenario, not fixed in code", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities.push({
    ...baseEntity,
    id: "observer-1",
    rddfId: "rddf://platform/base/observer",
    designation: "Observer",
    callsign: "OBSERVER",
    affiliation: "NEUTRAL",
    kind: "BASE",
    symbolRole: "AIR_BASE",
    initial: {
      position: { x: 1000, y: 1000, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      massKg: 1,
      fuelKg: 0,
    },
  });
  const run = runTestEngine(scenario);
  assert.equal(run.frames[0].entities.length, 4);
});

test("stowed weapons become observable only when their launch event occurs", () => {
  const scenario = admitTestAircraft(testScenario());
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds = 2;
  const run = runTestEngine(scenario);
  const beforeLaunch = run.frames.find((frame) => frame.t < 2);
  const launchFrame = run.frames.find((frame) => frame.t >= 2);
  assert.ok(beforeLaunch);
  assert.ok(launchFrame);
  assert.equal(
    beforeLaunch.entities.some((entity) => entity.id === "weapon-blue"),
    false,
  );
  const launchedWeapon = launchFrame.entities.find(
    (entity) => entity.id === "weapon-blue",
  );
  const launchPlatform = launchFrame.entities.find(
    (entity) => entity.id === "aircraft-blue",
  );
  assert.ok(launchedWeapon);
  assert.ok(launchPlatform);
  assert.ok(
    Math.abs(launchedWeapon.position.x - launchPlatform.position.x) < 100,
    "launch position should inherit the platform state",
  );
});

test("aircraft mass conserves empty mass, fuel, and installed stores across release", () => {
  const scenario = admitTestAircraft(testScenario());
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds = 2;
  const run = runTestEngine(scenario);
  const before = run.frames.find((frame) => frame.t < 2 && frame.t > 1.5);
  const after = run.frames.find((frame) => frame.t >= 2);
  const later = run.frames.find((frame) => frame.t >= 3);
  const beforeAircraft = before.entities.find((entity) => entity.id === "aircraft-blue");
  const afterAircraft = after.entities.find((entity) => entity.id === "aircraft-blue");
  const laterAircraft = later.entities.find((entity) => entity.id === "aircraft-blue");

  assert.equal(beforeAircraft.storeMassKg, weapon.weapon.launchMassKg);
  assert.deepEqual(beforeAircraft.installedStoreIds, [weapon.id]);
  assert.equal(afterAircraft.storeMassKg, 0);
  assert.deepEqual(afterAircraft.installedStoreIds, []);
  assert.ok(
    Math.abs(
      beforeAircraft.massKg - beforeAircraft.fuelKg -
        (testAircraftModel.emptyMassKg + weapon.weapon.launchMassKg),
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      afterAircraft.massKg - afterAircraft.fuelKg - testAircraftModel.emptyMassKg,
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      laterAircraft.massKg - laterAircraft.fuelKg - testAircraftModel.emptyMassKg,
    ) < 1e-8,
    "a released store must not be removed twice",
  );
});

test("aircraft admission rejects an initial mass that omits installed stores", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  blue.initial.massKg -= 180;
  assert.throws(
    () => runTestEngine(scenario),
    /initial mass must equal empty mass, fuel, and installed stores/,
  );
});

test("fuel exhaustion preserves empty mass and all installed store mass before release", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds =
    scenario.durationSeconds - scenario.fixedStepSeconds;
  blue.initial.fuelKg = 1;
  blue.initial.massKg = testAircraftModel.emptyMassKg + 1 + weapon.weapon.launchMassKg;
  blue.aircraft.fuelFlowByThrottle.values = [1, 1];

  const run = runTestEngine(scenario);
  const finalAircraft = [...run.frames]
    .reverse()
    .find((frame) => frame.t < weapon.weapon.launchTimeSeconds)
    .entities.find((entity) => entity.id === blue.id);
  assert.equal(finalAircraft.fuelKg, 0);
  assert.equal(finalAircraft.storeMassKg, weapon.weapon.launchMassKg);
  assert.ok(
    Math.abs(
      finalAircraft.massKg -
        (testAircraftModel.emptyMassKg + weapon.weapon.launchMassKg),
    ) < 1e-8,
  );
});

test("an unlaunched carried weapon remains inventory, not a world entity", () => {
  const scenario = admitTestAircraft(testScenario());
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds = null;
  const run = runTestEngine(scenario);
  assert.ok(
    run.frames.every(
      (frame) => !frame.entities.some((entity) => entity.id === "weapon-blue"),
    ),
  );
  assert.equal(run.scenario.entities.length, 3);
});

test("sensor entities publish separate detection, tracking, engagement, and minimum-range envelopes", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities[0].sensor = {
    detectionRadiusM: 90000,
    trackingRadiusM: 70000,
    engagementRadiusM: 45000,
    minimumRangeM: 2500,
    minimumAltitudeM: 50,
    maximumAltitudeM: 18000,
  };
  const run = runTestEngine(scenario);
  assert.deepEqual(
    run.envelopes.map((envelope) => envelope.kind),
    ["DETECTION", "TRACKING", "ENGAGEMENT", "MINIMUM_RANGE"],
  );
  assert.deepEqual(
    run.envelopes.map((envelope) => envelope.radiusM),
    [90000, 70000, 45000, 2500],
  );
});

test("aircraft dynamics consume fuel and expose thrust, drag, mass, and maneuver authority", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  blue.aircraft = testAircraftModel;
  blue.route = [
    { ...blue.initial.position },
    { x: 5000, y: 5000, z: 9000 },
  ];
  blue.routePlan = { schemaVersion: "vector.route-plan.v1", waypointAcceptanceRadiiM: [1, 25] };
  const run = runTestEngine(scenario);
  const first = run.frames[0].entities.find((entity) => entity.id === "aircraft-blue");
  const last = run.frames.at(-1).entities.find((entity) => entity.id === "aircraft-blue");

  assert.ok(first && last);
  assert.ok(last.fuelKg < first.fuelKg, "modeled thrust must consume aircraft fuel");
  assert.ok(last.massKg < first.massKg, "fuel consumption must reduce aircraft mass");
  assert.ok(last.dragNewtons > 0, "air-relative drag must be computed");
  assert.ok(last.thrustNewtons > 0, "available fuel must permit modeled thrust");
  assert.equal(last.availableG, testAircraftModel.maximumCommandG);
  assert.ok(
    run.frames.some((frame) => {
      const entity = frame.entities.find((item) => item.id === blue.id);
      return entity.commandedG > 0 && entity.commandedG <= entity.availableG;
    }),
  );
});

test("aircraft without an admitted model fail closed", () => {
  assert.throws(
    () => runTestEngine(testScenario()),
    /Aircraft aircraft-blue has no admitted aircraft model/,
  );
});

test("aircraft follow authored three-dimensional routes with bounded recorded control", () => {
  const scenario = admitTestAircraft(testScenario());
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  red.route = [
    { ...red.initial.position },
    { x: 10000, y: 9000, z: 10500 },
  ];
  red.routePlan = { schemaVersion: "vector.route-plan.v1", waypointAcceptanceRadiiM: [1, 25] };

  const run = runTestEngine(scenario);
  const first = run.frames[0].entities.find((entity) => entity.id === red.id);
  const last = run.frames.at(-1).entities.find((entity) => entity.id === red.id);

  assert.ok(first && last?.aircraftControl);
  assert.ok(last.position.y > first.position.y + 100, "route must change horizontal position");
  assert.ok(last.position.z > first.position.z + 25, "route must change altitude");
  assert.ok(last.headingRad < Math.PI, "heading must turn toward the authored route");
  assert.ok(last.aircraftControl.requestedVelocityMps.z > 0);
  assert.ok(
    Math.hypot(
      last.aircraftControl.acceptedSteeringAccelerationMps2.x,
      last.aircraftControl.acceptedSteeringAccelerationMps2.y,
      last.aircraftControl.acceptedSteeringAccelerationMps2.z,
    ) <= testAircraftModel.maximumCommandG * 9.80665 + 1e-9,
  );
  assert.deepEqual(last.aircraftControl.achievedVelocityMps, last.velocity);
});

test("aircraft records the guidance request separately from its load-factor-limited command", () => {
  const scenario = admitTestAircraft(testScenario());
  const red = scenario.entities.find((entity) => entity.id === "aircraft-red");
  red.route = [
    { ...red.initial.position },
    {
      x: red.initial.position.x,
      y: red.initial.position.y + 10_000,
      z: red.initial.position.z,
    },
  ];
  red.routePlan = { schemaVersion: "vector.route-plan.v1", waypointAcceptanceRadiiM: [1, 25] };

  const frame = runTestEngine(scenario).frames
    .flatMap((sample) => sample.entities)
    .find((entity) => entity.id === red.id && entity.aircraftControl);

  assert.ok(frame?.aircraftControl);
  // Independent kinematic oracle: a 90-degree route request at the initial
  // speed requires a lateral velocity change of speed / fixed-step.
  const expectedRequestedLateralAcceleration =
    Math.abs(red.initial.velocity.x) / scenario.fixedStepSeconds;
  assert.equal(
    frame.aircraftControl.requestedSteeringAccelerationMps2.y,
    expectedRequestedLateralAcceleration,
  );
  assert.equal(frame.aircraftControl.requestedSteeringAccelerationMps2.x, 0);
  assert.equal(frame.aircraftControl.limiter, "LOAD_FACTOR");
  assert.ok(
    Math.hypot(
      frame.aircraftControl.acceptedSteeringAccelerationMps2.x,
      frame.aircraftControl.acceptedSteeringAccelerationMps2.y,
      frame.aircraftControl.acceptedSteeringAccelerationMps2.z,
    ) < expectedRequestedLateralAcceleration,
  );
});

test("changing one authored route changes the recorded aircraft trail", () => {
  const leftScenario = admitTestAircraft(testScenario());
  const rightScenario = structuredClone(leftScenario);
  const leftRed = leftScenario.entities.find((entity) => entity.id === "aircraft-red");
  const rightRed = rightScenario.entities.find((entity) => entity.id === "aircraft-red");
  leftRed.route = [{ ...leftRed.initial.position }, { x: 0, y: 9000, z: 8500 }];
  rightRed.route = [{ ...rightRed.initial.position }, { x: 0, y: -9000, z: 8500 }];
  leftRed.routePlan = { schemaVersion: "vector.route-plan.v1", waypointAcceptanceRadiiM: [1, 25] };
  rightRed.routePlan = { schemaVersion: "vector.route-plan.v1", waypointAcceptanceRadiiM: [1, 25] };

  const left = runTestEngine(leftScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");
  const right = runTestEngine(rightScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");

  assert.ok(left.position.y > right.position.y + 100);
  assert.notDeepEqual(left.position, right.position);
});
