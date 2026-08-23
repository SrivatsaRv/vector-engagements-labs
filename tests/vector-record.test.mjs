import assert from "node:assert/strict";
import test from "node:test";
import {
  createVectorSimulationRecord,
  decodeColumnarFrames,
  encodeColumnarFrames,
  LEGACY_VECTOR_EVENT_SCHEMA,
  openVectorSimulationRecord,
  serializeVectorRecord,
  VECTOR_EVENT_SCHEMA,
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
import {
  assertPhaseAEnvironmentPack,
  environmentPackBinding,
} from "../lib/geospatial/environment-pack.ts";

const createdAt = "2026-08-06T00:00:00.000Z";
const textEncoder = new TextEncoder();
const jsonBytes = (value) => textEncoder.encode(canonicalJson(value));

async function replaceRecordMember(record, path, schemaVersion, bytes) {
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
      feature === VECTOR_EVENT_SCHEMA || feature === LEGACY_VECTOR_EVENT_SCHEMA
        ? schemaVersion
        : feature,
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
    assertPhaseAEnvironmentPack(recordedPack);
    assert.deepEqual(
      opened.result.engineRun.scenario.environment.environmentPack,
      environmentPackBinding(recordedPack),
      "replay must retain the exact admitted environment-pack binding instead of re-resolving a catalog selection",
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
        ? { ...member, schemaVersion: "vector.pictures.v4" }
        : member,
    ),
  };
  const serialized = serializeVectorRecord(unsupportedPictures);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit the required observer-picture schema/,
  );
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
  const encodedSchema = new TextEncoder().encode("vector.frames.columnar.v4");
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "9".charCodeAt(0);
  assert.throws(() => decodeColumnarFrames(bytes), /schema is unsupported/);
});

test("columnar frame decoder rejects v3 records because canonical observer state is absent", () => {
  const bytes = encodeColumnarFrames(simulate(SCENARIO_LIBRARY[0].scenario).engineRun.frames);
  const encodedSchema = new TextEncoder().encode("vector.frames.columnar.v4");
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "2".charCodeAt(0);
  assert.throws(
    () => decodeColumnarFrames(bytes),
    /omits canonical observer state/,
  );
});
