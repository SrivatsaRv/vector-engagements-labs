import assert from "node:assert/strict";
import test from "node:test";
import {
  RUST_WASM_ENGINE_ARTIFACT,
  runEngineBackend,
} from "../lib/engine/backend.ts";
import { VECTOR_ENGINE_WASM_OPTIMIZER } from "../lib/engine/generated/vector-engine-wasm.ts";
import { compileScenario } from "../lib/engine/compiler.ts";
import {
  getProfile,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { geographicToEnginePosition } from "../lib/scenario-spatial.ts";
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

function regionalBoundaryCrossingScenario() {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const grid = scenario.environment.runtimeEnvironment.terrain.grid;
  const eastDeg = grid.westDeg + grid.longitudeStepDeg * (grid.columns - 1);
  const latitudeDeg = grid.southDeg + grid.latitudeStepDeg * (grid.rows - 1) / 2;
  const position = (longitudeDeg) => geographicToEnginePosition({
    longitude: longitudeDeg,
    latitude: latitudeDeg,
    altitudeM: 8_000,
    verticalDatum: "MSL",
  }, scenario.environment.studyArea);
  const launcher = scenario.entities.find((entity) => entity.id === "blue-platform-1");
  const target = scenario.entities.find((entity) => entity.id === "red-object-1");
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(launcher && target && weapon?.weapon, "regional crossing fixture requires launcher, target and weapon");
  launcher.initial.position = position(eastDeg - 0.001);
  target.initial.position = position(eastDeg - 0.004);
  weapon.initial.position = { ...launcher.initial.position };
  for (const entity of [launcher, target, weapon]) {
    entity.initial.velocity = { x: 300, y: 0, z: 0 };
    entity.initial.headingRad = 0;
    entity.route = [];
    delete entity.routePlan;
  }
  weapon.weapon.launchTimeSeconds = 0;
  scenario.durationSeconds = 1;
  scenario.completion.distanceMeters = 1;
  return scenario;
}

test("TypeScript and Rust/WASM reject at the first regional sample after crossing coverage", () => {
  const scenario = regionalBoundaryCrossingScenario();
  assert.throws(
    () => runEngineBackend(structuredClone(scenario), "typescript"),
    /outside admitted terrain coverage or contains no-data/,
  );
  assert.throws(
    () => runEngineBackend(structuredClone(scenario), "rust-wasm"),
    /runtime environment terrain sample is outside admitted coverage or contains no-data/,
  );
});

test("committed Rust/WASM artifact has a stable integrity identity", () => {
  assert.match(RUST_WASM_ENGINE_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes > 100_000);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes < 575_000);
  assert.equal(
    VECTOR_ENGINE_WASM_OPTIMIZER,
    "binaryen@131.0.0 -O3 -S2 rust-wasm-features-v1",
  );
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
    assert.deepEqual(
      rust.engineRun.events,
      typescript.engineRun.events,
      "delivered run/lifecycle events must preserve TypeScript/Rust ordering and payload parity",
    );
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
      blueWeaponQuantity: definition.scenario.blueWeaponQuantity,
      redWeaponQuantity: definition.scenario.redWeaponQuantity,
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
  red.routePlan = {
    schemaVersion: "vector.route-plan.v1",
    waypointAcceptanceRadiiM: [1, 25],
  };

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

test("both engines record the same explicit fly-by/fly-over transition contrast", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const base = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  base.durationSeconds = 12;
  const red = base.entities.find((entity) => entity.id === "red-object-1");
  red.initial.velocity = { x: 250, y: 0, z: 0 };
  red.initial.headingRad = 0;
  red.route = [
    { ...red.initial.position },
    { x: red.initial.position.x + 1_500, y: red.initial.position.y, z: red.initial.position.z },
    { x: red.initial.position.x + 1_500, y: red.initial.position.y + 8_000, z: red.initial.position.z + 1_000 },
  ];

  const flyBy = structuredClone(base);
  flyBy.entities.find((entity) => entity.id === red.id).routePlan = {
    schemaVersion: "vector.route-plan.v2",
    waypointAcceptanceRadiiM: [1, 4_000, 25],
    waypointTransitions: ["START", "FLY_BY", "FLY_BY"],
  };
  const flyOver = structuredClone(base);
  flyOver.entities.find((entity) => entity.id === red.id).routePlan = {
    schemaVersion: "vector.route-plan.v2",
    waypointAcceptanceRadiiM: [1, 1, 25],
    waypointTransitions: ["START", "FLY_OVER", "FLY_BY"],
  };

  const flyByTs = runEngineBackend(flyBy, "typescript");
  const flyByRust = runEngineBackend(structuredClone(flyBy), "rust-wasm");
  const flyOverTs = runEngineBackend(flyOver, "typescript");
  const flyOverRust = runEngineBackend(structuredClone(flyOver), "rust-wasm");
  const last = (run) => run.frames.at(-1).entities.find((entity) => entity.id === red.id);

  for (const [name, typescript, rust] of [["fly-by", flyByTs, flyByRust], ["fly-over", flyOverTs, flyOverRust]]) {
    const tsRed = last(typescript);
    const rustRed = last(rust);
    assert.equal(rustRed.aircraftControl.routePointIndex, tsRed.aircraftControl.routePointIndex, `${name} route index parity`);
    for (const axis of ["x", "y", "z"]) {
      close(rustRed.position[axis], tsRed.position[axis], 1e-6, `${name} ${axis} parity`);
    }
  }
  assert.notDeepEqual(last(flyByTs).position, last(flyOverTs).position, "declared transition changes recorded trajectory");
  const firstTransitionFrame = (run) => run.frames.findIndex((frame) =>
    frame.entities.find((entity) => entity.id === red.id)?.aircraftControl?.routePointIndex === 2,
  );
  assert.ok(
    firstTransitionFrame(flyByTs) < firstTransitionFrame(flyOverTs),
    "fly-by advances the next leg before the corresponding fly-over",
  );
  const flyOverTransition = flyOverTs.frames.find((frame) =>
    frame.entities.find((entity) => entity.id === red.id)?.aircraftControl?.routePointIndex === 2,
  );
  assert.ok(flyOverTransition, "fly-over must advance the next leg at a finite pass-through point");
  const flyOverAtTransition = flyOverTransition.entities.find((entity) => entity.id === red.id);
  const firstWaypoint = flyOver.entities.find((entity) => entity.id === red.id).route[1];
  assert.ok(
    Math.hypot(
      flyOverAtTransition.position.x - firstWaypoint.x,
      flyOverAtTransition.position.y - firstWaypoint.y,
      flyOverAtTransition.position.z - firstWaypoint.z,
    ) < 100,
    "fly-over must not remain in an unbounded orbit around the waypoint",
  );
  assert.ok(
    flyOverTs.frames.flatMap((frame) => frame.entities).every((entity) =>
      [entity.position.x, entity.position.y, entity.position.z].every(Number.isFinite),
    ),
    "fly-over trajectory stays finite",
  );
});

test("both engines reject an incomplete v2 route transition plan", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(SCENARIO_LIBRARY[0].scenario, capabilities).engineRun.scenario,
  );
  const red = scenario.entities.find((entity) => entity.id === "red-object-1");
  red.route = [{ ...red.initial.position }, { x: red.initial.position.x + 1_000, y: red.initial.position.y, z: red.initial.position.z }];
  red.routePlan = { schemaVersion: "vector.route-plan.v2", waypointAcceptanceRadiiM: [1, 25] };

  assert.throws(() => runEngineBackend(structuredClone(scenario), "typescript"), /transitions.*missing or invalid/);
  assert.throws(() => runEngineBackend(structuredClone(scenario), "rust-wasm"), /waypointTransitions is required/);
  scenario.entities.find((entity) => entity.id === red.id).routePlan = {
    schemaVersion: "vector.route-plan.v2",
    waypointAcceptanceRadiiM: [1, 25],
    waypointTransitions: ["START", "LOITER"],
  };
  assert.throws(() => runEngineBackend(structuredClone(scenario), "typescript"), /transitions.*missing or invalid/);
  assert.throws(() => runEngineBackend(structuredClone(scenario), "rust-wasm"), /waypointTransitions\[1\] is invalid/);
});

