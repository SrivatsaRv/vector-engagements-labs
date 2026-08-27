import assert from "node:assert/strict";
import test from "node:test";
import {
  createVectorSimulationRecord,
  decodeColumnarFrames,
  encodeColumnarFrames,
  LEGACY_VECTOR_EVENT_SCHEMA,
  LEGACY_VECTOR_FRAME_SCHEMA,
  OLDER_VECTOR_FRAME_SCHEMA,
  LEGACY_VECTOR_PICTURE_SCHEMA,
  openVectorSimulationRecord,
  serializeVectorRecord,
  VECTOR_EVENT_SCHEMA,
  VECTOR_FRAME_SCHEMA,
  VECTOR_PICTURE_SCHEMA,
} from "../lib/record/vector-record.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import { sha256Bytes } from "../lib/runtime/digest.ts";
import {
  buildSimulationResult,
  prepareSimulation,
  simulate,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { runEngineBackend } from "../lib/engine/backend.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { bindVerificationTrackModelPack } from "../lib/engine/verification-track-fixture.ts";
import {
  assertEnvironmentPack,
  environmentPackBinding,
} from "../lib/geospatial/environment-pack.ts";
import {
  compileAirMissionDefinition,
  synchronizeScenarioAirMission,
} from "../lib/air-mission.ts";
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "../lib/engine/runtime-model-pack.ts";
import { resolveRetainedCompiledModelPack } from "../lib/engine/retained-model-packs.ts";
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

const createdAt = "2026-08-06T00:00:00.000Z";
const textEncoder = new TextEncoder();
const jsonBytes = (value) => textEncoder.encode(canonicalJson(value));

async function replaceRecordMember(record, path, schemaVersion, bytes) {
  const replacedSchemaVersion = record.members.find((member) => member.path === path)?.schemaVersion;
  const replacement = {
    ...record.members.find((member) => member.path === path),
    schemaVersion,
    bytes,
    sha256: await sha256Bytes(bytes),
  };
  const nonManifest = record.members
    .filter((member) => member.path !== "manifest.json")
    .map((member) => member.path === path ? replacement : member);
  const members = record.manifest.members.map((member) => {
    const source = nonManifest.find((candidate) => candidate.path === member.path);
    return {
      path: source.path,
      schemaVersion: source.schemaVersion,
      mediaType: source.mediaType,
      required: source.required,
      byteLength: source.bytes.byteLength,
      sha256: source.sha256,
    };
  });
  const recordId = await sha256Bytes(
    jsonBytes(nonManifest.map(({ path: memberPath, sha256 }) => ({ path: memberPath, sha256 }))),
  );
  const priorManifest = { ...record.manifest };
  delete priorManifest.contentDigest;
  const manifestWithoutDigest = {
    ...priorManifest,
    recordId,
    requiredViewerFeatures: priorManifest.requiredViewerFeatures.map((feature) =>
      feature === replacedSchemaVersion ? schemaVersion : feature,
    ),
    members,
  };
  const manifest = {
    ...manifestWithoutDigest,
    contentDigest: await sha256Bytes(jsonBytes(manifestWithoutDigest)),
  };
  const manifestBytes = jsonBytes(manifest);
  const priorManifestMember = record.members.find((member) => member.path === "manifest.json");
  const manifestMember = {
    ...priorManifestMember,
    bytes: manifestBytes,
    sha256: await sha256Bytes(manifestBytes),
  };
  return { manifest, members: [manifestMember, ...nonManifest] };
}

test("columnar frame transport round-trips exact engine frames", () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const bytes = encodeColumnarFrames(result.engineRun.frames);
  assert.deepEqual(decodeColumnarFrames(bytes), result.engineRun.frames);
  assert.ok(
    decodeColumnarFrames(bytes)
      .flatMap((frame) => frame.entities)
      .some((entity) => entity.weaponFlightState === "BOOST"),
    "weapon lifecycle evidence must survive VSR encoding",
  );
  const control = decodeColumnarFrames(bytes)
    .flatMap((frame) => frame.entities)
    .find((entity) => entity.aircraftControl)?.aircraftControl;
  assert.ok(control, "aircraft control evidence must survive VSR encoding");
  assert.ok(
    Number.isFinite(control.requestedSteeringAccelerationMps2.x),
    "the requested steering acceleration must be replayable, not reconstructed",
  );
  assert.ok(bytes.byteLength > 0);
});

