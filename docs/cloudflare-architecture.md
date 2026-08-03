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

The first deploy requires a Cloudflare account, Wrangler authentication, a Worker name and route, an origin PostgreSQL connection string, a Hyperdrive configuration, runtime secrets, and a production migration job. R2 is optional until durable binary or large JSON artifacts are stored server-side.

## Binding contract

The application should accept platform-neutral ports and bind them at the edge:

- `CATALOG_DATABASE`: PostgreSQL/PostGIS access through Hyperdrive;
- `FRESH_DATABASE`: cache-disabled Hyperdrive access for writes and read-after-write flows;
- `ARTIFACTS`: optional R2 bucket for immutable records and exports;
- `OTEL_EXPORTER_OTLP_ENDPOINT`: external telemetry collector;
- `APP_ENV`, `APP_VERSION`, and `LOG_LEVEL`: non-secret release configuration.

Local Compose supplies equivalent database and telemetry endpoints through environment variables. Code outside the adapter layer must not inspect Cloudflare-specific binding objects.

## Deployment gates

- `make ci-local`, integration, responsive, observability, and performance checks pass against the release commit.
- Database migrations are reviewed, forward-only, and tested on a production-like PostGIS version.
- The Worker build contains no development seeds or credentials.
- Hyperdrive freshness behavior is explicit for catalog reads, saves, and immediate report reads.
- R2 object keys are content-addressed or run-ID scoped, checksummed, and treated as immutable after report publication.
- Rollback deploys the prior Worker artifact without rolling back an already-applied database migration.

Cloudflare does not run the PostgreSQL container. Hyperdrive supplies the Worker with a database connection string and connection management. Local development uses the same binding shape with a direct Compose connection. The app and physics do not require a server round trip per model step.

Compose is intentionally small: one PostGIS service, one one-shot migration/seed service using the same application image, and one web service. The web container serves the built Worker bundle through Wrangler's local Cloudflare runtime; it does not run the HMR development server. Images are explicitly versioned; PostGIS is digest pinned; startup is gated by database health and successful migration.

A Hetzner or similar budget server remains a valid PostgreSQL origin and can also host the complete Compose stack. Server-side native batches are a future compute concern, not a reason to move interactive playback out of the browser.

## Primary references

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Hyperdrive overview](https://developers.cloudflare.com/hyperdrive/)
- [Connect Hyperdrive to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Cloudflare R2 architecture](https://developers.cloudflare.com/r2/how-r2-works/)
