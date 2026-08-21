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
