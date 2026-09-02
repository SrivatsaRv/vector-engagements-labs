# Public runtime security boundaries

Vector Engagement Labs is a public, stateless research application. Anonymous
callers are treated as attacker controlled before database or upstream work.

## Saved runs

Current BVR records remain content-addressed and package-bound. Opening a #197
BVR `1.2.0` record in the `1.3.0` workbench is rejected as a package mismatch;
the prior verified state remains visible and unchanged.

Before simulation or storage, the server repeats the shared structured-number
admission and the full Air-mission/scenario compiler. It rejects wrong JSON
types, non-finite numbers, range and integer violations, and excess fractional
precision with a stable code and field path. Ordinary authored scalars permit
at most three fractional digits; explicitly governed coordinate fields preserve
their higher exact-geometry precision. Rejection occurs before recomputation,
VSR creation and database mutation.

Air-domain saved-run admission requires the authored v1 mission unchanged,
recompiles it against exact environment/model identities, and returns stable
mission code/field-path errors. It never fills missing class, start, route,
loadout, fuel, recovery, policy, engine, or support values.
Every submitted Blue/Red route point, transition and acceptance radius is
re-admitted before recompilation. Optional `runDurationSeconds` accepts only a
finite value in `[0.001, 3600] s` with at most three fractional digits and is
passed unchanged to the terminal-tick boundary. Omission is retained for
historical packages and selects the versioned domain default; the server does
not persist a newly invented duration.

`vector.authored-route-profile.v1` is server-selected package/report metadata,
not caller-supplied engine policy. Saved-run validation does not admit a request
profile into `Scenario`; the report copies the selected template's exact-key
profile, side leg-intent labels and limitations when present. Those fields
cannot authorize an autonomous pilot, maneuver, launch, effect or lifecycle
transition. Historical templates and saved reports without a profile remain
readable and are reported as having no preserved authored profile.
The server also derives `vector.authored-profile-binding.v1` from the template's
exact causal profile inputs. Presentation recomputes equality against the
admitted saved scenario. It may say `MATCHED` only when both starts/routes,
transitions/radii, headings/TAS, guidance, regime, leg roles, release request
time and installed drag area, and duration are identical. Otherwise it says
`MODIFIED_FROM`, preserves only
source ancestry and suppresses source leg-intent claims. Missing historical
binding evidence cannot be treated as a match.

Saved-run admission validates the complete regional EnvironmentPack, compact
runtime binding and exact runway origin schema. Corrupt, stale, unknown or
cross-environment identities fail closed without catalogue fallback.
Ground-start replay also requires the exact compiled ground-operation mission,
posture, release, and runway-evidence binding. A digest-valid hostile mutation,
unknown field, or mismatched archived identity is rejected; replay never repairs
it by substituting a current mission or by presenting unavailable movement as a
valid zero-valued dynamics result.
Store-transfer replay additionally revalidates the full authored/compiled
request, ordered authority seal and compact entity binding. Caller mutation of
identity, tick, station/rule, operation, mass, installed drag or validity cannot
be repaired by resealing exposed compact digests. Operational airborne-state or
inventory rejection is retained explicitly and never materializes a store.
Weapon-terminal replay requires the event's achieved state and typed cause to
map exactly to the saved run outcome. It also retains the cumulative minimum
separation over the admitted weapon lifetime; a caller cannot substitute the
terminal step's separation or reseal a contradictory event, frame and report.
The read boundary compares the event value to the canonical six-decimal
projection of `report.engine.closestApproachM` before exposing replay.
Target-effect replay additionally requires exact authority, commit, causal
termination event, target frame, manifest and report agreement. Hash resealing
cannot change reason/result/lifecycle or insert sub-precision causal values;
historical records without the authority remain explicitly `NOT_MODELLED`.

A governed-package VSR uses the closed
`vector.scenario-package-reference.v1` tuple of package ID, version and 64-hex
content hash. Record creation and opening require exact equality across
`compiled.json`, `manifest.json` and `report.json`, plus the matching required
viewer feature. Resealing one or all archive members cannot make divergent
tuples authoritative. A feature without a tuple, a tuple without all three
artifacts, unknown keys or a malformed digest fails closed. Historical records
with no optional tuple remain admissible and are never upgraded from a current
database or catalogue row.
New-run creation additionally resolves the tuple against the deployment's
retained scenario inventory at browser and Worker boundaries; an arbitrary
well-formed hash cannot be self-sealed as governed provenance.