for (const backend of ["typescript", "rust-wasm"]) {
  test(`VSR replays without physics and preserves ${backend} provenance`, async () => {
    const scenario = SCENARIO_LIBRARY[0].scenario;
    const capabilities = createVerificationDeploymentCapabilities(backend);
    const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
    const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
    const record = await createVectorSimulationRecord(prepared, result, createdAt);
    const serialized = serializeVectorRecord(record);
    const opened = await openVectorSimulationRecord(
      serialized.buffer,
      serialized.byteLength,
    );

    assert.equal(opened.manifest.backend.selected, backend);
    assert.equal(
      opened.manifest.deploymentCapabilities.digest,
      capabilities.digest,
    );
    assert.equal(
      opened.manifest.deploymentCapabilities.schemaVersion,
      "vector.deployment-capabilities.v1",
    );
    assert.equal(opened.result.engineRun.diagnostics.backend, backend);
    const recordedPack = opened.result.engineRun.scenario.geospatial.environmentPack;
    assertEnvironmentPack(recordedPack);
    assert.deepEqual(
      opened.result.engineRun.scenario.environment.environmentPack,
      environmentPackBinding(recordedPack),
      "replay must retain the exact admitted environment-pack binding instead of re-resolving a catalog selection",
    );
    const supersedingPreparation = prepareSimulation({
      ...scenario,
      wind: scenario.wind + 1,
    }, scenario.profile, capabilities);
    assert.notEqual(
      supersedingPreparation.engineScenario.geospatial.environmentPack.identity.digest,
      recordedPack.identity.digest,
      "a later authored pack is a distinct immutable version",
    );
    assert.equal(
      opened.result.engineRun.scenario.geospatial.environmentPack.identity.digest,
      recordedPack.identity.digest,
      "archived replay must not resolve against a later pack",
    );
    assert.deepEqual(
      opened.result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      "VSR must retain the compiled fly-by route constraint for replay audit",
    );
    assert.deepEqual(opened.result.frames, result.frames);
    assert.deepEqual(opened.result.envelopes, result.envelopes);
    assert.equal(opened.result.reason, result.reason);
    assert.equal(opened.events.state, "AVAILABLE");
    assert.ok(opened.events.items.length > 0);
    assert.deepEqual(opened.events, result.engineRun.events);
    assert.match(
      opened.report.limitations.join(" "),
      /named-aircraft performance remains unsupported.*no catalog association supplies runtime authority/i,
    );
    assert.ok(opened.pictures.length > 0, "tick-owned observer state must be recorded");
    assert.deepEqual(
      opened.result.pictures,
      opened.pictures,
      "replay must expose the immutable recorded observer pictures, not rebuild them",
    );
    assert.ok(opened.pictures.every((picture) => picture.trackState === "UNSUPPORTED"));
    assert.ok(
      opened.pictures.every((picture) =>
        opened.result.frames.some((frame) => frame.t === picture.modelTimeSeconds),
      ),
      "each observer-picture sample must identify its recorded frame",
    );
    assert.ok(opened.pictures.every((picture) => !("truthPosition" in picture) && !("position" in picture) && !("observedEntityId" in picture)));
    assert.match(opened.manifest.recordId, /^[a-f0-9]{64}$/);
  });
}

