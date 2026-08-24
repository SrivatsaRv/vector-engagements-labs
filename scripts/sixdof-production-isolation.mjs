export const PRIVATE_SIX_DOF_ABI_EXPORT_PREFIX = "vector_sixdof_verifier_";

/**
 * Exact identifiers owned only by the isolated 6DOF verification crate,
 * adapter, schemas, and generated module. Production source, generated WASM,
 * and built Worker bundles must contain none of them.
 */
export const PRIVATE_SIX_DOF_PRODUCTION_MARKERS = Object.freeze([
  PRIVATE_SIX_DOF_ABI_EXPORT_PREFIX,
  "vector.sixdof-verification-input.v1",
  "vector.sixdof-verification-run.v1",
  "sixdof-foundation-wasm",
  "sixdof-foundation-verifier-wasm",
  "SIX_DOF_FOUNDATION_VERIFIER_",
  "runRustWasmSixDofVerification",
  "vector-sixdof-foundation-verifier",
]);

export function assertNoPrivateSixDofVerifierBytes(bytes, label) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const marker = PRIVATE_SIX_DOF_PRODUCTION_MARKERS.find((candidate) =>
    content.includes(Buffer.from(candidate))
  );
  if (marker) {
    throw new Error(`${label} contains private 6DOF verifier marker ${marker}.`);
  }
}

export function assertNoPrivateSixDofVerifierExports(exportNames, label) {
  const leaked = exportNames.find((name) =>
    name.startsWith(PRIVATE_SIX_DOF_ABI_EXPORT_PREFIX)
  );
  if (leaked) {
    throw new Error(`${label} exposes private 6DOF verifier export ${leaked}.`);
  }
}
