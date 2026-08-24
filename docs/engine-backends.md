# Simulation engine backends

VECTOR has one engine contract and two browser implementations. The authored scenario compiler produces the same immutable `EngineScenario` for either backend. Both return the same `EngineRun` frame, authoritative simulation-event, envelope, termination, and diagnostic contract.

## Rust / WebAssembly

The default backend is a Rust 2021 `cdylib` compiled for `wasm32-unknown-unknown`. This target has no operating-system dependency and executes inside the browser WebAssembly runtime. The module exposes a deliberately small C ABI:

- `vector_abi_version()` identifies the stable adapter contract;
- `vector_max_input_len()` publishes the bounded admission limit;
- `vector_input_reserve(length)` allocates the JSON input buffer;
- `vector_run_json()` executes the deterministic fixed-step model;
- `vector_reference_run_json()` executes the isolated public-aircraft reference
  parity case and is not a production scenario entry;
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

The TypeScript engine is retained as an independently executable reference implementation. It uses the same coordinate frames, atmosphere, entity lifecycle, identity-bearing aircraft table interpolation with fail-closed coverage, aircraft state update, proportional-navigation guidance, coverage-envelope generation, termination rules, and sampling cadence.

It is not a separate product mode. Its purpose is controlled parity testing, diagnosis, and performance comparison while the Rust implementation matures.

## Selection and provenance

The selected production backend is owned by the content-addressed
`DeploymentCapabilityManifest`; it is not a scenario field, URL parameter,
saved-run preference or browser control. TypeScript is selected for the current
Cloudflare Air deployment because the present embedded Rust/WASM loader is not
admitted in the server runtime. The selected backend is recorded in
`EngineRun.diagnostics`, the compiled VSR member and the VSR manifest. Rust/WASM
remains independently executable through explicit verification manifests for
parity checks. See [`deployment-capabilities.md`](deployment-capabilities.md).

## Build and verification

Native Rust checks use the exact repository toolchain in `rust-toolchain.toml`:
Rust 1.97.1 with rustfmt, Clippy, and `wasm32-unknown-unknown`. Both private
verifier modules require canonical Linux/amd64 raw-byte artifact generation.
Their build and verify commands run the pinned Rust 1.97.1 container image by
immutable platform-manifest digest. That canonical host is necessary because
Rust/LLVM code and data layout changed both across 1.97.1/1.98.0 and across
macOS/Linux. The container restores the isolated `/target` tree to the invoking
host uid/gid on every normal or failed shell exit before Node removes it; only
that confined target is ownership-adjusted. Platforms without POSIX uid/gid
APIs retain their native bind-mount ownership behavior. The production
application consumes committed, integrity-checked artifacts and installs no
compiler at runtime.

- `npm run engine:rust:build` compiles release WASM and regenerates the embedded artifact.
- `npm run engine:rust:verify` recompiles and rejects a stale committed artifact.
- `npm run engine:rust:fmt` checks canonical Rust formatting.
- `npm run engine:rust:clippy` runs strict Clippy across every target and feature.
- `npm run engine:rust:test` runs native Rust tests.
- `npm run engine:rust:doc` builds rustdoc with warnings denied.
- `tests/engine-backends.test.mjs` runs all eight calibrated scenarios through both implementations and compares termination, frame count, entity lifecycle, the complete authoritative event stream, sampled telemetry, closest approach, time of flight, speed, demand, and finite-state diagnostics.
- `tests/simulation-events.test.ts` proves insertion-order-independent event ordering, arbitrary-entity coverage, exact off-cadence event frames, duplicate and causal-reference rejection, and the absence of authoritative English strings.
- `tests/model-pack.test.mjs` plus Rust `model_pack` tests verify the shared compiled object-data contract and committed digest fixture.
- `npm run performance:verify` measures cold initialization and warm-run p50/p95 for both backends.
- `npm run reference-aam:verify` and `npm run reference-aam:performance`
  verify the standalone generic AAM corpus/workload and Node-hosted evaluator.
  The local command is closed to the calibrated Apple M5 / Node 24 30/200 ms
  profile. Hosted Stage 2B calls the separate closed Ubuntu 24 x64 / Node 22
  65/200 ms alias and emits both full sample distributions before failing.
  Performance report v3 separates exact `boundProfileIdentity` from
  `observedContext`; hosted CPU, core count, memory, and image release are
  observations and cannot select or authorize the hosted profile.
  Generic-AAM `:build` and `:verify` use that container, while `:fmt`, `:clippy`,
  `:test`, and `:doc` run on the host with exact repository-pinned Rust 1.97.1.
  Hosted Stage 2B owns all of those commands, full verification, and the bounded
  benchmark. Stage 2C audits its independent lockfile.
