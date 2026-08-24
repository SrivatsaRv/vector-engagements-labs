# Public runtime security boundaries

Vector Engagement Labs is a public, stateless research application. Anonymous
callers are treated as attacker controlled before database or upstream work.

## Saved runs

Air-domain saved-run admission requires the authored v1 mission unchanged,
recompiles it against exact environment/model identities, and returns stable
mission code/field-path errors. It never fills missing class, start, route,
loadout, fuel, recovery, policy, engine, or support values.

Saved-run snapshots and saved-run admission counters now have separate
domain-owned declaration modules behind the unchanged aggregate Drizzle schema.

The browser submits a bounded scenario configuration and validated package
identity, not authoritative telemetry. The Worker validates each configurable
field, recomputes the run, hashes server-generated frames, and stores a
server-generated report. Request bodies are capped at 96 KiB, route plans at 64
waypoints per side, and physics inputs at documented finite study limits.
Database connections, locks, and statements have explicit timeouts.

`public-api-admission.v1` is the versioned anonymous-admission policy. The
Cloudflare edge uses its two declared Rate Limiting bindings; Node/container
deployments use the same limits in Postgres-backed fixed windows. A deployed
adapter that cannot enforce its declared limiter rejects the request with
`rate_limit_unavailable`; it must not fall back to unlimited access. Rate-limit
rejections use `rate_limit_exceeded` and include `Retry-After`.

`/api/health` is an admission-readiness check. It reports the non-secret
policy version, runtime adapter, limiter identity, and `ready` state only after
the deployment has configured the required limiter backend. A missing Node
database URL or either Cloudflare limiter binding returns
`rate_limit_unavailable` with HTTP 503. The normal health database query then
proves the configured backing store is reachable; it does not expose a
connection string, client identity, or limiter state.

Node accepts only the Cloudflare canonical client-IP header when that header is
provided by the edge. A direct Node deployment has no trusted peer-address
adapter yet, so anonymous callers share one conservative budget rather than
trusting a spoofable forwarding header. This is safe but intentionally not a
multi-tenant identity solution.

`saved-run-lifecycle.v1` separately caps anonymous saved-run recomputations,
daily accepted writes, stored result bytes, and record retention. A Postgres-backed lease table
enforces the global recomputation limit across Node processes; lease expiry
prevents a crashed process retaining capacity. A quota entry is a durable
reservation during recomputation. It becomes an accepted write only after the
immutable snapshot insert succeeds; failed validation, computation, or storage
refunds the reservation and releases capacity in the same transaction. Release
performs bounded expiry cleanup. Admission rejects use stable quota, capacity, or unavailable codes;
the `/api/health` readback identifies the active non-secret admission adapter.

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

`PublicApiError` retains explicit status, code, headers and deterministic field
path as ordinary immutable instance fields. This representation is executable
under both the built application loader and Node's strip-only TypeScript loader;
it does not change catalog, tile, request-size, origin or storage admission.

The shared public-API rate-window table is declared in
`db/schema/public-api-admission.ts`; its limiter and relay behavior are
unchanged.

The catalog is cached for five minutes. The tile relay uses the versioned
`vector-basemap-tile.v1` tuple: exactly one `mode`, `z`, `x`, and `y`, all
strictly canonical. Unknown, duplicate, encoded, empty, conflicting, leading-
zero, or out-of-range input is rejected before cache or upstream work. Reordered
valid query fields share one cache identity. The tuple selects a fixed HTTPS
provider; it has a three-second timeout, accepts PNG or WebP only, buffers at
most 4 MiB, coalesces identical misses, and caches only successful bounded
responses for 24 hours. Cache schema appears in the response and cache key, so
an intentional schema change invalidates prior entries without a broad purge.
Expired responses are deleted and refetched; failed, timed-out, partial,
oversized, and misleading-media responses are never cached. Node uses a bounded
process cache and Workers use Cache API; both preserve the same tuple and
headers. The relay emits bounded hit, miss, rejection, and error counters plus
latency. It uses a dedicated Cloudflare Rate Limiting binding. Public APIs use
a separate binding. These are safety controls, not billing guarantees; account
spending limits and abuse monitoring remain deployment duties.

## Delivery trust

The contract ownership registry now maps the one Air mission implementation and
regression suite to new material mission-contract and record-storage sections.
The registry canonical digest and exact semantic declaration bind that new
authority; no old heading is relabelled and no unrelated schema is introduced.

Release workflows run from the trusted `main` definition and accept only an
existing semantic tag in reviewed `main` history. They run the full gate,
generate checksums and an SPDX SBOM, and attest archives before protected
publication. Production deploys accept only a full commit SHA in `origin/main`
history and require the workflow itself to be dispatched from `main`.

## Browser response baseline

`browser-response-policy.v1` applies the same response headers at the
Cloudflare Worker boundary and the Node production server. The policy sets a
self-only default source, denies framing and plugin objects, prevents MIME
sniffing, limits referrers, and disables unused browser permissions. The
headers are tested on built Worker and Node HTML responses; source inspection
alone is not evidence.

The current framework produces inline bootstrap and style payloads. Therefore
the baseline explicitly permits inline script and style content and does not
claim to prevent inline-script injection. Repository content must continue to
use structural rendering and text nodes. A later #70 slice must inventory the
approved payloads and replace these allowances with a tested nonce/hash CSP
before future operator-authored content is admitted.

## Trusted published content

`trusted-content-rendering.v1` treats Markdown as content rather than an HTML
template language. Blog Markdown is lexed and rendered with structural React
nodes. Raw HTML is shown as text. Only `https`, `http`, `mailto`, same-origin
absolute paths, relative paths, and fragment links can produce an anchor;
other URL schemes produce inert link text. This rule applies to headings,
paragraphs, lists, and table cells.

Mermaid input is also content. The browser renderer uses Mermaid strict mode;
it does not admit loose HTML labels or callback links. The SVG insertion is a
library rendering boundary and must retain its strict-mode regression test.

Repository Markdown is reviewed source content, but it does not receive
executable trust. Future database or operator-authored content must use this
same structural renderer or a separately versioned, tested sanitization policy.
This slice does not provide a nonce/hash CSP, comment moderation, operator
identity, retention, or a production CSP report endpoint; those remain open
items in #70.

## Offline reference-source quarantine

The issue #148 source freeze is quarantined under
`governance/generic-sensor-verification-sources/`. Production TypeScript,
Rust/WASM, backend, Worker, browser, model-pack, VSR, fixture, public, and built
assets must contain no Stage-0 subject/schema/export marker or source-bundle
import. The offline verifier scans those boundaries and treats any exposure as
a release failure.

ZIP handling is verification-only and never writes archive-selected paths. It
parses declared bytes with fixed archive, member-count, and expanded-size
limits, validates local and central records, CRC and sizes, and rejects
traversal, absolute or non-UTF-8 paths, backslashes, symlinks, duplicates,
encryption, unsupported compression, and undeclared inventory changes before a
selected member is compared. Stone Soup is never imported or executed.

The legal artifact is authority data, not an agent recommendation. Each source
has separate redistribution, reference-execution, and adaptation states. Only
an authorized human record with identity, date, jurisdiction, scope,
conditions, and evidence digest can represent approval; pending, missing,
forged, agent-authored, and out-of-scope decisions fail closed. Network access
is unnecessary for verification, and dynamic unpinned or substituted
community/game material is rejected.
