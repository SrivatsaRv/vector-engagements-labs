# Cloudflare runtime mapping

| VECTOR capability                            | Cloudflare component                                                     | Current status                                            |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Landing, scenario library, workbench, report | Workers-compatible vinext application                                    | Implemented                                               |
| Catalog, compatibility, assertions           | D1                                                                       | Implemented with runtime bootstrap and Drizzle migrations |
| Saved run snapshots                          | D1                                                                       | Implemented                                               |
| Large telemetry/replay artifacts             | R2                                                                       | Planned; keep only object keys and checksums in D1        |
| Profile/account service                      | Worker API + D1                                                          | Planned                                                   |
| Authentication                               | Cloudflare Access for private deployments or application auth in Workers | Planned                                                   |
| Live shared experiment room                  | Durable Object                                                           | Optional; only needed for synchronized multi-user state   |
| Caching/static assets                        | Workers cache/CDN                                                        | Available through deployment                              |

## Deployment decision

The current workload should remain on Cloudflare: the physics runs client-side, APIs are short catalog/snapshot operations, and D1 fits the structured metadata. A dedicated Hetzner service becomes useful only when server-side Monte Carlo batches, native/WASM jobs exceeding Worker limits, large model inference, or long-running authoritative simulation are introduced. That compute can remain a separate worker service while Cloudflare continues to serve the UI, identity edge, catalog, and artifact index.

## Local parity

Local development uses the Cloudflare-compatible vinext runtime and local D1 state. The public UI must not depend on a remote service to conduct a deterministic run. Run records are saved through the same `/api/runs` contract used in deployment.

`docker compose up --build` provides an optional local container at `http://localhost:4317`. The container still runs the Cloudflare-compatible application and keeps local Wrangler/D1 state in a named volume. Docker Compose is a development and self-hosting convenience; it is not the Cloudflare production deployment unit.
