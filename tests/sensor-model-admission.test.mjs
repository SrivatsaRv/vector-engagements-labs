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

function admittedScenario({ mode = "SEARCH", rangeM = 120_000, digest } = {}) {
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

function stateAtStart(run, perspective) {
  return run.frames[0].observerStates.find((state) => state.perspective === perspective);
}

test("a positive, versioned sensor admission emits a non-positional plot only at a due scan", () => {
  const { engineScenario } = admittedScenario();
  const run = runEngineBackend(engineScenario, "typescript");
  const iaf = stateAtStart(run, "IAF");
  const paf = stateAtStart(run, "PAF");
  assert.deepEqual(iaf, {
    schemaVersion: "vector.observer-state.v2",
    perspective: "IAF",
    sensorState: "SEARCH",
    observationCount: 1,
    trackState: "PLOT",
    visible: false,
    availabilityReason: "OBSERVATION_ADMITTED",
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: "One due scan satisfied the admitted range and field-of-view conditions. This plot has no position estimate or weapon-support authority.",
    sensorModelId: "test-radar-model-v1",
  });
  assert.equal(paf.sensorState, "UNSUPPORTED");
  assert.equal(paf.observationCount, 0);
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

test("the same admitted contract is TypeScript/Rust parity evidence", () => {
  const { engineScenario } = admittedScenario();
  const typescript = runEngineBackend(engineScenario, "typescript");
  const rust = runEngineBackend(engineScenario, "rust-wasm");
  assert.deepEqual(
    rust.frames.map((frame) => frame.observerStates),
    typescript.frames.map((frame) => frame.observerStates),
  );
});

test("range, mode, and model-pack mismatch fail closed instead of manufacturing a track", () => {
  const outOfRange = runEngineBackend(admittedScenario({ rangeM: 101 }).engineScenario, "typescript");
  assert.equal(stateAtStart(outOfRange, "IAF").trackState, "NONE");
  assert.equal(stateAtStart(outOfRange, "IAF").availabilityReason, "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME");
  const off = runEngineBackend(admittedScenario({ mode: "OFF" }).engineScenario, "typescript");
  assert.equal(stateAtStart(off, "IAF").trackState, "NONE");
  assert.equal(stateAtStart(off, "IAF").availabilityReason, "SENSOR_OFF");
  assert.throws(
    () => runEngineBackend(admittedScenario({ digest: "0".repeat(64) }).engineScenario, "typescript"),
    /Observer sensor blue-platform-1 has no valid compiled admission/,
  );
  assert.throws(
    () => runEngineBackend(admittedScenario({ digest: "0".repeat(64) }).engineScenario, "rust-wasm"),
    /observer sensor blue-platform-1 admission does not match scenario model pack/,
  );
});

test("VSR replay preserves the admitted plot without rebuilding an estimate from world frames", async () => {
  const { prepared, engineScenario } = admittedScenario();
  const run = runEngineBackend(engineScenario, "typescript");
  const result = buildSimulationResult(prepared, run);
  const record = await createVectorSimulationRecord(prepared, result, "2026-08-21T00:00:00.000Z");
  const serialized = serializeVectorRecord(record);
  const replay = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  const plot = replay.pictures.find((picture) => picture.trackState === "PLOT");
  assert.ok(plot);
  assert.equal(plot.sensorModelId, "test-radar-model-v1");
  assert.equal(plot.visible, false);
  assert.equal("position" in plot, false);
  assert.equal("observedEntityId" in plot, false);
  assert.equal("truthPosition" in plot, false);
});
