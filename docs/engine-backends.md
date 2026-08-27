# Simulation engine backends

VECTOR has one engine contract and two browser implementations. The authored scenario compiler produces the same immutable `EngineScenario` for either backend. Both return the same `EngineRun` frame, authoritative simulation-event, envelope, termination, and diagnostic contract.

## Rust / WebAssembly

Ground-operation v2 is an exact cross-backend ABI: direct Rust/WASM reads the
unchanged full compiled Air mission as independent authority, binds its generic
projection to both compact runtime copies, and emits the same per-tick state,
controller and transition-event fields as TypeScript. Compact-copy mutation or
caller-visible digest resealing cannot promote an unavailable operation.

Airborne store transfer uses the same independent-authority boundary. Rust
reads the full compiled request and its `[0.001, 1] m²` installed-drag validity,
recomputes ordered transfer identity against the compiler-owned seal, and then
cross-checks the compact entity projection. Accepted and operationally rejected
outcomes are schema-identical to TypeScript; malformed authority rejects before
ticks. RELEASE and JETTISON select only the declared generic lifecycle, never a
named branch.

`EngineScenario.airMission` is an optional compiled lineage envelope. A ground
run also carries a compact compiler-owned copy of the exact
`vector.aircraft-ground-operation.v1` artifact. Before ticks, both backends
require exactly one ground-operation entity owned by the compiled Air mission,
compare the compact runtime and entity copies, and bind their posture, release,
mission digest, runway evidence digest, and aircraft source identity to the
authoritative compiled Air mission. Rust deserializes only that closed lineage
projection and ignores unrelated authoring fields. The production Rust adapter
revalidates the exact full compiled and authored content digests before the ABI
call. Independently, the raw Rust/WASM admission deserializes the full mission
as a non-output authority value, rejects malformed digest identities, and
derives aircraft, posture, release, runway evidence, and compiled-mission
identity from its authored/compiled lineage. Caller-supplied compact authority
fields are overwritten. Rust rejects either a missing compact copy or compact
copies that diverge from the full mission.
The backend adapter reattaches the already verified Air mission so results
retain identical VSR authority.
The Rust ABI admits `vector.environment-runtime-grid.v1` with the exact parent
pack binding and implements the same grid/time interpolation, atmosphere
derivation, wind consumption and DEM collision rules as TypeScript.

The default backend is a Rust 2021 `cdylib` compiled for `wasm32-unknown-unknown`. This target has no operating-system dependency and executes inside the browser WebAssembly runtime. The module exposes a deliberately small C ABI:

- `vector_abi_version()` identifies the stable adapter contract;
- `vector_max_input_len()` publishes the bounded admission limit;
- `vector_input_reserve(length)` allocates the JSON input buffer;
- `vector_run_json()` executes the deterministic fixed-step model;
- `vector_output_ptr()` and `vector_output_len()` expose the serialized run.

NASA TM-109057 generic-AAM verification is not exposed by this production
ABI. It is built from `verification-rust/generic-aam` as a separate generated
verification artifact and is callable only through the verification adapter,
focused tests and benchmark. Production Rust exports, production WASM, backend
selection and the built simulation Worker are scanned for its symbol, subject
identity and adapter; any match fails the isolation gate.
NASA TP-1538 aerodynamic verification follows the same separate-artifact rule:
its `vector_tp1538_aero_*` ABI exists only in the verification crate and is
prohibited from this production module.

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

The same WASM-capable Rust core now also contains the strict Stage-B
`vector.compiled-model-pack.v2` identity validator. It consumes the
TypeScript-generated anonymous fixture, rejects unknown keys, recomputes the v1
SI projection, completeness and final digests, and returns only the exact pack
identity. V2 remains non-promotable: the function is not part of the simulation
ABI above and cannot construct runtime state or select a backend.

Weapon termination is backend-neutral. Each weapon carries one compiled
`vector.weapon-termination-model.v1`; both implementations reject wrong schema,
intended use, criterion, non-finite or non-positive radius/time before the first
tick. Before either live backend runs, any scenario carrying that entity-level
authority must resolve an exact application-retained compiled pack; an unknown
pack is rejected even when its compact projection is omitted or self-resealed.
Compiler verification may supply the complete exact-identity pack only when the
scenario and pack both declare the governed engine-verification intended use;
the product execution path supplies no such pack.
Both minimize the same between-step relative-position segment, apply the
same terminal precedence, update the achieved weapon state and emit the same
`WEAPON_TERMINATED` payload. The legacy scenario completion distance and any
renderer distance are outside this authority.

## TypeScript reference

The TypeScript engine is retained as an independently executable reference implementation. It uses the same coordinate frames, atmosphere, entity lifecycle, identity-bearing aircraft table interpolation with fail-closed coverage, aircraft state update, proportional-navigation guidance, coverage-envelope generation, termination rules, and sampling cadence.

It is not a separate product mode. Its purpose is controlled parity testing, diagnosis, and performance comparison while the Rust implementation matures.

