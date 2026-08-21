import assert from "node:assert/strict";
import test from "node:test";
import {
  RUST_WASM_ENGINE_ARTIFACT,
  runEngineBackend,
} from "../lib/engine/backend.ts";
import { compileScenario } from "../lib/engine/compiler.ts";
import {
  getProfile,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  decodeColumnarFrames,
  encodeColumnarFrames,
} from "../lib/record/vector-record.ts";

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differed from ${expected} by more than ${tolerance}`,
  );
};

const assertPictureParity = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, `${label}: picture count`);
  for (let index = 0; index < actual.length; index += 1) {
    const actualPicture = actual[index];
    const expectedPicture = expected[index];
    const { position: actualPosition, ...actualMetadata } = actualPicture;
    const { position: expectedPosition, ...expectedMetadata } = expectedPicture;
    assert.deepEqual(actualMetadata, expectedMetadata, `${label}: picture ${index} metadata`);
    assert.equal(Boolean(actualPosition), Boolean(expectedPosition), `${label}: picture ${index} position availability`);
    if (actualPosition && expectedPosition) {
      close(actualPosition.x, expectedPosition.x, 1e-6, `${label}: picture ${index} x`);
      close(actualPosition.y, expectedPosition.y, 1e-6, `${label}: picture ${index} y`);
      close(actualPosition.z, expectedPosition.z, 1e-6, `${label}: picture ${index} z`);
    }
  }
};

test("committed Rust/WASM artifact has a stable integrity identity", () => {
  assert.match(RUST_WASM_ENGINE_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes > 100_000);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes < 500_000);
});

for (const definition of SCENARIO_LIBRARY) {
  test(`Rust/WASM matches TypeScript for ${definition.id}`, () => {
    const domains = ["A2A", "A2G", "G2A", "G2G"];
    const typescript = simulateWithCapabilitiesForVerification(
      definition.scenario,
      createVerificationDeploymentCapabilities("typescript", domains),
    );
    const rust = simulateWithCapabilitiesForVerification(
      definition.scenario,
      createVerificationDeploymentCapabilities("rust-wasm", domains),
    );

    assert.equal(typescript.engineRun.diagnostics.backend, "typescript");
    assert.equal(rust.engineRun.diagnostics.backend, "rust-wasm");
    assert.match(rust.engineRun.scenario.modelPack.digest, /^[0-9a-f]{64}$/);
    assert.equal(
      rust.engineRun.scenario.modelPack.digest,
      typescript.engineRun.scenario.modelPack.digest,
    );
    assert.ok(
      rust.engineRun.scenario.entities.every(
        (entity) =>
          entity.provenance.modelId &&
          entity.provenance.modelPackDigest === rust.engineRun.scenario.modelPack.digest,
      ),
    );
    assert.equal(rust.termination, typescript.termination);
    assert.equal(rust.outcome, typescript.outcome);
    assert.equal(rust.frames.length, typescript.frames.length);
    if (definition.scenario.domain === "A2A") {
      assert.ok(typescript.pictures.length > 0, "A2A ticks must publish canonical observer state");
      assert.ok(typescript.pictures.every((picture) => picture.trackState === "UNSUPPORTED" && !picture.visible && !("position" in picture)));
    } else {
      assert.equal(typescript.pictures.length, 0, "non-A2A runs must not fabricate observer pictures");
    }
    assertPictureParity(
      rust.pictures,
      typescript.pictures,
      "equivalent TypeScript and Rust engine frames must yield the same versioned observer pictures",
    );
    assert.equal(rust.entityManifest.length, typescript.entityManifest.length);
    assert.deepEqual(
      rust.engineRun.scenario.geospatial.syntheticEnvironment,
      typescript.engineRun.scenario.geospatial.syntheticEnvironment,
    );
    assert.deepEqual(
      rust.entityManifest.map((entity) => [entity.id, entity.kind, entity.lifecycle]),
      typescript.entityManifest.map((entity) => [entity.id, entity.kind, entity.lifecycle]),
    );
    close(rust.closestApproach, typescript.closestApproach, 1e-6, "closest approach");
    close(rust.timeOfFlight, typescript.timeOfFlight, 1e-9, "time of flight");
    close(rust.endSpeed, typescript.endSpeed, 1e-6, "end speed");
    close(rust.peakDemand, typescript.peakDemand, 1e-8, "peak demand");
    assert.equal(
      rust.engineRun.diagnostics.integratedSteps,
      typescript.engineRun.diagnostics.integratedSteps,
    );
    assert.equal(rust.engineRun.diagnostics.nonFiniteStateCount, 0);

    const checkpoints = [0, Math.floor(rust.frames.length / 2), rust.frames.length - 1];
    for (const frameIndex of checkpoints) {
      const rustFrame = rust.frames[frameIndex];
      const typescriptFrame = typescript.frames[frameIndex];
      close(rustFrame.t, typescriptFrame.t, 1e-9, `frame ${frameIndex} time`);
      close(rustFrame.range, typescriptFrame.range, 1e-6, `frame ${frameIndex} range`);
      close(rustFrame.speed, typescriptFrame.speed, 1e-6, `frame ${frameIndex} speed`);
      assert.deepEqual(
        rustFrame.entities.map((entity) => [entity.id, entity.lifecycle, entity.phase, entity.weaponFlightState]),
        typescriptFrame.entities.map((entity) => [entity.id, entity.lifecycle, entity.phase, entity.weaponFlightState]),
      );
      assert.deepEqual(
        rustFrame.geographicPositions.map((item) => item.entityId),
        typescriptFrame.geographicPositions.map((item) => item.entityId),
      );
      for (let index = 0; index < rustFrame.geographicPositions.length; index += 1) {
        const rustPosition = rustFrame.geographicPositions[index].position;
        const typescriptPosition = typescriptFrame.geographicPositions[index].position;
        close(
          rustPosition.longitudeDeg,
          typescriptPosition.longitudeDeg,
          1e-10,
          `frame ${frameIndex} longitude`,
        );
        close(
          rustPosition.latitudeDeg,
          typescriptPosition.latitudeDeg,
          1e-10,
          `frame ${frameIndex} latitude`,
        );
        close(
          rustPosition.altitude.valueM,
          typescriptPosition.altitude.valueM,
          1e-5,
          `frame ${frameIndex} ellipsoid altitude`,
        );
        assert.equal(rustPosition.altitude.datum, "ELLIPSOID");
      }
    }
  });
}

test("explicit backend selection never silently falls through", () => {
  const definition = SCENARIO_LIBRARY[0];
  const profile = getProfile(definition.scenario);
  const compiled = compileScenario(
    {
      id: definition.id,
      version: definition.version,
      domain: definition.scenario.domain,
      name: definition.scenario.name,
      bluePlatformId: definition.scenario.bluePlatformId,
      blueSystemId: definition.scenario.blueSystemId,
      redObjectId: definition.scenario.redObjectId,
      redSystemId: definition.scenario.redSystemId,
      studyAreaId: definition.scenario.studyAreaId,
      weatherPresetId: definition.scenario.weatherPresetId,
      profile: definition.scenario.profile,
      guidance: definition.scenario.guidance,
      altitude: definition.scenario.altitude,
      cruiseAltitude: definition.scenario.cruiseAltitude,
      targetDelta: definition.scenario.targetDelta,
      range: definition.scenario.range,
      aspect: definition.scenario.aspect,
      launcherSpeed: definition.scenario.launcherSpeed,
      targetSpeed: definition.scenario.targetSpeed,
      blueFuelPercent: definition.scenario.blueFuelPercent,
      redFuelPercent: definition.scenario.redFuelPercent,
      windEastMps: definition.scenario.wind,
      windNorthMps: definition.scenario.windNorth,
      temperatureOffset: definition.scenario.temperatureOffset,
      windShiftAt: null,
      windShiftEastMps: 0,
      windShiftNorthMps: 0,
      seed: definition.scenario.seed,
    },
    profile,
  );
  assert.throws(
    () => runEngineBackend(compiled, "other"),
    /Unknown VECTOR engine backend/,
  );
});

test("Rust/WASM and TypeScript preserve parity for a turning and climbing route", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", [
    "A2A",
  ]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  scenario.durationSeconds = 8;
  const red = scenario.entities.find((entity) => entity.id === "red-object-1");
  red.route = [
    { ...red.initial.position },
    {
      x: red.initial.position.x - 5000,
      y: red.initial.position.y + 5000,
      z: red.initial.position.z + 1500,
    },
  ];

  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");
  const typescriptRed = typescript.frames.at(-1).entities.find(
    (entity) => entity.id === red.id,
  );
  const rustRed = rust.frames.at(-1).entities.find((entity) => entity.id === red.id);

  for (const axis of ["x", "y", "z"]) {
    close(
      rustRed.position[axis],
      typescriptRed.position[axis],
      1e-6,
      `route position ${axis}`,
    );
    close(
      rustRed.velocity[axis],
      typescriptRed.velocity[axis],
      1e-6,
      `route velocity ${axis}`,
    );
  }
  assert.equal(
    rustRed.aircraftControl.routePointIndex,
    typescriptRed.aircraftControl.routePointIndex,
  );
  assert.equal(rustRed.aircraftControl.limiter, typescriptRed.aircraftControl.limiter);
  for (const vectorName of [
    "requestedVelocityMps",
    "requestedSteeringAccelerationMps2",
    "acceptedSteeringAccelerationMps2",
    "achievedVelocityMps",
  ]) {
    for (const axis of ["x", "y", "z"]) {
      close(
        rustRed.aircraftControl[vectorName][axis],
        typescriptRed.aircraftControl[vectorName][axis],
        1e-9,
        `${vectorName} ${axis}`,
      );
    }
  }
});

test("both engines terminate an admitted weapon when its assigned target is unavailable", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", [
    "A2A",
  ]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const target = scenario.entities.find((entity) => entity.id === "red-object-1");
  assert.ok(target, "fixture must contain the primary weapon target");
  target.lifecycle = "TERMINATED";

  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");

  for (const [name, run] of [["TypeScript", typescript], ["Rust/WASM", rust]]) {
    assert.equal(run.termination, "target_unavailable", `${name} termination`);
    assert.equal(run.diagnostics.integratedSteps, 1, `${name} must not continue a dead weapon`);
    const weapon = run.frames[0].entities.find(
      (entity) => entity.id === run.primaryWeaponId,
    );
    assert.equal(weapon?.lifecycle, "TERMINATED", `${name} weapon lifecycle`);
    assert.equal(
      weapon?.weaponFlightState,
      "TARGET_UNAVAILABLE",
      `${name} weapon state`,
    );
    const replayWeapon = decodeColumnarFrames(encodeColumnarFrames(run.frames))[0]
      .entities.find((entity) => entity.id === run.primaryWeaponId);
    assert.equal(
      replayWeapon?.weaponFlightState,
      "TARGET_UNAVAILABLE",
      `${name} VSR weapon state`,
    );
  }
});

test("Rust/WASM and TypeScript preserve aircraft store-mass transfer at release", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", [
    "A2A",
  ]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  scenario.durationSeconds = 4;
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.launchTimeSeconds = 2;
  const launcherId = weapon.weapon.launchPlatformId;

  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");
  for (const sampleTime of [1.5, 2, 3]) {
    const typescriptFrame = typescript.frames.find((frame) => frame.t >= sampleTime);
    const rustFrame = rust.frames.find((frame) => frame.t >= sampleTime);
    const typescriptLauncher = typescriptFrame.entities.find(
      (entity) => entity.id === launcherId,
    );
    const rustLauncher = rustFrame.entities.find((entity) => entity.id === launcherId);
    close(
      rustLauncher.massKg,
      typescriptLauncher.massKg,
      1e-8,
      `launcher mass at ${sampleTime} s`,
    );
    close(
      rustLauncher.storeMassKg,
      typescriptLauncher.storeMassKg,
      1e-8,
      `store mass at ${sampleTime} s`,
    );
    assert.deepEqual(
      rustLauncher.installedStoreIds,
      typescriptLauncher.installedStoreIds,
    );
  }
});

test("scenario compilation fails closed for unknown objects and incompatible loadouts", () => {
  const definition = SCENARIO_LIBRARY[0];
  const profile = getProfile(definition.scenario);
  const base = {
    id: definition.id,
    version: definition.version,
    domain: definition.scenario.domain,
    name: definition.scenario.name,
    bluePlatformId: definition.scenario.bluePlatformId,
    blueSystemId: definition.scenario.blueSystemId,
    redObjectId: definition.scenario.redObjectId,
    redSystemId: definition.scenario.redSystemId,
    studyAreaId: definition.scenario.studyAreaId,
    weatherPresetId: definition.scenario.weatherPresetId,
    profile: definition.scenario.profile,
    guidance: definition.scenario.guidance,
    altitude: definition.scenario.altitude,
    cruiseAltitude: definition.scenario.cruiseAltitude,
    targetDelta: definition.scenario.targetDelta,
    range: definition.scenario.range,
    aspect: definition.scenario.aspect,
    launcherSpeed: definition.scenario.launcherSpeed,
    targetSpeed: definition.scenario.targetSpeed,
    blueFuelPercent: definition.scenario.blueFuelPercent,
    redFuelPercent: definition.scenario.redFuelPercent,
    windEastMps: definition.scenario.wind,
    windNorthMps: definition.scenario.windNorth,
    temperatureOffset: definition.scenario.temperatureOffset,
    windShiftAt: null,
    windShiftEastMps: 0,
    windShiftNorthMps: 0,
    seed: definition.scenario.seed,
  };
  assert.throws(
    () => compileScenario({ ...base, bluePlatformId: "unknown-platform" }, profile),
    /Unknown catalog object/,
  );
  assert.throws(
    () => compileScenario({ ...base, blueSystemId: "aim-120c5" }, profile),
    /Incompatible loadout/,
  );
});
