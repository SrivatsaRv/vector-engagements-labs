# VECTOR Engagement Lab

VECTOR is a local-first browser workbench for public-data engagement experiments. A normalized PostgreSQL/PostGIS catalog resolves versioned scenario packages; deterministic physics, map/3D playback, telemetry, comparison, and reporting execute from one browser-engine frame contract.

## Run the complete local stack

Docker Compose starts the pinned PostGIS database, applies checksum-tracked migrations, loads idempotent fixtures, and serves the built Worker bundle through the local Cloudflare runtime on port 4317.

```bash
docker compose up --build -d
docker compose ps
```

Open [http://localhost:4317](http://localhost:4317). The database is exposed locally on port `55433` for inspection. Images use explicit versions: `reachdefence/vector-engagement-lab:0.1.0`, `node:22.18.0-bookworm-slim`, and digest-pinned `postgis/postgis:16-3.4`.

Useful routes:

- `/` — product entry and scenario quick start
- `/scenarios` — eight versioned templates
- `/workbench?scenario=a2a-crossing-intercept` — Construct, Simulate, Observe, Explain, Compare, Report
- `/math` — published equations, model limits, and reproducibility contract
- `/symbols` — tactical symbol and lifecycle reference

For host-side development, start the database and seed it first:

```bash
make db-up
npm run dev -- --port 4317
```

## Canonical product journey

**Enter → Construct → Simulate → Observe → Explain → Compare → Report**.

“Define,” “Place,” “Configure,” and “Model” are sections within Construct, not competing top-level workflows. Reports require an explicit conducted and saved run; `/report?sample=1` is the only example-data mode.

## Runtime boundaries

- PostgreSQL/PostGIS: sources, objects, compatibility, model coefficients, public-reference installations, template versions, and saved run snapshots.
- Scenario compiler: resolves builder state and catalog records into one immutable engine package.
- Browser engine: fixed-step 3DOF/point-mass integration and event lifecycle.
- Presentation: MapLibre, Three.js, telemetry, RASP, explanation, comparison, and report consume the same sampled frames.
- Carried weapons are inventory until their launch event. They become visible tracks only when spawned with inherited launcher position and velocity.

`lib/capability-data.ts`, `lib/installations.ts`, `lib/scenarios.ts`, and `lib/simulation-models.ts` are deterministic seed/test fixtures. Runtime catalog reads come from `/api/catalog`; saved snapshots use `/api/runs`.

## Verification

```bash
make ci-local
make integration-local
```

The first command runs lint, type checks, production build, route checks, and deterministic engine tests. The second applies migrations/seeds and validates PostGIS SRID, row coverage, scenario count, and model foreign keys.

See [`docs/`](docs/README.md) for product language, catalog contracts, engine mathematics, deployment mapping, and current limitations.
