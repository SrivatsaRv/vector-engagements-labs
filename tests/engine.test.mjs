import assert from "node:assert/strict";
import test from "node:test";
import { runEngine } from "../lib/engine/core.ts";

const baseEntity = {
  lifecycle: "ACTIVE",
  behavior: { maneuver: "steady", commandedG: 0, decision: "PRESS" },
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
        },
      },
    ],
  };
}

const testAircraftModel = {
  emptyMassKg: 14000,
  fuelCapacityKg: 5000,
  referenceAreaM2: 62,
  zeroLiftDragCoefficient: 0.025,
  inducedDragFactor: 0.055,
  maximumThrustNewtons: 240000,
  specificFuelConsumptionKgPerNewtonSecond: 0.000022,
  maximumCommandG: 9,
};

function admitTestAircraft(scenario) {
  for (const entity of scenario.entities) {
    if (entity.kind === "AIRCRAFT") entity.aircraft = { ...testAircraftModel };
  }
  return scenario;
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

test("fuel exhaustion preserves empty mass and all installed store mass", () => {
  const scenario = admitTestAircraft(testScenario());
  const blue = scenario.entities.find((entity) => entity.id === "aircraft-blue");
  const weapon = scenario.entities.find((entity) => entity.id === "weapon-blue");
  weapon.weapon.launchTimeSeconds = scenario.durationSeconds + 1;
  blue.initial.fuelKg = 1;
  blue.initial.massKg = testAircraftModel.emptyMassKg + 1 + weapon.weapon.launchMassKg;
  blue.aircraft.specificFuelConsumptionKgPerNewtonSecond = 1;

  const run = runEngine(scenario);
  const finalAircraft = run.frames.at(-1).entities.find(
    (entity) => entity.id === blue.id,
  );
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

  const frame = runEngine(scenario).frames[0].entities.find(
    (entity) => entity.id === red.id,
  );

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

  const left = runEngine(leftScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");
  const right = runEngine(rightScenario).frames.at(-1).entities.find((entity) => entity.id === "aircraft-red");

  assert.ok(left.position.y > right.position.y + 100);
  assert.notDeepEqual(left.position, right.position);
});
