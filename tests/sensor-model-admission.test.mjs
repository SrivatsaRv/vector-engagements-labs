import assert from "node:assert/strict";
import test from "node:test";
import { runEngineBackend } from "../lib/engine/backend.ts";
import { buildSimulationResult, DEFAULT_SCENARIO, prepareSimulation } from "../lib/simulation.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  createVectorSimulationRecord,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import {
  bindVerificationTrackModelPack,
  createVerificationTrackModelPackSource,
  DEFAULT_VERIFICATION_TRACK_MODEL,
} from "../lib/engine/verification-track-fixture.ts";
import { EngineSession, runEngine } from "../lib/engine/core.ts";
import { compileModelPack } from "../lib/model-pack.ts";
import { adaptPreparedSimulation, admitRuntimeModelPack } from "../lib/runtime/model-pack-adapter.ts";
import { assertEngineObserverState } from "../lib/information-state.ts";
import { bindRuntimeModelPackDigest } from "../lib/engine/runtime-model-pack.ts";

function forgedScenario({ mode = "SEARCH", rangeM = 120_000, digest } = {}) {
  const capabilities = createVerificationDeploymentCapabilities("typescript");
  const prepared = prepareSimulation(DEFAULT_SCENARIO, DEFAULT_SCENARIO.profile, capabilities);
  const engineScenario = structuredClone(prepared.engineScenario);
  const blue = engineScenario.entities.find((entity) => entity.id === "blue-platform-1");
  blue.observerSensor = {
    schemaVersion: "vector.observer-sensor-admission.v1",
    modelPackDigest: digest ?? engineScenario.modelPack.digest,
    modelId: "test-radar-model-v1",
    modelVersion: "1.0.0",
    evidenceRefIds: ["test-sensor-source"],
    sensorKind: "RADAR",
    mode,
    detectionRangeM: rangeM,
    minimumRangeM: 100,
    scanPeriodS: 0.25,
    azimuthFieldOfViewRad: Math.PI * 2,
    elevationFieldOfViewRad: Math.PI,
  };
  return { prepared: { ...prepared, engineScenario }, engineScenario };
}

test("an entity admission cannot manufacture a sensor plot beside a valid pack digest", () => {
  const { engineScenario } = forgedScenario();
  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(
      () => runEngineBackend(engineScenario, backend),
      /observer sensor blue-platform-1 is not bound to an admitted compiled sensor model/i,
    );
  }
});

test("the active reference scenario cannot promote its zero-range declared envelope into a radar", () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  assert.equal(
    prepared.engineScenario.entities.find((entity) => entity.id === "blue-platform-1").observerSensor,
    undefined,
  );
  assert.ok(
    prepared.engineScenario.entities.every((entity) => entity.observerSensor === undefined),
    "the production fixture must remain explicitly unavailable until a sourced sensor model is compiled",
  );
});

test("range, mode, and model-pack mismatch fail closed instead of manufacturing a track", () => {
  const outOfRange = forgedScenario({ rangeM: 101 }).engineScenario;
  const off = forgedScenario({ mode: "OFF" }).engineScenario;
  for (const scenario of [outOfRange, off]) {
    for (const backend of ["typescript", "rust-wasm"]) {
      assert.throws(
        () => runEngineBackend(scenario, backend),
        /observer sensor blue-platform-1 is not bound to an admitted compiled sensor model/i,
      );
    }
  }
  assert.throws(
    () => runEngineBackend(forgedScenario({ digest: "0".repeat(64) }).engineScenario, "typescript"),
    /not bound to an admitted compiled sensor model/,
  );
  assert.throws(
    () => runEngineBackend(forgedScenario({ digest: "0".repeat(64) }).engineScenario, "rust-wasm"),
    /observer sensor blue-platform-1 admission does not match scenario model pack/,
  );
});

test("recorded default observer state remains unavailable without a compiled sensor model", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const run = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, run);
  const record = await createVectorSimulationRecord(prepared, result, "2026-08-21T00:00:00.000Z");
  const serialized = serializeVectorRecord(record);
  const replay = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.ok(replay.pictures.every((picture) => picture.trackState === "UNSUPPORTED"));
  assert.ok(replay.pictures.every((picture) => !("position" in picture)));
  assert.ok(replay.pictures.every((picture) => !("observedEntityId" in picture)));
});