test("VSR recompiles an archived Air mission against its exact retained model pack", async () => {
  const currentScenario = SCENARIO_LIBRARY[0].scenario;
  const historicalModelPack = historicalModelPackBundle.pack;
  const scenario = synchronizeScenarioAirMission(
    structuredClone(currentScenario),
    historicalModelPack,
  );
  const prepared = prepareSimulation(currentScenario);
  const environmentPack = prepared.engineScenario.geospatial.environmentPack;
  const archivedMission = compileAirMissionDefinition(scenario.airMission, {
    scenario,
    modelPack: historicalModelPack,
    environmentPackDigest: environmentPack.identity.digest,
    environmentPack,
    fixedStepSeconds: prepared.engineScenario.fixedStepSeconds,
    durationSeconds: prepared.engineScenario.durationSeconds,
  });
  prepared.scenario = scenario;
  prepared.engineScenario.airMission = archivedMission;
  prepared.engineScenario.modelPack = bindRuntimeModelPackDigest({
    schemaVersion: historicalModelPack.schemaVersion,
    id: historicalModelPack.id,
    version: historicalModelPack.version,
    digest: historicalModelPack.digest,
    intendedUse: { ...historicalModelPack.intendedUses[0] },
    observerSensors: historicalModelPack.sensors.map((sensor) => ({
      modelId: sensor.id,
      modelVersion: sensor.version,
      evidenceRefIds: [...sensor.evidenceRefIds],
      sensorKind: sensor.sensorKind,
      detectionRangeM: sensor.detectionRangeM,
      minimumRangeM: sensor.minimumRangeM,
      scanPeriodS: sensor.scanPeriodS,
      azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
      elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
      ...(sensor.verificationTrackModel
        ? { verificationTrackModel: structuredClone(sensor.verificationTrackModel) }
        : {}),
    })),
    weaponTerminations: runtimeWeaponTerminations(historicalModelPack, []),
    scenarioPatches: [],
  });

  const result = simulate(currentScenario);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);

  assert.equal(opened.result.engineRun.scenario.modelPack.version, "0.8.0");
  assert.equal(opened.result.engineRun.scenario.modelPack.digest, historicalModelPack.digest);
  assert.deepEqual(opened.result.engineRun.scenario.airMission, archivedMission);
});

test("archived model-pack resolution rejects every partial identity match", () => {
  const pack = historicalModelPackBundle.pack;
  for (const identity of [
    { id: `${pack.id}-other`, version: pack.version, digest: pack.digest },
    { id: pack.id, version: "0.8.1", digest: pack.digest },
    { id: pack.id, version: pack.version, digest: "0".repeat(64) },
  ]) {
    assert.throws(
      () => resolveRetainedCompiledModelPack(identity),
      /No retained compiled model pack matches/,
    );
  }
});

test("VSR admits an off-grid scheduled launch at its first fixed-step boundary", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find((entity) =>
    entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === 0
  );
  assert.ok(weapon?.weapon);
  weapon.weapon.launchTimeSeconds = 2.03;
  prepared.engineScenario.durationSeconds = 3;
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.equal(opened.events.state, "AVAILABLE");
  const entry = opened.events.items.find((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id
  );
  assert.ok(entry);
  assert.equal(entry.tick, 41);
  assert.equal(entry.modelTimeSeconds, 2.05);
  assert.equal(opened.result.engineRun.frames[entry.frameIndex].t, 2.05);
});

test("VSR rejects a hash-resealed expiry time that contradicts the achieved launch boundary", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find((entity) =>
    entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === 0
  );
  assert.ok(weapon?.weapon);
  governWeaponTermination(prepared.engineScenario, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: 0.075,
  });
  prepared.engineScenario.durationSeconds = 1;
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  assert.equal(result.termination, "weapon_expired");
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  assert.equal(terminal.payload.occurrenceTimeSeconds, 0.075);
  terminal.payload.occurrenceTimeSeconds = 0.06;
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match the exact admitted expiry time/,
  );
});

test("VSR rejects a hash-resealed boundary-cause occurrence time", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2g-emitter-corridor",
  ).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2G"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  assert.equal(result.engineRun.termination, "weapon_failed");
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  assert.equal(terminal.payload.cause, "TERRAIN_IMPACT");
  assert.equal(terminal.payload.occurrenceTimeSeconds, terminal.modelTimeSeconds);
  terminal.payload.occurrenceTimeSeconds = Number((
    terminal.modelTimeSeconds - prepared.engineScenario.fixedStepSeconds / 2
  ).toFixed(6));
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact terminal boundary time/,
  );
});

test("VSR content identity and stable event ordering are deterministic", async () => {
  const scenario = SCENARIO_LIBRARY[1].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const first = await createVectorSimulationRecord(prepared, result, createdAt);
  const second = await createVectorSimulationRecord(prepared, result, createdAt);

  assert.equal(first.manifest.recordId, second.manifest.recordId);
  assert.equal(first.manifest.contentDigest, second.manifest.contentDigest);
  assert.deepEqual(
    first.members.map((item) => [item.path, item.sha256]),
    second.members.map((item) => [item.path, item.sha256]),
  );
  const allocated = serializeVectorRecord(first);
  const reused = serializeVectorRecord(second, allocated.buffer);
  assert.equal(reused.buffer, allocated.buffer);
  assert.equal(reused.byteLength, allocated.byteLength);
});

