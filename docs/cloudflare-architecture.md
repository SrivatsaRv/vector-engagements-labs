# Cloudflare runtime and deployment mapping

There is no current Cloudflare product named **R1** in the public Cloudflare developer catalog. If “R1” means **R2**, R2 is object storage and is suitable for simulation records, exports, report assets, and large immutable artifacts. It is not a replacement for PostgreSQL/PostGIS. If “R1” means the lowest paid Workers tier, the relevant product is the **Workers Paid plan**.

| Capability | Local Compose | Cloudflare-oriented deployment |
| --- | --- | --- |
| Web UI and API | Versioned VECTOR image on port 4317 | Worker-compatible vinext build |
| Catalog and snapshots | PostgreSQL 16 + PostGIS 3.4 | PostgreSQL reached through Hyperdrive |
| Browser physics | Client main thread today | Same; Web Worker/WASM migration does not change contracts |
| Static assets | Local application | Cloudflare CDN/cache |
| Large artifacts | Files/JSON download today | R2 when durable artifact custody is required |
| Multi-user synchronization | Not present | Durable Objects only if multiplayer is later authorized |

## Recommended first Cloudflare release

1. Deploy the vinext output as a Cloudflare Worker with static assets.
2. Keep individual simulation runs in the browser. The Worker serves the application and handles bounded catalog and saved-record APIs; it does not advance physics frames.
3. Host PostgreSQL/PostGIS on a managed provider or a secured budget server and connect it through Hyperdrive.
4. Bind R2 only for immutable Vector Simulation Records, telemetry exports, report assets, and large scenario attachments.
5. Keep the Worker stateless. Use Durable Objects only when a later synchronized session needs one ordered coordinator per session.
6. Send production telemetry to a managed OTLP endpoint. The local Grafana stack remains the development and self-hosted profile.

Public catalog and tile routes use Cloudflare's Cache API and separate Rate
Limiting bindings. The bindings are cost guards at the edge; database timeouts,
bounded request bodies, and server-side saved-run reconstruction remain the
authoritative application controls.

The first deploy requires a Cloudflare account, Wrangler authentication, a Worker name and route, an origin PostgreSQL connection string, a Hyperdrive configuration, runtime secrets, and a production migration job. R2 is optional until durable binary or large JSON artifacts are stored server-side.

## Binding contract

The application should accept platform-neutral ports and bind them at the edge:

- `CATALOG_DATABASE`: PostgreSQL/PostGIS access through Hyperdrive;
- `FRESH_DATABASE`: cache-disabled Hyperdrive access for writes and read-after-write flows;
- `ARTIFACTS`: optional R2 bucket for immutable records and exports;
- `OTEL_EXPORTER_OTLP_ENDPOINT`: external telemetry collector;
- `PUBLIC_API_RATE_LIMITER`, `BROWSER_TELEMETRY_RATE_LIMITER`, and
  `TILE_RATE_LIMITER`: independent anonymous traffic budgets, declared in
  `public-api-admission.v2` and mirrored by the Node/Postgres adapter;
- `METRICS_BEARER_TOKEN`: secret protecting production Prometheus output;
- `APP_ENV`, `APP_VERSION`, and `LOG_LEVEL`: non-secret release configuration.

Local Compose supplies equivalent database and telemetry endpoints through environment variables. Code outside the adapter layer must not inspect Cloudflare-specific binding objects.

## Production database provisioning

Migration 014 provisions immutable environment-pack payload/coverage rows and
PostGIS runway centrelines. Production seeding remains a controlled release
action; runtime ticks never connect to this catalogue.
Migration 017 independently publishes both the retained 0.8.0 authority chain
for scenario `1.0.0` and the new 0.9.0 authority chain for scenario `1.1.0`.
The immutable `1.0.0` packages are retained as `RETIRED`: their 0.8.0 pack has
no weapon-termination authority, so catalog and saved-run admission cannot
advertise them as executable under the current engine.
Reference-data seeding uses insert-only conflict handling, so an existing
content identity cannot be rewritten by a later deploy or administrative seed.

VECTOR uses a managed PostgreSQL origin with PostGIS enabled. The protected
GitHub `production` environment owns the deployment credentials. It accepts
only protected branches and requires explicit maintainer approval before a job
can read its credentials:

