# VECTOR Rust engine

This crate is the deterministic Rust/WebAssembly numerical backend for Vector
Engagement Labs. It consumes the same versioned scenario contract as the
TypeScript reference engine and returns the same replayable run contract.

## Design rules

- Invalid domain states are rejected before integration.
- Public lifecycle, affiliation, guidance, event, and termination states are
  typed Rust enums with stable serde representations.
- Fallible public operations return `Result`; production paths do not panic.
- The core is synchronous because it performs CPU-bound deterministic work and
  does not own browser scheduling or I/O.
- Browser concurrency belongs at the Web Worker boundary, not inside the
  integrator.
- Unsafe blocks are denied. Reviewed `no_mangle` attributes publish the small
  C-compatible WASM ABI but do not contain unsafe operations.
- Output provenance identifies the selected backend.

## Modules

- `lib.rs` contains the versioned domain model and deterministic integration
  loop.
- `validation.rs` owns semantic invariants and resource admission limits.
- `error.rs` owns stable engine errors.
- `wasm_abi.rs` owns the bounded, versioned browser ABI and linear-memory
  buffers.
- `public_aircraft_reference.rs` owns the isolated NASA NESC trim-propagation
  oracle and versioned output used for external-history and cross-backend
  verification. It does not modify the operational scenario engine.
- `sixdof_foundation.rs` owns the isolated, generic rigid-body verification
  kernel and its strict v1 input/output contract. It is not a production
  `EngineScenario` backend and contains no named-aircraft data.

The physics loop remains intentionally colocated while its equations and state
transitions are still evolving together. It should be split by behavior only
when those boundaries have stable contracts; file count is not treated as an
architecture metric.

## Resource limits

The ABI accepts at most 1 MiB of JSON. Scenario validation also bounds entities,
events, route points, integrated steps, and retained entity states. These limits
protect a synchronous browser call from accidental resource exhaustion. They do
not encode a duel or any other fixed actor count.

## Commands

```text
npm run engine:rust:fmt
npm run engine:rust:clippy
npm run engine:rust:test
npm run engine:rust:doc
npm run engine:rust:build
npm run engine:rust:verify
```

`make ci-local` runs every required Rust gate plus the cross-backend JavaScript
parity suite. Performance results must state the runtime host and workload; the
existing `performance:verify` command is a Node-hosted regression harness, not a
browser load test.
