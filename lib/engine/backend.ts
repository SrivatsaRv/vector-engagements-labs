import type {
  EngineBackendId,
  EngineRun,
  EngineScenario,
} from "./contracts.ts";
import { runEngine } from "./core.ts";
import {
  VECTOR_ENGINE_WASM_BASE64,
  VECTOR_ENGINE_WASM_BYTES,
  VECTOR_ENGINE_WASM_SHA256,
} from "./generated/vector-engine-wasm.ts";
import { enginePositionToGeographic } from "../scenario-spatial.ts";
import { assertSimulationEventStream } from "./simulation-events.ts";
import { sha256HexSync } from "../geospatial/digest.ts";
import {
  assertRuntimeModelPackAuthority,
} from "./runtime-model-pack.ts";
import { findRetainedCompiledModelPack } from "./retained-model-packs.ts";
import type {
  PublicAircraftReferenceInput,
  PublicAircraftReferenceRun,
} from "../validation/public-aircraft-reference.ts";
type RustEngineExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  vector_abi_version: () => number;
  vector_input_reserve: (length: number) => number;
  vector_max_input_len: () => number;
  vector_run_json: () => number;
  vector_reference_run_json: () => number;
  vector_output_ptr: () => number;
  vector_output_len: () => number;
};

let rustEngine: RustEngineExports | null = null;

function withGeospatialRecord(
  scenario: EngineScenario,
  run: EngineRun,
): EngineRun {
  return {
    ...run,
    scenario: {
      ...run.scenario,
      ...(scenario.airMission ? { airMission: scenario.airMission } : {}),
      geospatial: scenario.geospatial,
      environment: {
        ...run.scenario.environment,
        studyArea: {
          ...run.scenario.environment.studyArea,
          surfaceElevationDatum:
            scenario.environment.studyArea.surfaceElevationDatum,
        },
      },
    },
    frames: run.frames.map((frame) => ({
      ...frame,
      geographicPositions: frame.geographicPositions
        ?? frame.entities.map((entity) => ({
          entityId: entity.id,
          position: enginePositionToGeographic(
            entity.position,
            scenario.geospatial.origin,
          ),
        })),
    })),
    envelopes: run.envelopes.map((envelope) => ({
      ...envelope,
      basis: envelope.basis ?? "DECLARED",
    })),
  };
}

