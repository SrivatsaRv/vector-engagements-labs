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
import { assertEngineObserverState, projectObserverStates } from "../lib/information-state.ts";
import { bindRuntimeModelPackDigest } from "../lib/engine/runtime-model-pack.ts";
import { assertSimulationEventStream } from "../lib/engine/simulation-events.ts";

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

async function twoTargetVerificationScenario() {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const binding = await bindVerificationTrackModelPack(prepared.engineScenario);
  const scenario = structuredClone(binding.scenario);
  const observer = scenario.entities.find((entity) => entity.id === "blue-platform-1");
  const firstTarget = scenario.entities.find((entity) => entity.id === "red-object-1");
  assert.ok(observer && firstTarget);
  const secondTarget = structuredClone(firstTarget);
  const start = {
    x: observer.initial.position.x + 199_999,
    y: observer.initial.position.y,
    z: observer.initial.position.z,
  };
  secondTarget.id = "verification-red-object-2";
  secondTarget.rddfId = "rddf://verification/aircraft/generic-red-2";
  secondTarget.designation = "Generic verification target 2";
  secondTarget.callsign = "VERIFY 2";
  secondTarget.initial.position = start;
  secondTarget.initial.velocity = { x: 400, y: 0, z: 0 };
  secondTarget.initial.headingRad = 0;
  secondTarget.initial.massKg = secondTarget.aircraft.emptyMassKg + secondTarget.initial.fuelKg;
  secondTarget.route = [start, { x: start.x + 20_000, y: start.y, z: start.z }];
  secondTarget.routePlan = {
    schemaVersion: "vector.route-plan.v2",
    waypointAcceptanceRadiiM: [1, 500],
    waypointTransitions: ["START", "FLY_BY"],
  };
  scenario.entities.push(secondTarget);
  return { prepared, ...binding, scenario };
}

async function sameSideObserverPermutationScenarios() {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const binding = await bindVerificationTrackModelPack(prepared.engineScenario);
  const scenario = structuredClone(binding.scenario);
  scenario.durationSeconds = 0.6;
  const originalObserver = scenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.ok(originalObserver?.observerSensor && originalObserver.aircraft);
  const stableObserver = structuredClone(originalObserver);
  stableObserver.id = "aaa-verification-observer";
  stableObserver.rddfId = "rddf://verification/aircraft/stable-observer";
  stableObserver.designation = "Stable generic verification observer";
  stableObserver.callsign = "STABLE";
  stableObserver.initial.massKg = stableObserver.aircraft.emptyMassKg + stableObserver.initial.fuelKg;
  scenario.entities.push(stableObserver);
  const stableFirst = structuredClone(scenario);
  stableFirst.entities = [
    stableFirst.entities.find((entity) => entity.id === stableObserver.id),
    ...stableFirst.entities.filter((entity) => entity.id !== stableObserver.id),
  ];
  return { prepared, ...binding, originalFirst: scenario, stableFirst };
}

