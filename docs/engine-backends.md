# Simulation engine backends

VECTOR has one engine contract and two browser implementations. The authored scenario compiler produces the same immutable `EngineScenario` for either backend. Both return the same `EngineRun` frame, envelope, termination, and diagnostic contract.

## Rust / WebAssembly

The default backend is a Rust 2021 `cdylib` compiled for `wasm32-unknown-unknown`. This target has no operating-system dependency and executes inside the browser WebAssembly runtime. The module exposes a deliberately small C ABI:

- `vector_abi_version()` identifies the stable adapter contract;
- `vector_max_input_len()` publishes the bounded admission limit;
- `vector_input_reserve(length)` allocates the JSON input buffer;
- `vector_run_json()` executes the deterministic fixed-step model;
- `vector_output_ptr()` and `vector_output_len()` expose the serialized run.

The build embeds the compiled module in the application with its SHA-256 digest and byte length. Loading fails closed if the required ABI or provenance is missing. VECTOR does not silently fall back to TypeScript after a Rust/WASM run has been selected.

The ABI accepts at most 1 MiB of JSON. Rust admission also bounds entity
count, event count, route length, integration work, and retained entity states
before the numerical loop begins. These are compute-safety limits, not fixed
assumptions about the number of actors in a scenario.

Rust also consumes `vector.compiled-model-pack.v1` through the shared generated
fixture. Admission verifies the canonical digest, SI unit system, table shapes,
finite ordered axes, component indexes, mass constraints, loadout indexes, and
compatibility indexes. Scenario admission requires the same pack digest on the
scenario binding and every entity provenance record. Pack validation and
runtime construction occur before integration; the numerical loop has no
database access or unit parsing.

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
- `npm run engine:rust:fmt` checks canonical Rust formatting.
- `npm run engine:rust:clippy` runs strict Clippy across every target and feature.
- `npm run engine:rust:test` runs native Rust tests.
- `npm run engine:rust:doc` builds rustdoc with warnings denied.
- `tests/engine-backends.test.mjs` runs all eight calibrated scenarios through both implementations and compares termination, frame count, entity lifecycle, sampled telemetry, closest approach, time of flight, speed, demand, and finite-state diagnostics.
- `tests/model-pack.test.mjs` plus Rust `model_pack` tests verify the shared compiled object-data contract and committed digest fixture.
- `npm run performance:verify` measures cold initialization and warm-run p50/p95 for both backends.

## Swap boundary

UI components do not import either numerical core. They call `simulate`, which compiles the scenario and dispatches through `runEngineBackend`. Observe, Explain, Compare, Save, and Report consume only the returned `EngineRun`. A later native service, worker pool, or higher-fidelity engine must implement this same boundary instead of branching presentation state.

Interactive workbench calls now use `BrowserSimulationClient`, not the
synchronous `simulate` compatibility function. The client loads a digest-addressed
compiled adapter, sends a compact run reference, and receives one transferable
VSR. Server verification, deterministic fixtures, benchmarks, the landing sample,
and the hidden SSR pre-run placeholder continue to use `simulate` explicitly.
Those entry points retain authored backend provenance and never substitute
TypeScript for a selected Rust run.

The browser protocol is common to both backends, but the numerical adapters are
at different maturity levels:

| Backend | Worker execution | Model batching | Current ABI |
| --- | --- | --- | --- |
| TypeScript | dedicated module Worker | cooperative fixed-step batches | `typescript-batched-v1` |
| Rust/WASM | dedicated module Worker | one complete run | `rust-json-v1` compatibility ABI |

The Rust JSON ABI remains supported until a typed batch ABI reproduces the full
parity corpus. Its manifest provenance includes the selected backend, ABI name,
and committed WASM artifact SHA-256. Loading, execution, record creation, or
replay fails closed when those identities disagree.
