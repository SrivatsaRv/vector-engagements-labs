# Browser simulation engine boundary

Status: foundation contract, not yet the default workbench runtime.

VECTOR is moving from a fixed engagement calculator to a scenario-driven engine. The boundary is deliberately small:

1. The builder emits one immutable scenario package.
2. The engine spawns every entity declared in that package.
3. The engine advances entity state at a fixed model step.
4. The engine emits immutable sampled frames and diagnostics.
5. The 3D view, future MapLibre view, telemetry, replay, explanation, and report all consume the same frames.

No engine loop assumes a pair or a fixed number of entities. An entity declares identity, affiliation, kind, lifecycle, initial state, behavior, optional weapon or sensor behavior, and provenance. Stowed weapons remain entities and can be activated by scenario events.

## First physics foundation

`lib/engine/core.ts` currently provides the isolated first implementation:

- deterministic 50 ms fixed-step integration;
- local Cartesian east/north/up coordinates;
- standard-atmosphere density and speed of sound;
- air-relative velocity using an explicit three-axis wind vector;
- thrust, propellant depletion, aerodynamic drag, and gravity;
- proportional-navigation acceleration with a maneuver-authority limit;
- direct and simplified loft guidance;
- moving target behavior;
- guidance-hold and wind-shift event contracts;
- closest approach, termination, and non-finite-state diagnostics.

The current workbench still calls the legacy adapter until scenario compilation, presentation, report, and regression tests are migrated together. This prevents the UI from presenting a mixed run assembled from two engines.

## Runtime direction

The reference implementation remains TypeScript so it can be inspected and tested easily. The same scenario/frame contracts are intended to cross a Web Worker boundary. Performance-critical integration may later move to Rust/WASM without changing the builder or presentation contracts. A server may persist or batch runs, but a network service is not required to conduct a scenario.

## Truth labels

RDDF identity and public specifications do not automatically become physics coefficients. Every engine parameter carries a value state: sourced, model assumption, user provided, or unknown. Public maximum-range figures are metadata and study-boundary context; they are not runtime termination equations.

