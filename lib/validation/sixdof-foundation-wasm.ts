import {
  SIX_DOF_FOUNDATION_VERIFIER_BUILDER,
  SIX_DOF_FOUNDATION_VERIFIER_WASM_BASE64,
  SIX_DOF_FOUNDATION_VERIFIER_WASM_BYTES,
  SIX_DOF_FOUNDATION_VERIFIER_WASM_SHA256,
} from "./generated/sixdof-foundation-verifier-wasm.ts";
import type {
  SixDofVerificationInput,
  SixDofVerificationRun,
} from "./sixdof-foundation.ts";

type VerificationExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  vector_sixdof_verifier_abi_version: () => number;
  vector_sixdof_verifier_max_input_len: () => number;
  vector_sixdof_verifier_input_reserve: (length: number) => number;
  vector_sixdof_verifier_run_json: () => number;
  vector_sixdof_verifier_output_ptr: () => number;
  vector_sixdof_verifier_output_len: () => number;
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
  const bytes = decodeBase64(SIX_DOF_FOUNDATION_VERIFIER_WASM_BASE64);
  if (bytes.byteLength !== SIX_DOF_FOUNDATION_VERIFIER_WASM_BYTES) {
    throw new Error("The 6DOF verification artifact failed its length check.");
  }
  const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as VerificationExports;
  if (
    !(exports.memory instanceof WebAssembly.Memory)
    || typeof exports.vector_sixdof_verifier_abi_version !== "function"
    || typeof exports.vector_sixdof_verifier_max_input_len !== "function"
    || typeof exports.vector_sixdof_verifier_input_reserve !== "function"
    || typeof exports.vector_sixdof_verifier_run_json !== "function"
    || typeof exports.vector_sixdof_verifier_output_ptr !== "function"
    || typeof exports.vector_sixdof_verifier_output_len !== "function"
    || exports.vector_sixdof_verifier_abi_version() !== 1
  ) {
    throw new Error("The 6DOF verification artifact ABI is invalid.");
  }
  verifier = exports;
  return exports;
}

export function runRustWasmSixDofVerification(
  input: SixDofVerificationInput,
): SixDofVerificationRun {
  const wasm = getVerifier();
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  if (encoded.byteLength > wasm.vector_sixdof_verifier_max_input_len()) {
    throw new Error("The 6DOF verification input exceeds its isolated ABI limit.");
  }
  const pointer = wasm.vector_sixdof_verifier_input_reserve(encoded.byteLength);
  if (encoded.byteLength > 0 && pointer === 0) {
    throw new Error("The 6DOF verifier could not reserve its input buffer.");
  }
  new Uint8Array(wasm.memory.buffer, pointer, encoded.byteLength).set(encoded);
  const succeeded = wasm.vector_sixdof_verifier_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(
    wasm.memory.buffer,
    wasm.vector_sixdof_verifier_output_ptr(),
    wasm.vector_sixdof_verifier_output_len(),
  ));
  if (!succeeded) throw new Error(`VECTOR Rust/WASM 6DOF verifier rejected input: ${output}`);
  return JSON.parse(output) as SixDofVerificationRun;
}

export const SIX_DOF_FOUNDATION_VERIFIER_ARTIFACT = {
  builder: SIX_DOF_FOUNDATION_VERIFIER_BUILDER,
  sha256: SIX_DOF_FOUNDATION_VERIFIER_WASM_SHA256,
  bytes: SIX_DOF_FOUNDATION_VERIFIER_WASM_BYTES,
} as const;
