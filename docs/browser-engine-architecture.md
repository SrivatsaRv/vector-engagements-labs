# Browser simulation engine boundary

Status: active workbench runtime.

1. Construct emits one immutable scenario package.
2. The compiler resolves catalog objects and versioned coefficients.
3. The engine creates state for any number of declared entities.
4. Carried weapons remain inventory (`STOWED`) and are omitted from observable frames.
5. A launch event activates a weapon and copies the launcher position, velocity, and heading into its initial world state.
6. The engine advances all active entities at a fixed model step and emits immutable sampled frames plus diagnostics.
7. Map, 3D, telemetry, RASP, explanation, comparison, and reporting consume those same frames.

## State ownership

- PostGIS owns published template versions, object identity, source assertions, model versions, installation geometry, and saved runs.
- The Construct state owns one editable draft and increments its local revision when an authoring input changes.
- Conduct owns runtime-only state: playback time, speed, selected surface, active RASP perspective, layer visibility, and prepared-condition state. These controls do not mutate the authored scenario.
- A completed result is valid only for the draft revision that produced it. Editing an authoring input invalidates Results and Save; playback, view switching, and fault activation do not.
- The report owns no simulation logic. It renders the exact saved frames and provenance read from PostGIS.

## Geographic presentation

The MapLibre surface has two independent choices:

- basemap: minimal or satellite;
- extent: engagement (default, fit to recorded trajectories) or region (India/Pakistan public-reference station context).

Map, 3D, and telemetry share model time. Tactical markers are keyed by affiliation, object kind, and lifecycle; a guided weapon is absent before launch.

`lib/engine/contracts.ts` defines the boundary; `compiler.ts` resolves the scenario; `core.ts` integrates it. No loop assumes two, four, or another fixed entity count.

The current inspected TypeScript implementation is the golden reference. Rust/WASM is authorized as a performance path, but it must pass frame/result parity fixtures before becoming default. A Web Worker boundary will keep batches away from interaction rendering. Rust/WASM will not change scenario or frame schemas.
