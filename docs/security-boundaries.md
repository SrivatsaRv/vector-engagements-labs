# Public runtime security boundaries

Vector Engagement Labs is a public, stateless research application. Anonymous
callers are treated as attacker controlled before database or upstream work.

## Saved runs

The browser submits a bounded scenario configuration and validated package
identity, not authoritative telemetry. The Worker validates each configurable
field, recomputes the run, hashes server-generated frames, and stores a
server-generated report. Request bodies are capped at 96 KiB, route plans at 64
waypoints per side, and physics inputs at documented finite study limits.
Database connections, locks, and statements have explicit timeouts.

The Cloudflare application Worker that validates APIs and saved runs is not the
browser simulation Web Worker. Interactive physics has no database or network
capability in its protocol: it receives a validated digest-addressed compiled
adapter and returns a content-addressed record. Browser Worker input is
structured-cloned, bounded by the engine admission limits, and verified by
digest before caching. Output record members are length-checked and SHA-256
verified before replay.

Transferable `ArrayBuffer` ownership is exclusive. Completed buffers move to the
main thread, are verified and decoded, then may be transferred back for reuse;
detached buffers are never read after transfer. The pool retains at most two
buffers of at most 64 MiB. `SharedArrayBuffer`, cross-origin isolation, network
fetches from the simulation Worker, and executable record assets are not part of
this boundary.

## Browser telemetry and metrics

Anonymous telemetry accepts only bounded browser-performance and map-load
events. Run outcomes, entity counts, active-run gauges, and report counters are
written by server-owned paths. The Prometheus registry caps retained series.

Production metrics return 404 without a configured `METRICS_BEARER_TOKEN` and
matching Bearer token. Local Compose uses a local scrape token and publishes
all development ports on `127.0.0.1`.

## Catalog and basemap relay

The catalog is cached for five minutes. The tile relay uses HTTPS upstreams,
validates image content types, has a three-second timeout, caches successful
responses, and uses a dedicated Cloudflare Rate Limiting binding. Public APIs
use a separate binding. These are safety controls, not billing guarantees;
account spending limits and abuse monitoring remain deployment duties.

## Delivery trust

Release workflows run from the trusted `main` definition and accept only an
existing semantic tag in reviewed `main` history. They run the full gate,
generate checksums and an SPDX SBOM, and attest archives before protected
publication. Production deploys accept only a full commit SHA in `origin/main`
history and require the workflow itself to be dispatched from `main`.
