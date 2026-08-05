# Vector Engagement Labs documentation

Vector Engagement Labs is built by
[Reach Defence](https://reachdefence.com) and maintained by
[Srivatsa RV](https://github.com/SrivatsaRv).

This directory is the maintained engineering and product contract for the application and the reusable simulation engine. A behavior is not complete when code exists but its contract, limits, verification, and operational consequences are undocumented.

## Public identity

The canonical public title is **Vector Engagement Labs by Reach Defence**. Social previews use `public/og.png` at 1200×630 and describe the product as a browser-based engagement experiment lab with visible assumptions, synchronized simulation views, comparisons, and reproducible reports. Public metadata must resolve against `https://labs.reachdefence.com` in production.

## Documentation map

- [`engineering-principles.md`](engineering-principles.md): open-source boundary, SOLID design, twelve-factor alignment, and release evidence.
- [`browser-engine-architecture.md`](browser-engine-architecture.md): scenario compilation, runtime ownership, entity lifecycle, and frame consumers.
- [`engine-backends.md`](engine-backends.md): TypeScript and Rust/WASM interface, provenance, parity, and backend selection.
- [`physics-model.md`](physics-model.md): equations, atmosphere, guidance, termination, numerical limits, and declared assumptions.
- [`scenario-builder.md`](scenario-builder.md): authoring journey, state ownership, map controls, and validation.
- [`vector-simulation-record.md`](vector-simulation-record.md): portable replay and debriefing record.
- [`catalog-and-sources.md`](catalog-and-sources.md): PostGIS ontology, source assertions, versions, and installation geometry.
- [`model-pack-contract.md`](model-pack-contract.md): executable object definitions, intended use, credibility, SI compilation, compatibility, patches, and cross-language consumption.
- [`rasp-state-machine.md`](rasp-state-machine.md): observer-picture dependencies, state transitions, scope, and regression matrix.
- [`tacview-visual-subset.md`](tacview-visual-subset.md): supported analysis-display subset and explicit exclusions.
- [`responsive-ui.md`](responsive-ui.md): supported viewports and fit-to-task behavior.
- [`regression-matrix.md`](regression-matrix.md): release proof across engine, maps, symbols, reports, persistence, and UI.
- [`testing-strategy.md`](testing-strategy.md): test-layer selection, current runners, frontend strategy, regression policy, and release evidence.
- [`observability.md`](observability.md): metrics, traces, logs, dashboards, and business signals.
- [`performance-capacity.md`](performance-capacity.md): clock separation, benchmark targets, the 100-user workload, and the x86-64 host capability contract.
- [`geospatial-environment.md`](geospatial-environment.md): WGS84/ECEF/local frames, vertical datums, environment manifests, bounded terrain, and geometric line of sight.
- [`cloudflare-architecture.md`](cloudflare-architecture.md): Workers, Hyperdrive, optional R2, deployment gates, and local parity.
- [`product-language.md`](product-language.md): canonical workflow and human-readable military terminology.
- [`repository-governance.md`](repository-governance.md): protected branches, CI/CD, releases, tags, ownership, and repository status.
- [`security-boundaries.md`](security-boundaries.md): anonymous API admission, saved-run integrity, metrics protection, caching, and delivery trust.
- [`../AGENTS.md`](../AGENTS.md) and [`../.codex/skills/vector-lab-harness/SKILL.md`](../.codex/skills/vector-lab-harness/SKILL.md): project-level agent routing, focused context loading, release-train ownership, and verification/handoff rules.
- [`../pending-work/README.md`](../pending-work/README.md): dependency-ordered A2A research and implementation backlog.

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

The air-picture source dependencies, effect scope, transitions, and automated regression matrix are specified in [`rasp-state-machine.md`](rasp-state-machine.md).

The release proof across engine, map, symbols, reports, persistence, observability, and responsive breakpoints is specified in [`regression-matrix.md`](regression-matrix.md).

## Working vertical slice

- Eight versioned A2A, A2G, G2A, and G2G templates, with regression-tested successful baselines.
- Scenario-driven engine contracts with no fixed entity count.
- Explicit carried → launched → active → terminated weapon lifecycle.
- Deterministic fixed-step browser physics, atmosphere, wind vector, changing mass, thrust, drag, gravity, proportional-navigation demand, and termination diagnostics.
- Tactical symbols by affiliation and object kind; carried inventory is not rendered as a world track.
- Shared MapLibre standard, minimal, and low-light tactical basemaps with VECTOR controls, camera telemetry, PostGIS public-reference installations, study-area boundaries, declared routes, recorded tracks, launches, and model-assumption coverage envelopes.
- Versioned WGS84/ECEF/ENU recording, explicit altitude datums, and a content-addressed synthetic-environment manifest shared by engine, map, Three.js, and reports.
- Engagement-scale map fitting for readable trajectories plus an explicit regional station-context extent.
- Three.js playback with exact recorded tracks, ground projections, altitude curtains, altitude stems, and synchronized model time.
- Small-multiple telemetry from the same engine frames.
- Model Truth, IAF RASP, and PAF RASP separation.
- Run snapshots saved to Postgres and a dedicated PDF-like report route with explicit print and JSON behavior.
- A hosted `/math` page that publishes equations, value states, limitations, and the package/hash/model/frame reproducibility chain.

## Data authority

PostgreSQL/PostGIS is the catalog authority. Schema creation is migration-only; API requests never create tables or seed data as a side effect. `scripts/seed-db.ts` loads deterministic development fixtures. Public facts, source assertions, human-readable model sources, immutable compiled model packs, and credibility manifests are separate records. The engine consumes an admitted SI pack and never queries the database during a tick.

## Acceptance rules

- Primary actions remain visible at 1366×768, 1440×900, and 1920×1080.
- No critical control requires horizontal scrolling.
- Results never appear as unlabeled examples.
- A report cannot exist without either an explicit saved run ID or `sample=1`.
- Saving is permitted only after a completed browser run. The API validates the
  bounded scenario and independently recomputes and hashes stored frames.
- Controls expose affiliation/view scope before effect.
- Inputs and computed outputs have distinct treatments.
- Expensive batches will run in browser Workers; map and playback interactions remain immediate.

## Verification

`make ci-local` is the commit gate. `make integration-local` additionally verifies the live PostGIS catalog and the Save → View Report API contract, including rejected incomplete saves and missing-run reads. `make observability-local` verifies Prometheus metrics, Tempo traces, and provisioned Grafana dashboards. `make performance-local` runs the deterministic engine benchmark and p95 regression guard. Docker Compose uses explicit image versions and health-gated migration/application startup. See [`observability.md`](observability.md) for the metric and dashboard contract.