test("both engines fail closed when an authored route has no matching fly-by plan", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const red = scenario.entities.find((entity) => entity.id === "red-object-1");
  red.route = [
    { ...red.initial.position },
    { x: red.initial.position.x + 1_000, y: red.initial.position.y, z: red.initial.position.z },
  ];
  delete red.routePlan;

  assert.throws(() => runEngineBackend(structuredClone(scenario), "typescript"), /Route plan.*missing or invalid/);
  assert.throws(() => runEngineBackend(structuredClone(scenario), "rust-wasm"), /routePlan is required/);
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
    const releasedWeapon = run.frames[0].entities.find(
      (entity) => entity.id === run.primaryWeaponId,
    );
    assert.equal(releasedWeapon?.lifecycle, "ACTIVE", `${name} launch-frame lifecycle`);
    const weapon = run.frames.at(-1).entities.find(
      (entity) => entity.id === run.primaryWeaponId,
    );
    assert.equal(weapon?.lifecycle, "TERMINATED", `${name} weapon lifecycle`);
    assert.equal(
      weapon?.weaponFlightState,
      "TARGET_UNAVAILABLE",
      `${name} weapon state`,
    );
    const replayWeapon = decodeColumnarFrames(encodeColumnarFrames(run.frames)).at(-1)
      .entities.find((entity) => entity.id === run.primaryWeaponId);
    assert.equal(
      replayWeapon?.weaponFlightState,
      "TARGET_UNAVAILABLE",
      `${name} VSR weapon state`,
    );
  }
});