## Selection and provenance

Both backends retain the exact 0.9.0 model-pack digest and the same compiled
termination-model fields in run provenance. Backend selection cannot replace
that authority or change an intercept into a damage/kill claim.

Generic runway execution does not select a backend or a named model. Both
backends retain the same mission, model-pack, EnvironmentPack and optimized
WASM content identities, and `ADMITTED_GENERIC_EDUCATIONAL` remains an explicit
model-assumption authority rather than a deployment-capability selector.

Air runs add authored and compiled mission digests to backend-independent
provenance. Backend choice cannot create, migrate, or repair mission intent.
Airborne transfer provenance is likewise backend-neutral: authored digest,
aircraft source identity, ordered transfer digests and the independent
authority seal are identical in both engines and retained in the VSR.
Backend provenance now sits beside one content-addressed regional pack. A run
is rejected when the runtime grid, source grids or compact pack binding do not
match the archived EnvironmentPack digest.

The selected production backend is owned by the content-addressed
`DeploymentCapabilityManifest`; it is not a scenario field, URL parameter,
saved-run preference or browser control. TypeScript is selected for the current
Cloudflare Air deployment because the present embedded Rust/WASM loader is not
admitted in the server runtime. The selected backend is recorded in
`EngineRun.diagnostics`, the compiled VSR member and the VSR manifest. Rust/WASM
remains independently executable through explicit verification manifests for
parity checks. See [`deployment-capabilities.md`](deployment-capabilities.md).
Validating a Stage-B v2 pack in Rust does not alter that selection or provenance
authority; no deployment manifest currently admits v2 execution.
Likewise, a TP-1538 verification digest records only an offline evaluator run;
it cannot select a deployment backend or become `EngineRun` provenance.
The #187 benchmark is a separate 25-second composed workload; it does not alter
or replace #182's governed takeoff benchmark.
Ground-operation provenance is backend-neutral: both implementations require
the same full mission, start posture, release time, runway/environment evidence
and independently sealed ground-dynamics digest. They integrate the same
fixed-step generic roll/rotation/climbout mechanism and emit identical
operational frames and transition events; direct Rust/WASM rejects compact-copy
promotion against the unchanged full Air-mission authority.

## Build and verification

Rebuilding the artifact requires Rust stable, Cargo on `PATH`, and the
`wasm32-unknown-unknown` target. The build then applies the exact
`binaryen@131.0.0 -O3 -S2 rust-wasm-features-v1` post-link policy before
content-addressing and embedding the module. The optimizer identity participates
in the source digest and is recorded beside the artifact; verification rejects
either source or optimizer drift. The feature policy admits only the Rust-emitted
mutable-global, non-trapping conversion, bulk-memory, sign-extension and
reference-type instruction families (plus Binaryen's bulk-memory optimization
flag), and the generated module is validated by both Binaryen and the host
WebAssembly runtime. The production application consumes the committed,
integrity-checked artifact and does not install a compiler or optimizer at
runtime.

- `npm run engine:rust:build` compiles and deterministically optimizes release WASM, then regenerates the embedded artifact.
- `npm run engine:rust:verify` repeats compilation and optimization and rejects a stale artifact or build-policy identity.
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

## Swap boundary

Weapon terminal transitions sit inside the shared backend contract: either
implementation must produce the same achieved state, cause, occurrence time
and event payload. No TypeScript-only, WASM-only or browser-only branch may
invent terminal state.

The ground-to-air swap is achieved-state-driven: only the recorded `ENROUTE`
transition releases the aircraft from the ground-operation integrator to the
existing airborne route controller. A timer, scenario ID, actor name or compact
caller claim cannot cross this boundary, and installed stores remain stowed
until after it.
At the transfer tick, both engines record the same requested/accepted/achieved
outcome. Acceptance removes one installed store mass/drag contribution and
creates one store at the retained launcher boundary state; operational
rejection leaves inventory unchanged. No backend swap or identifier branch can
invent either result.

The swap boundary consumes mission-authoritative start speed, fuel mass, and
store count only after the compiler has reconciled them with the generic engine
entity contract. No mission class, scenario ID, or named aircraft selects a
backend or physics branch. Likewise, a successfully validated Stage-B v2
identity cannot cross this swap boundary until #154 and the later
Worker/runtime/VSR owner add a separate admission contract.
The TP-1538 verification adapter is also outside this boundary: neither a
complete synthetic batch nor a later admitted corpus can enter an
`EngineScenario` without a separately owned production model-pack contract.
Ground starts cross the swap boundary only through
`vector.aircraft-ground-operation.v1`. Its current execution authority is
`UNAVAILABLE`; both backends hold position and inventory rather than invoking
the airborne controller. This does not admit taxi, takeoff, or recovery.
The backend-neutral scenario owns the complete preprocessed environment
projection. Implementations may optimize sampling but may not re-resolve area
names, query remote terrain/database state, or substitute atmosphere defaults.

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
