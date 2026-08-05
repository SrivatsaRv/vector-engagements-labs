# Work item 07: Browser worker and simulation record

Priority: P1

Depends on: stable compiled scenario, model, entity, event, and frame contracts

Blocks: responsive heavy runs, uncertainty batches, scale testing, and ACMI export

## Outcome

Physics runs in a dedicated browser Worker. The engine emits one deterministic, portable VECTOR Simulation Record that drives map, 3D, telemetry, explanation, comparison, and report without rerunning physics.

## Current gap

Rust/WASM and TypeScript are both called synchronously. The Rust ABI serializes the complete scenario to JSON and parses the complete run back to JavaScript. The application holds array-of-object frames. The documented `vector.record.v1` archive, `frames.arrow`, transferable buffers, and event stream do not yet exist.

## Runtime boundary

```text
React builder and controls
        -> validated commands
Dedicated simulation Worker
        -> compiled model packs
        -> Rust/WASM fixed-step engine
        -> ordered events and snapshots
Transferable double buffer
        -> playback store
        -> MapLibre and Three.js interpolation
        -> telemetry decimation
        -> VSR recorder
```

The UI receives low-frequency progress and summary state. It never receives one React update per entity per physics tick.

[Web Workers](https://www.w3.org/TR/2021/NOTE-workers-20210128/) provide the browser execution boundary. Transferable `ArrayBuffer` ownership should be the default transport. `SharedArrayBuffer` is optional only after profiling justifies it and deployment provides cross-origin isolation.

## Engine ABI evolution

- Load a compiled model pack once by digest.
- Instantiate a scenario using compact references.
- Advance many fixed ticks with one `runTicks(count)` call.
- Expose typed, structure-of-arrays snapshot buffers.
- Emit ordered lifecycle and sensor events separately.
- Keep f64 authoritative physics and f32 camera-relative presentation views.
- Avoid one JavaScript/WASM call per entity or field.

The existing JSON ABI remains a compatibility path until parity fixtures cover the new ABI. It is not the performance target.

The execution policy must also become unambiguous. Interactive runs, saved-run verification, sample reports, and regression fixtures must state which backend produced the record and which independently checked it. A saved scenario authored for Rust/WASM must not be silently recomputed by TypeScript and then reported as the same run.

## VECTOR Simulation Record

Implement the existing `vector.record.v1` design as a content-addressed archive:

- `manifest.json`;
- authored scenario package;
- compiled scenario and model-pack digests;
- stable entity manifest;
- columnar time-addressed frames;
- ordered event stream;
- observer-specific track streams;
- sources, credibility manifest, and limitations;
- frozen report payload;
- optional licensed portable assets.

Recording policy is separate from integration rate. Record changed properties and class-appropriate samples, while preserving exact lifecycle events and all values needed by analysis.

## Determinism rule

Each tick executes a stable order:

1. Apply timestamped commands.
2. Update environment.
3. Build spatial candidate sets.
4. Update sensors and tracks due at this tick.
5. Run tactical decisions due at this tick.
6. Run guidance and controls.
7. Compute propulsion, forces, and moments.
8. Integrate next state.
9. Resolve closest approach, fuze, collision, and termination.
10. Commit launches and lifecycle events in stable ID order.
11. Publish due snapshots and telemetry.

Systems read the previous committed state and write next-state buffers. Parallel work may not make event order nondeterministic.

## Acceptance criteria

- A long run does not create main-thread long tasks attributable to physics.
- Rust/WASM and TypeScript implement the same Worker protocol.
- Cancel, pause, resume, and progress have defined states and do not produce partial completed records.
- The new batch ABI materially reduces boundary calls and bytes allocated compared with the JSON baseline.
- Opening a VSR reproduces the entity list, events, map/3D playback, telemetry, RASP views, explanation, and report without executing the engine.
- Every required archive member has a digest and schema version.
- A changed scenario or model pack cannot masquerade as the saved run.

## Tests

- Worker startup, cancellation, crash, timeout, and recovery.
- Rust/TypeScript parity through the Worker boundary.
- Buffer ownership, reuse, and memory-growth tests.
- Stable event ordering and deterministic record digest.
- Record save, load, corruption, missing member, and schema-version tests.
- Playback at 0.5x, 1x, 2x, 4x, seek, and end boundaries.
- Main-thread long-task and interaction-latency measurements on representative devices.

## Non-goals

- Running ordinary single engagements on a server.
- Introducing SharedArrayBuffer before it has a measured benefit.
- Making WebGPU a requirement for the initial engine.