test("a source-authored engine-verification pack drives exact side-owned TrackStore events", async () => {
  const source = createVerificationTrackModelPackSource();
  const first = await compileModelPack(source);
  const second = await compileModelPack(source);
  assert.equal(first.pack.digest, second.pack.digest);

  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const { scenario, pack } = await bindVerificationTrackModelPack(prepared.engineScenario);
  assert.equal(pack.digest, first.pack.digest);
  const runs = Object.fromEntries(
    ["typescript", "rust-wasm"].map((backend) => [backend, runEngineBackend(scenario, backend)]),
  );
  const run = runs.typescript;
  const trackEvents = run.events.items.filter((event) => event.payload.kind === "TRACK_STATE_CHANGED");
  assert.deepEqual(
    trackEvents.filter((event) => event.payload.perspective === "IAF").slice(0, 6)
      .map((event) => [event.modelTimeSeconds, event.payload.from, event.payload.to, event.payload.cause]),
    [
      [0, "NONE", "TENTATIVE", "INITIAL_OBSERVATION"],
      [0.05, "TENTATIVE", "CONFIRMED", "CONFIRMATION_THRESHOLD_MET"],
      [0.2, "CONFIRMED", "COASTING", "FRESHNESS_EXPIRED"],
      [0.3, "COASTING", "LOST", "TRACK_EXPIRED"],
      [0.35, "LOST", "TENTATIVE", "OBSERVATION_REACQUIRED"],
      [0.4, "TENTATIVE", "CONFIRMED", "CONFIRMATION_THRESHOLD_MET"],
    ],
  );
  for (const event of trackEvents) {
    const frame = run.frames[event.frameIndex];
    assert.equal(frame.t, event.modelTimeSeconds);
    const observer = frame.observerStates.find((item) => item.perspective === event.payload.perspective);
    assert.equal(observer.schemaVersion, "vector.observer-state.v3");
    assert.equal(observer.tracks[0].state, event.payload.to);
  }
  assert.doesNotMatch(
    JSON.stringify({ frames: run.frames, events: trackEvents }),
    /observedEntityId|targetEntityId|truthEntityId|truthPosition/,
  );
  assert.deepEqual(
    runs["rust-wasm"].frames.map((frame) => frame.observerStates),
    run.frames.map((frame) => frame.observerStates),
    "the complete side-owned observation and track state must be identical across engines",
  );
  assert.deepEqual(
    runs["rust-wasm"].events.items.filter((event) => event.payload.kind === "TRACK_STATE_CHANGED"),
    trackEvents,
    "track events, receipts, causes, and exact frame references must be identical across engines",
  );

  const batched = new EngineSession(scenario);
  for (const size of [1, 7, 3, 29]) {
    if (!batched.isCompleted()) batched.runTicks(size);
  }
  while (!batched.isCompleted()) batched.runTicks(11);
  assert.deepEqual(batched.result().frames.map((frame) => frame.observerStates), run.frames.map((frame) => frame.observerStates));
  assert.deepEqual(
    batched.result().events.items.filter((event) => event.payload.kind === "TRACK_STATE_CHANGED"),
    trackEvents,
  );

  for (const backend of ["typescript", "rust-wasm"]) {
    const capabilityManifest = createVerificationDeploymentCapabilities(backend, ["A2A"], [pack.digest]);
    const recordedPrepared = { ...prepared, engineScenario: scenario, capabilityManifest };
    const result = buildSimulationResult(recordedPrepared, runs[backend]);
    const record = await createVectorSimulationRecord(recordedPrepared, result, "2026-08-23T00:00:00.000Z");
    const serialized = serializeVectorRecord(record);
    const replay = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
    assert.deepEqual(replay.result.frames.map((frame) => frame.observerStates), runs[backend].frames.map((frame) => frame.observerStates));
    assert.deepEqual(
      replay.events.items.filter((event) => event.payload.kind === "TRACK_STATE_CHANGED"),
      runs[backend].events.items.filter((event) => event.payload.kind === "TRACK_STATE_CHANGED"),
    );
  }
});

