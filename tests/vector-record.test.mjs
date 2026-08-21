import assert from "node:assert/strict";
import test from "node:test";
import {
  createVectorSimulationRecord,
  decodeColumnarFrames,
  encodeColumnarFrames,
  openVectorSimulationRecord,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import {
  prepareSimulation,
  simulate,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";

const createdAt = "2026-08-06T00:00:00.000Z";

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
    assert.deepEqual(
      opened.result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      "VSR must retain the compiled fly-by route constraint for replay audit",
    );
    assert.deepEqual(opened.result.frames, result.frames);
    assert.deepEqual(opened.result.envelopes, result.envelopes);
    assert.equal(opened.result.reason, result.reason);
    assert.ok(opened.events.length > 0);
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
        ? { ...member, schemaVersion: "vector.pictures.v3" }
        : member,
    ),
  };
  const serialized = serializeVectorRecord(unsupportedPictures);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit the required observer-picture schema/,
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