test("VSR retains read-only compatibility with the last observer frame and picture schemas", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepareSimulation(scenario), result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(frameMember && pictureMember);
  const legacyFrameBytes = frameMember.bytes.slice();
  const currentSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = legacyFrameBytes.findIndex((_, index) =>
    currentSchema.every((value, inner) => legacyFrameBytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  legacyFrameBytes[offset + currentSchema.length - 1] = "5".charCodeAt(0);
  let legacy = await replaceRecordMember(
    record,
    "frames.arrow",
    LEGACY_VECTOR_FRAME_SCHEMA,
    legacyFrameBytes,
  );
  const serialized = serializeVectorRecord(legacy);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.deepEqual(opened.result.frames, result.frames);
  assert.ok(opened.pictures.every((picture) => picture.schemaVersion === "vector.observer-state.v2"));

  const olderFrameBytes = frameMember.bytes.slice();
  olderFrameBytes[offset + currentSchema.length - 1] = "4".charCodeAt(0);
  let older = await replaceRecordMember(
    record,
    "frames.arrow",
    OLDER_VECTOR_FRAME_SCHEMA,
    olderFrameBytes,
  );
  older = await replaceRecordMember(
    older,
    "pictures.jsonl",
    LEGACY_VECTOR_PICTURE_SCHEMA,
    pictureMember.bytes,
  );
  const olderSerialized = serializeVectorRecord(older);
  const olderOpened = await openVectorSimulationRecord(
    olderSerialized.buffer,
    olderSerialized.byteLength,
  );
  assert.deepEqual(olderOpened.result.frames, result.frames);
  assert.ok(olderOpened.pictures.every((picture) => picture.schemaVersion === "vector.observer-state.v2"));
});

test("VSR rejects tampered side-owned track state and track-event history", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(scenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const openOptions = { compiledModelPack: binding.pack };
  const capabilityManifest = createVerificationDeploymentCapabilities("typescript", ["A2A"], [binding.pack.digest]);
  const prepared = { ...base, engineScenario: binding.scenario, capabilityManifest };
  const engineRun = runEngineBackend(binding.scenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);

  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(pictureMember);
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n").map(JSON.parse);
  const tracked = pictures.find((picture) => picture.schemaVersion === "vector.observer-state.v3" && picture.tracks.length > 0);
  assert.ok(tracked);
  tracked.tracks[0].truthEntityId = "red-object-1";
  let corrupt = await replaceRecordMember(
    record,
    "pictures.jsonl",
    VECTOR_PICTURE_SCHEMA,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );
  let serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /unsupported or missing|truth/i,
  );

  const eventMember = record.members.find((member) => member.path === "events.jsonl");
  assert.ok(eventMember);
  const events = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  const transition = events.find((event) => event.payload.kind === "TRACK_STATE_CHANGED");
  assert.ok(transition);
  transition.payload.sourceSequence += 1;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /ownership|frame state|transition/i,
  );

  const observationEvents = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  const observationTransition = observationEvents.find((event) =>
    event.payload.kind === "TRACK_STATE_CHANGED" && event.payload.observationId !== null
  );
  assert.ok(observationTransition);
  observationTransition.payload.observationId = `${observationTransition.payload.perspective}-OBS-9999-99999999`;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(observationEvents.map((event) => canonicalJson(event)).join("\n")),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /observation cause/i,
  );
});

