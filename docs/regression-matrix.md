# VECTOR Regression Matrix

This matrix is the minimum proof required before a feature milestone is committed.

| Surface | Automated proof | Live-stack proof |
| --- | --- | --- |
| Engine and lifecycle | Determinism, arbitrary entity count, stowed/launch/active lifecycle, finite state, fuel/mass/force telemetry, eight-scenario TypeScript/Rust-WASM parity, embedded-WASM integrity, fail-closed backend selection | Cold initialization and warm-run p50/p95 for both browser backends |
| Public aircraft reference | Content-bound NASA NESC Case 11 fixture; position, speed, altitude, attitude, rates, forces, moments, Mach, pressure, energy and trim residual within declared tolerances; malformed/bounded input rejection; 1×10⁻⁹ TypeScript/Rust-WASM parity | `/math` reports the admitted case, measured errors, pass state and named-aircraft limitation |
| Environment | Study-area preset propagation, east/north wind physics, visual-range boundary, standard atmosphere | Saved run preserves area and weather |
| RASP | 128 source-state rows, both perspectives, dependency isolation, and truth invariance | RASP display and run event inspection |
| Decisions | 5 Blue × 4 Red combinations, finite deterministic frames, declared effects | Recorded scenario/report decision fields |
| Tactical map | Coordinate conversion, closed coverage polygons, installations, routes, launches, tracks, vectors, ownership and value state; governed standard/minimal/tactical basemap modes; explicit same-origin MapLibre module-worker packaging | Same-origin tile and worker responses, non-zero MapLibre canvas, six VECTOR controls, cursor/zoom/bearing/pitch telemetry, engine entity markers and Rust/WASM run provenance |
| Map authoring | Map/scalar state equivalence, heading/speed compilation, route retention, route-origin integrity, zero-length-leg and preset-boundary rejection; invalid intermediate text is preserved and blocks Run | Two draggable starts, numeric WGS84/MSL start and waypoint editor, affiliation-scoped base-origin pickers, selectable installations, scoped waypoint action, six custom navigation controls, persisted basemap switch, resize recovery, real-Worker browser run, no browser error overlay |
| Symbols | 7 entity kinds × 3 affiliations × 5 lifecycle states | Map and 3D use the same symbol contract |
| Reports | Exact configuration, result, frame count, environment, source state and provenance hashes | Save → load → report lifecycle; missing/incomplete run rejection |
| Database | Canonical scenario identity, content hash, schema version and spatial context; 15 SHIELD PAF installation identities, ICAO codes, EPSG:4326 coordinate order and source binding | Migrations, 21-installation seed count, exact Nur Khan coordinate regression and PostGIS catalog verification |
| Observability | Telemetry allowlist and metric definitions | Prometheus targets/queries, Tempo trace, Loki/Grafana data sources and both provisioned dashboards |
| Responsive layout | CSS ownership for builder scroll/footer, fluid task-width tokens and six telemetry panels | Headless system-Chrome checks at 390×844, 430×932, 1280×720, 1366×768, 1440×900, 1536×864, 1920×1080, 2560×1440 and 3840×2160; phone stacking, QHD/4K proportional expansion, non-zero authoring and Observe canvases, no horizontal overflow or action overlap, readable maneuver cards and distinct Blue/Red RASP ownership |

## Commit gates

### Selected track-state inspector (#41 slice)

- `tests/frontend-selectors.test.mjs` proves an IAF/PAF picture is selected by
  the canonical display-frame time and that an absent record stays explicitly
  unavailable.
- `tests/component/track-state-inspector.test.tsx` proves the VECTOR inspector
  consumes a frozen canonical sample, keeps observer-picture selection in UI
  state, and never substitutes zero-valued track data for an absent sample.
- `tests/browser/route-authoring.spec.ts` proves the inspector remains visible
  after a real Worker run at desktop and compact viewports.

### Canonical playback frame (#62 slice)

- `tests/frontend-selectors.test.mjs` proves a requested scrub position resolves
  to one recorded frame and its exact model-time identity.
- `tests/component/viewport-telemetry.test.tsx` proves telemetry shows the
  selected recorded-frame time, not an in-between browser request.
- `tests/browser/route-authoring.spec.ts` uses real keyboard scrubbing and
  proves Map, playback controls, and telemetry share one display-time identity
  at all five required viewports.

1. `make ci-local`
2. The applicable named target: `make worker-local`, `make frontend-local`,
   `make integration-local`, `make container-verify`,
   `make observability-local`, `make performance-local`, or
   `make air-reference-local`
3. `make clean-clone-local` after the candidate commit for harness, dependency,
   generated-asset, build, or workflow changes
4. Browser breakpoint inspection for any changed workspace layout

`make integration-local` executes `npm run ui:responsive:verify` against the
Compose application. The script captures breakpoint screenshots in the ignored
`outputs/responsive/` directory and fails on page errors, missing tiles,
collapsed map canvases, missing entity/base markers, footer overlap, disabled
baseline runs, telemetry regressions, or an unexpected simulation backend.

Failures block the milestone. A test may not be weakened merely to preserve a previous outcome; the model, fixture or declared contract must be corrected.
