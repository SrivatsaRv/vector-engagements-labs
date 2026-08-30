import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  RUST_WASM_ENGINE_ARTIFACT,
  runEngineBackend,
} from "../lib/engine/backend.ts";
import {
  VECTOR_ENGINE_WASM_BASE64,
  VECTOR_ENGINE_WASM_OPTIMIZER,
} from "../lib/engine/generated/vector-engine-wasm.ts";
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
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "../lib/engine/runtime-model-pack.ts";
import {
  findEngineCompiledModelPackAuthority,
  resolveRetainedCompiledModelPack,
} from "../lib/engine/retained-model-packs.ts";
import { bindVerificationTrackModelPack } from "../lib/engine/verification-track-fixture.ts";
import historicalModelPackBundle from "../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json" with { type: "json" };

function governWeaponTermination(scenario, weapon, changes) {
  const pack = resolveRetainedCompiledModelPack(scenario.modelPack);
  const compiledWeapon = pack.weapons.find(
    (candidate) => candidate.id === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(compiledWeapon?.termination);
  const fields = {
    interceptRadiusM: ["/termination/interceptRadiusM", "m", "interceptRadiusM"],
    maximumFlightTimeSeconds: ["/termination/maximumFlightTimeS", "s", "maximumFlightTimeS"],
  };
  const patches = Object.entries(changes).map(([field, newValue]) => ({
    schemaVersion: "vector.model-patch.v1",
    id: `test-${compiledWeapon.id}-${field.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}`,
    modelPackDigest: pack.digest,
    modelId: compiledWeapon.id,
    fieldPath: fields[field][0],
    oldValue: compiledWeapon.termination[fields[field][2]],
    newValue,
    unit: fields[field][1],
    reason: "Deterministic boundary regression fixture",
    provenance: {
      authorId: "vector-test-suite",
      authoredAt: "2026-08-27T00:00:00.000Z",
      evidenceRefIds: [compiledWeapon.evidenceRefIds[0]],
    },
  }));
  Object.assign(weapon.weapon.termination, changes);
  const projection = structuredClone(scenario.modelPack);
  delete projection.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest({
    ...projection,
    weaponTerminations: runtimeWeaponTerminations(pack, patches),
    scenarioPatches: patches,
  });
}

function runRawRustWasm(scenario) {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(
    Buffer.from(VECTOR_ENGINE_WASM_BASE64, "base64"),
  ));
  const engine = instance.exports;
  const input = new TextEncoder().encode(JSON.stringify(scenario));
  const pointer = engine.vector_input_reserve(input.byteLength);
  new Uint8Array(engine.memory.buffer, pointer, input.byteLength).set(input);
  const accepted = engine.vector_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(
    engine.memory.buffer,
    engine.vector_output_ptr(),
    engine.vector_output_len(),
  ));
  return { accepted, output };
}

function resealCompiledPack(pack) {
  const payload = structuredClone(pack);
  delete payload.digest;
  const normalize = (value) => {
    if (typeof value === "number") {
      return `#number:${value.toExponential(12).replace("e+", "e")}`;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };
  pack.digest = createHash("sha256")
    .update(JSON.stringify(normalize(payload)))
    .digest("hex");
  return pack;
}

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
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes < 585_000);
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
  governWeaponTermination(baseline, weapon, { maximumFlightTimeSeconds: 0.075 });

  for (const backend of ["typescript", "rust-wasm"]) {
    const expired = runEngineBackend(structuredClone(baseline), backend);
    const longerLivedScenario = structuredClone(baseline);
    const longerLivedWeapon = longerLivedScenario.entities.find((entity) => entity.weapon);
    governWeaponTermination(longerLivedScenario, longerLivedWeapon, {
      maximumFlightTimeSeconds: 0.1,
    });
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
  governWeaponTermination(baseline, weapon, { maximumFlightTimeSeconds: 0.075 });

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
  governWeaponTermination(baseline, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: 0.01,
  });
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
  governWeaponTermination(baseline, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: 0.5,
  });

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
  governWeaponTermination(baseline, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: 0.1,
  });
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