Saved-report debrief text is derived only after record admission from retained
frames, typed events, compiled/authored routes and optional template-owned
profile metadata. Route transitions, weapon world entry, store transfer,
termination, target effect, fuel, mass, installed stores and final aircraft
separation must each remain traceable to their recorded value. A descriptive
leg cannot be presented as an autonomous-pilot choice. Terminal kill wording
requires the exact admitted `KILL` commit and target-lifecycle proof and must
show its generic educational model/authority and limitations; it is never a
named-system effectiveness, probability-of-kill or pilot-performance claim.
Launch geometry must use the exact frame cited by the unique weapon world-entry
event. Aircraft closest-approach and authored-leg comparison may reduce only
retained aircraft frames; the latter additionally requires exact profile-input
applicability. Missing or unreached `INTERCEPT`/`RECOMMIT` frames remain
unavailable and cannot be repaired from a profile label, declared waypoint,
final frame or scenario identity.
The report's exact causal-input projection retains authored versus
versioned-default duration authority and both side-owned WGS84/MSL routes. Its
weapon-state timeline is formed only from changes in the primary weapon's
recorded `weaponFlightState`; observer and track availability is copied from an
exact retained observer-state frame. No report label may synthesize either from
time, separation, scenario identity or guidance mode.

Saved-run snapshots and saved-run admission counters now have separate
domain-owned declaration modules behind the unchanged aggregate Drizzle schema.

The browser submits a bounded scenario configuration and validated package
identity, not authoritative telemetry. The Worker validates each configurable
field, recomputes the run, hashes server-generated frames, and stores a
server-generated report. Request bodies are capped at 96 KiB, route plans at 64
waypoints per side, and physics inputs at documented finite study limits.
Database connections, locks, and statements have explicit timeouts.

`public-api-admission.v2` is the versioned anonymous-admission policy. The
Cloudflare edge uses its three declared Rate Limiting bindings; Node/container
deployments use the same limits in Postgres-backed fixed windows. A deployed
adapter that cannot enforce its declared limiter rejects the request with
`rate_limit_unavailable`; it must not fall back to unlimited access. Rate-limit
rejections use `rate_limit_exceeded` and include `Retry-After`.

Browser telemetry has its own 60-request-per-minute binding. Its best-effort
navigation, map, and sampled long-task events cannot consume the separate public
API budget used by catalog and saved-run requests.

`/api/health` is an admission-readiness check. It reports the non-secret
policy version, runtime adapter, limiter identity, and `ready` state only after
the deployment has configured the required limiter backend. A missing Node
database URL or any Cloudflare limiter binding returns
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
The catalog route exposes only PostGIS rows that exactly match governed pack,
installation and runway artifacts. Geometry is serialized at sufficient
precision for digest admission; mismatched or partial rows return no catalog.

The shared public-API rate-window table is declared in
`db/schema/public-api-admission.ts`; its limiter and relay behavior are
unchanged.

The catalog is cached for five minutes. The tile relay admits exactly one
`revision`, `mode`, `z`, `x`, and `y`, all strictly canonical. Its versioned
`vector-basemap-tile.v3` cache identity contains only `revision`, `z`, `x`, and
`y`; presentation mode is echoed in the response but cannot duplicate identical
OSM bytes. Revision `osm-derived-v1` admits a fixed public OSM HTTPS raster
upstream for standard, minimal, and tactical presentation; no
browser-visible provider key or key-bearing style URL is accepted. Unknown,
duplicate, encoded, empty, conflicting, leading-zero, stale-revision, or out-of-
range input is rejected before cache or upstream work. Reordered valid query
fields and all three presentation modes share one cache identity. The browser
uses one raster source and applies mode-specific paint locally. The relay has a three-second timeout, accepts
PNG or WebP only, buffers at most 4 MiB, coalesces identical misses, and caches
only successful bounded responses for 24 hours. Cache schema and revision appear
in the response and cache key, so an intentional authority change invalidates
prior entries without a broad purge.
Expired responses are deleted and refetched; failed, timed-out, partial,
oversized, and misleading-media responses are never cached. Node uses a bounded
process cache and Workers use Cache API; both preserve the same tuple and
headers. The relay emits bounded hit, miss, rejection, and error counters plus
latency. It uses a dedicated Cloudflare Rate Limiting binding. Public APIs use
a separate binding. These are safety controls, not billing guarantees; account
spending limits and abuse monitoring remain deployment duties.

## Delivery trust

Migration 019, the regenerated #207 VSR inventory and the run-information
projection are subject to existing contract-policy, immutable-record and CI
checks. No deployment flag can promote unavailable tactical information into a
trusted runtime capability.

