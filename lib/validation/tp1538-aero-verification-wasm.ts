import {
  TP1538_AERO_VERIFIER_WASM_BASE64,
  TP1538_AERO_VERIFIER_WASM_BYTES,
  TP1538_AERO_VERIFIER_WASM_SHA256,
} from "./generated/tp1538-aero-verifier-wasm.ts";
import {
  createTp1538EvaluatorBatch,
  validateTp1538EvaluatorBatchResult,
  type Tp1538AeroAssemblyInput,
  type Tp1538AeroLookupRequest,
  type Tp1538EvaluatorBatchResult,
} from "./tp1538-aero-verification.ts";

type VerificationExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  vector_tp1538_aero_abi_version: () => number;
  vector_tp1538_aero_max_input_len: () => number;
  vector_tp1538_aero_input_reserve: (length: number) => number;
  vector_tp1538_aero_run_json: () => number;
  vector_tp1538_aero_output_ptr: () => number;
  vector_tp1538_aero_output_len: () => number;
};

let verifier: VerificationExports | null = null;

function decodeBase64(value: string) {
  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function getVerifier() {
  if (verifier) return verifier;
  const bytes = decodeBase64(TP1538_AERO_VERIFIER_WASM_BASE64);
  if (bytes.byteLength !== TP1538_AERO_VERIFIER_WASM_BYTES) throw new Error("TP-1538 verification artifact length mismatch.");
  const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as VerificationExports;
  if (!(exports.memory instanceof WebAssembly.Memory)
    || exports.vector_tp1538_aero_abi_version() !== 1) throw new Error("TP-1538 verification artifact ABI is invalid.");
  verifier = exports;
  return exports;
}

function executeEncodedBatch(encoded: Uint8Array): unknown {
  const wasm = getVerifier();
  if (encoded.byteLength > wasm.vector_tp1538_aero_max_input_len()) throw new Error("TP-1538 verification input exceeds its isolated ABI limit.");
  const pointer = wasm.vector_tp1538_aero_input_reserve(encoded.byteLength);
  if (encoded.byteLength > 0 && pointer === 0) throw new Error("TP-1538 verifier could not reserve input.");
  new Uint8Array(wasm.memory.buffer, pointer, encoded.byteLength).set(encoded);
  const succeeded = wasm.vector_tp1538_aero_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.vector_tp1538_aero_output_ptr(), wasm.vector_tp1538_aero_output_len()));
  if (!succeeded) throw new Error(`TP-1538 verification artifact rejected input: ${output}`);
  return JSON.parse(output);
}

export function prepareRustWasmTp1538AeroBatch(
  corpusCandidate: unknown,
  expectedCorpusSha256: string,
  lookupRequests: Tp1538AeroLookupRequest[],
  assemblyRequests: Tp1538AeroAssemblyInput[],
) {
  const corpus = structuredClone(corpusCandidate);
  const batch = createTp1538EvaluatorBatch(corpus, expectedCorpusSha256, lookupRequests, assemblyRequests);
  const encoded = new TextEncoder().encode(JSON.stringify(batch));
  return Object.freeze({
    encodedBytes: encoded.byteLength,
    executeCandidate: () => executeEncodedBatch(encoded),
    validateCandidate: (candidate: unknown) => validateTp1538EvaluatorBatchResult(corpus, batch, candidate, expectedCorpusSha256),
  });
}

export function runRustWasmTp1538AeroBatch(
  corpusCandidate: unknown,
  expectedCorpusSha256: string,
  lookupRequests: Tp1538AeroLookupRequest[],
  assemblyRequests: Tp1538AeroAssemblyInput[],
): Tp1538EvaluatorBatchResult {
  const prepared = prepareRustWasmTp1538AeroBatch(corpusCandidate, expectedCorpusSha256, lookupRequests, assemblyRequests);
  return prepared.validateCandidate(prepared.executeCandidate());
}

export const TP1538_AERO_VERIFIER_ARTIFACT = {
  sha256: TP1538_AERO_VERIFIER_WASM_SHA256,
  bytes: TP1538_AERO_VERIFIER_WASM_BYTES,
} as const;
