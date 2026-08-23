import {
  GENERIC_AAM_VERIFIER_WASM_BASE64,
  GENERIC_AAM_VERIFIER_WASM_BYTES,
  GENERIC_AAM_VERIFIER_WASM_SHA256,
} from "./generated/generic-aam-verifier-wasm.ts";
import {
  decodeGenericAamVerificationRunJson,
  type GenericAamVerificationInput,
  type GenericAamVerificationRun,
} from "./generic-aam-verification.ts";

type VerificationExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  vector_generic_aam_abi_version: () => number;
  vector_generic_aam_max_input_len: () => number;
  vector_generic_aam_input_reserve: (length: number) => number;
  vector_generic_aam_run_json: () => number;
  vector_generic_aam_output_ptr: () => number;
  vector_generic_aam_output_len: () => number;
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
  const bytes = decodeBase64(GENERIC_AAM_VERIFIER_WASM_BASE64);
  if (bytes.byteLength !== GENERIC_AAM_VERIFIER_WASM_BYTES) throw new Error("Generic-AAM verification artifact length mismatch.");
  const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as VerificationExports;
  if (!(exports.memory instanceof WebAssembly.Memory)
    || typeof exports.vector_generic_aam_abi_version !== "function"
    || typeof exports.vector_generic_aam_max_input_len !== "function"
    || typeof exports.vector_generic_aam_input_reserve !== "function"
    || typeof exports.vector_generic_aam_run_json !== "function"
    || typeof exports.vector_generic_aam_output_ptr !== "function"
    || typeof exports.vector_generic_aam_output_len !== "function"
    || exports.vector_generic_aam_abi_version() !== 1) throw new Error("Generic-AAM verification artifact ABI is invalid.");
  verifier = exports;
  return exports;
}

export function runRustWasmGenericAamVerification(input: GenericAamVerificationInput): GenericAamVerificationRun {
  const wasm = getVerifier();
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  if (encoded.byteLength > wasm.vector_generic_aam_max_input_len()) throw new Error("Generic-AAM verification input exceeds its isolated ABI limit.");
  const pointer = wasm.vector_generic_aam_input_reserve(encoded.byteLength);
  if (encoded.byteLength > 0 && pointer === 0) throw new Error("Generic-AAM verifier could not reserve input.");
  new Uint8Array(wasm.memory.buffer, pointer, encoded.byteLength).set(encoded);
  const succeeded = wasm.vector_generic_aam_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.vector_generic_aam_output_ptr(), wasm.vector_generic_aam_output_len()));
  if (!succeeded) throw new Error(`Generic-AAM verification artifact rejected input: ${output}`);
  return decodeGenericAamVerificationRunJson(output, input, "rust-wasm");
}

export const GENERIC_AAM_VERIFIER_ARTIFACT = {
  sha256: GENERIC_AAM_VERIFIER_WASM_SHA256,
  bytes: GENERIC_AAM_VERIFIER_WASM_BYTES,
} as const;