test("both engines retain a launch-boundary minimum before a delayed expiry", () => {
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
  blue.initial.velocity = { x: 400, y: 0, z: 0 };
  red.initial.position = { x: -1000, y: 0, z: 8000 };
  red.initial.velocity = { x: -400, y: 0, z: 0 };
  weapon.initial.position = { ...blue.initial.position };
  weapon.initial.velocity = { ...blue.initial.velocity };
  for (const entity of [blue, red]) {
    delete entity.route;
    delete entity.routePlan;
  }
  weapon.weapon.launchTimeSeconds = baseline.fixedStepSeconds;
  governWeaponTermination(baseline, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: baseline.fixedStepSeconds * 3,
  });
  baseline.durationSeconds = 1;

  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend(structuredClone(baseline), backend);
    const launchTimeSeconds = weapon.weapon.launchTimeSeconds;
    const launchFrame = run.frames.find(
      (frame) => frame.t === launchTimeSeconds &&
        frame.entities.some((entity) => entity.id === run.primaryWeaponId),
    );
    const evidenceFrame = run.frames.find(
      (frame) => frame.t === launchTimeSeconds + baseline.fixedStepSeconds,
    );
    const terminalFrame = run.frames.at(-1);
    assert.ok(launchFrame && evidenceFrame && terminalFrame, backend);
    const separation = (frame) => {
      const frameWeapon = frame.entities.find((entity) => entity.id === run.primaryWeaponId);
      const frameTarget = frame.entities.find((entity) => entity.id === run.primaryTargetId);
      assert.ok(frameWeapon && frameTarget, backend);
      return Math.hypot(
        frameTarget.position.x - frameWeapon.position.x,
        frameTarget.position.y - frameWeapon.position.y,
        frameTarget.position.z - frameWeapon.position.z,
      );
    };
    const launchSeparationM = separation(launchFrame);
    assert.equal(run.termination, "weapon_expired", backend);
    close(run.closestApproachM, launchSeparationM, 1e-9, `${backend} launch-boundary minimum`);
    assert.ok(separation(evidenceFrame) > launchSeparationM, backend);
    assert.ok(separation(terminalFrame) > launchSeparationM, backend);
  }
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

test("both engines reject hash-rebound termination limits beside a retained pack identity", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  for (const backend of ["typescript", "rust-wasm"]) {
    const scenario = structuredClone(baseline);
    const weapon = scenario.entities.find((entity) => entity.weapon);
    assert.ok(weapon?.weapon);
    weapon.weapon.termination.interceptRadiusM += 100;
    const projection = scenario.modelPack.weaponTerminations.find(
      (candidate) => candidate.modelId === weapon.weapon.admission.weaponModelId,
    );
    assert.ok(projection);
    projection.termination.interceptRadiusM = weapon.weapon.termination.interceptRadiusM;
    const material = structuredClone(scenario.modelPack);
    delete material.runtimeDigest;
    scenario.modelPack = bindRuntimeModelPackDigest(material);
    assert.throws(
      () => runEngineBackend(scenario, backend),
      /does not match the exact compiled model pack/,
      backend,
    );
  }
});

test("direct Rust/WASM rejects a jointly resealed compact termination projection", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario);
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.termination.interceptRadiusM += 100;
  const projected = scenario.modelPack.weaponTerminations.find(
    (candidate) => candidate.modelId === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(projected);
  projected.termination.interceptRadiusM = weapon.weapon.termination.interceptRadiusM;
  const material = structuredClone(scenario.modelPack);
  delete material.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest(material);

  const result = runRawRustWasm(scenario);
  assert.equal(result.accepted, false);
  assert.match(result.output, /retained compiler-owned pack/);
});

test("direct Rust/WASM cannot relabel a resealed termination projection as engine verification", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario);
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.termination.interceptRadiusM += 100;
  const projected = scenario.modelPack.weaponTerminations.find(
    (candidate) => candidate.modelId === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(projected);
  projected.termination.interceptRadiusM = weapon.weapon.termination.interceptRadiusM;
  scenario.modelPack.intendedUse = {
    id: "vector.intended-use.engine-verification",
    version: "1.0.0",
  };
  const material = structuredClone(scenario.modelPack);
  delete material.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest(material);

  const result = runRawRustWasm(scenario);
  assert.equal(result.accepted, false);
  assert.match(result.output, /complete authenticated compiled model pack/);
});

