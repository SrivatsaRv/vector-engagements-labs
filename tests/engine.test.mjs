import assert from "node:assert/strict";
import test from "node:test";
import { runEngine } from "../lib/engine/core.ts";

const baseEntity = {
  lifecycle: "ACTIVE",
  behavior: { maneuver: "steady", commandedG: 0, decision: "PRESS" },
  provenance: {
    sourceObjectId: "test",
    modelVersion: "test-v1",
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
        initial: {
          position: { x: 0, y: 0, z: 8000 },
          velocity: { x: 250, y: 0, z: 0 },
          headingRad: 0,
          massKg: 18000,
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
        initial: {
          position: { x: 10000, y: 1500, z: 8500 },
          velocity: { x: -220, y: 0, z: 0 },
          headingRad: Math.PI,
          massKg: 12000,
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
        },
      },
    ],
  };
}

test("generic engine updates every spawned entity deterministically", () => {
  const first = runEngine(testScenario());
  const second = runEngine(testScenario());
  assert.deepEqual(first, second);
  assert.ok(first.frames.length > 10);
  assert.equal(first.frames[0].entities.length, 3);
  assert.equal(first.diagnostics.nonFiniteStateCount, 0);
  const firstWeapon = first.frames[0].entities.find((item) => item.id === "weapon-blue");
  const lastWeapon = first.frames.at(-1).entities.find((item) => item.id === "weapon-blue");
  assert.ok(lastWeapon.massKg < firstWeapon.massKg);
  assert.ok(first.closestApproachM < 10000);
});

test("engine entity count is supplied by the scenario, not fixed in code", () => {
  const scenario = testScenario();
  scenario.entities.push({
    ...baseEntity,
    id: "observer-1",
    rddfId: "rddf://platform/base/observer",
    designation: "Observer",
    callsign: "OBSERVER",
    affiliation: "NEUTRAL",
    kind: "BASE",
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
  const scenario = testScenario();
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

test("an unlaunched carried weapon remains inventory, not a world entity", () => {
  const scenario = testScenario();
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