test("VSR rejects consistently forged track sources beside the admitted pack digest", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(scenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const openOptions = { compiledModelPack: binding.pack };
  const capabilityManifest = createVerificationDeploymentCapabilities("typescript", ["A2A"], [binding.pack.digest]);
  const prepared = { ...base, engineScenario: binding.scenario, capabilityManifest };
  const engineRun = runEngineBackend(binding.scenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const forgedModelId = "forged-valid-digest-model";

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  const frames = decodeColumnarFrames(frameMember.bytes);
  for (const frame of frames) for (const state of frame.observerStates) {
    if (state.schemaVersion !== "vector.observer-state.v3") continue;
    state.sensorModelId = forgedModelId;
    for (const value of [...state.observations, ...state.tracks]) value.source.sensorModelId = forgedModelId;
  }
  let corrupt = await replaceRecordMember(record, "frames.arrow", VECTOR_FRAME_SCHEMA, encodeColumnarFrames(frames));

  const pictureMember = corrupt.members.find((member) => member.path === "pictures.jsonl");
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n").map(JSON.parse);
  for (const state of pictures) {
    if (state.schemaVersion !== "vector.observer-state.v3") continue;
    state.sensorModelId = forgedModelId;
    state.source = forgedModelId;
    for (const value of [...state.observations, ...state.tracks]) value.source.sensorModelId = forgedModelId;
  }
  corrupt = await replaceRecordMember(
    corrupt,
    "pictures.jsonl",
    VECTOR_PICTURE_SCHEMA,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );

  const eventMember = corrupt.members.find((member) => member.path === "events.jsonl");
  const events = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  for (const event of events) if (event.payload.kind === "TRACK_STATE_CHANGED") event.payload.sensorModelId = forgedModelId;
  corrupt = await replaceRecordMember(
    corrupt,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /compiled scenario|admitted scenario|canonical tick state/i,
  );
});

test("VSR rejects corruption before exposing replay data", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const serialized = serializeVectorRecord(record);
  const bytes = new Uint8Array(serialized.buffer);
  bytes[serialized.byteLength - 1] ^= 0xff;
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /failed SHA-256 verification/,
  );

  const missing = serializeVectorRecord({
    ...record,
    members: record.members.filter((item) => item.path !== "events.jsonl"),
  });
  await assert.rejects(
    openVectorSimulationRecord(missing.buffer, missing.byteLength),
    /events\.jsonl.*does not match its manifest/,
  );
});

test("VSR rejects an observer-picture member with an unadmitted schema", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const unsupportedPictures = {
    ...record,
    members: record.members.map((member) =>
      member.path === "pictures.jsonl"
        ? { ...member, schemaVersion: "vector.pictures.v5" }
        : member,
    ),
  };
  const serialized = serializeVectorRecord(unsupportedPictures);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit the required observer-picture schema/,
  );
});

test("VSR admits only the governed frame/picture schema pairs", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(prepareSimulation(scenario), simulate(scenario), createdAt);
  for (const [frameSchema, pictureSchema] of [
    [VECTOR_FRAME_SCHEMA, LEGACY_VECTOR_PICTURE_SCHEMA],
    [LEGACY_VECTOR_FRAME_SCHEMA, LEGACY_VECTOR_PICTURE_SCHEMA],
    [OLDER_VECTOR_FRAME_SCHEMA, VECTOR_PICTURE_SCHEMA],
  ]) {
    let corrupt = await replaceRecordMember(record, "frames.arrow", frameSchema, record.members.find((member) => member.path === "frames.arrow").bytes);
    corrupt = await replaceRecordMember(corrupt, "pictures.jsonl", pictureSchema, record.members.find((member) => member.path === "pictures.jsonl").bytes);
    const serialized = serializeVectorRecord(corrupt);
    await assert.rejects(openVectorSimulationRecord(serialized.buffer, serialized.byteLength), /frame.*picture|schema pair/i);
  }
});

test("VSR opens legacy v1 events only as an explicit unavailable stream", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const legacyBytes = textEncoder.encode(canonicalJson({
    schemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
    id: "event-000000",
    sequence: 0,
    t: 0,
    type: "ENTITY_ACTIVATED",
    entityId: "blue-aircraft-1",
    detail: "ACTIVE",
  }));
  const legacyRecord = await replaceRecordMember(
    record,
    "events.jsonl",
    LEGACY_VECTOR_EVENT_SCHEMA,
    legacyBytes,
  );
  const serialized = serializeVectorRecord(legacyRecord);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);

  assert.deepEqual(opened.events, {
    state: "UNAVAILABLE",
    sourceSchemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
    reason: "LEGACY_EVENT_SCHEMA",
  });
  assert.deepEqual(opened.result.engineRun.events, opened.events);
  assert.ok(opened.result.frames.length > 0, "legacy replay remains read-only without invented v2 events");
});

