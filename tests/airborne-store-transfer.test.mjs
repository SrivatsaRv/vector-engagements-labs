import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2,
  authorGenericAirborneStoreTransfer,
  createDefaultAirMissionDefinition,
  synchronizeScenarioAirMission,
} from "../lib/air-mission.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import { runEngineBackend } from "../lib/engine/backend.ts";
import { VECTOR_ENGINE_WASM_BASE64 } from "../lib/engine/generated/vector-engine-wasm.ts";
import { buildLaunchFeatures } from "../lib/map-layer-contracts.ts";
import { selectAirborneStoreTransferOutcomes } from "../lib/frontend/selectors.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { adaptPreparedSimulation, admitRuntimeModelPack } from "../lib/runtime/model-pack-adapter.ts";
import { createEnvironmentSampler } from "../lib/geospatial/environment-pack.ts";
import { createDefaultSpatialPlan } from "../lib/scenario-spatial.ts";
import { buildSimulationResult, DEFAULT_SCENARIO, prepareSimulation } from "../lib/simulation.ts";
import { getStudyArea } from "../lib/study-areas.ts";
import {
  GENERIC_AIRBORNE_STORE_TRANSFER_PERFORMANCE_PROFILE,
  createGenericAirborneStoreTransferScenario,
} from "../lib/validation/generic-airborne-store-transfer.ts";
import {
  createGenericTakeoffPerformanceScenario,
} from "../lib/validation/generic-takeoff-performance.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../lib/engine/weapon-admission.ts";

const sha256 = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");

