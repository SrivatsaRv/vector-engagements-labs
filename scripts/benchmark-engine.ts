import { performance } from "node:perf_hooks";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import {
  prepareSimulation,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import type { EngineBackendId } from "../lib/engine/contracts.ts";
import {
  RUST_WASM_ENGINE_ARTIFACT,
  runRustWasmPublicAircraftReference,
} from "../lib/engine/backend.ts";
import {
  publicAircraftReferenceInput,
  runPublicAircraftReference,
} from "../lib/validation/public-aircraft-reference.ts";
import {
  createVectorSimulationRecord,
  encodeColumnarFrames,
  serializeVectorRecord,
} from "../lib/record/vector-record.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";

const verificationDomains = ["A2A", "A2G", "G2A", "G2G"] as const;
const capabilities = Object.fromEntries(
  (["typescript", "rust-wasm"] as const).map((backend) => [
    backend,
    createVerificationDeploymentCapabilities(backend, verificationDomains),
  ]),
) as Record<EngineBackendId, ReturnType<typeof createVerificationDeploymentCapabilities>>;

const warmupRounds = 2;
const measuredRounds = Number(process.env.VECTOR_BENCHMARK_ROUNDS ?? 25);
const maximumP95Ms = Number(process.env.VECTOR_MAX_ENGINE_P95_MS ?? 75);

const backends: EngineBackendId[] = ["typescript", "rust-wasm"];
const coldStartMs: Partial<Record<EngineBackendId, number>> = {};
const samples: Array<{
  backend: EngineBackendId;
  id: string;
  durationMs: number;
  frames: number;
}> = [];

for (const backend of backends) {
  const coldStarted = performance.now();
  simulateWithCapabilitiesForVerification(SCENARIO_LIBRARY[0].scenario, capabilities[backend]);
  coldStartMs[backend] = performance.now() - coldStarted;
  for (let round = 0; round < warmupRounds; round += 1) {
    for (const definition of SCENARIO_LIBRARY) {
      simulateWithCapabilitiesForVerification(definition.scenario, capabilities[backend]);
    }
  }
  for (let round = 0; round < measuredRounds; round += 1) {
    for (const definition of SCENARIO_LIBRARY) {
      const started = performance.now();
      const result = simulateWithCapabilitiesForVerification(
        definition.scenario,
        capabilities[backend],
      );
      samples.push({
        backend,
        id: definition.id,
        durationMs: performance.now() - started,
        frames: result.frames.length,
      });
    }
  }
}

const summary = (backend: EngineBackendId) => {
  const backendSamples = samples.filter((sample) => sample.backend === backend);
  const durations = backendSamples
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const percentile = (value: number) =>
    durations[
      Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)
    ];
  const totalModelFrames = backendSamples.reduce(
    (sum, sample) => sum + sample.frames,
    0,
  );
  const totalWallMs = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    backend,
    coldStartMs: Number(coldStartMs[backend]!.toFixed(3)),
    measuredRuns: backendSamples.length,
    totalModelFrames,
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maxMs: Number(durations.at(-1)!.toFixed(3)),
    framesPerWallSecond: Math.round(totalModelFrames / (totalWallMs / 1000)),
  };
};

const backendResults = backends.map(summary);
const referenceInput = publicAircraftReferenceInput();
const referenceBenchmarks = [
  { backend: "typescript", run: () => runPublicAircraftReference(referenceInput) },
  { backend: "rust-wasm", run: () => runRustWasmPublicAircraftReference(referenceInput) },
].map(({ backend, run }) => {
  const durations = Array.from({ length: 200 }, () => {
    const started = performance.now();
    run();
    return performance.now() - started;
  }).sort((a, b) => a - b);
  return {
    backend,
    runs: durations.length,
    p50Ms: Number(durations[Math.ceil(durations.length * 0.5) - 1].toFixed(3)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1].toFixed(3)),
    maxMs: Number(durations.at(-1)!.toFixed(3)),
  };
});
const transportEvidence = [];
for (const backend of backends) {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities[backend]);
  const representative = simulateWithCapabilitiesForVerification(
    scenario,
    capabilities[backend],
  );
  const record = await createVectorSimulationRecord(
    prepared,
    representative,
    "2026-08-06T00:00:00.000Z",
  );
  const serialized = serializeVectorRecord(record);
  transportEvidence.push({
    backend,
    integratedSteps: representative.engineRun.diagnostics.integratedSteps,
    workerModelBatchesAt128Ticks:
      backend === "typescript"
        ? Math.ceil(representative.engineRun.diagnostics.integratedSteps / 128)
        : 1,
    wasmExportCallsPerRun: backend === "rust-wasm" ? 4 : 0,
    jsonScenarioBytes: Buffer.byteLength(JSON.stringify(prepared.engineScenario)),
    jsonEngineRunBytes: Buffer.byteLength(JSON.stringify(representative.engineRun)),
    columnarFrameBytes: encodeColumnarFrames(representative.engineRun.frames).byteLength,
    vectorRecordBytes: serialized.byteLength,
    reusableTransferCapacityBytes: serialized.buffer.byteLength,
  });
}
const result = {
  engine: "browser-point-mass-v0.5",
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  scenarios: SCENARIO_LIBRARY.length,
  rustWasmBytes: RUST_WASM_ENGINE_ARTIFACT.bytes,
  backends: backendResults,
  publicAircraftReference: referenceBenchmarks,
  transportEvidence,
  regressionLimitP95Ms: maximumP95Ms,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
for (const backend of backendResults) {
  if (backend.p95Ms > maximumP95Ms) {
    throw new Error(
      `${backend.backend} engine p95 ${backend.p95Ms} ms exceeded ${maximumP95Ms} ms regression limit`,
    );
  }
}