Migration 016's duplicated canonical package/readback bytes contain two visible
`MODEL_ASSUMPTION` and two fixed duel-slot indicators. The runtime-stub ledger
classifies them under release-blocking STUB-01/STUB-02 and STUB-04 respectively,
owned by #64/#28/#38/#60. The governed challenge therefore cannot be used to
retire named-model or generic-force-package debt merely because it completes.

Migration 018's three canonical study packages and three immutable readback
copies retain six visible `MODEL_ASSUMPTION` lines and six fixed duel-slot
lines. The runtime-stub ledger classifies those lines under release-blocking
STUB-01, STUB-02, STUB-26, STUB-28 and STUB-04: publishing deterministic BVR,
WVR and transition evidence does not validate named aircraft or weapon
performance, generic store-release aerodynamics, target-effect thresholds, or
the fixed two-actor allocation. The migration remains useful as governed study
evidence while every one of those limitations stays explicit and issue-owned.

The Rust/WASM artifact now binds the exact Binaryen 131.0.0 optimization policy
into its source identity and verifies optimized bytes, length and required ABI
exports before embedding. The optimizer is build-time only and cannot be
selected or supplied by a runtime scenario. Direct engine-verification request
callers are independently denied when a positive sensor's admitted source or
validation evidence has the wrong role or lacks its immutable SHA-256 digest;
the same raw boundary rejects an unknown admission/coverage field, unsupported
schema, non-`VALIDATED` coverage, or an admitted artifact removed from sensor
provenance. It also rejects duplicate evidence identities, overlapping source
and validation roles, and any ordered runtime observer-sensor projection that
does not exactly match the authenticated compiled pack. The browser wrapper is
defense in depth, not the sole authority boundary.

The contract ownership registry now maps the one Air mission implementation and
regression suite to new material mission-contract and record-storage sections.
The registry canonical digest and exact semantic declaration bind that new
authority; no old heading is relabelled and no unrelated schema is introduced.
Retiring #61's six completed runtime-stub rows is explicit governance data:
regional source verification, immutable pack admission and browser/runtime
tests replace those blockers; remaining assumptions stay separately disclosed.
Source-freeze validators may recognize the `MODEL_ASSUMPTION` vocabulary only
through issue-owned ledger exemptions that prove the records remain value-less
governance assertions and cannot provide runtime or mission-policy authority.
The ownership registry separately maps #187's composed fixture, benchmark and
focused regression to the engine performance section, while STUB-26 keeps its
generic operation/installed-drag assumptions release-blocking. The inclusive
`[0.001, 1] m²` validity is documented and authority-sealed; changing that
policy requires a new reviewed contract rather than caller data.

Migration 017 and its generated model-pack fixture are accepted only when the
registered generator reproduces their exact bytes, model-pack digest, intended
use, and scenario-template readback identities. STUB-27 keeps the 25 m
geometric closest-approach and 180 s expiry values release-blocking and binds
their explicit `NOT_MODELLED` target effect; neither a caller nor a renderer
may promote that verification-only termination into fuze, damage, kill, or
named-weapon authority. VSR replay recomputes the achieved fixed-step launch
boundary plus the admitted maximum lifetime and rejects any hash-resealed
expiry event carrying a different occurrence time. Boundary-only miss, terrain
and target-unavailable causes likewise require exact equality with the terminal
event boundary.

The separate generic target-effect authority is governed by STUB-28. Its
radial thresholds and target-domain profile remain release-blocking
`MODEL_ASSUMPTION` data owned by #196/#28. Admission binds the exact weapon,
target, model-pack, termination receipt and same-frame target state; missing or
out-of-domain authority records `EFFECT_UNAVAILABLE` and cannot change target
lifecycle. Presentation may display only the committed result and cannot infer
an effect from distance, team colour, label or named platform.

Issue #151's generic mission-policy source policy scans every production and
runtime-fixture root for exact hashes and SHA-256-confirmed raw or
contiguous-base64 embedded fingerprints of all governed external PDFs,
metadata, renders, and contact sheets. Its committed record is a policy
template; generated PASS output is content-addressed over the exact
candidate/runtime heads, attested policy inputs, and scanned production tree,
so neither marker removal nor reuse of an old PASS can authorize promotion.

The hosted integration build reruns the issue #148 deny-network source verifier
after creating the production output. A build that embeds a Stage-0 source
marker, an exact frozen artifact, or frozen bytes inside a wrapper fails before
API verification; a pre-build scan alone is not release evidence.