function decodeBase64(value: string) {
  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function getRustEngine() {
  if (rustEngine) return rustEngine;
  const bytes = decodeBase64(VECTOR_ENGINE_WASM_BASE64);
  if (bytes.byteLength !== VECTOR_ENGINE_WASM_BYTES) {
    throw new Error("The embedded VECTOR Rust/WASM module failed its length check.");
  }
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
  const exports = instance.exports as RustEngineExports;
  if (
    !(exports.memory instanceof WebAssembly.Memory) ||
    typeof exports.vector_abi_version !== "function" ||
    typeof exports.vector_input_reserve !== "function" ||
    typeof exports.vector_max_input_len !== "function" ||
    typeof exports.vector_run_json !== "function" ||
    typeof exports.vector_reference_run_json !== "function" ||
    typeof exports.vector_output_ptr !== "function" ||
    typeof exports.vector_output_len !== "function"
  ) {
    throw new Error("The VECTOR Rust/WASM module does not expose the required engine ABI.");
  }
  if (exports.vector_abi_version() !== 1) {
    throw new Error("The VECTOR Rust/WASM module exposes an unsupported ABI version.");
  }
  rustEngine = exports;
  return exports;
}

export function runRustWasmPublicAircraftReference(
  input: PublicAircraftReferenceInput,
): PublicAircraftReferenceRun {
  const engine = getRustEngine();
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  if (encoded.byteLength > engine.vector_max_input_len()) {
    throw new Error("The public aircraft reference input exceeds the Rust/WASM ABI limit.");
  }
  const inputPointer = engine.vector_input_reserve(encoded.byteLength);
  if (encoded.byteLength > 0 && inputPointer === 0) {
    throw new Error("The Rust/WASM engine could not reserve the reference input buffer.");
  }
  new Uint8Array(engine.memory.buffer, inputPointer, encoded.byteLength).set(encoded);
  const succeeded = engine.vector_reference_run_json() === 1;
  const output = new TextDecoder().decode(
    new Uint8Array(
      engine.memory.buffer,
      engine.vector_output_ptr(),
      engine.vector_output_len(),
    ),
  );
  if (!succeeded) {
    throw new Error(`VECTOR Rust/WASM reference runner rejected the case: ${output}`);
  }
  return JSON.parse(output) as PublicAircraftReferenceRun;
}

export function runRustWasmEngine(scenario: EngineScenario): EngineRun {
  const engine = getRustEngine();
  const retainedPack = findRetainedCompiledModelPack(scenario.modelPack);
  assertRuntimeModelPackAuthority(scenario.modelPack, retainedPack);
  if (scenario.airMission) {
    const compiledContent = structuredClone(scenario.airMission) as Record<string, unknown>;
    delete compiledContent.compiledDigest;
    if (
      sha256HexSync(compiledContent) !== scenario.airMission.compiledDigest ||
      sha256HexSync(scenario.airMission.authored) !== scenario.airMission.authoredDigest
    ) {
      throw new Error("Rust/WASM Air mission lineage digest is invalid.");
    }
  }
  const input = new TextEncoder().encode(JSON.stringify(scenario));
  const maximumInputLength = engine.vector_max_input_len();
  if (input.byteLength > maximumInputLength) {
    throw new Error(
      `The VECTOR Rust/WASM scenario is ${input.byteLength} bytes; the ABI maximum is ${maximumInputLength} bytes.`,
    );
  }
  const inputPointer = engine.vector_input_reserve(input.byteLength);
  if (input.byteLength > 0 && inputPointer === 0) {
    throw new Error("The VECTOR Rust/WASM engine could not reserve its input buffer.");
  }
  new Uint8Array(engine.memory.buffer, inputPointer, input.byteLength).set(input);
  const succeeded = engine.vector_run_json() === 1;
  const outputPointer = engine.vector_output_ptr();
  const outputLength = engine.vector_output_len();
  const output = new TextDecoder().decode(
    new Uint8Array(engine.memory.buffer, outputPointer, outputLength),
  );
  if (!succeeded) {
    throw new Error(`VECTOR Rust/WASM engine rejected the scenario: ${output}`);
  }
  const run = JSON.parse(output) as EngineRun;
  if (run.diagnostics.backend !== "rust-wasm") {
    throw new Error("The VECTOR Rust/WASM engine returned invalid provenance.");
  }
  if (run.events?.state !== "AVAILABLE") {
    throw new Error("The VECTOR Rust/WASM engine returned no admitted simulation-event stream.");
  }
  assertSimulationEventStream(
    run.events.items,
    run.frames,
    scenario,
    run.termination,
    run.closestApproachM,
    {
      primaryWeaponId: run.primaryWeaponId,
      primaryTargetId: run.primaryTargetId,
    },
  );
  return withGeospatialRecord(scenario, run);
}

export function runEngineBackend(
  scenario: EngineScenario,
  backend: EngineBackendId,
): EngineRun {
  if (backend === "rust-wasm") return runRustWasmEngine(scenario);
  if (backend === "typescript") return withGeospatialRecord(scenario, runEngine(scenario));
  const exhaustive: never = backend;
  throw new Error(`Unknown VECTOR engine backend: ${exhaustive}`);
}

export const RUST_WASM_ENGINE_ARTIFACT = {
  sha256: VECTOR_ENGINE_WASM_SHA256,
  bytes: VECTOR_ENGINE_WASM_BYTES,
} as const;
