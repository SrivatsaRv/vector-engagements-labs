/** Verification-owned release gate for the production simulation WASM/Worker. */
export const ENGINE_WASM_PERFORMANCE_POLICY = Object.freeze({
  schemaVersion: "vector.engine-wasm-performance-policy.v1" as const,
  baselineCommit: "69dd91d821e164936f231a59254af950ed4a0f21" as const,
  baselineOptimizedWasmBytes: 581_120,
  maximumOptimizedWasmBytes: 620_000,
  maximumGzipWasmBytes: 240_000,
  maximumBrotliWasmBytes: 190_000,
  maximumWorkerGrowthFraction: 0.05,
  maximumBrowserInitializationP95RegressionFraction: 0.1,
  maximumBrowserInitializationMs: 25,
  initialMemoryBytes: 1_114_112,
  maximumRetainedMemoryGrowthBytes: 16 * 1_024 * 1_024,
  maximumRetainedMemoryRegressionFraction: 0.1,
  maximumSoakGrowthAfterFirstRunBytes: 0,
});