- `npm run sixdof-foundation:rust:build` regenerates the standalone 6DOF
  verification artifact; `sixdof-foundation:rust:verify`, `:fmt`, `:clippy`,
  `:test`, and `:doc` independently gate that private crate.

## Swap boundary

UI components do not import either numerical core. They call `simulate`, which compiles the scenario and dispatches through `runEngineBackend`. Observe, Explain, Compare, Save, and Report consume only the returned `EngineRun`. A later native service, worker pool, or higher-fidelity engine must implement this same boundary instead of branching presentation state.

Interactive workbench calls now use `BrowserSimulationClient`, not the
synchronous `simulate` compatibility function. The client loads a digest-addressed
compiled adapter, sends a compact run reference, and receives one transferable
VSR. Server verification, deterministic fixtures, benchmarks, the landing sample,
and the hidden SSR pre-run placeholder continue to use `simulate` explicitly.
Those entry points retain deployment backend provenance and never substitute
TypeScript for a selected Rust run. Server-rendered pre-run and landing frames
are explicitly labelled reference previews; they are not conducted runs.

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

## Isolated six-degree-of-freedom verification artifact

The exact-key `vector.sixdof-verification-input.v1` kernel is compiled only
from `verification-rust/sixdof-foundation`. Its private
`vector_sixdof_verifier_run_json` ABI is loaded by
`lib/validation/sixdof-foundation-wasm.ts`; production `engine-rust`,
`lib/engine/backend.ts`, the production WASM module, and the simulation Worker
cannot import or export it. This is a numerical-conformance artifact, not an
`EngineScenario` backend selection. It does not emit production frames/events,
enter a Worker or VSR, or silently substitute for the deployed 3DOF engine. See
[`sixdof-numerical-foundation.md`](sixdof-numerical-foundation.md).

Both adapters enforce the same conditioned-inertia, CG-origin, per-step angular
increment and RK-stage quaternion bounds. Angular admission uses the identical
ordered squared-increment comparison rather than runtime-specific `hypot`
implementations. Inertia admission and the triangular solve use the same
scale-normalized Cholesky factor with an exactly representable `2^-32` relative
pivot threshold and governed minimum mass/inertia scale. Rust/WASM does not
accept a broader finite-input domain than TypeScript, and neither adapter emits
conservation drift for a nonzero applied wrench.
The private JSON ABI uses correctly rounded binary64 decoding and verifies authored
frame-zero values plus scalar, angular, and conditioned-inertia ULP boundaries
against the TypeScript adapter before a release artifact is admitted.
Both crates use size-first `opt-level = "z"` and have independent immutable
artifacts. The production module retains its unchanged 500,000-byte limit and
is currently 493,585 bytes with SHA-256
`e1105047cd06edd50f13d8b212e1292bda747468ee7421a977112fadeef65b8c`.
The private verifier is 161,542 bytes with SHA-256
`d15440083d393fd692254113c06432c62ec81fcaed1003d44d22362b35ccad8d`.
Build verification rejects a stale digest, a missing required private symbol,
any production symbol in the verifier, any verifier symbol in production, or
either artifact crossing its 500,000-byte limit. A mismatch reports both fresh
and committed byte identities without accepting a host-specific alternative.