test("direct Rust/WASM rejects malformed termination patches before consuming overrides", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  for (const mutation of ["target", "old-value", "unit", "evidence"]) {
    const scenario = structuredClone(baseline);
    const weapon = scenario.entities.find((entity) => entity.weapon);
    assert.ok(weapon?.weapon);
    governWeaponTermination(scenario, weapon, { interceptRadiusM: 50 });
    const patch = scenario.modelPack.scenarioPatches[0];
    if (mutation === "target") patch.fieldPath = "/termination/notGoverned";
    if (mutation === "old-value") patch.oldValue = 24;
    if (mutation === "unit") patch.unit = "s";
    if (mutation === "evidence") patch.provenance.evidenceRefIds = ["outside-pack"];
    const projection = structuredClone(scenario.modelPack);
    delete projection.runtimeDigest;
    scenario.modelPack = bindRuntimeModelPackDigest(projection);

    const result = runRawRustWasm(scenario);
    assert.equal(result.accepted, false, mutation);
    assert.match(result.output, /weapon termination patch/, mutation);
  }
});

test("both engines require a runtime digest for retained weapon-termination authority", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  for (const backend of ["typescript", "rust-wasm"]) {
    const scenario = structuredClone(baseline);
    delete scenario.modelPack.runtimeDigest;
    assert.throws(
      () => runEngineBackend(scenario, backend),
      /runtime model-pack projection digest/,
      backend,
    );
  }
});

test("both live engines require a retained pack for entity weapon-termination authority", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const unrelatedRetainedPack = resolveRetainedCompiledModelPack(baseline.modelPack);
  for (const backend of ["typescript", "rust-wasm"]) {
    for (const projectionState of ["RESEALED", "OMITTED"]) {
      const scenario = structuredClone(baseline);
      scenario.modelPack.id = "unretained-termination-pack";
      scenario.modelPack.version = "99.0.0";
      scenario.modelPack.digest = "7".repeat(64);
      if (projectionState === "OMITTED") {
        scenario.modelPack.weaponTerminations = [];
        scenario.modelPack.scenarioPatches = [];
        delete scenario.modelPack.runtimeDigest;
      } else {
        const material = structuredClone(scenario.modelPack);
        delete material.runtimeDigest;
        scenario.modelPack = bindRuntimeModelPackDigest(material);
      }
      assert.throws(
        () => runEngineBackend(scenario, backend),
        /No retained compiled model pack matches weapon-termination authority/,
        `${backend} ${projectionState}`,
      );
    }
    const mismatchedVerificationScenario = structuredClone(baseline);
    mismatchedVerificationScenario.modelPack.id = "unretained-termination-pack";
    mismatchedVerificationScenario.modelPack.intendedUse = {
      id: "vector.intended-use.engine-verification",
      version: "1.0.0",
    };
    assert.throws(
      () => runEngineBackend(mismatchedVerificationScenario, backend, unrelatedRetainedPack),
      /Supplied engine-verification compiled model pack does not match the exact scenario identity/,
      `${backend} mismatched supplied pack`,
    );
  }
});

test("both live engines reject retained packs that predate weapon-termination authority", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const historicalPack = historicalModelPackBundle.pack;
  for (const backend of ["typescript", "rust-wasm"]) {
    const scenario = structuredClone(baseline);
    const projection = structuredClone(scenario.modelPack);
    projection.id = historicalPack.id;
    projection.version = historicalPack.version;
    projection.digest = historicalPack.digest;
    projection.intendedUse = { ...historicalPack.intendedUses[0] };
    projection.weaponTerminations = [];
    projection.scenarioPatches = [];
    delete projection.runtimeDigest;
    scenario.modelPack = bindRuntimeModelPackDigest(projection);
    for (const entity of scenario.entities) {
      entity.provenance.modelPackDigest = historicalPack.digest;
      if (entity.weapon) entity.weapon.admission.modelPackDigest = historicalPack.digest;
    }
    assert.throws(
      () => runEngineBackend(scenario, backend),
      /retained compiled model pack .* contains no weapon-termination authority/,
      backend,
    );
  }
});