test("observer-state v3 preserves multiple mixed-lifecycle tracks without a scalar summary", async () => {
  const { scenario, pack, prepared } = await twoTargetVerificationScenario();
  const runs = Object.fromEntries(
    ["typescript", "rust-wasm"].map((backend) => [backend, runEngineBackend(scenario, backend)]),
  );
  const run = runs.typescript;
  const mixed = run.frames.find((frame) => {
    const state = frame.observerStates.find((candidate) => candidate.perspective === "IAF");
    return state?.schemaVersion === "vector.observer-state.v3" &&
      new Set(state.tracks.map((track) => track.state)).size > 1;
  });
  assert.ok(mixed, "the verification scenario must retain two concurrent tracks in different lifecycle states");
  const state = mixed.observerStates.find((candidate) => candidate.perspective === "IAF");
  assert.equal(state.schemaVersion, "vector.observer-state.v3");
  assert.equal(state.tracks.length, 2);
  assert.doesNotThrow(() => assertEngineObserverState(state));
  const pictures = projectObserverStates([{ t: mixed.t, observerStates: [state] }]);
  assert.equal(pictures.length, 1, "one side/frame picture owns all retained tracks");
  assert.deepEqual(pictures[0].tracks, state.tracks);
  assert.equal(new Set(pictures[0].tracks.map((track) => track.state)).size, 2);
  assert.doesNotMatch(JSON.stringify(pictures), /truthEntityId|targetEntityId|observedEntityId|truthPosition/);
  assert.deepEqual(
    runs["rust-wasm"].frames.map((frame) => frame.observerStates),
    run.frames.map((frame) => frame.observerStates),
    "Rust/WASM must preserve the complete mixed multi-track state",
  );
  assert.deepEqual(runs["rust-wasm"].events, run.events);
  for (const backend of ["typescript", "rust-wasm"]) {
    const capabilityManifest = createVerificationDeploymentCapabilities(backend, ["A2A"], [pack.digest]);
    const recordedPrepared = { ...prepared, engineScenario: scenario, capabilityManifest };
    const result = buildSimulationResult(recordedPrepared, runs[backend]);
    const record = await createVectorSimulationRecord(recordedPrepared, result, "2026-08-23T00:00:00.000Z");
    const serialized = serializeVectorRecord(record);
    const replay = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
    const replayPicture = replay.pictures.find((picture) =>
      picture.schemaVersion === "vector.observer-state.v3" &&
      picture.perspective === "IAF" && picture.modelTimeSeconds === mixed.t
    );
    assert.ok(replayPicture);
    assert.deepEqual(replayPicture.tracks, state.tracks);
    assert.equal(new Set(replayPicture.tracks.map((track) => track.state)).size, 2);
  }
});

test("opaque source associations remain bound to the compiled opposing-aircraft order", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const binding = await bindVerificationTrackModelPack(prepared.engineScenario);
  const scenario = structuredClone(binding.scenario);
  const activeTarget = scenario.entities.find((entity) => entity.id === "red-object-1");
  assert.ok(activeTarget);
  const inactivePredecessor = structuredClone(activeTarget);
  inactivePredecessor.id = "aaa-inactive-verification-target";
  inactivePredecessor.rddfId = "rddf://verification/aircraft/inactive-predecessor";
  inactivePredecessor.designation = "Inactive generic verification target";
  inactivePredecessor.callsign = "INACTIVE";
  inactivePredecessor.lifecycle = "TERMINATED";
  inactivePredecessor.initial.massKg = inactivePredecessor.aircraft.emptyMassKg + inactivePredecessor.initial.fuelKg;
  scenario.entities.push(inactivePredecessor);

  for (const backend of ["typescript", "rust-wasm"]) {
    const run = runEngineBackend(scenario, backend);
    const observation = run.frames
      .flatMap((frame) => frame.observerStates)
      .find((state) => state.schemaVersion === "vector.observer-state.v3" && state.perspective === "IAF")
      ?.observations[0];
    assert.equal(observation?.sourceAssociationId, "IAF-SOURCE-0002");
  }
});