function resealStoreTransferAuthority(mission) {
  mission.assignment.storeTransferAuthorityDigest = sha256({
    schemaVersion: "vector.airborne-store-transfer-authority.v1",
    aircraftSourceObjectId: mission.assignment.aircraftId,
    authoredDigest: mission.authoredDigest,
    transferDigests: mission.assignment.storeTransfers.map((transfer) => transfer.digest),
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

function assertParity(actual, expected, path = "root") {
  if (typeof actual === "number" && typeof expected === "number") {
    const tolerance = Math.max(1e-9, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-12);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} != ${expected}`);
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && Array.isArray(expected), `${path}: array mismatch`);
    assert.equal(actual.length, expected.length, `${path}: length`);
    actual.forEach((value, index) => assertParity(value, expected[index], `${path}[${index}]`));
    return;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys`);
    for (const key of Object.keys(actual)) assertParity(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, path);
}

function groundScenario() {
  const scenario = createGenericAirborneStoreTransferScenario();
  const prepared = prepareSimulation(scenario).engineScenario;
  prepared.durationSeconds = 21;
  return prepared;
}

function twoStoreGroundScenario() {
  const scenario = createGenericAirborneStoreTransferScenario();
  scenario.airMission = authorGenericAirborneStoreTransfer({
    mission: scenario.airMission,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    storeOrdinal: 2,
    operation: "JETTISON",
    requestedTimeSeconds: 20.05,
    installedDragAreaM2: 0.06,
  });
  const prepared = prepareSimulation(scenario).engineScenario;
  prepared.durationSeconds = 21;
  return prepared;
}

function airborneScenario(operation = "RELEASE", options = {}) {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  scenario.blueWeaponQuantity = options.quantity ?? scenario.blueWeaponQuantity;
  scenario.wind = options.windEastMps ?? scenario.wind;
  const area = getStudyArea(scenario.studyAreaId);
  scenario.spatialPlan = createDefaultSpatialPlan({
    studyArea: area,
    rangeM: scenario.range,
    blueAltitudeM: scenario.altitude,
    redAltitudeM: scenario.altitude + scenario.targetDelta,
    blueSpeedMps: scenario.launcherSpeed,
    redSpeedMps: scenario.targetSpeed,
    crossingAngleDeg: scenario.aspect,
  });
  scenario.airMission = createDefaultAirMissionDefinition({
    scenario,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
  });
  scenario.airMission = authorGenericAirborneStoreTransfer({
    mission: scenario.airMission,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    storeOrdinal: options.storeOrdinal ?? 1,
    operation,
    requestedTimeSeconds: options.requestedTimeSeconds ?? 0,
    installedDragAreaM2: options.installedDragAreaM2 ?? 0.08,
  });
  const prepared = prepareSimulation(scenario).engineScenario;
  prepared.durationSeconds = options.durationSeconds ?? 1;
  return prepared;
}

function transferEvent(run) {
  return run.events.items.find((event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME");
}

function installedStoreDragWorkBeforeTransfer(run, scenario, event) {
  const sampler = createEnvironmentSampler(scenario.geospatial.environmentPack);
  return run.frames.slice(0, event.frameIndex).reduce((workJoules, frame) => {
    const launcher = frame.entities.find((entity) => entity.id === event.payload.launcherId);
    assert.ok(launcher, `launcher retained at frame ${frame.t}`);
    const sample = sampler.sample({
      eastM: launcher.position.x,
      northM: launcher.position.y,
      upM: launcher.position.z,
      modelTimeSeconds: frame.t,
    });
    const wind = scenario.events.reduce((current, authoredEvent) => (
      authoredEvent.type === "WIND_SHIFT"
      && frame.t >= authoredEvent.startSeconds
      && frame.t < authoredEvent.startSeconds + authoredEvent.durationSeconds
        ? {
            x: current.x + authoredEvent.vectorMps.x,
            y: current.y + authoredEvent.vectorMps.y,
            z: current.z + authoredEvent.vectorMps.z,
          }
        : current
    ), sample.windEnuMps);
    const airspeed = Math.hypot(
      launcher.velocity.x - wind.x,
      launcher.velocity.y - wind.y,
      launcher.velocity.z - wind.z,
    );
    const installedDragNewtons = 0.5 * sample.atmosphere.densityKgM3
      * airspeed ** 2 * event.payload.installedDragAreaM2;
    return workJoules + installedDragNewtons * airspeed * scenario.fixedStepSeconds;
  }, 0);
}

function jointlyResealTransfer(scenario, mutate) {
  const request = scenario.airMission.authored.assignments[0].storeTransferPlan.requests[0];
  const full = scenario.airMission.assignment.storeTransfers[0];
  const compact = scenario.entities
    .find((entity) => entity.id === full.storeEntityId)?.weapon.storeTransfer
    ?? scenario.entities.find((entity) => entity.id === "blue-weapon-1").weapon.storeTransfer;
  mutate({ request, full, compact });
  scenario.airMission.authoredDigest = sha256(scenario.airMission.authored);
  const material = structuredClone(full);
  delete material.digest;
  full.digest = sha256(material);
  Object.assign(compact, structuredClone(full));
  resealStoreTransferAuthority(scenario.airMission);
  return scenario;
}

test("ordinary scenario synchronization preserves authored store-transfer intent", () => {
  const predecessor = createGenericTakeoffPerformanceScenario();
  assert.equal(predecessor.airMission.assignments[0].storeTransferPlan, undefined);
  assert.deepEqual(GENERIC_AIRBORNE_STORE_TRANSFER_PERFORMANCE_PROFILE, {
    schemaVersion: "vector.generic-airborne-store-transfer-performance-profile.v1",
    id: "generic-runway-takeoff-airborne-transfer-25s.v1",
    durationSeconds: 25,
    warmupRunsPerBackend: 3,
    measuredRunsPerBackend: 20,
    percentile: 0.95,
    maximumP95Ms: 100,
    maximumFramesPerRun: 150,
    maximumOptimizedWasmBytes: 550_000,
    backends: ["typescript", "rust-wasm"],
  });
  const scenario = createGenericAirborneStoreTransferScenario();
  const request = structuredClone(
    scenario.airMission.assignments[0].storeTransferPlan.requests[0],
  );
  const synchronized = synchronizeScenarioAirMission({
    ...scenario,
    launcherSpeed: scenario.launcherSpeed + 5,
  }, CURRENT_COMPILED_MODEL_PACK);
  assert.deepEqual(
    synchronized.airMission.assignments[0].storeTransferPlan.requests[0],
    request,
  );
});

test("authored governed transfer is exact, causal, independently balanced, and TS/Rust identical", () => {
  const scenario = groundScenario();
  const runs = ["typescript", "rust-wasm"].map((backend) =>
    runEngineBackend(structuredClone(scenario), backend));
  const [typescript, rust] = runs;
  const tsEvent = transferEvent(typescript);
  const rustEvent = transferEvent(rust);
  assert.ok(tsEvent && rustEvent);
  assertParity(rustEvent, tsEvent, "transfer event");
  assert.equal(tsEvent.tick, 400);
  assert.equal(tsEvent.payload.requestedTick, 400);
  assert.deepEqual(
    [tsEvent.payload.requested, tsEvent.payload.accepted, tsEvent.payload.achieved],
    [true, true, true],
  );
  assert.equal(tsEvent.payload.limiter, "NONE");
  assert.equal(tsEvent.payload.cause, "AIRBORNE_TRANSFER_ADMITTED");

  for (const run of runs) {
    const event = transferEvent(run);
    const frame = run.frames[event.frameIndex];
    const launcher = frame.entities.find((entity) => entity.id === event.payload.launcherId);
    const store = frame.entities.find((entity) => entity.id === event.payload.storeId);
    const aircraft = scenario.entities.find((entity) => entity.id === launcher.id);
    assert.equal(launcher.aircraftOperationalState, "ENROUTE");
    assert.equal(store.lifecycle, "ACTIVE");
    assert.deepEqual(store.position, launcher.position);
    assert.deepEqual(store.velocity, launcher.velocity);
    assert.equal(launcher.installedStoreIds.includes(store.id), false);
    assert.equal(event.payload.launcherMassBeforeKg - event.payload.launcherMassAfterKg, store.massKg);
    assert.equal(event.payload.launcherMassAfterKg, launcher.massKg);
    assert.equal(event.payload.launcherFuelBeforeKg, event.payload.launcherFuelAfterKg);
    assert.equal(event.payload.launcherFuelAfterKg, launcher.fuelKg);
    assert.ok(Math.abs(
      event.payload.installedDragAreaBeforeM2
        - event.payload.installedDragAreaAfterM2
        - event.payload.installedDragAreaM2,
    ) < 1e-12);
    assert.ok(Math.abs(
      launcher.massKg - (aircraft.aircraft.emptyMassKg + launcher.fuelKg + launcher.storeMassKg),
    ) < 1e-9);

    const velocitySquared = launcher.velocity.x ** 2 + launcher.velocity.y ** 2 + launcher.velocity.z ** 2;
    const momentumBefore = event.payload.launcherMassBeforeKg * Math.sqrt(velocitySquared);
    const momentumAfter = launcher.massKg * Math.sqrt(velocitySquared)
      + store.massKg * Math.sqrt(velocitySquared);
    const energyBefore = 0.5 * event.payload.launcherMassBeforeKg * velocitySquared;
    const energyAfter = 0.5 * launcher.massKg * velocitySquared + 0.5 * store.massKg * velocitySquared;
    assert.ok(Math.abs(momentumBefore - momentumAfter) < 1e-9);
    assert.ok(Math.abs(energyBefore - energyAfter) < 1e-6);

    const sampler = createEnvironmentSampler(scenario.geospatial.environmentPack);
    const environment = sampler.sample({
      eastM: launcher.position.x,
      northM: launcher.position.y,
      upM: launcher.position.z,
      modelTimeSeconds: event.modelTimeSeconds,
    });
    const wind = {
      x: environment.windEnuMps.x,
      y: environment.windEnuMps.y,
      z: environment.windEnuMps.z,
    };
    const airspeed = Math.hypot(
      launcher.velocity.x - wind.x,
      launcher.velocity.y - wind.y,
      launcher.velocity.z - wind.z,
    );
    const expectedInstalledDrag = 0.5 * environment.atmosphere.densityKgM3
      * airspeed ** 2 * event.payload.installedDragAreaM2;
    assert.ok(Math.abs(event.payload.installedDragNewtons - expectedInstalledDrag) < 1e-8);
  }
});

test("two authored stores transfer exactly once in integer-tick order", () => {
  for (const backend of ["typescript", "rust-wasm"]) {
    const scenario = twoStoreGroundScenario();
    const run = runEngineBackend(structuredClone(scenario), backend);
    const transfers = run.events.items.filter(
      (event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME",
    );
    assert.deepEqual(transfers.map((event) => event.tick), [400, 401], backend);
    assert.deepEqual(
      transfers.map((event) => [event.payload.storeId, event.payload.operation]),
      [["blue-weapon-1", "RELEASE"], ["blue-weapon-2", "JETTISON"]],
      backend,
    );
    assert.equal(new Set(transfers.map((event) => event.payload.transferId)).size, 2);
    for (const event of transfers) {
      assert.equal(event.payload.launcherMassBeforeKg - event.payload.launcherMassAfterKg, event.payload.storeMassKg);
      assert.equal(event.payload.launcherFuelBeforeKg, event.payload.launcherFuelAfterKg);
    }
    const finalLauncher = run.frames.at(-1).entities.find((entity) => entity.id === "blue-platform-1");
    const aircraft = scenario.entities.find((entity) => entity.id === "blue-platform-1");
    assert.deepEqual(finalLauncher.installedStoreIds, []);
    assert.ok(Math.abs(
      finalLauncher.massKg - (aircraft.aircraft.emptyMassKg + finalLauncher.fuelKg),
    ) < 1e-9);
  }
});

test("direct raw WASM rejects a digest-valid compact forgery beside unchanged full authority", () => {
  const scenario = groundScenario();
  const forged = structuredClone(scenario);
  const store = forged.entities.find((entity) => entity.id === "blue-weapon-1");
  const compact = store.weapon.storeTransfer;
  compact.stationId = "caller-resealed-station";
  const material = structuredClone(compact);
  delete material.missionDigest;
  delete material.digest;
  compact.digest = sha256(material);
  assert.throws(
    () => runEngineBackend(structuredClone(forged), "typescript"),
    /STORE_TRANSFER_AUTHORITY_INVALID/,
  );
  const raw = runRawRustWasm(forged);
  assert.equal(raw.accepted, false);
  assert.match(raw.output, /STORE_TRANSFER_AUTHORITY_INVALID/);
});

test("direct raw WASM rejects jointly resealed authored, full, and compact transfer copies", () => {
  const forged = structuredClone(groundScenario());
  const request = forged.airMission.authored.assignments[0].storeTransferPlan.requests[0];
  const full = forged.airMission.assignment.storeTransfers[0];
  const compact = forged.entities
    .find((entity) => entity.id === full.storeEntityId).weapon.storeTransfer;

  request.installedDragAreaM2 = 0.09;
  forged.airMission.authoredDigest = sha256(forged.airMission.authored);
  full.installedDragAreaM2 = request.installedDragAreaM2;
  const fullMaterial = structuredClone(full);
  delete fullMaterial.digest;
  full.digest = sha256(fullMaterial);
  Object.assign(compact, structuredClone(full));

  // Every request/transfer digest available to a raw caller is now internally
  // consistent. The unchanged compiler-owned authority seal must remain an
  // independent third source and reject the jointly rewritten copies.
  assert.throws(
    () => runEngineBackend(structuredClone(forged), "typescript"),
    /Air mission lineage digest|Air mission compiled digest|AIR_MISSION.*DIGEST|mission digest/i,
  );
  const raw = runRawRustWasm(forged);
  assert.equal(raw.accepted, false);
  assert.match(raw.output, /STORE_TRANSFER_AUTHORITY_INVALID/);
});

test("raw authority seal binds aircraft, authored digest, ordered cardinality, and unique transfers", () => {
  const admitted = twoStoreGroundScenario();
  assert.equal(runRawRustWasm(structuredClone(admitted)).accepted, true);

  const alteredSeal = structuredClone(admitted);
  alteredSeal.airMission.assignment.storeTransferAuthorityDigest = "0".repeat(64);
  assert.match(runRawRustWasm(alteredSeal).output, /STORE_TRANSFER_AUTHORITY_INVALID/);

  const reordered = structuredClone(admitted);
  reordered.airMission.assignment.storeTransfers.reverse();
  assert.match(runRawRustWasm(reordered).output, /STORE_TRANSFER_AUTHORITY_INVALID/);

  const shortened = structuredClone(admitted);
  shortened.airMission.assignment.storeTransfers.pop();
  shortened.airMission.authored.assignments[0].storeTransferPlan.requests.pop();
  shortened.airMission.authoredDigest = sha256(shortened.airMission.authored);
  assert.match(runRawRustWasm(shortened).output, /STORE_TRANSFER_AUTHORITY_INVALID/);

  const duplicated = structuredClone(admitted);
  const [first, second] = duplicated.airMission.assignment.storeTransfers;
  const secondRequest = duplicated.airMission.authored.assignments[0].storeTransferPlan.requests[1];
  const secondCompact = duplicated.entities
    .find((entity) => entity.id === second.storeEntityId).weapon.storeTransfer;
  second.id = first.id;
  secondRequest.id = first.id;
  const secondMaterial = structuredClone(second);
  delete secondMaterial.digest;
  second.digest = sha256(secondMaterial);
  Object.assign(secondCompact, structuredClone(second));
  duplicated.airMission.authoredDigest = sha256(duplicated.airMission.authored);
  resealStoreTransferAuthority(duplicated.airMission);
  assert.match(runRawRustWasm(duplicated).output, /STORE_TRANSFER_AUTHORITY_INVALID/);
});

test("ground, absent, duplicate, identity, terminal, and nonphysical requests fail closed", () => {
  const cases = [
    ["absent compact", (scenario) => {
      delete scenario.entities.find((entity) => entity.id === "blue-weapon-1").weapon.storeTransfer;
    }, /STORE_TRANSFER_AUTHORITY_INVALID/],
    ["wrong launcher", (scenario) => {
      scenario.entities.find((entity) => entity.id === "blue-weapon-1").weapon.launchPlatformId = "red-object-1";
    }, /STORE_TRANSFER_AUTHORITY_INVALID|STORE_TRANSFER_LAUNCHER/],
  ];
  for (const [name, mutate, expected] of cases) {
    const scenario = structuredClone(groundScenario());
    mutate(scenario);
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(() => runEngineBackend(structuredClone(scenario), backend), expected, `${name} ${backend}`);
    }
  }

  const duplicate = createGenericAirborneStoreTransferScenario();
  const duplicatedMission = authorGenericAirborneStoreTransfer({
    mission: duplicate.airMission,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    storeOrdinal: 1,
    operation: "RELEASE",
    requestedTimeSeconds: 21,
    installedDragAreaM2: 0.08,
  });
  assert.throws(() => prepareSimulation({ ...duplicate, airMission: duplicatedMission }), /duplicated|replayed|one request/i);
  assert.throws(() => authorGenericAirborneStoreTransfer({
    mission: duplicate.airMission,
    modelPack: CURRENT_COMPILED_MODEL_PACK,
    storeOrdinal: 3,
    operation: "RELEASE",
    requestedTimeSeconds: 21,
    installedDragAreaM2: 0.08,
  }), /installed store ordinal/);

  const compileRejects = [
    ["negative time", (request) => { request.requestedTimeSeconds = -1; }],
    ["nonfinite time", (request) => { request.requestedTimeSeconds = Number.NaN; }],
    ["terminal time", (request) => { request.requestedTimeSeconds = 140; }],
    ["zero drag", (request) => { request.installedDragAreaM2 = 0; }],
    ["below minimum drag", (request) => {
      request.installedDragAreaM2 = AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.minimum - Number.EPSILON;
    }],
    ["above maximum drag", (request) => {
      request.installedDragAreaM2 = AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.maximum + Number.EPSILON;
    }],
    ["nonfinite drag", (request) => { request.installedDragAreaM2 = Number.POSITIVE_INFINITY; }],
    ["wrong station", (request) => { request.stationId = "unknown-station"; }],
    ["wrong store", (request) => { request.storeEntityId = "missing-store"; }],
    ["wrong store source", (request) => { request.storeSourceObjectId = "unknown-store"; }],
  ];
  for (const [name, mutate] of compileRejects) {
    const scenario = createGenericAirborneStoreTransferScenario();
    mutate(scenario.airMission.assignments[0].storeTransferPlan.requests[0]);
    assert.throws(() => prepareSimulation(scenario), /MISSION_|mission|store|transfer|terminal/i, name);
  }

  for (const boundary of Object.values(AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2)) {
    const scenario = createGenericAirborneStoreTransferScenario();
    scenario.airMission.assignments[0].storeTransferPlan.requests[0].installedDragAreaM2 = boundary;
    const transfer = prepareSimulation(scenario).engineScenario.airMission.assignment.storeTransfers[0];
    assert.equal(transfer.installedDragAreaM2, boundary);
    assert.deepEqual(transfer.validity, {
      schemaVersion: "vector.airborne-store-transfer-validity.v1",
      intendedUse: "PUBLIC_EDUCATIONAL",
      mechanism: "AIRBORNE_STORE_RELEASE_OR_JETTISON",
      minimumInstalledDragAreaM2: 0.001,
      maximumInstalledDragAreaM2: 1,
    });
  }
});

function assertOperationalGroundRejection(run) {
  const outcomes = run.events.items.filter(
    (event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME",
  );
  assert.equal(outcomes.length, 1);
  const event = outcomes[0];
  assert.deepEqual(
    [event.payload.requested, event.payload.accepted, event.payload.achieved],
    [true, false, false],
  );
  assert.equal(event.payload.limiter, "AIRCRAFT_STATE");
  assert.equal(event.payload.cause, "AIRCRAFT_NOT_ENROUTE");
  assert.equal(event.payload.launcherMassBeforeKg, event.payload.launcherMassAfterKg);
  assert.equal(event.payload.launcherFuelBeforeKg, event.payload.launcherFuelAfterKg);
  assert.equal(event.payload.installedDragAreaBeforeM2, event.payload.installedDragAreaAfterM2);
  const frame = run.frames[event.frameIndex];
  const launcher = frame.entities.find((entity) => entity.id === event.payload.launcherId);
  assert.ok(launcher.installedStoreIds.includes(event.payload.storeId));
  assert.equal(frame.entities.some((entity) => entity.id === event.payload.storeId), false);
  return event;
}

test("operational ground rejection is canonical and exactly once in TypeScript", () => {
  const scenario = createGenericAirborneStoreTransferScenario();
  scenario.airMission.assignments[0].storeTransferPlan.requests[0].requestedTimeSeconds = 0;
  const prepared = prepareSimulation(scenario);
  prepared.engineScenario.durationSeconds = 1;
  assertOperationalGroundRejection(runEngineBackend(prepared.engineScenario, "typescript"));
});

test("operational ground rejection is TS/Rust identical and VSR replayable", async () => {
  const scenario = createGenericAirborneStoreTransferScenario();
  scenario.airMission.assignments[0].storeTransferPlan.requests[0].requestedTimeSeconds = 0;
  const prepared = prepareSimulation(scenario);
  prepared.engineScenario.durationSeconds = 1;
  const runs = ["typescript", "rust-wasm"].map((backend) =>
    runEngineBackend(structuredClone(prepared.engineScenario), backend));
  assertParity(runs[1].events, runs[0].events, "rejected transfer events");
  for (const run of runs) assertOperationalGroundRejection(run);

  const capabilities = createVerificationDeploymentCapabilities("rust-wasm");
  const recordPrepared = prepareSimulation(scenario, scenario.profile, capabilities);
  recordPrepared.engineScenario.durationSeconds = 1;
  const rustRun = runEngineBackend(structuredClone(recordPrepared.engineScenario), "rust-wasm");
  const result = buildSimulationResult(recordPrepared, rustRun);
  const record = await createVectorSimulationRecord(recordPrepared, result, "2026-08-26T00:00:00.000Z");
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  const replayed = transferEvent(opened.result.engineRun);
  assert.equal(replayed.payload.accepted, false);
  assert.equal(replayed.payload.achieved, false);
  assert.equal(replayed.payload.cause, "AIRCRAFT_NOT_ENROUTE");
  const origin = recordPrepared.engineScenario.geospatial.origin.geographic;
  assert.equal(
    buildLaunchFeatures(opened.result, {
      longitude: origin.longitudeDeg,
      latitude: origin.latitudeDeg,
    }).some((feature) => feature.properties.entityId === replayed.payload.storeId),
    false,
    "a rejected governed transfer cannot fall through to a legacy launch marker",
  );
});

test("raw Rust rejects jointly resealed mass, station, store, and rule promotion", () => {
  const cases = [
    ["mass", ({ full }) => { full.storeMassKg += 1; }],
    ["station", ({ request, full }) => {
      request.stationId = "caller-station";
      full.stationId = request.stationId;
    }],
    ["store", ({ request, full }) => {
      request.storeEntityId = "caller-store";
      full.storeEntityId = request.storeEntityId;
    }],
    ["rule", ({ full }) => { full.compatibilityRuleId = "caller-rule"; }],
    ["validity", ({ full }) => { full.validity.maximumInstalledDragAreaM2 = 2; }],
  ];
  for (const [name, mutate] of cases) {
    const raw = runRawRustWasm(jointlyResealTransfer(structuredClone(groundScenario()), mutate));
    assert.equal(raw.accepted, false, name);
    assert.match(raw.output, /STORE_TRANSFER_AUTHORITY_INVALID/, name);
  }
});

test("release and jettison are explicit generic configuration contrasts", () => {
  const release = runEngineBackend(airborneScenario("RELEASE"), "typescript");
  const releaseRust = runEngineBackend(airborneScenario("RELEASE"), "rust-wasm");
  const jettison = runEngineBackend(airborneScenario("JETTISON"), "typescript");
  const jettisonRust = runEngineBackend(airborneScenario("JETTISON"), "rust-wasm");
  const releaseEvent = transferEvent(release);
  const jettisonEvent = transferEvent(jettison);
  assertParity(transferEvent(releaseRust), releaseEvent, "release event");
  assertParity(transferEvent(jettisonRust), jettisonEvent, "jettison event");
  assert.equal(releaseEvent.payload.operation, "RELEASE");
  assert.equal(jettisonEvent.payload.operation, "JETTISON");
  const releaseStore = release.frames.at(-1).entities.find((entity) => entity.id === "blue-weapon-1");
  const jettisonStore = jettison.frames.at(-1).entities.find((entity) => entity.id === "blue-weapon-1");
  assert.equal(releaseStore.weaponFlightState, "BOOST");
  assert.equal(jettisonStore.weaponFlightState, "COAST");
  assert.equal(jettisonStore.thrustNewtons, 0);
  assert.notDeepEqual(releaseStore.velocity, jettisonStore.velocity);
  assertParity(
    jettisonRust.frames.at(-1).entities.find((entity) => entity.id === "blue-weapon-1"),
    jettisonStore,
    "jettison terminal store",
  );
});

test("mass, installed drag, wind, and operation are independent governed contrasts", () => {
  const dragRuns = [0.04, 0.08, 0.12].map((installedDragAreaM2) =>
    transferEvent(runEngineBackend(airborneScenario("JETTISON", { installedDragAreaM2 }), "typescript")));
  assert.deepEqual(dragRuns.map((event) => event.payload.installedDragAreaM2), [0.04, 0.08, 0.12]);
  assert.ok(dragRuns[0].payload.installedDragNewtons < dragRuns[1].payload.installedDragNewtons);
  assert.ok(dragRuns[1].payload.installedDragNewtons < dragRuns[2].payload.installedDragNewtons);

  const windForces = [-20, 0, 20].map((windEastMps) =>
    transferEvent(runEngineBackend(airborneScenario("JETTISON", { windEastMps }), "typescript"))
      .payload.installedDragNewtons);
  assert.equal(new Set(windForces.map((value) => value.toFixed(9))).size, 3);

  const oneStore = transferEvent(runEngineBackend(
    airborneScenario("JETTISON", { quantity: 1 }),
    "typescript",
  ));
  const twoStores = transferEvent(runEngineBackend(
    airborneScenario("JETTISON", { quantity: 2 }),
    "typescript",
  ));
  assert.ok(oneStore.payload.launcherMassBeforeKg < twoStores.payload.launcherMassBeforeKg);
  assert.equal(oneStore.payload.storeMassKg, twoStores.payload.storeMassKg);
});

test("accepted drag removal diverges from a governed no-transfer-until-later twin", () => {
  const immediateScenario = airborneScenario("JETTISON", { requestedTimeSeconds: 0, durationSeconds: 1 });
  const delayedScenario = airborneScenario("JETTISON", { requestedTimeSeconds: 0.5, durationSeconds: 1 });
  const immediateDefinition = immediateScenario.entities.find((entity) => entity.id === "blue-platform-1");
  const delayedDefinition = delayedScenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.deepEqual(immediateDefinition.initial, delayedDefinition.initial);
  assert.equal(immediateDefinition.initial.massKg, delayedDefinition.initial.massKg);
  const immediate = runEngineBackend(immediateScenario, "typescript");
  const delayed = runEngineBackend(delayedScenario, "typescript");
  const immediateEvent = transferEvent(immediate);
  const delayedEvent = transferEvent(delayed);
  assert.equal(immediateEvent.tick, 0);
  assert.equal(delayedEvent.tick, 10);
  assert.equal(immediateEvent.payload.installedDragAreaAfterM2, 0);
  assert.equal(delayedEvent.payload.installedDragAreaBeforeM2, 0.08);
  const immediateLauncher = immediate.frames.at(-1).entities.find((entity) => entity.id === "blue-platform-1");
  const delayedLauncher = delayed.frames.at(-1).entities.find((entity) => entity.id === "blue-platform-1");
  assert.notDeepEqual(immediateLauncher.velocity, delayedLauncher.velocity);
  const immediateInstalledDragWorkJ = installedStoreDragWorkBeforeTransfer(
    immediate,
    immediateScenario,
    immediateEvent,
  );
  const delayedInstalledDragWorkJ = installedStoreDragWorkBeforeTransfer(
    delayed,
    delayedScenario,
    delayedEvent,
  );
  assert.equal(immediateInstalledDragWorkJ, 0);
  assert.ok(delayedInstalledDragWorkJ > 0);
  assert.ok(Math.abs(
    delayedEvent.payload.installedDragAreaBeforeM2
      - delayedEvent.payload.installedDragAreaAfterM2
      - delayedEvent.payload.installedDragAreaM2,
  ) < 1e-12);
});

test("jettison trajectory converges across 10, 20, and 40 Hz without changing transfer tick", () => {
  const samples = [0.1, 0.05, 0.025].map((fixedStepSeconds) => {
    const scenario = airborneScenario("JETTISON", { durationSeconds: 1 });
    scenario.fixedStepSeconds = fixedStepSeconds;
    const run = runEngineBackend(scenario, "typescript");
    const event = transferEvent(run);
    const store = run.frames.at(-1).entities.find((entity) => entity.id === event.payload.storeId);
    assert.equal(event.tick, 0);
    return store.position;
  });
  const distance = (left, right) => Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z,
  );
  const coarseToMedium = distance(samples[0], samples[1]);
  const mediumToFine = distance(samples[1], samples[2]);
  assert.ok(mediumToFine < coarseToMedium, `${mediumToFine} !< ${coarseToMedium}`);
});

test("VSR replay and map projection retain the exact transfer event and boundary frame", async () => {
  const scenario = createGenericAirborneStoreTransferScenario();
  const capabilities = createVerificationDeploymentCapabilities("typescript");
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  prepared.engineScenario.durationSeconds = 21;
  const engineRun = runEngineBackend(structuredClone(prepared.engineScenario), "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(
    prepared,
    result,
    "2026-08-26T00:00:00.000Z",
  );
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  const event = transferEvent(result.engineRun);
  const replayed = transferEvent(opened.result.engineRun);
  assert.deepEqual(replayed, event);
  assert.deepEqual(
    opened.result.engineRun.frames[replayed.frameIndex],
    result.engineRun.frames[event.frameIndex],
  );
  assert.deepEqual(selectAirborneStoreTransferOutcomes(opened.result, {
    frame: opened.result.frames[0],
    frameIndex: 0,
    displayTimeSeconds: opened.result.frames[0].t,
  }), []);
  const selectedOutcome = selectAirborneStoreTransferOutcomes(opened.result, {
    frame: opened.result.frames[replayed.frameIndex],
    frameIndex: replayed.frameIndex,
    displayTimeSeconds: replayed.modelTimeSeconds,
  });
  assert.equal(selectedOutcome.length, 1);
  assert.equal(selectedOutcome[0].eventId, replayed.id);
  const geographic = prepared.engineScenario.geospatial.origin.geographic;
  const features = buildLaunchFeatures(opened.result, {
    longitude: geographic.longitudeDeg,
    latitude: geographic.latitudeDeg,
  });
  const feature = features.find((candidate) => candidate.properties.entityId === event.payload.storeId);
  assert.equal(feature.properties.transferDigest, event.payload.transferDigest);
  assert.equal(feature.properties.operation, "RELEASE");
  assert.deepEqual(
    [feature.properties.requested, feature.properties.accepted, feature.properties.achieved],
    [true, true, true],
  );
  assert.deepEqual(feature.geometry.coordinates, [
    result.engineRun.frames[event.frameIndex].geographicPositions
      .find((position) => position.entityId === event.payload.storeId).position.longitudeDeg,
    result.engineRun.frames[event.frameIndex].geographicPositions
      .find((position) => position.entityId === event.payload.storeId).position.latitudeDeg,
  ]);
});

test("Worker admission preserves the full authority seal and rejects caller mutation", async () => {
  const scenario = createGenericAirborneStoreTransferScenario();
  const prepared = prepareSimulation(scenario);
  const pack = await adaptPreparedSimulation(prepared);
  const admitted = await admitRuntimeModelPack(pack);
  assert.equal(
    pack.prepared.engineScenario.airMission.assignment.storeTransferAuthorityDigest,
    prepared.engineScenario.airMission.assignment.storeTransferAuthorityDigest,
  );
  assert.equal(admitted.engineId, prepared.capabilityManifest.engine.id);
  const tampered = structuredClone(pack);
  tampered.prepared.engineScenario.airMission.assignment.storeTransferAuthorityDigest = "0".repeat(64);
  const tamperedContent = structuredClone(tampered);
  delete tamperedContent.digest;
  tampered.digest = sha256(tamperedContent);
  await assert.rejects(
    () => admitRuntimeModelPack(tampered),
    /compiled runtime artifact|authority|mission/i,
  );
});
