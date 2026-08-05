# Non-negotiable project invariants

- The scenario package, compiled model pack, engine run, VECTOR Simulation Record, playback, explanation, report, and persistence use versioned contracts.
- TypeScript and Rust/WASM implement the same engine behavior and parity fixtures; backend identity is recorded and never silently substituted.
- Physics owns authoritative model state. MapLibre, Three.js, camera, UI, observer tracks, and reports consume projections or read models.
- Every physical quantity has units. Geographic positions have WGS84 context; altitude has an explicit vertical datum; transforms carry a version.
- Facts, assumptions, overrides, inferred values, coefficients, and validation evidence retain separate value states and provenance.
- Entity IDs are stable across draft, compilation, runtime, recording, and replay. Weapons remain inventory until a launch event creates world state.
- Saved records are immutable and content-addressed. A changed scenario or model pack cannot masquerade as an existing run.
- PostgreSQL/PostGIS is runtime data authority; schema changes are migrations only; API requests do not create tables or seed data.
- Simulation ticks do not query databases, parse units, request remote terrain, or depend on rendering state.
- Expensive browser work runs in a dedicated Worker; the main thread receives bounded progress and transferable buffers, not per-entity tick updates.
- Targets in `docs/performance-capacity.md` remain targets until reproducible benchmark evidence marks them measured.
