# VECTOR Engagement Lab

VECTOR is a local-first browser workbench for public-data engagement experiments. It provides named Blue/Red force configuration, source-aware A2A loadouts, a deterministic Three.js simulation, Model Truth and Real Air Situation Picture views, repeatable run tools, D1 persistence, and printable/JSON reports.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317).

Docker is optional:

```bash
docker compose up --build
```

## Product routes

- `/` — landing page with an embedded live model.
- `/scenarios` — eight configured A2A, A2G, G2A, and G2G templates.
- `/workbench?scenario=a2a-crossing-intercept` — configured experiment workbench.
- `/report?sample=1` — explicitly labeled sample report.
- `/lab` — backward-compatible alias; without a scenario it redirects to the library.

## Data and runtime

- `lib/capability-data.ts` contains the typed seed catalog for sources, platforms, subsystems, weapons, compatibility, and study models.
- `db/schema.ts`, `db/bootstrap.ts`, and `drizzle/` define and seed Cloudflare D1.
- `/api/catalog` reads the structured D1 catalog.
- `/api/runs` saves and returns reproducible run snapshots.
- Physics and RASP derivation execute client-side; saved records use the same API locally and on Cloudflare.

Public facts and simulation assumptions are intentionally separate. The named-system curves are public-study models, not verified real-world performance or operational predictions.

## Verification

```bash
make ci-local
```

This runs lint, TypeScript checks, a production Cloudflare-compatible build, route rendering tests, and deterministic simulation/RASP tests. `docker build -t vector-lab:local .` validates the optional container path.

Architecture, physics limits, source contracts, and product language are documented in [`docs/`](docs/README.md).