test("VSR rejects unsupported, reordered, and causally corrupt v2 event streams", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const encodeEvents = (events) =>
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n"));

  const unsupported = await replaceRecordMember(
    record,
    "events.jsonl",
    "vector.simulation-event.v3",
    encodeEvents(result.engineRun.events.items),
  );
  let serialized = serializeVectorRecord(unsupported);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit a supported simulation-event schema/,
  );

  const reorderedItems = structuredClone(result.engineRun.events.items);
  [reorderedItems[0], reorderedItems[1]] = [reorderedItems[1], reorderedItems[0]];
  const reordered = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(reorderedItems),
  );
  serialized = serializeVectorRecord(reordered);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid sequence or ID/,
  );

  const causalItems = structuredClone(result.engineRun.events.items);
  causalItems[0].causeEventIds = [causalItems[1].id];
  const causal = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(causalItems),
  );
  serialized = serializeVectorRecord(causal);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /missing or future causal reference/,
  );

  const inventedBackwardCauseItems = structuredClone(result.engineRun.events.items);
  const completed = inventedBackwardCauseItems.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  completed.causeEventIds = [inventedBackwardCauseItems[0].id];
  const inventedBackwardCause = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(inventedBackwardCauseItems),
  );
  serialized = serializeVectorRecord(inventedBackwardCause);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload family does not admit causal references/,
  );

  const unknownPayloadItems = structuredClone(result.engineRun.events.items);
  unknownPayloadItems[0].payload.kind = "TYPO_EVENT";
  const unknownPayload = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(unknownPayloadItems),
  );
  serialized = serializeVectorRecord(unknownPayload);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload kind is unsupported/,
  );

  const futurePayloadVersionItems = structuredClone(result.engineRun.events.items);
  futurePayloadVersionItems[0].payload.schemaVersion =
    "vector.simulation-event-payload.run-started.v2";
  const futurePayloadVersion = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(futurePayloadVersionItems),
  );
  serialized = serializeVectorRecord(futurePayloadVersion);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload schema is unsupported/,
  );
});

test("VSR rejects a hash-resealed terminal-event distance that contradicts the report", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  terminal.payload.closestApproachM += 1;
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept distance/,
  );
});

test("VSR rejects hash-rebound termination limits beside a retained pack identity", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const weapon = compiled.engineScenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.termination.interceptRadiusM += 100;
  const projected = compiled.engineScenario.modelPack.weaponTerminations.find(
    (candidate) => candidate.modelId === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(projected);
  projected.termination.interceptRadiusM = weapon.weapon.termination.interceptRadiusM;
  const runtimeProjection = structuredClone(compiled.engineScenario.modelPack);
  delete runtimeProjection.runtimeDigest;
  compiled.engineScenario.modelPack = bindRuntimeModelPackDigest(runtimeProjection);
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match the exact compiled model pack/,
  );
});

test("VSR rejects missing runtime digest for retained weapon-termination authority", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  delete compiled.engineScenario.modelPack.runtimeDigest;
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /runtime model-pack projection digest/,
  );
});

test("VSR rejects hash-resealed weapon-termination authority under an unretained pack", async () => {
  const scenario = SCENARIO_LIBRARY.find((entry) => entry.scenario.airMission === undefined).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", [scenario.domain]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const runtimeProjection = structuredClone(compiled.engineScenario.modelPack);
  runtimeProjection.id = "unretained-termination-authority";
  runtimeProjection.version = "9.9.9";
  runtimeProjection.digest = "9".repeat(64);
  delete runtimeProjection.runtimeDigest;
  compiled.engineScenario.modelPack = bindRuntimeModelPackDigest(runtimeProjection);
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /No retained compiled model pack matches weapon-termination authority/,
  );
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, {
      compiledModelPack: resolveRetainedCompiledModelPack(prepared.engineScenario.modelPack),
    }),
    /Supplied compiled model pack does not match the exact recorded identity/,
  );
});

