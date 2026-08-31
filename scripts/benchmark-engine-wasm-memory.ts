import { execFileSync } from "node:child_process";

import {
  VECTOR_ENGINE_WASM_BASE64,
} from "../lib/engine/generated/vector-engine-wasm.ts";
import { ENGINE_WASM_PERFORMANCE_POLICY } from "../lib/engine/performance-policy.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  HIGH_ENERGY_CROSSING_CHALLENGE_ID,
  SCENARIO_LIBRARY,
} from "../lib/scenarios.ts";
import { prepareSimulation } from "../lib/simulation.ts";

type EngineExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  vector_input_reserve: (length: number) => number;
  vector_max_input_len: () => number;
  vector_run_json: () => number;
  vector_output_ptr: () => number;
  vector_output_len: () => number;
};

const RUNS = 100;
const baselineSource = execFileSync(
  "git",
  [
    "show",
    `${ENGINE_WASM_PERFORMANCE_POLICY.baselineCommit}:lib/engine/generated/vector-engine-wasm.ts`,
  ],
  { encoding: "utf8", maxBuffer: 2_000_000 },
);
const baselineBase64 = baselineSource.match(
  /VECTOR_ENGINE_WASM_BASE64 = "([A-Za-z0-9+/=]+)"/,
)?.[1];
if (!baselineBase64) throw new Error("The frozen engine WASM memory baseline is unavailable.");

const definition = SCENARIO_LIBRARY.find(
  (candidate) => candidate.id === HIGH_ENERGY_CROSSING_CHALLENGE_ID,
);
if (!definition) throw new Error("The high-energy memory workload is unavailable.");
const capabilities = createVerificationDeploymentCapabilities(
  "rust-wasm",
  ["A2A", "A2G", "G2A", "G2G"],
);
const candidateScenario = prepareSimulation(
  definition.scenario,
  definition.scenario.profile,
  capabilities,
).engineScenario;
const baselineScenario = structuredClone(candidateScenario);
delete baselineScenario.targetEffectAuthority;

function instantiate(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as EngineExports;
}

function run(engine: EngineExports, scenario: typeof candidateScenario) {
  const encoded = new TextEncoder().encode(JSON.stringify(scenario));
  if (encoded.byteLength > engine.vector_max_input_len()) {
    throw new Error("The memory workload exceeds the engine ABI input limit.");
  }
  const pointer = engine.vector_input_reserve(encoded.byteLength);
  new Uint8Array(engine.memory.buffer, pointer, encoded.byteLength).set(encoded);
  if (engine.vector_run_json() !== 1) {
    const output = new TextDecoder().decode(new Uint8Array(
      engine.memory.buffer,
      engine.vector_output_ptr(),
      engine.vector_output_len(),
    ));
    throw new Error(`The memory workload was rejected: ${output}`);
  }
  // Consume the output boundary exactly as the production adapter does.
  JSON.parse(new TextDecoder().decode(new Uint8Array(
    engine.memory.buffer,
    engine.vector_output_ptr(),
    engine.vector_output_len(),
  )));
}

function measure(base64: string, scenario: typeof candidateScenario) {
  const engine = instantiate(base64);
  const initialBytes = engine.memory.buffer.byteLength;
  const checkpoints = [];
  for (let index = 1; index <= RUNS; index += 1) {
    run(engine, scenario);
    if (index === 1 || index % 10 === 0) {
      checkpoints.push({ run: index, bytes: engine.memory.buffer.byteLength });
    }
  }
  return {
    initialBytes,
    firstRunBytes: checkpoints[0].bytes,
    finalBytes: checkpoints.at(-1)!.bytes,
    checkpoints,
  };
}

const baseline = measure(baselineBase64, baselineScenario);
const candidate = measure(VECTOR_ENGINE_WASM_BASE64, candidateScenario);
const baselineGrowth = baseline.finalBytes - baseline.initialBytes;
const candidateGrowth = candidate.finalBytes - candidate.initialBytes;
const evidence = {
  schemaVersion: "vector.engine-wasm-memory-evidence.v1",
  runs: RUNS,
  baselineCommit: ENGINE_WASM_PERFORMANCE_POLICY.baselineCommit,
  baseline,
  candidate,
  retainedGrowthRegressionFraction:
    (candidateGrowth - baselineGrowth) / baselineGrowth,
  limits: {
    ...ENGINE_WASM_PERFORMANCE_POLICY,
  },
};
process.stdout.write(`${JSON.stringify(evidence)}\n`);

if (baseline.initialBytes !== ENGINE_WASM_PERFORMANCE_POLICY.initialMemoryBytes ||
    candidate.initialBytes !== ENGINE_WASM_PERFORMANCE_POLICY.initialMemoryBytes) {
  throw new Error("Initial WASM memory changed from the governed identity.");
}
if (candidateGrowth > ENGINE_WASM_PERFORMANCE_POLICY.maximumRetainedMemoryGrowthBytes) {
  throw new Error("Candidate retained-memory growth exceeds its absolute ceiling.");
}
if (evidence.retainedGrowthRegressionFraction >
    ENGINE_WASM_PERFORMANCE_POLICY.maximumRetainedMemoryRegressionFraction) {
  throw new Error("Candidate retained-memory growth regressed beyond the baseline allowance.");
}
if (candidate.finalBytes - candidate.firstRunBytes >
    ENGINE_WASM_PERFORMANCE_POLICY.maximumSoakGrowthAfterFirstRunBytes) {
  throw new Error("Candidate WASM memory continued growing after its first run.");
}