test("both live engines authenticate supplied verification-pack content", async () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const binding = await bindVerificationTrackModelPack(baseline);
  for (const backend of ["typescript", "rust-wasm"]) {
    assert.doesNotThrow(
      () => runEngineBackend(structuredClone(binding.scenario), backend, binding.pack),
      `${backend} must accept the complete digest-authenticated verification pack`,
    );
  }
  const forgedPack = structuredClone(binding.pack);
  const forgedWeapon = forgedPack.weapons.find((weapon) => weapon.termination);
  assert.ok(forgedWeapon?.termination);
  forgedWeapon.termination.interceptRadiusM += 100;

  const forgedScenario = structuredClone(binding.scenario);
  const projection = structuredClone(forgedScenario.modelPack);
  delete projection.runtimeDigest;
  forgedScenario.modelPack = bindRuntimeModelPackDigest({
    ...projection,
    weaponTerminations: runtimeWeaponTerminations(forgedPack, []),
  });
  for (const entity of forgedScenario.entities) {
    if (entity.weapon?.admission.weaponModelId === forgedWeapon.id) {
      entity.weapon.termination.interceptRadiusM = forgedWeapon.termination.interceptRadiusM;
    }
  }

  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(
      () => runEngineBackend(structuredClone(forgedScenario), backend, forgedPack),
      /verification compiled model pack digest does not match its canonical content/i,
      backend,
    );
  }
});

test("both live engines reject duplicate verification termination patches", async () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const binding = await bindVerificationTrackModelPack(baseline);
  const scenario = structuredClone(binding.scenario);
  const weapon = scenario.entities.find((entity) => entity.weapon)?.weapon;
  assert.ok(weapon);
  const compiledWeapon = binding.pack.weapons.find(
    (candidate) => candidate.id === weapon.admission.weaponModelId,
  );
  assert.ok(compiledWeapon?.termination);
  const patch = {
    schemaVersion: "vector.model-patch.v1",
    id: "verification-intercept-radius-primary",
    modelPackDigest: binding.pack.digest,
    modelId: compiledWeapon.id,
    fieldPath: "/termination/interceptRadiusM",
    oldValue: compiledWeapon.termination.interceptRadiusM,
    newValue: 50,
    unit: "m",
    reason: "Duplicate-key cross-backend rejection fixture",
    provenance: {
      authorId: "vector-test-suite",
      authoredAt: "2026-08-28T00:00:00.000Z",
      evidenceRefIds: [compiledWeapon.evidenceRefIds[0]],
    },
  };
  const duplicate = {
    ...structuredClone(patch),
    id: "verification-intercept-radius-contradiction",
    newValue: 60,
  };
  weapon.termination.interceptRadiusM = patch.newValue;
  const projection = structuredClone(scenario.modelPack);
  delete projection.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest({
    ...projection,
    weaponTerminations: runtimeWeaponTerminations(binding.pack, [patch]),
    scenarioPatches: [patch, duplicate],
  });

  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(
      () => runEngineBackend(structuredClone(scenario), backend, binding.pack),
      /duplicate weapon termination patch/i,
      backend,
    );
  }
});