Release workflows run from the trusted `main` definition and accept only an
existing semantic tag in reviewed `main` history. They run the full gate,
generate checksums and an SPDX SBOM, and attest archives before protected
publication. Production deploys accept only a full commit SHA in `origin/main`
history and require the workflow itself to be dispatched from `main`. The
protected verification checkout retains that trusted history while executing
the admitted exact SHA, so source gates cannot lose their `origin/main`
authority in a detached checkout.

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
a release failure. It scans every production file as bytes, including symlink
targets and `.next`, `.output`, `build`, `out`, `dist`, Rust/WASM, public, Worker,
and browser artifacts. It rejects Stage-0 markers, exact frozen-artifact files,
and frozen bytes embedded inside a larger file; a wrapper, suffix, file
extension, symlink, or alternate build root cannot bypass the quarantine.
The complete canonical source-manifest digest is verifier-pinned. A caller
cannot replace a governed PDF or render, alter a source identity, erase scope
claims, relax extracted-text policy, update local hashes and totals, and then
promote the resealed manifest. Generator freshness and this full verification
run as a required `make ci-quality` gate.

ZIP handling is verification-only and never writes archive-selected paths. It
parses declared bytes with fixed archive, member-count, and expanded-size
limits, validates local and central records, CRC and sizes, and rejects
traversal, absolute or non-UTF-8 paths, backslashes, symlinks, duplicates,
encryption, unsupported compression, and undeclared inventory changes before a
selected member is compared. Stone Soup is never imported or executed.

The legal artifact is authority data, not an agent recommendation. Each source
has separate redistribution, reference-execution, and adaptation states.
Redistribution may be `SOURCE_TERMS_AUTHORIZED` only when the digest-pinned
source-terms artifact proves the exact NASA public/public-use metadata or the
exact Zenodo open/MIT record and preserved MIT notice. That source grant has no
reviewer identity and cannot authorize execution or adaptation. Only an
allowlisted human record with identity, canonical calendar date, closed
jurisdiction and scope, conditions, and evidence digest can represent those
separate approvals.
The complete decision payload must carry a detached Ed25519 signature verified
against the digest-pinned policy at
`governance/generic-sensor-legal-authority-policy.v1.json`, outside the source
bundle. Caller-supplied roots or allowlists are ignored. The policy binds an
exact reviewer, source, decision field, jurisdiction, scope, validity interval,
and public key; each field has one fixed scope. Signed evidence identity must
resolve to the exact bytes of a regular file below the governed external
evidence root. Repository-local or self-declared keys, reviewer-kind strings,
invented or unresolved records/evidence, malformed dates, pending, missing,
forged, agent-authored, and out-of-scope decisions fail closed. Decision,
reviewer, registry, policy, evidence, and attestation objects use exact keys.
Pending and rejected states carry no reviewer, date, jurisdiction, scope,
conditions, record, evidence, or alternate authority field. Source-terms
authority uses an exact closed redistribution scope and evidence digest, with
no reviewer, decision date, or jurisdiction. Network access is unnecessary
for verification. The mandatory focused command preloads a deny-all network
guard and proves TCP, HTTP, and every callback, promise, resolver-instance, and
ESM DNS resolution method fail before inspecting only committed bytes. The DNS
inventory is discovered from Node's `lookup*`, `resolve*`, and `reverse`
surfaces so newly exposed resolver variants fail the regression instead of
silently escaping the guard. The verifier runs again after the production build so missing output
directories cannot stand in for bundle-exclusion evidence. Dynamic unpinned or
substituted community/game material is rejected.
Hosted source checks resolve both `pdftoppm` and `pdfinfo` through the same
network-denied, digest-keyed Poppler 26.05.0 image. Quality, web-contract, and
integration jobs depend on that setup and cannot fall back to an ambient
runner binary with an ungoverned version.

Visual release review is a separate technical boundary. `RELEASE_OWNER_REVIEW`
is manifest-bound to separately content-addressed Darwin-arm64 and Linux-amd64
44-page render sets and their eight profile/contact-sheet identities. It
records title/report identity, declared mapping, context category,
limitations/nonclaims, and cross-profile mapping, nonblank structure,
orientation, and limitation consistency. Each profile must reproduce exact
bytes; the contract makes no cross-platform PNG byte-identity claim. It is not
`AUTHORIZED_HUMAN`, cannot create legal authority, and records that no numeric
value or equation was transcribed. Production isolation scans the entire
`fixtures/` tree, so frozen or embedded quarantine bytes cannot hide in
public-reference or performance fixtures.
