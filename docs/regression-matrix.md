# VECTOR Regression Matrix

This matrix is the minimum proof required before a feature milestone is committed.

| Surface | Automated proof | Live-stack proof |
| --- | --- | --- |
| Engine and lifecycle | Determinism, arbitrary entity count, stowed/launch/active lifecycle, finite state, fuel/mass/force telemetry, eight-scenario TypeScript/Rust-WASM parity, embedded-WASM integrity, fail-closed backend selection | Cold initialization and warm-run p50/p95 for both browser backends |
| Environment | Study-area preset propagation, east/north wind physics, visual-range boundary, standard atmosphere | Saved run preserves area and weather |
| RASP | 128 source-state rows, both perspectives, dependency isolation, truth invariance, interruption boundaries | RASP display and run event inspection |
| Decisions | 5 Blue × 4 Red combinations, finite deterministic frames, declared effects | Recorded scenario/report decision fields |
| Tactical map | Coordinate conversion, closed coverage polygons, installations, routes, launches, tracks, vectors, ownership and value state | Same-origin tile response, non-zero MapLibre canvas, engine entity markers and Rust/WASM run provenance |
| Map authoring | Map/scalar state equivalence, heading/speed compilation, route retention, route-origin integrity, preset-boundary rejection | Two draggable starts, affiliation-scoped base-origin pickers, selectable installations, scoped waypoint action, navigation controls, compact preconfigured context, no browser error overlay |
| Symbols | 7 entity kinds × 3 affiliations × 5 lifecycle states | Map and 3D use the same symbol contract |
| Reports | Exact configuration, result, frame count, environment, source state and provenance hashes | Save → load → report lifecycle; missing/incomplete run rejection |
| Database | Canonical scenario identity, content hash, schema version and spatial context | Migrations, seed counts and PostGIS catalog verification |
| Observability | Telemetry allowlist and metric definitions | Prometheus targets/queries, Tempo trace, Loki/Grafana data sources and both provisioned dashboards |
| Responsive layout | CSS ownership for builder scroll/footer and six telemetry panels | Headless system-Chrome checks at 1366×768, 1440×900 and 1920×1080; non-zero authoring and Observe canvases, no horizontal overflow or action overlap, readable maneuver cards and distinct Blue/Red RASP ownership |

## Commit gates

1. `make ci-local`
2. `make integration-local`
3. `make observability-local`
4. `make performance-local`
5. Browser breakpoint inspection for any changed workspace layout

`make integration-local` executes `npm run ui:responsive:verify` against the
Compose application. The script captures breakpoint screenshots in the ignored
`outputs/responsive/` directory and fails on page errors, missing tiles,
collapsed map canvases, missing entity/base markers, footer overlap, disabled
baseline runs, telemetry regressions, or an unexpected simulation backend.

Failures block the milestone. A test may not be weakened merely to preserve a previous outcome; the model, fixture or declared contract must be corrected.