test("same-side observer selection is stable across definition order in both engines and VSR", async () => {
  const { prepared, pack, originalFirst, stableFirst } = await sameSideObserverPermutationScenarios();
  const results = [];
  for (const backend of ["typescript", "rust-wasm"]) {
    for (const scenario of [originalFirst, stableFirst]) {
      const run = runEngineBackend(structuredClone(scenario), backend);
      const trackEvents = run.events.items.filter((event) =>
        event.payload.kind === "TRACK_STATE_CHANGED" && event.payload.perspective === "IAF",
      );
      assert.ok(trackEvents.length > 0);
      assert.ok(
        trackEvents.every((event) => event.producer.entityId === "aaa-verification-observer"),
        `${backend} must use the stable sensor-capable producer`,
      );
      const capabilityManifest = createVerificationDeploymentCapabilities(backend, ["A2A"], [pack.digest]);
      const recordedPrepared = { ...prepared, engineScenario: scenario, capabilityManifest };
      const result = buildSimulationResult(recordedPrepared, run);
      const record = await createVectorSimulationRecord(recordedPrepared, result, "2026-08-24T00:00:00.000Z");
      const serialized = serializeVectorRecord(record);
      const replay = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
      results.push({
        backend,
        run,
        replay,
        serializedBytes: new Uint8Array(serialized.buffer, 0, serialized.byteLength),
        eventBytes: record.members.find((member) => member.path === "events.jsonl")?.bytes,
        pictureBytes: record.members.find((member) => member.path === "pictures.jsonl")?.bytes,
      });
    }
  }
  for (const backend of ["typescript", "rust-wasm"]) {
    const [original, reversed] = results.filter((candidate) => candidate.backend === backend);
    assert.deepEqual(
      reversed.serializedBytes,
      original.serializedBytes,
      `${backend} must produce identical full VSR bytes for semantically identical entity definitions`,
    );
  }
  const baseline = results[0];
  assert.ok(baseline?.eventBytes && baseline.pictureBytes);
  for (const candidate of results.slice(1)) {
    assert.deepEqual(
      candidate.run.frames.map((frame) => frame.observerStates),
      baseline.run.frames.map((frame) => frame.observerStates),
    );
    assert.deepEqual(candidate.run.events, baseline.run.events);
    assert.deepEqual(candidate.eventBytes, baseline.eventBytes);
    assert.deepEqual(candidate.pictureBytes, baseline.pictureBytes);
    assert.deepEqual(
      candidate.replay.result.frames.map((frame) => frame.observerStates),
      baseline.replay.result.frames.map((frame) => frame.observerStates),
    );
    assert.deepEqual(candidate.replay.events, baseline.replay.events);
  }
});

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
    assert.equal(observer.tracks.find((track) => track.trackId === event.payload.trackId)?.state, event.payload.to);
    if (["INITIAL_OBSERVATION", "CONFIRMATION_THRESHOLD_MET", "OBSERVATION_REACQUIRED"].includes(event.payload.cause)) {
      assert.match(event.payload.observationId, new RegExp(`^${event.payload.perspective}-OBS-`));
      assert.ok(observer.observations.some((observation) => observation.id === event.payload.observationId));
    } else {
      assert.equal(event.payload.observationId, null);
    }
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
  assert.throws(() => assertEngineObserverState({ ...unsupported, availabilityReason: "MAYBE" }), /contradictory|availability/i);
  assert.throws(() => assertEngineObserverState({ ...unsupported, stateExplanation: 7 }), /explanation/i);
  assert.throws(() => assertEngineObserverState({ ...unsupported, nested: { truthEntityId: "red-object-1" } }), /truth/i);

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
    state.tracks[0].state = "CONFIRMED";
    state.visibleTrackCount = 0;
    assert.throws(() => assertEngineObserverState(state), /visible-track/i);
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

test("both engines reject observation, track, and event sources forged beside a valid digest", async () => {
  const prepared = prepareSimulation(DEFAULT_SCENARIO);
  const { scenario } = await bindVerificationTrackModelPack(prepared.engineScenario);
  const forged = structuredClone(runEngine(scenario));
  const frame = forged.frames.find((item) => item.observerStates.some((state) => state.schemaVersion === "vector.observer-state.v3" && state.tracks.length));
  const state = frame.observerStates.find((item) => item.schemaVersion === "vector.observer-state.v3" && item.tracks.length);
  state.sensorModelId = "forged-valid-digest-model";
  state.tracks[0].source.sensorModelId = "forged-valid-digest-model";
  state.observations[0].source.sensorModelId = "forged-valid-digest-model";
  const event = forged.events.items.find((item) => item.payload.kind === "TRACK_STATE_CHANGED");
  event.payload.sensorModelId = "forged-valid-digest-model";
  assert.throws(() => assertSimulationEventStream(
    forged.events.items,
    forged.frames,
    scenario,
    forged.termination,
  ), /compiled scenario|admitted scenario/i);
});
