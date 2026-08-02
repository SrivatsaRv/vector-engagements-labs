# Runtime and deployment mapping

| Capability | Local Compose | Cloudflare-oriented deployment |
| --- | --- | --- |
| Web UI and API | Versioned VECTOR image on port 4317 | Worker-compatible vinext build |
| Catalog and snapshots | PostgreSQL 16 + PostGIS 3.4 | PostgreSQL reached through Hyperdrive |
| Browser physics | Client main thread today | Same; Web Worker/WASM migration does not change contracts |
| Static assets | Local application | Cloudflare CDN/cache |
| Large artifacts | Files/JSON download today | R2 when durable artifact custody is required |
| Multi-user synchronization | Not present | Durable Objects only if multiplayer is later authorized |

Cloudflare does not run the PostgreSQL container. Hyperdrive supplies the Worker with a database connection string and connection management. Local development uses the same binding shape with a direct Compose connection. The app and physics do not require a server round trip per model step.

Compose is intentionally small: one PostGIS service, one one-shot migration/seed service using the same application image, and one web service. The web container serves the built Worker bundle through Wrangler's local Cloudflare runtime; it does not run the HMR development server. Images are explicitly versioned; PostGIS is digest pinned; startup is gated by database health and successful migration.

A Hetzner or similar budget server remains a valid PostgreSQL origin and can also host the complete Compose stack. Server-side native batches are a future compute concern, not a reason to move interactive playback out of the browser.