- `DATABASE_ORIGIN_URL` is an environment secret used only by the migration and
  verification job. It is never bundled into the Worker or exposed to the
  browser.
- `CLOUDFLARE_API_TOKEN` is an environment secret used by Wrangler.
- `CLOUDFLARE_ACCOUNT_ID` is a non-secret environment variable.
- `CLOUDFLARE_HYPERDRIVE_ID` is a non-secret environment variable identifying
  the production Hyperdrive configuration.
- `VECTOR_PRODUCTION_HOST` is the non-secret custom domain. Production uses
  `labs.reachdefence.com`.

The deployment gate validates that the Hyperdrive configuration exists and
checks the production migration ledger in a database-enforced read-only
transaction. The ledger must be an exact checksum-bound prefix of the admitted
revision. A deploy operation then runs only reviewed forward-only SQL
migrations, performs the full PostGIS and catalog verification in one
repeatable-read, read-only transaction, deploys the immutable Worker revision,
and probes production health. Production
is never seeded implicitly; new reference data belongs in a reviewed migration
or an explicitly governed admin process. The Worker receives only the
`HYPERDRIVE` binding generated by the Cloudflare Vite plugin. Runtime database
code reads `env.HYPERDRIVE.connectionString`; it does not receive the origin
password.

Local development keeps `DATABASE_URL` pointed at Compose PostGIS. An ignored
`PROD_DATABASE_ORIGIN_URL` may be used for an explicitly requested production
migration check, but its value must never be committed or copied into
`.env.example`.

The manual workflow defaults to `verify`. Both operations require a full
40-character commit SHA that is contained in `main` and has a successful
Required PR Gate. Admission happens before untrusted revision code can access
the production environment. Verify checks Cloudflare access, Hyperdrive, source
gates, and migration-ledger compatibility without changing schema, data, or the
deployed Worker. Deploy alone applies migrations, runs the full catalog
verifier without its disposable-database mutation probes, publishes the same
admitted revision, and checks `/api/health` and
`/blogs` on the configured production host.

Historical rollback fails closed when the live migration ledger is ahead of or
otherwise not an exact prefix of the selected revision. Forward-schema rollback
requires a separately reviewed compatibility contract; it is not inferred from
an older image or commit.

The Cloudflare Vite configuration owns the Worker name, compatibility date,
observability switch, Hyperdrive binding, and custom-domain route. A separate
`wrangler.jsonc` is intentionally not maintained because two configuration
sources can silently diverge. The custom-domain route is included only when
`VECTOR_PRODUCTION_HOST` is present during deployment.

The compatibility date is pinned to `2026-05-22`, the newest date accepted by
the repository's pinned Wrangler/workerd runtime. Dependency upgrades must
advance and verify this date together; using the calendar date without checking
the runtime support boundary can make the local Worker fail before health
checks begin.

Local Cloudflare builds declare `nodejs_compat` through the Vite binding so the
runtime can load the framework and PostgreSQL adapter. During `vinext deploy`,
vinext owns the generated copy, so the Vite configuration omits its copy for
that lifecycle. Cloudflare rejects duplicate compatibility flags before the
Worker version is created.

## Deployment gates

Before applying any migration, deployment opens a database-enforced read-only
ledger check and requires the live rows to be an exact checksum-bound prefix of
the admitted revision. It then applies only the pending forward suffix and
repeats catalogue verification in a repeatable-read, read-only transaction.

Migration 021 follows the published migration 020. It reconciles the known
pre-#133 three-platform production seed to the exact four-platform Peace Drive
C/D catalog while keeping F-16D catalog-only. It clears only the retired
ALQ-211(V)9 and DSCA authority, and marks the affected compatibility rows
`UNVERIFIED`. Fresh empty, known legacy, and already-current paths have explicit
outcomes: an empty migrate-before-seed database stays empty for the
explicit seed job, the legacy path reaches the current rows, and the current
path remains unchanged. A conflicting row rolls back the migration. Production
Worker promotion remains blocked until the post-migration read-only catalog
verifier passes.

Pending migration 017 recognizes the exact intended-use tuple produced by the
August 10 pre-#54 seed as well as the migration-007 tuple. The integration gate
recreates that production sequence and proves the row is preserved, unknown
history is rejected, and all later exact readbacks remain active. Production
had not applied migration 017 when its checksum was corrected. Build-once
artifact promotion remains separately owned by #111 and is not bypassed here.

