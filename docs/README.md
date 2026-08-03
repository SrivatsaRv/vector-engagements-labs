# VECTOR product and engineering contract

## One journey

| Product stage | Includes |
| --- | --- |
| Enter | Choose a template, blank scenario, weapon-led study, or Red-vs-Blue study |
| Construct | Engagement type, entities, placement, loadouts, environment, assumptions |
| Simulate | Deterministic detailed run; uncertainty batches follow the same package contract |
| Observe | Synchronized map/3D playback, event timeline, air picture, and telemetry |
| Explain | Outcome, causes, value state, confidence, and influential variables |
| Compare | Controlled Variant A/Variant B comparison |
| Report | Save, replay, print/PDF, JSON/telemetry export, and research citations |

The interface uses these terms. Define, Forces & loadouts, Place & flight, Sensors & decisions, and Validate are Construct sections. Advanced repeatability tools remain enthusiast features and are not described as an Instructor Station. The complete builder contract is in [`scenario-builder.md`](scenario-builder.md).

The mandatory analysis-display contract is documented in [`tacview-visual-subset.md`](tacview-visual-subset.md). It defines the Tacview-style subset precisely and explicitly excludes claims of Tacview file compatibility or NATO symbol compliance.

The portable replay and debriefing artifact is specified in [`vector-simulation-record.md`](vector-simulation-record.md). It is the browser-oriented VECTOR equivalent of an ACMI recording and is deliberately independent of the TypeScript or Rust/WASM engine backend.

## Working vertical slice

- Eight versioned A2A, A2G, G2A, and G2G templates, with regression-tested successful baselines.
- Scenario-driven engine contracts with no fixed entity count.
- Explicit carried → launched → active → terminated weapon lifecycle.
- Deterministic fixed-step browser physics, atmosphere, wind vector, changing mass, thrust, drag, gravity, proportional-navigation demand, and termination diagnostics.
- Tactical symbols by affiliation and object kind; carried inventory is not rendered as a world track.
- MapLibre minimal basemap backed by PostGIS public-reference installations, with study-area boundaries, declared routes, recorded tracks, launches, and model-assumption coverage envelopes.
- Engagement-scale map fitting for readable trajectories plus an explicit regional station-context extent.
- Three.js playback with exact recorded tracks, ground projections, altitude curtains, altitude stems, and synchronized model time.
- Small-multiple telemetry from the same engine frames.
- Model Truth, IAF RASP, and PAF RASP separation.
- Run snapshots saved to Postgres and a dedicated PDF-like report route with explicit print and JSON behavior.
- A hosted `/math` page that publishes equations, value states, limitations, and the package/hash/model/frame reproducibility chain.

## Data authority

PostgreSQL/PostGIS is the runtime authority. Schema creation is migration-only; API requests never create tables or seed data as a side effect. `scripts/seed-db.ts` loads deterministic development fixtures. Public facts, source assertions, and simulation coefficients are separate tables and retain separate value states.

## Acceptance rules

- Primary actions remain visible at 1366×768, 1440×900, and 1920×1080.
- No critical control requires horizontal scrolling.
- Results never appear as unlabeled examples.
- A report cannot exist without either an explicit saved run ID or `sample=1`.
- Saving is permitted only after a completed run has recorded frames. The API,
  database check constraint, and report route enforce that lifecycle together.
- Controls expose affiliation/view scope before effect.
- Inputs and computed outputs have distinct treatments.
- Expensive batches will run in browser Workers; map and playback interactions remain immediate.

## Verification

`make ci-local` is the commit gate. `make integration-local` additionally verifies the live PostGIS catalog and the Save → View Report API contract, including rejected incomplete saves and missing-run reads. `make observability-local` verifies Prometheus metrics, Tempo traces, and provisioned Grafana dashboards. `make performance-local` runs the deterministic engine benchmark and p95 regression guard. Docker Compose uses explicit image versions and health-gated migration/application startup. See [`observability.md`](observability.md) for the metric and dashboard contract.
