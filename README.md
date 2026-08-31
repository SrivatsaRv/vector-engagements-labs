# Vector Engagement Labs

[![Continuous Integration](https://github.com/SrivatsaRv/vector-engagements-labs/actions/workflows/ci.yml/badge.svg)](https://github.com/SrivatsaRv/vector-engagements-labs/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SrivatsaRv/vector-engagements-labs/actions/workflows/codeql.yml/badge.svg)](https://github.com/SrivatsaRv/vector-engagements-labs/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Built by [Reach Defence](https://reachdefence.com) and created and maintained
by [Srivatsa RV](https://github.com/SrivatsaRv).

> **Project status: pre-alpha research software.** Contracts and results may change before `v1.0.0`. The software is for transparent educational simulation and is not verified system performance or operational decision support.

Vector Engagement Labs is a local-first browser workbench for public-data engagement experiments. A normalized PostgreSQL/PostGIS catalog resolves versioned scenario packages; deterministic physics, map/3D playback, telemetry, comparison, and reporting execute from one browser-engine frame contract.

The long-term deliverable is a rigorously tested open-source simulation library with a browser workbench as its reference application. See [`docs/README.md`](docs/README.md), [`docs/engineering-principles.md`](docs/engineering-principles.md), and [`CONTRIBUTING.md`](CONTRIBUTING.md). Source code is licensed under Apache-2.0; bundled third-party artwork retains its own attribution and license in [`NOTICE`](NOTICE).

## Run the complete local stack

Docker Compose is the authoritative local service topology. It builds one
explicitly tagged application image, starts the pinned PostGIS database, applies
checksum-tracked schema and governed-catalog migrations, loads idempotent local
fixtures in a separate one-shot service, and serves that same image through the
non-root Node production runtime on port 4317.

```bash
make compose-up
docker compose ps
```

Open [http://localhost:4317](http://localhost:4317). Grafana is available at [http://localhost:4300](http://localhost:4300) using `vector` / `vector-local-only` unless `VECTOR_GRAFANA_PASSWORD` is set. The database is exposed on loopback port `55433` for inspection. Every Compose image uses an explicit version or digest; `latest` is not an admitted tag. Set `VECTOR_IMAGE` to one exact GHCR tag or digest to verify a release candidate; see [`docs/container-release.md`](docs/container-release.md).

Useful routes:

- `/`: product entry and scenario quick start
- `/scenarios`: nine versioned templates, including three Air-combat study profiles
- `/lab`: choose a governed study area, including North Punjab or Ladakh, and construct a run
- `/workbench?scenario=a2a-crossing-intercept`: Construct, Simulate, Observe, Explain, Compare, Report
- `/math`: published equations, model limits, and reproducibility contract
- `/symbols`: tactical symbol and lifecycle reference

For host-side development, build the same application image and start the
database, migration, and local fixture services first:

```bash
make db-up
npm run dev -- --port 4317
```

## Canonical product journey

**Enter → Construct → Simulate → Observe → Explain → Compare → Report**.

“Define,” “Place,” “Configure,” and “Model” are sections within Construct, not competing top-level workflows. Reports require an explicit conducted and saved run; `/report?sample=1` is the only example-data mode.

## Runtime boundaries

- PostgreSQL/PostGIS: sources, objects, compatibility, model coefficients, 21 public-reference installations including all 15 SHIELD-seeded PAF points, template versions, and saved run snapshots.
- Scenario compiler: resolves builder state and catalog records into one immutable engine package.
- Browser engine: fixed-step 3DOF/point-mass integration and event lifecycle. Saving reruns the bounded scenario on the server so stored telemetry is not caller-authored.
- Presentation: MapLibre, Three.js, telemetry, RASP, explanation, comparison, and report consume the same sampled frames.
- Carried weapons are inventory until their launch event. They become visible tracks only when spawned with inherited launcher position and velocity.

`lib/capability-data.ts`, `lib/installations.ts`, `lib/scenarios.ts`, and `lib/simulation-models.ts` are deterministic local seed/test fixtures. The six governed public-educational study areas are additionally installed by a forward-only data migration so production never depends on running the development seed. Runtime catalog reads come from `/api/catalog`; saved snapshots use `/api/runs`.

## Verification

```bash
make ci-local
make integration-local
make observability-local
```

The first command runs lint, type checks, production build, route checks, and deterministic engine tests. The second verifies the non-root production image, applies migrations/seeds, validates PostGIS SRID, row coverage, scenario count, model foreign keys, and the automated application journey. The third proves protected Prometheus ingestion, Tempo traces, Grafana provisioning, and bounded browser performance telemetry.

Public API and delivery trust boundaries are documented in [`docs/security-boundaries.md`](docs/security-boundaries.md).

See [`docs/`](docs/README.md) for product language, catalog contracts, engine mathematics, deployment mapping, and current limitations.

## Project stewardship

Vector Engagement Labs is an open-source Reach Defence research project led by
Srivatsa RV. Project information and related defence technology research are
available at [reachdefence.com](https://reachdefence.com).