test("supplied authority rejects digest-valid malformed verification-pack structure at each consuming boundary", async () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const binding = await bindVerificationTrackModelPack(baseline);

  for (const {
    id: mutation,
    typescriptPattern,
    rustPattern,
  } of [
    {
      id: "extra-top-level-key",
      typescriptPattern: /must use the exact compiled-v1 key set/i,
      rustPattern: /complete exact-key compiled model pack/i,
    },
    {
      id: "duplicate-weapon-id",
      typescriptPattern: /has duplicate weapon ID/i,
      rustPattern: /duplicates an earlier weapon/i,
    },
    {
      id: "duplicate-intended-use-id",
      typescriptPattern: /has duplicate intended-use ID/i,
      rustPattern: /duplicates an earlier intended use/i,
    },
    {
      id: "string-launch-mass",
      typescriptPattern: /weapons\[0\].launchMassKg is structurally invalid/i,
      rustPattern: /pack\.weapons\[0\]\.launchMassKg must be finite/i,
    },
    {
      id: "non-semver-weapon-version",
      typescriptPattern: /weapons\[0\].version is structurally invalid/i,
      rustPattern: /pack\.weapons\[0\]\.version must be semantic version/i,
    },
    {
      id: "incomplete-evidence-record",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "unsupported-evidence-kind",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "invalid-evidence-digest",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "duplicate-evidence-id",
      typescriptPattern: /has duplicate evidence ID/i,
      rustPattern: null,
    },
    {
      id: "extra-evidence-field",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "relative-evidence-uri",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "invalid-evidence-access-date",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
    {
      id: "blank-evidence-locator",
      typescriptPattern: /evidence\[0\] is structurally invalid/i,
      rustPattern: null,
    },
  ]) {
    const pack = structuredClone(binding.pack);
    if (mutation === "extra-top-level-key") pack.unadmittedAuthority = true;
    if (mutation === "duplicate-weapon-id") {
      pack.weapons.push(structuredClone(pack.weapons[0]));
    }
    if (mutation === "duplicate-intended-use-id") {
      const intendedUse = pack.intendedUses.find(
        (item) => item.id === "vector.intended-use.engine-verification",
      );
      assert.ok(intendedUse);
      pack.intendedUses.unshift({ ...structuredClone(intendedUse), version: "0.0.0" });
    }
    if (mutation === "string-launch-mass") pack.weapons[0].launchMassKg = "170";
    if (mutation === "non-semver-weapon-version") pack.weapons[0].version = "v1";
    if (mutation === "incomplete-evidence-record") {
      pack.evidence[0] = { id: pack.evidence[0].id };
    }
    if (mutation === "unsupported-evidence-kind") pack.evidence[0].kind = "CONTEXT";
    if (mutation === "invalid-evidence-digest") pack.evidence[0].contentSha256 = "bad";
    if (mutation === "duplicate-evidence-id") {
      pack.evidence.push(structuredClone(pack.evidence[0]));
    }
    if (mutation === "extra-evidence-field") pack.evidence[0].unqualified = true;
    if (mutation === "relative-evidence-uri") pack.evidence[0].uri = "relative/path";
    if (mutation === "invalid-evidence-access-date") pack.evidence[0].accessedAt = "2026-02-31";
    if (mutation === "blank-evidence-locator") pack.evidence[0].locator = " ";
    resealCompiledPack(pack);
    const scenario = structuredClone(binding.scenario);
    const projection = structuredClone(scenario.modelPack);
    projection.digest = pack.digest;
    projection.weaponTerminations = runtimeWeaponTerminations(pack, []);
    delete projection.runtimeDigest;
    scenario.modelPack = bindRuntimeModelPackDigest(projection);
    for (const entity of scenario.entities) {
      entity.provenance.modelPackDigest = pack.digest;
      if (
        mutation === "non-semver-weapon-version" &&
        entity.provenance.modelId === pack.weapons[0].id
      ) {
        entity.provenance.modelVersion = pack.weapons[0].version;
      }
      if (entity.observerSensor) entity.observerSensor.modelPackDigest = pack.digest;
      if (entity.weapon) entity.weapon.admission.modelPackDigest = pack.digest;
    }

    assert.throws(
      () => runEngineBackend(structuredClone(scenario), "typescript", pack),
      typescriptPattern,
      `typescript ${mutation}`,
    );
    if (rustPattern) {
      const rust = runRawRustWasm({
        schemaVersion: "vector.engine-run-request.v1",
        scenario,
        verificationModelPack: pack,
      });
      assert.equal(rust.accepted, false, `raw rust-wasm ${mutation}`);
      assert.match(rust.output, rustPattern, `raw rust-wasm ${mutation}`);
    }
  }
});