test("VSR binds a terminal event to the report's exact primary weapon and target", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const carriedWeapon = result.engineRun.scenario.entities.find(
    (entity) =>
      entity.kind === "GUIDED_WEAPON" &&
      entity.id !== result.engineRun.primaryWeaponId,
  );
  assert.ok(carriedWeapon);
  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.primaryWeaponId = carriedWeapon.id;
  const corrupt = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR requires an active target for every terminal cause except target-unavailable", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
  );
  assert.ok(weapon?.weapon);
  governWeaponTermination(prepared.engineScenario, weapon, {
    maximumFlightTimeSeconds: 0.1,
  });
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  assert.equal(engineRun.termination, "weapon_expired");
  assert.equal(engineRun.events.state, "AVAILABLE");
  const terminal = engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "FLIGHT_TIME_EXPIRED");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects a hash-resealed terminal event with a false prior weapon state", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  terminal.payload.from = terminal.payload.from === "BOOST" ? "COAST" : "BOOST";
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects a hash-resealed geometric intercept occurrence time", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  terminal.payload.occurrenceTimeSeconds = Number((
    terminal.payload.occurrenceTimeSeconds - 0.04
  ).toFixed(6));
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept time/,
  );
});

test("VSR rejects hash-resealed geometric distance even when report and event agree", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  const forgedDistanceM = Math.min(
    terminal.payload.interceptRadiusM,
    terminal.payload.closestApproachM + 1,
  );
  assert.notEqual(forgedDistanceM, terminal.payload.closestApproachM);
  terminal.payload.closestApproachM = forgedDistanceM;

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.closestApproachM = forgedDistanceM;
  let corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  corrupt = await replaceRecordMember(
    corrupt,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept distance/,
  );
});

test("VSR rejects a geometric intercept whose target is terminal in the event frame", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects target-unavailable termination while the target remains active", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const targetDefinition = prepared.engineScenario.entities.find(
    (entity) => entity.id === "red-object-1",
  );
  assert.ok(targetDefinition);
  targetDefinition.lifecycle = "TERMINATED";
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  assert.equal(engineRun.events.state, "AVAILABLE");
  const terminal = engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "TARGET_UNAVAILABLE");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "ACTIVE";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects a lifecycle event whose valid from-enum falsifies canonical history", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const target = prepared.engineScenario.entities.find((entity) => entity.id === "red-object-1");
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  assert.equal(engineRun.events.state, "AVAILABLE");
  const events = structuredClone(engineRun.events.items);
  const transition = events.find((event) =>
    event.payload.kind === "ENTITY_LIFECYCLE_CHANGED"
  );
  assert.ok(transition?.payload.kind === "ENTITY_LIFECYCLE_CHANGED");
  transition.payload.from = "TRACKING";
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /prior canonical lifecycle/,
  );
});

test("VSR rejects valid-state events moved away from their transition boundaries", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const engineRun = result.engineRun;
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  assert.equal(engineRun.events.state, "AVAILABLE");
  const weapon = engineRun.scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON");
  assert.ok(weapon?.weapon);
  const encodeEvents = (events) =>
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n"));

  const delayedEntry = structuredClone(engineRun.events.items);
  const entry = delayedEntry.find((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id
  );
  assert.ok(entry);
  const laterFrame = engineRun.frames.findIndex((frame) => frame.t === 0.25);
  assert.ok(laterFrame >= 0);
  entry.tick = 5;
  entry.modelTimeSeconds = 0.25;
  entry.frameIndex = laterFrame;
  let corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(delayedEntry),
  );
  let serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /declared launch boundary/,
  );

  const earlyCompletion = structuredClone(engineRun.events.items);
  const completed = earlyCompletion.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  const terminalTime = engineRun.frames.at(-1).t;
  const earlierTime = Number((terminalTime - 0.25).toFixed(6));
  const earlierFrame = engineRun.frames.findIndex((frame) => frame.t === earlierTime);
  assert.ok(earlierFrame >= 0);
  completed.tick = Math.round(earlierTime / engineRun.scenario.fixedStepSeconds);
  completed.modelTimeSeconds = earlierTime;
  completed.frameIndex = earlierFrame;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(earlyCompletion),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /final retained frame/,
  );
});

test("columnar frame decoder rejects an unsupported member schema", () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const bytes = encodeColumnarFrames(simulate(scenario).engineRun.frames);
  const encodedSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "9".charCodeAt(0);
  assert.throws(() => decodeColumnarFrames(bytes), /schema is unsupported/);
});

test("columnar frame decoder rejects v3 records because canonical observer state is absent", () => {
  const bytes = encodeColumnarFrames(simulate(SCENARIO_LIBRARY[0].scenario).engineRun.frames);
  const encodedSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "3".charCodeAt(0);
  assert.throws(
    () => decodeColumnarFrames(bytes),
    /omits canonical observer state/,
  );
});
