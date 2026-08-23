# Vector Engagement Labs documentation

Vector Engagement Labs is built by
[Reach Defence](https://reachdefence.com) and maintained by
[Srivatsa RV](https://github.com/SrivatsaRv).

This directory is the maintained engineering and product contract for the application and the reusable simulation engine. A behavior is not complete when code exists but its contract, limits, verification, and operational consequences are undocumented.

## Public identity

The canonical public title is **Vector Engagement Labs by Reach Defence**. Site-level social previews use `public/og.png` at 1200×630 and describe the product as a browser-based engagement experiment lab with visible assumptions, synchronized simulation views, comparisons, and reproducible reports. Blog posts can override that with per-post thumbnails declared in markdown frontmatter. Public metadata must resolve against `https://labs.reachdefence.com` in production.

## Documentation map

- [`engineering-principles.md`](engineering-principles.md): open-source boundary, SOLID design, twelve-factor alignment, and release evidence.
- [`browser-engine-architecture.md`](browser-engine-architecture.md): scenario compilation, runtime ownership, entity lifecycle, and frame consumers.
- [`engine-backends.md`](engine-backends.md): TypeScript and Rust/WASM interface, provenance, parity, and backend selection.
- [`deployment-capabilities.md`](deployment-capabilities.md): deployment-owned domain, engine, model-pack and optional-capability admission.
- [`physics-model.md`](physics-model.md): equations, atmosphere, guidance, termination, numerical limits, and declared assumptions.
- [`public-aircraft-reference.md`](public-aircraft-reference.md): NASA NESC aircraft check-case evidence, SI-normalized trim propagation, tolerances, parity, measurements, and limits.
- [`generic-aam-verification.md`](generic-aam-verification.md): governed NASA TM-109057 generic missile arithmetic, discrepancy decisions, standalone TS/Rust-WASM verification, and nonclaims.
- [`aircraft-evidence-registry.md`](aircraft-evidence-registry.md): governed public-artifact inventory, per-capability named-aircraft admission, and explicit evidence gaps.
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
- [`../governance/runtime-stub-ledger.v1.json`](../governance/runtime-stub-ledger.v1.json): executable inventory of causal stubs, assumptions, fallbacks, evidence paths, and owning issues.
- [`../governance/aircraft-evidence-registry.v2.json`](../governance/aircraft-evidence-registry.v2.json): current exact-subject registry separating catalog context, ineligible proposals, unknowns, assumptions, and named-performance admission.
- [`../governance/aircraft-evidence-registry.v1.json`](../governance/aircraft-evidence-registry.v1.json): preserved predecessor for compatibility verification.
- [`../governance/environment-sources/`](../governance/environment-sources): immutable, checksum-verified offline source artifacts. Point-only source snapshots are ingestion evidence, not runtime regional environment packs.
- [`container-release.md`](container-release.md): authoritative Compose topology, immutable GHCR images, promotion, rollback, backup, and restore.
- [`blog-publishing.md`](blog-publishing.md): markdown frontmatter, thumbnail assets, canonical metadata, and ops publishing flow.
- [`security-boundaries.md`](security-boundaries.md): anonymous API admission, saved-run integrity, metrics protection, caching, and delivery trust.
- [`../AGENTS.md`](../AGENTS.md) and [`../.codex/skills/vector-lab-harness/SKILL.md`](../.codex/skills/vector-lab-harness/SKILL.md): project-level agent routing, focused context loading, release-train ownership, and verification/handoff rules.
- [Causal simulation runtime epic #47](https://github.com/SrivatsaRv/vector-engagements-labs/issues/47): dependency order, executable scope, status, and acceptance links. GitHub Issues are the work authority; this directory remains the durable product and engineering contract.

## Engineering personas

The project harness is the shared operating protocol. Four authoritative skills divide engineering responsibility without creating competing contracts:

| Explicit invocation | Authority |
| --- | --- |
| `$vector-staff-engineer` | Architecture, shared contracts, causal delivery order, and cross-stream integration |
| `$vector-simulation-systems-engineer` | Dynamics, behavior, guidance, weapons, sensing, tracking, datalinks, EW, and causal simulation validity |
| `$vector-3d-frontend-engineer` | Scenario UX, canonical 2D/3D observation, playback, interaction, telemetry, responsive presentation, and frontend performance |
| `$vector-verification-performance-engineer` | Independent validation, regression, parity, browser and visual testing, performance, security, recovery, and release readiness |

Invoke a persona with the `$skill-name` shown above. Each persona follows `$vector-lab-harness`, the owning GitHub issue, and the maintained contracts in this directory. The Staff Architect owns the integrated outcome; specialist authority and independent verification remain explicit.

## One journey

| Product stage | Includes |
| --- | --- |
| Enter | Choose a template, blank scenario, weapon-led study, or Red-vs-Blue study |
| Construct | Engagement type, entities, placement, loadouts, environment, assumptions |
| Simulate | Deterministic detailed run; uncertainty batches follow the same package contract |
| Observe | Synchronized map/3D playback, Situation Log, air picture, and telemetry |
| Explain | Outcome, causes, value state, confidence, and influential variables |
| Compare | Controlled Variant A/Variant B comparison |
| Report | Save, replay, print/PDF, JSON/telemetry export, and research citations |

The interface uses these terms. Define, Forces & loadouts, Place & flight, Sensors & decisions, and Validate are Construct sections. Advanced repeatability tools remain enthusiast features and are not described as an Instructor Station. The complete builder contract is in [`scenario-builder.md`](scenario-builder.md).

The mandatory analysis-display contract is documented in [`tacview-visual-subset.md`](tacview-visual-subset.md). It defines the Tacview-style subset precisely and explicitly excludes claims of Tacview file compatibility or NATO symbol compliance.

The portable replay and debriefing artifact is specified in [`vector-simulation-record.md`](vector-simulation-record.md). It is the browser-oriented VECTOR equivalent of an ACMI recording and is deliberately independent of the TypeScript or Rust/WASM engine backend.

The air-picture source dependencies, effect scope, transitions, and automated regression matrix are specified in [`rasp-state-machine.md`](rasp-state-machine.md).

The release proof across engine, map, symbols, reports, persistence, observability, and responsive breakpoints is specified in [`regression-matrix.md`](regression-matrix.md).

## Simulation-object objective

Every object visible in the shared 3D world must move and change state as a causal result of its versioned model pack, authored initial conditions, environment, side-owned information, configured mission/behavior, and bounded commands interpreted by its dynamics component. The renderer replays canonical achieved state; it never invents movement. Behavior labels, events, timelines, and reports explain that movement rather than substitute for it.

The contract is cross-domain. A2A is the first proving domain because it stresses continuous dynamics, sensing, pursuit/defence, weapon support, and replay, but named platforms are data fixtures rather than engine or renderer branches.

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
- Model Truth is the only admitted observer surface in the current Air
  deployment. IAF/PAF RASP, sensor, data-link, AEW, and EW views return only
  after their information-model contract is admitted.
- Run snapshots saved to Postgres and a dedicated PDF-like report route with explicit print and JSON behavior.
- A hosted `/math` page that publishes equations, value states, limitations, and the package/hash/model/frame reproducibility chain.
- A public-reference verification panel that reports NASA NESC Case 11 trajectory errors and the TypeScript/Rust-WASM parity gate without relabeling it as operational F-16 or Su-30MKI performance.
- A hosted `/blogs` section with searchable engineering notes and per-post discussion that explains runtime contracts, assumptions, and release-facing implementation decisions inside the same application shell.

## Data authority

PostgreSQL/PostGIS is the catalog authority. Schema creation and governed runtime catalog data are migration-only; API requests never create tables or seed data as a side effect. `scripts/seed-db.ts` loads deterministic development fixtures in a separate Compose one-shot service. Public facts, source assertions, human-readable model sources, immutable compiled model packs, and credibility manifests are separate records. The engine consumes an admitted SI pack and never queries the database during a tick.

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