test("supplied-pack authority validates the complete loadout and compatibility graph", async () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const binding = await bindVerificationTrackModelPack(baseline);
  const verificationUse = binding.pack.intendedUses.find(
    (item) => item.id === "vector.intended-use.engine-verification",
  );
  assert.ok(verificationUse);
  const firstStation = (pack) => {
    const station = pack.loadouts.find((item) => item.stations.length)?.stations[0];
    assert.ok(station);
    return station;
  };

  for (const { label, mutate, pattern } of [
    {
      label: "station exact fields",
      mutate: (pack) => { firstStation(pack).invented = true; },
      pattern: /loadouts\[\d+\]\.stations\[0\]\.fields is structurally invalid/i,
    },
    {
      label: "station finite position",
      mutate: (pack) => { firstStation(pack).positionBodyM.x = "0"; },
      pattern: /loadouts\[\d+\]\.stations\[0\]\.positionBodyM is structurally invalid/i,
    },
    {
      label: "station integer capacity",
      mutate: (pack) => { firstStation(pack).maximumQuantity = "bad"; },
      pattern: /loadouts\[\d+\]\.stations\[0\]\.maximumQuantity is structurally invalid/i,
    },
    {
      label: "station weapon reference",
      mutate: (pack) => { firstStation(pack).compatibleStoreModelIndexes = [pack.weapons.length]; },
      pattern: /loadouts\[\d+\]\.stations\[0\]\.compatibleStoreModelIndexes is structurally invalid/i,
    },
    {
      label: "compatibility evidence reference",
      mutate: (pack) => { pack.compatibility[0].evidenceRefIds = ["missing-evidence"]; },
      pattern: /compatibility\[0\]\.evidenceRefIds is structurally invalid/i,
    },
    {
      label: "compatibility loadout reference",
      mutate: (pack) => { pack.compatibility[0].loadoutModelIndex = pack.loadouts.length; },
      pattern: /compatibility\[0\]\.loadoutModelIndex is structurally invalid/i,
    },
    {
      label: "compatibility capacity relation",
      mutate: (pack) => {
        const rule = pack.compatibility[0];
        const station = pack.loadouts[rule.loadoutModelIndex].stations.find(
          (item) => item.stationGroup === rule.stationGroup,
        );
        assert.ok(station);
        rule.maximumQuantity = station.maximumQuantity + 1;
      },
      pattern: /compatibility\[0\]\.maximumQuantity is structurally invalid/i,
    },
    {
      label: "loadout validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const loadout = pack.loadouts[aircraft.loadoutModelIndex];
        loadout.validityDomain.altitudeM.minimum =
          aircraft.validityDomain.altitudeM.minimum + 1;
      },
      pattern: /aircraft\[0\]\.loadoutModel\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "aerodynamic validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.validityDomain.mach.maximum = aircraft.validityDomain.mach.maximum - 0.01;
      },
      pattern: /aircraft\[0\]\.aerodynamicModel\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "aerodynamic model retains at least one coefficient table",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables = [];
      },
      pattern: /aerodynamics\[0\]\.coefficientTables is structurally invalid/i,
    },
    {
      label: "aerodynamic table exact fields",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0] = {
          validityDomain: structuredClone(aerodynamic.coefficientTables[0].validityDomain),
        };
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.fields is structurally invalid/i,
    },
    {
      label: "aerodynamic table axis unit",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].axes[0].unit = "m";
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.axes\[0\]\.unit is structurally invalid/i,
    },
    {
      label: "aerodynamic table strictly increasing axis",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].axes[0].values = [1, 1];
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.axes\[0\]\.values is structurally invalid/i,
    },
    {
      label: "aerodynamic table tensor shape",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].values = [0.1];
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.values is structurally invalid/i,
    },
    {
      label: "aerodynamic table finite values",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].values[0] = Number.NaN;
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.values is structurally invalid/i,
    },
    {
      label: "aerodynamic table evidence reference",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].evidenceRefIds = ["missing-evidence"];
      },
      pattern: /aerodynamics\[0\]\.coefficientTables\[0\]\.evidenceRefIds is structurally invalid/i,
    },
    {
      label: "aerodynamic table validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const aerodynamic = pack.aerodynamics[aircraft.aerodynamicModelIndex];
        aerodynamic.coefficientTables[0].validityDomain.mach.maximum =
          aircraft.validityDomain.mach.maximum - 0.01;
      },
      pattern: /aircraft\[0\]\.aerodynamicModel\.coefficientTables\[0\]\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "propulsion validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const propulsion = pack.propulsion[aircraft.propulsionModelIndexes[0]];
        propulsion.validityDomain.altitudeM.maximum =
          aircraft.validityDomain.altitudeM.maximum - 1;
      },
      pattern: /aircraft\[0\]\.propulsionModels\[0\]\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "propulsion exact fields",
      mutate: (pack) => { pack.propulsion[0].invented = true; },
      pattern: /propulsion\[0\]\.fields is structurally invalid/i,
    },
    {
      label: "propulsion thrust output unit",
      mutate: (pack) => { pack.propulsion[0].thrustTable.outputUnit = "1"; },
      pattern: /propulsion\[0\]\.thrustTable\.outputUnit is structurally invalid/i,
    },
    {
      label: "thrust-table validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const propulsion = pack.propulsion[aircraft.propulsionModelIndexes[0]];
        propulsion.thrustTable.validityDomain.altitudeM.maximum =
          aircraft.validityDomain.altitudeM.maximum - 1;
      },
      pattern: /aircraft\[0\]\.propulsionModels\[0\]\.thrustTable\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "fuel-flow-table validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft[0];
        const propulsion = pack.propulsion[aircraft.propulsionModelIndexes[0]];
        propulsion.fuelFlowTable.validityDomain.configurations = ["UNSUPPORTED_CONFIGURATION"];
      },
      pattern: /aircraft\[0\]\.propulsionModels\[0\]\.fuelFlowTable\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "sensor validity covers aircraft domain",
      mutate: (pack) => {
        const aircraft = pack.aircraft.find((item) => item.sensorModelIndexes.length > 0);
        assert.ok(aircraft, "the fixture requires an aircraft sensor dependency");
        const sensor = pack.sensors[aircraft.sensorModelIndexes[0]];
        sensor.validityDomain.environments = ["UNSUPPORTED_ENVIRONMENT"];
      },
      pattern: /aircraft\[\d+\]\.sensorModels\[0\]\.validityDomain does not cover its admitted aircraft validity domain/i,
    },
    {
      label: "sensor exact fields",
      mutate: (pack) => { pack.sensors[0].invented = true; },
      pattern: /sensors\[0\]\.fields is structurally invalid/i,
    },
    {
      label: "sensor finite scan period",
      mutate: (pack) => { pack.sensors[0].scanPeriodS = Number.NaN; },
      pattern: /sensors\[0\]\.scanPeriodS is structurally invalid/i,
    },
    {
      label: "verification track model numeric domain",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.verificationTrackModel);
        assert.ok(sensor, "the fixture requires verification track authority");
        sensor.verificationTrackModel.confirmationObservations = 1;
      },
      pattern: /sensors\[\d+\]\.verificationTrackModel is structurally invalid/i,
    },
    {
      label: "positive sensor evidence coverage",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.evidenceAdmission);
        assert.ok(sensor, "the fixture requires positive sensor evidence admission");
        sensor.evidenceAdmission.coverage.detectionRange = "UNKNOWN";
      },
      pattern: /sensors\[\d+\]\.evidenceAdmission\.coverage is structurally invalid/i,
    },
    {
      label: "positive sensor source evidence role",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.evidenceAdmission);
        assert.ok(sensor, "the fixture requires positive sensor evidence admission");
        const sourceId = sensor.evidenceAdmission.sourceEvidenceRefIds[0];
        const evidence = pack.evidence.find((item) => item.id === sourceId);
        assert.ok(evidence, "the fixture requires admitted source evidence");
        evidence.kind = "ASSUMPTION";
      },
      pattern: /sensors\[\d+\]\.evidenceAdmission is structurally invalid/i,
    },
    {
      label: "positive sensor validation evidence digest",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.evidenceAdmission);
        assert.ok(sensor, "the fixture requires positive sensor evidence admission");
        const validationId = sensor.evidenceAdmission.validationEvidenceRefIds[0];
        const evidence = pack.evidence.find((item) => item.id === validationId);
        assert.ok(evidence, "the fixture requires admitted validation evidence");
        delete evidence.contentSha256;
      },
      pattern: /sensors\[\d+\]\.evidenceAdmission is structurally invalid/i,
    },
  ]) {
    const pack = structuredClone(binding.pack);
    mutate(pack);
    resealCompiledPack(pack);
    assert.throws(
      () => findEngineCompiledModelPackAuthority({
        id: pack.id,
        version: pack.version,
        digest: pack.digest,
        intendedUse: {
          id: verificationUse.id,
          version: verificationUse.version,
        },
      }, pack),
      pattern,
      label,
    );
  }

  const packWithUnusedStation = structuredClone(binding.pack);
  const loadout = packWithUnusedStation.loadouts[0];
  loadout.stations.push({
    id: "unused-auxiliary-station",
    stationGroup: "UNUSED_AUXILIARY",
    positionBodyM: { x: 0, y: 0, z: 0 },
    maximumQuantity: 1,
    compatibleStoreModelIndexes: [],
  });
  resealCompiledPack(packWithUnusedStation);
  assert.doesNotThrow(
    () => findEngineCompiledModelPackAuthority({
      id: packWithUnusedStation.id,
      version: packWithUnusedStation.version,
      digest: packWithUnusedStation.digest,
      intendedUse: {
        id: verificationUse.id,
        version: verificationUse.version,
      },
    }, packWithUnusedStation),
    "unused stations may declare no compatible stores",
  );
});