test("both engines exclude a geometric intercept occurring after an in-step expiry", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const blue = baseline.entities.find((entity) => entity.id === "blue-platform-1");
  const red = baseline.entities.find((entity) => entity.id === "red-object-1");
  const weapon = baseline.entities.find((entity) => entity.weapon);
  assert.ok(blue && red && weapon?.weapon);
  blue.initial.position = { x: 0, y: 0, z: 8000 };
  blue.initial.velocity = { x: 250, y: 0, z: 0 };
  red.initial.position = { x: 100, y: 0, z: 8000 };
  red.initial.velocity = { x: -600, y: 0, z: 0 };
  delete blue.route;
  delete blue.routePlan;
  delete red.route;
  delete red.routePlan;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.075;

  for (const backend of ["typescript", "rust-wasm"]) {
    const expired = runEngineBackend(structuredClone(baseline), backend);
    const longerLivedScenario = structuredClone(baseline);
    longerLivedScenario.entities.find((entity) => entity.weapon)
      .weapon.termination.maximumFlightTimeSeconds = 0.1;
    const longerLived = runEngineBackend(longerLivedScenario, backend);
    assert.equal(expired.termination, "weapon_expired", backend);
    assert.equal(longerLived.termination, "weapon_intercept", backend);
    const terminal = expired.events.items.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    assert.equal(terminal?.payload.occurrenceTimeSeconds, 0.075, backend);
    assert.ok(expired.closestApproachM > 25, backend);
  }
});

test("both engines validate a geometric intercept admitted before an in-step expiry", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const blue = baseline.entities.find((entity) => entity.id === "blue-platform-1");
  const red = baseline.entities.find((entity) => entity.id === "red-object-1");
  const weapon = baseline.entities.find((entity) => entity.weapon);
  assert.ok(blue && red && weapon?.weapon);
  blue.initial.position = { x: 0, y: 0, z: 8000 };
  blue.initial.velocity = { x: 250, y: 0, z: 0 };
  red.initial.position = { x: 80, y: 0, z: 8000 };
  red.initial.velocity = { x: -600, y: 0, z: 0 };
  delete blue.route;
  delete blue.routePlan;
  delete red.route;
  delete red.routePlan;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.075;

  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend(structuredClone(baseline), backend);
    const terminal = run.events.items.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    assert.equal(run.termination, "weapon_intercept", backend);
    assert.equal(terminal?.payload.cause, "GEOMETRIC_INTERCEPT", backend);
    assert.equal(terminal.payload.occurrenceTimeSeconds, 0.075, backend);
  }
});

test("both engines start off-grid weapon lifetime at the achieved activation boundary", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const weapon = baseline.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.launchTimeSeconds = 0.025;
  weapon.weapon.termination.interceptRadiusM = 0.1;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.01;
  baseline.durationSeconds = 1;

  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend(structuredClone(baseline), backend);
    const entry = run.events.items.find(
      (event) => event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id,
    );
    const terminal = run.events.items.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    assert.equal(run.termination, "weapon_expired", backend);
    assert.equal(entry?.modelTimeSeconds, 0.05, backend);
    assert.equal(terminal?.payload.occurrenceTimeSeconds, 0.06, backend);
  }
});