test("observer-state v2/v3 admission rejects contradictory, extra-field, and truth-leaking states", () => {
  const unsupported = {
    schemaVersion: "vector.observer-state.v2",
    perspective: "IAF",
    sensorState: "UNSUPPORTED",
    observationCount: 0,
    trackState: "UNSUPPORTED",
    visible: false,
    availabilityReason: "SENSOR_MODEL_UNAVAILABLE",
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: "No admitted model.",
  };
  assert.doesNotThrow(() => assertEngineObserverState(unsupported));
  assert.throws(() => assertEngineObserverState({ ...unsupported, visible: true }), /contradictory/i);
  assert.throws(() => assertEngineObserverState({ ...unsupported, invented: true }), /unsupported or missing/i);

  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  return bindVerificationTrackModelPack(prepared.engineScenario).then(({ scenario }) => {
    const state = structuredClone(runEngine(scenario).frames[1].observerStates[0]);
    assert.doesNotThrow(() => assertEngineObserverState(state));
    state.tracks[0].truthEntityId = "red-object-1";
    assert.throws(() => assertEngineObserverState(state), /unsupported or missing|truth/i);
    delete state.tracks[0].truthEntityId;
    state.tracks[0].owner = "PAF";
    assert.throws(() => assertEngineObserverState(state), /ownership/i);
    state.tracks[0].owner = "IAF";
    state.visible = false;
    state.trackState = "CONFIRMED";
    state.tracks[0].state = "CONFIRMED";
    assert.throws(() => assertEngineObserverState(state), /visibility/i);
  });
});

test("source-authored TrackStore configuration changes pack identity and causal behavior", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const baseline = await bindVerificationTrackModelPack(prepared.engineScenario);
  const changed = await bindVerificationTrackModelPack(prepared.engineScenario, {
    ...structuredClone(DEFAULT_VERIFICATION_TRACK_MODEL),
    confirmationObservations: 3,
  });
  assert.notEqual(changed.pack.digest, baseline.pack.digest);
  const events = (binding) => runEngine(binding.scenario).events.items
    .filter((event) => event.payload.kind === "TRACK_STATE_CHANGED" && event.payload.perspective === "IAF")
    .map((event) => [event.modelTimeSeconds, event.payload.from, event.payload.to, event.payload.cause]);
  assert.notDeepEqual(events(changed), events(baseline));
  assert.ok(events(changed).some((event) => event[2] === "CONFIRMED" && event[0] > 0.4));

  const unknownField = createVerificationTrackModelPackSource();
  unknownField.sensors.find((sensor) => sensor.verificationTrackModel)
    .verificationTrackModel.invented = true;
  await assert.rejects(() => compileModelPack(unknownField), /unsupported or missing fields/i);
});

test("production Worker admission rejects verification packs and changed runtime projections", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const { scenario } = await bindVerificationTrackModelPack(prepared.engineScenario);
  const verificationPack = await adaptPreparedSimulation({ ...prepared, engineScenario: scenario });
  await assert.rejects(() => admitRuntimeModelPack(verificationPack), /not admitted by this deployment/i);

  const changed = structuredClone(prepared);
  changed.engineScenario.modelPack.observerSensors[0].scanPeriodS += 0.01;
  const changedPack = await adaptPreparedSimulation(changed);
  await assert.rejects(() => admitRuntimeModelPack(changedPack), /projection digest/i);
});

test("both engines reject mutated and unknown-field verification projections", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const { scenario } = await bindVerificationTrackModelPack(prepared.engineScenario);
  const mutated = structuredClone(scenario);
  mutated.modelPack.observerSensors.find((sensor) => sensor.verificationTrackModel)
    .verificationTrackModel.confirmationObservations += 1;
  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(() => runEngineBackend(mutated, backend), /runtimeDigest|runtime model-pack projection digest/i);
  }

  const unknown = structuredClone(scenario);
  for (const sensor of unknown.modelPack.observerSensors.filter((item) => item.verificationTrackModel)) {
    sensor.verificationTrackModel.invented = true;
  }
  for (const entity of unknown.entities.filter((item) => item.observerSensor?.verificationTrackModel)) {
    entity.observerSensor.verificationTrackModel.invented = true;
  }
  const projection = { ...unknown.modelPack };
  delete projection.runtimeDigest;
  unknown.modelPack = bindRuntimeModelPackDigest(projection);
  for (const backend of ["typescript", "rust-wasm"]) {
    assert.throws(() => runEngineBackend(unknown, backend), /unsupported or missing field|unknown field/i);
  }
});