test("both live engines reject positive sensor evidence authority drift", async () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const binding = await bindVerificationTrackModelPack(baseline);

  for (const { label, mutate } of [
    {
      label: "source evidence relabelled as an assumption",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.evidenceAdmission);
        assert.ok(sensor, "the fixture requires positive sensor evidence admission");
        const sourceId = sensor.evidenceAdmission.sourceEvidenceRefIds[0];
        const evidence = pack.evidence.find((item) => item.id === sourceId);
        assert.ok(evidence, "the fixture requires admitted source evidence");
        evidence.kind = "ASSUMPTION";
      },
    },
    {
      label: "validation evidence loses its immutable digest",
      mutate: (pack) => {
        const sensor = pack.sensors.find((item) => item.evidenceAdmission);
        assert.ok(sensor, "the fixture requires positive sensor evidence admission");
        const validationId = sensor.evidenceAdmission.validationEvidenceRefIds[0];
        const evidence = pack.evidence.find((item) => item.id === validationId);
        assert.ok(evidence, "the fixture requires admitted validation evidence");
        delete evidence.contentSha256;
      },
    },
  ]) {
    const pack = structuredClone(binding.pack);
    mutate(pack);
    resealCompiledPack(pack);
    const scenario = structuredClone(binding.scenario);
    const projection = structuredClone(scenario.modelPack);
    projection.digest = pack.digest;
    projection.weaponTerminations = runtimeWeaponTerminations(pack, []);
    delete projection.runtimeDigest;
    scenario.modelPack = bindRuntimeModelPackDigest(projection);
    for (const entity of scenario.entities) {
      entity.provenance.modelPackDigest = pack.digest;
      if (entity.observerSensor) entity.observerSensor.modelPackDigest = pack.digest;
      if (entity.weapon) entity.weapon.admission.modelPackDigest = pack.digest;
    }

    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend, pack),
        /sensors\[\d+\]\.evidenceAdmission is structurally invalid/i,
        `${backend}: ${label}`,
      );
    }

    const rust = runRawRustWasm({
      schemaVersion: "vector.engine-run-request.v1",
      scenario,
      verificationModelPack: pack,
    });
    assert.equal(rust.accepted, false, `raw rust-wasm: ${label}`);
    assert.match(
      rust.output,
      /sensor evidence/i,
      `raw rust-wasm: ${label}`,
    );
  }
});