test("both engines bind non-intercept events to the lifetime closest approach", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const blue = baseline.entities.find((entity) => entity.id === "blue-platform-1");
  const red = baseline.entities.find((entity) => entity.id === "red-object-1");
  const weapon = baseline.entities.find((entity) => entity.weapon);
  assert.ok(blue && red && weapon?.weapon);
  blue.initial.position = { x: 0, y: 0, z: 8000 };
  blue.initial.velocity = { x: 250, y: 0, z: 0 };
  red.initial.position = { x: 200, y: 100, z: 8000 };
  red.initial.velocity = { x: -500, y: 500, z: 0 };
  delete blue.route;
  delete blue.routePlan;
  delete red.route;
  delete red.routePlan;
  weapon.weapon.termination.interceptRadiusM = 0.1;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.5;

  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend(structuredClone(baseline), backend);
    const terminal = run.events.items.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    const final = run.frames.at(-1);
    const finalWeapon = final.entities.find((entity) => entity.id === run.primaryWeaponId);
    const finalTarget = final.entities.find((entity) => entity.id === run.primaryTargetId);
    const terminalSeparationM = Math.hypot(
      finalTarget.position.x - finalWeapon.position.x,
      finalTarget.position.y - finalWeapon.position.y,
      finalTarget.position.z - finalWeapon.position.z,
    );
    assert.equal(run.termination, "weapon_expired", backend);
    assert.equal(
      terminal?.payload.closestApproachM,
      Number(run.closestApproachM.toFixed(6)),
      backend,
    );
    assert.ok(run.closestApproachM < terminalSeparationM, backend);
  }
});

test("both engines exclude stowed geometry from the weapon-lifetime closest approach", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const blue = baseline.entities.find((entity) => entity.id === "blue-platform-1");
  const red = baseline.entities.find((entity) => entity.id === "red-object-1");
  const weapon = baseline.entities.find((entity) => entity.weapon);
  assert.ok(blue && red && weapon?.weapon);
  blue.initial.position = { x: 0, y: 0, z: 8000 };
  blue.initial.velocity = { x: 250, y: 0, z: 0 };
  red.initial.position = { x: 250, y: 0, z: 8000 };
  red.initial.velocity = { x: -250, y: 0, z: 0 };
  weapon.initial.position = { ...blue.initial.position };
  weapon.initial.velocity = { ...blue.initial.velocity };
  for (const entity of [blue, red]) {
    delete entity.route;
    delete entity.routePlan;
  }
  weapon.weapon.launchTimeSeconds = 1;
  weapon.weapon.termination.interceptRadiusM = 0.1;
  weapon.weapon.termination.maximumFlightTimeSeconds = 0.1;
  baseline.durationSeconds = 2;

  const runs = ["typescript", "rust-wasm"].map((backend) =>
    runEngineBackend(structuredClone(baseline), backend));
  for (const [index, run] of runs.entries()) {
    const backend = index === 0 ? "typescript" : "rust-wasm";
    assert.equal(run.termination, "weapon_expired", backend);
    assert.ok(run.closestApproachM > 100, `${backend} included pre-launch geometry`);
  }
  close(runs[0].closestApproachM, runs[1].closestApproachM, 1e-9, "post-launch closest approach parity");
});

test("both engines reject malformed weapon termination authority before integration", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const cases = [
    (value) => { value.schemaVersion = "vector.weapon-termination-model.v0"; },
    (value) => { value.intendedUse = "OPERATIONAL"; },
    (value) => { value.criterion = "RENDERER_DISTANCE"; },
    (value) => { value.interceptRadiusM = 0; },
    (value) => { value.maximumFlightTimeSeconds = Number.NaN; },
  ];
  for (const mutate of cases) {
    for (const backend of ["typescript", "rust-wasm"]) {
      const scenario = structuredClone(baseline);
      const termination = scenario.entities.find((entity) => entity.weapon).weapon.termination;
      mutate(termination);
      assert.throws(
        () => runEngineBackend(scenario, backend),
        /termination|finite number|finite positive number|invalid type: null, expected f64/i,
        backend,
      );
    }
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
    blueWeaponQuantity: definition.scenario.blueWeaponQuantity,
    redWeaponQuantity: definition.scenario.redWeaponQuantity,
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
