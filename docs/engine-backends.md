# Simulation engine backends

VECTOR has one engine contract and two browser implementations. The authored scenario compiler produces the same immutable `EngineScenario` for either backend. Both return the same `EngineRun` frame, envelope, termination, and diagnostic contract.

## Rust / WebAssembly

The default backend is a Rust 2021 `cdylib` compiled for `wasm32-unknown-unknown`. This target has no operating-system dependency and executes inside the browser WebAssembly runtime. The module exposes a deliberately small C ABI:

- `vector_input_reserve(length)` allocates the JSON input buffer;
- `vector_run_json()` executes the deterministic fixed-step model;
- `vector_output_ptr()` and `vector_output_len()` expose the serialized run.

The build embeds the compiled module in the application with its SHA-256 digest and byte length. Loading fails closed if the required ABI or provenance is missing. VECTOR does not silently fall back to TypeScript after a Rust/WASM run has been selected.

## TypeScript reference

The TypeScript engine is retained as an independently executable reference implementation. It uses the same coordinate frames, atmosphere, entity lifecycle, aircraft state update, proportional-navigation guidance, coverage-envelope generation, termination rules, and sampling cadence.

It is not a separate product mode. Its purpose is controlled parity testing, diagnosis, and performance comparison while the Rust implementation matures.

## Selection and provenance

`Scenario.engineBackend` is either `rust-wasm` or `typescript`. Rust/WASM is the default for new scenarios. The selected backend is an authored input, is recorded in `EngineRun.diagnostics.backend`, and is preserved in the report's scenario snapshot. An explicit unsupported value is an error.

## Build and verification

Rebuilding the artifact requires Rust stable, Cargo on `PATH`, and the
`wasm32-unknown-unknown` target. The production application consumes the
committed, integrity-checked artifact and does not install a compiler at runtime.

- `npm run engine:rust:build` compiles release WASM and regenerates the embedded artifact.
- `npm run engine:rust:verify` recompiles and rejects a stale committed artifact.
- `npm run engine:rust:test` runs native Rust tests.
- `tests/engine-backends.test.mjs` runs all eight calibrated scenarios through both implementations and compares termination, frame count, entity lifecycle, sampled telemetry, closest approach, time of flight, speed, demand, and finite-state diagnostics.
- `npm run performance:verify` measures cold initialization and warm-run p50/p95 for both backends.

## Swap boundary

UI components do not import either numerical core. They call `simulate`, which compiles the scenario and dispatches through `runEngineBackend`. Observe, Explain, Compare, Save, and Report consume only the returned `EngineRun`. A later native service, worker pool, or higher-fidelity engine must implement this same boundary instead of branching presentation state.
