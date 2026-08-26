import assert from "node:assert/strict";
import test from "node:test";
import { runEngine } from "../lib/engine/core.ts";

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
  const first = runEngine(admitTestAircraft(testScenario()));
  const second = runEngine(admitTestAircraft(testScenario()));
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
  const baseline = runEngine(admitTestAircraft(testScenario()));
  const contrastedScenario = admitTestAircraft(testScenario());
  const blue = contrastedScenario.entities.find((entity) => entity.id === "aircraft-blue");
  blue.aircraft = {
    ...blue.aircraft,
    zeroLiftDragByMach: { id: "contrast-drag", axis: [0, 2], values: [0.015, 0.06] },
    inducedDragByAngleOfAttackRad: { id: "contrast-induced", axis: [-0.2, 0.4], values: [0.02, 0.11] },
    thrustByThrottle: { id: "contrast-thrust", axis: [0, 0.5, 1], values: [0, 60000, 180000] },
    fuelFlowByThrottle: { id: "contrast-fuel", axis: [0, 0.5, 1], values: [0.00001, 0.00002, 0.00004] },
  };
  const contrasted = runEngine(contrastedScenario);
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
  assert.throws(() => runEngine(scenario), /outside admitted table narrow-drag coverage/);
});

test("TypeScript engine rejects an unknown weapon support declaration", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities.find((entity) => entity.weapon).weapon.admission.supportRequirement = "TYPO_SUPPORT";
  assert.throws(() => runEngine(scenario), /no valid compiled admission/);
});

test("weapon flight state is a closed achieved-state contract", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.durationSeconds = 8;
  const run = runEngine(scenario);
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
  const run = runEngine(scenarioWithLegacyAllowance(1));
  const permissiveLegacyRun = runEngine(scenarioWithLegacyAllowance(10_000));
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

test("maximum admitted flight time terminates the weapon as expired", () => {
  const scenario = admitTestAircraft(testScenario());
  scenario.entities.find((entity) => entity.weapon).weapon.termination.maximumFlightTimeSeconds = 0.1;
  const run = runEngine(scenario);
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

  const expired = runEngine(scenarioAtLifetime(0.075));
  const longerLived = runEngine(scenarioAtLifetime(0.1));
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
    assert.throws(() => runEngine(scenario), /no valid termination admission/, name);
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
  assert.throws(() => runEngine(removed), /Unsupported engine event type/);

  const malformed = admitTestAircraft(testScenario());
  malformed.events = [{
    id: "bad-wind-shift",
    type: "WIND_SHIFT",
    startSeconds: 1,
    durationSeconds: 0,
    vectorMps: { x: 8, y: 0, z: 0 },
  }];
  assert.throws(() => runEngine(malformed), /positive duration/);
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
  const run = runEngine(scenario);
  assert.equal(run.frames[0].entities.length, 4);
});

test("stowed weapons become observable only when their launch event occurs", () => {
  const scenario = admitTestAircraft(testScenario());
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds = 2;
  const run = runEngine(scenario);
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
  const run = runEngine(scenario);
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
    () => runEngine(scenario),
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

  const run = runEngine(scenario);
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
  const run = runEngine(scenario);
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
  const run = runEngine(scenario);
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
  const run = runEngine(scenario);
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
    () => runEngine(testScenario()),
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

  const run = runEngine(scenario);
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

  const frame = runEngine(scenario).frames
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

  const left = runEngine(leftScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");
  const right = runEngine(rightScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");

  assert.ok(left.position.y > right.position.y + 100);
  assert.notDeepEqual(left.position, right.position);
});