test("both engines reject a second scheduled guided release before integration", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const unlaunchedWeapon = baseline.entities.find(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === null,
  );
  assert.ok(unlaunchedWeapon?.weapon, "fixture requires a carried second weapon");
  unlaunchedWeapon.weapon.launchTimeSeconds = 0.1;

  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(
      () => runEngineBackend(structuredClone(baseline), backend),
      /at most one scheduled guided release/i,
      backend,
    );
  }
});

test("both engines require a scheduled guided weapon to begin stowed", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0].scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const scheduledWeapon = scenario.entities.find(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
  );
  assert.ok(scheduledWeapon?.weapon, "fixture requires a scheduled guided weapon");
  scheduledWeapon.lifecycle = "ACTIVE";

  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(
      () => runEngineBackend(structuredClone(scenario), backend),
      /scheduled guided weapon.*must begin STOWED/i,
      backend,
    );
  }
});

test("both engines count only guided entities toward the scheduled-release limit", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const baseline = simulateWithCapabilitiesForVerification(
    SCENARIO_LIBRARY[0].scenario,
    capabilities,
  ).engineRun.scenario;
  const nonGuidedWeapon = baseline.entities.find(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === null,
  );
  assert.ok(nonGuidedWeapon?.weapon, "fixture requires a carried second weapon");
  nonGuidedWeapon.kind = "FIXED_OBJECTIVE";
  nonGuidedWeapon.tacticalRole = "FIXED_OBJECTIVE";
  nonGuidedWeapon.weapon.launchTimeSeconds = 0.1;

  for (const backend of ["typescript", "rust-wasm"]) {
    assert.doesNotThrow(
      () => runEngineBackend(structuredClone(baseline), backend),
      backend,
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