The migration gate upgrades the nine-template `1.0.0` catalog through
`017_weapon_termination_model.sql` and requires 18 rows on readback:
nine immutable retired historical versions and nine validated `1.1.0` versions.
It admits only two exact compiled-model catalog histories. A fresh database has
the 0.8.0 and 0.9.0 packs, engine manifest 0.7.0, and model manifests 1.2.0
and 1.3.0. Long-lived production instead has the 0.5.0, 0.8.0, and 0.9.0
packs, engine manifest 0.5.0, and model manifests 1.0.0, 1.2.0, and 1.3.0.
Every identity, digest, subject, and pack-to-manifest binding is checked; any
other missing, altered, or extra row blocks deployment. The existing platform,
installation, runway and
EnvironmentPack counts are not changed by migration 017. Migration 021
separately advances the governed platform count from the known production seed
of three to the current catalog count of four.
Migration 018 then produces 21 immutable scenario rows: nine `VALIDATED` rows
(six unaffected `1.1.0` and three Air-combat `1.2.0`) plus 12 `RETIRED` rows
(nine `1.0.0` and three superseded Air-combat `1.1.0`). Exact readback
and conflicting-row rollback are required before the catalog API can publish
the new current versions.

Migration 019 versions only the crossing study from `1.2.0` to `1.3.0`. Fresh
and upgraded verification therefore requires 22 immutable scenario rows: nine
`VALIDATED` current templates and 13 `RETIRED` historical versions. The database
gate derives the validated count from the nine-entry scenario library and
separately asserts the four additional retained version generations, preventing
the new BVR history row from being mistaken for duplicate current catalog data.

Migration 020 extends the existing durable rate-window constraint with the
`BROWSER_TELEMETRY_RATE_LIMITER` identity. It changes no scenario, catalog, or
saved-record row. Fresh and upgraded databases must admit telemetry and public
API counters independently before application readiness is accepted.

The PostGIS gate now exercises both sides of the Air mission transition: current
v3 production rows are valid pre-migration input, while post-migration and fresh
databases must expose canonical `vector.scenario.v4` Air envelopes through the
catalog and application verifier. A mixed catalogue fails closed.
Deployment verifies 12 exact environment packs, 24 runway rows, 12 eligible
starts, geometry/SRID validity, immutable-update rejection and live catalog API
readback before browser verification.

- The exact release commit has a successful Required PR Gate; release and
  deployment workflows re-run the gates appropriate to their authority.
- `make ci-local`, integration, responsive, observability, and performance checks pass against the release commit.
- Database migrations are reviewed, forward-only, and tested on a production-like PostGIS version.
- Production verification is read-only, production is never seeded implicitly,
  and only the deploy operation may apply migrations.
- The Worker build contains no development seeds or credentials.
- Hyperdrive freshness behavior is explicit for catalog reads, saves, and immediate report reads.
- R2 object keys are content-addressed or run-ID scoped, checksummed, and treated as immutable after report publication.
- Rollback deploys the prior Worker artifact without rolling back an already-applied database migration.

Cloudflare does not run the PostgreSQL container. Hyperdrive supplies the Worker with a database connection string and connection management. Local development uses the same binding shape with a direct Compose connection. The app and physics do not require a server round trip per model step.

Compose is intentionally small: one PostGIS service, one one-shot migration/seed service using the same application image, and one web service. The web container serves the built Worker bundle through Wrangler's local Cloudflare runtime; it does not run the HMR development server. Images are explicitly versioned; PostGIS is digest pinned; startup is gated by database health and successful migration.
For a first start against an empty volume, database health additionally verifies
that the image entrypoint has handed control to the final PostgreSQL process.
This prevents the temporary initialization postmaster from releasing the
migration dependency immediately before that temporary server shuts down.

An x86-64 server remains a valid PostgreSQL origin and can also host the complete Compose stack plus a bounded native Rust worker pool. Interactive playback and ordinary runs remain browser-first. The workload, machine capability, clock separation, and evidence requirements are defined in [`performance-capacity.md`](performance-capacity.md).

## Primary references

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Hyperdrive overview](https://developers.cloudflare.com/hyperdrive/)
- [Connect Hyperdrive to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Cloudflare R2 architecture](https://developers.cloudflare.com/r2/how-r2-works/)
