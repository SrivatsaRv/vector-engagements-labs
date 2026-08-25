# Testing strategy

## Frozen TP-1538 evidence

`npm run tp1538:sources:verify` checks the immutable source and metadata hashes, exact 59-page mapping, exhaustive manifest descriptors, source-render and upright lossless-display hashes/dimensions/orientation lineage, rights/export fields, visual-QA inventory, path confinement, and verification-only production isolation. `npm run tp1538:sources:generate` is deliberately pinned to Poppler `pdftoppm` 26.05.0 and Sharp 0.35.0; repeated generation must be byte-identical before any regenerated artifact is admitted.

The verifier is offline and cannot fetch replacement evidence. Numeric transcription, interpolation, and runtime tests belong to later #142 children and must not be credited to #143.

Testing is part of the implementation contract. An executable action is incomplete until its behavior is covered at the appropriate test layers and the result is recorded. The project uses focused tests for fast feedback and staged integration evidence for release confidence.

## Required layers

- **Unit:** pure math, coordinate transforms, parsers, reducers, validators, compilers, and state machines.
- **Contract and regression:** schemas, canonical hashes, lifecycle transitions, backend boundaries, saved records, error cases, and every bug fix.
- **Documentation impact:** base/head policy ownership, rename/copy endpoints, exact owning-section identities, structured dispositions, and hostile declaration inputs.
- **Engine:** Rust unit/integration tests, TypeScript reference tests, strict lint/Clippy/rustdoc, and deterministic parity fixtures.
- **Database and API integration:** empty-database migration, upgrade migration, deterministic seed/verifier, route admission, persistence, report replay, and failure paths.
- **Frontend:** component and interaction tests for builder, maps, playback, reports, keyboard/touch behavior, loading, cancellation and errors.
- **Browser end-to-end:** built-app journeys proving Enter → Construct → Simulate → Observe → Explain → Compare → Report, including save and replay.
- **Visual/responsive:** supported viewport checks, changed-breakpoint screenshots or traces, and map interaction evidence.
- **Performance and operations:** p95/allocation benchmarks, Worker cancellation/recovery, load/soak, health, metrics, traces and logs.

Use the smallest complete set for a change. State why any applicable layer was omitted. A passing build is not a passing behavioral test.

## Existing baseline

`make ci-local` runs quality, Rust, TypeScript, contract, parity and
production-audit checks. It first runs the same contract-documentation impact
validator used by hosted CI. Governed feature branches must supply an explicit
declaration file or JSON value; an absent declaration fails as soon as the
merge-base-to-worktree change set contains a registered family. The verifier
constructs an isolated temporary Git snapshot for dirty and untracked files,
so pre-commit validation neither ignores edits nor mutates the real index. The
post-commit clean-clone run validates the exact immutable candidate and carries
the declaration path forward. Registry regression also resolves each newly
introduced family to its exact implementation and maintained section, and
checks changelog-heading uniqueness against the live inventory rather than a
fixed family count. It then verifies the machine-readable runtime stub
ledger. A new or removed production fallback, temporary adapter, model
assumption, named-duel identifier, scripted guidance hold, or source-less public
reference must update its owning ledger entry; an
unclassified occurrence fails. A zero-match policy control is rejected because
it can hide a classified indicator; every exemption has an accountable issue
owner and a non-causal rationale. The named targeted contracts are `make worker-local`,
`make frontend-local`, `make integration-local`, `make container-verify`,
`make observability-local`, `make performance-local` and
`make air-reference-local`. `frontend-local` requires `VECTOR_URL` to identify
an already running built application; it does not start or silently substitute
a development server. `make integration-local` validates Compose, builds and
inspects the non-root production image, starts the authoritative topology,
verifies governed migration data before fixture admission, covers the live
PostGIS/API path, and runs automated responsive interaction checks. The
responsive verifier reads the configuration-owned engine identity from
`config/deployment-capabilities.json` and requires the observed run to use that
backend; it must not hardcode a TypeScript or Rust/WASM selection. Its default
run covers the entire governed responsive matrix. `VECTOR_RESPONSIVE_WIDTH`
can select one admitted matrix width for local red/green diagnosis, but it
fails closed for unknown widths and is not complete release evidence. The image
inspection rejects missing OCI identity, development `node_modules`, an
unexpected command, or a root user. These targets remain separate because they
have different environment and runtime costs.

`make clean-clone-local` clones the current committed branch without local
working-tree files, resolves the documented harness entry point, installs the
lockfile and runs `make ci-local`. Run it after the candidate commit exists. It
is not evidence for uncommitted files.

Database integration additionally runs `db:credibility:verify`, which confirms
the live immutable triggers reject same-version mutation and malformed compiled
pack insertion under rolled-back transactions. API tests assert that admitted
credibility, limitations, persisted run provenance, and the Validate surface
all carry the same pack digest.

Air-mission verification uses the exported `AirMissionDefinition` adapter at
template creation, JSON import, compiler admission, the production Worker
boundary, saved-run readback and VSR replay. Its focused regressions cover every
mission class, engagement overlay and start posture; hostile nested authority,
non-finite or out-of-area geometry, stale environment/runway evidence, invalid
time and fuel constraints, BLUE-only side admission, arbitrary/deleted task
references, unknown station/rule identities, store quantities above immutable
capacity, ground-envelope digest tampering, environment-owned geometry
regeneration, cross-model loadouts, digest tampering and missing
persisted intent; and causal first-frame, fuel, mass and store consequences.
The database gate must prove both an all-v3 pre-migration state and the exact
all-v4 result of migration `013_air_mission_contract.sql`; mixed versions fail.
Browser completion evidence includes the governed viewport matrix and a real
built Worker run from mission authoring through report provenance.

Aircraft-model verification additionally runs `reference-aircraft:verify`.
The gate checks immutable NASA source identities, deterministic trim
propagation, every declared external time-history tolerance, malformed and
unbounded input rejection, energy invariance, step-size convergence at common
checkpoints, and 1×10⁻⁹ TypeScript/Rust-WASM parity. A deliberately perturbed
trajectory must fail the gate.

Generic-missile arithmetic verification additionally runs
`reference-aam:verify`. It checks the frozen NASA TM-109057 bytes, exact corpus
and successor workload ownership, private-corpus mutation resistance, input/output falsifiers,
independent arithmetic and convergence oracles, forward/reversed workload
digests, a cross-platform quantized semantic identity with sampled and aggregate
trajectory values, full-to-terminal comparison of all 30 numeric frame leaves under the governed default/CPA-specific absolute-plus-relative parity policy,
half-bin/overflow/policy-tamper falsifiers, printed-radian boundary flips, D09 exceptional semantics, exhaustive
finite content-addressed run decoding, isolated production-bundle scans, exact numeric-boundary sweeps, and complete TypeScript/actual-WASM frame parity. The separate
`reference-aam:performance` target reports a 15-case Node-hosted workload under
explicit p95 limits and makes no Worker or product-capacity claim. See
[`generic-aam-verification.md`](generic-aam-verification.md).

GitHub CI uses `scripts/classify-ci-changes.mjs` to select the smallest complete
automated gate from merge-base-relative `--name-status -z` records. Rename and
copy records use `--find-copies-harder` and retain both endpoints without
trimming legal path bytes. Invalid UTF-8, control characters, absolute paths,
dot segments, backslashes, symlink traversal, and unregistered additions fail
closed.
`scripts/verify-contract-doc-impact.mjs` independently maps those endpoints to
the base and head versions of `governance/contract-doc-ownership.v1.json`,
validates the one structured declaration, resolves every registered Markdown
file and heading from exact Git blobs, derives the changed semantic facets, and
compares only their exact registered sections. Every test path belongs to its
actual model, engine, evidence, Worker, VSR, UI, security, mission, geospatial,
content, data, or delivery family rather than a generic test-only owner.
Regression coverage changes a test and two independent owning sections in one
fixture, proving the test-selected facet cannot hide the second changed contract
section; migration headings remain a distinct requirement inventory.
The ownership baseline also binds the shared overlay implementation and its
focused ObjectPicker/overlay regressions to `UI_RESPONSIVE_INTERACTION`,
including its dedicated shared-overlay section, so future primitive changes
cannot bypass responsive interaction evidence.
The template command runs the same analysis without accepting a declaration and
emits the exact required family/section inventory for the current diff. Hosted
verification writes the subsequently validated declaration to the visible job
summary. Regression coverage also proves changelog headings are family-unique,
the aggregate Drizzle facade has only generic database ownership, and each
domain schema module selects only its generic plus truthful domain owners.
Post-bootstrap section-introduction fixtures cover both a wholly new family and
a new facet on an existing family. They require the exact owning document and a
semantic declaration in the introducing revision, and reject dormant relabels,
empty new sections, unchanged or unrelated headings, and every non-semantic or
docs-current disposition. The same core is exercised through dirty-tree,
pull-request exact-head, and associated-main-push adapters.
Placeholder-only section regressions reject non-rendered HTML comments, empty
raw tags, subordinate headings without material rendered content, invisible
Unicode/HTML entities, reference definitions, empty links, and non-textual raw
style content. Hidden, styled, titled, dialog/details, cross-block containers,
cross-block stylesheets, and every other raw-HTML-bearing section fail closed;
raw HTML is never permitted to establish new contract authority. Positive
controls admit ordinary prose, code/list content, and a visible Markdown
autolink through the pinned renderer and decoded-DOM policy. Hosted Stage 0.6
installs the exact JavaScript lockfile with lifecycle scripts disabled before
running this parser-backed gate, while Stage 0/0.5 remain dependency-free.
Classifier probe regressions exercise the shared dependency-free name-status
parser from a clean materialized tree, bind its source digest to the classifier,
and require passing unchanged V1 and V2 self-comparisons before hostile
mutations. The immutable V1 probe remains executable compatibility authority as
well as a historical ledger entry; V2 is the current two-file
classifier/parser-helper identity contract. The helper re-exports the parser
implemented once by the self-contained classifier, so compatibility does not
create a second parser.
Exact-rule retirement regressions reproduce the former delete/rename deadlock
and then require a bijective, append-only tombstone bound to the merge-base
commit, canonical base-policy digest, old endpoint, and exact Git operation.
They cover implementation, test, and generated-rule slots; endpoint-aware
`TEST_ONLY`; same-family/inventory/facet rename replacement; retained tombstones
across later revisions; and rejection of prefix, wrong-digest, wrong-revision,
orphan, edited, removed, mismatched-target, copied/still-live, cross-inventory,
new-dormant-probe, new-inert-multi-family, empty-generated-group, and bootstrap
retirements. A two-hop rename proves historical replacement paths may later
move under a second independently bound tombstone.
The exemption matrix also rejects a deleted/retired output even when the
registered freshness command or pre-trusted refactor/invariant probes succeed,
because output retirement changes the governed contract rather than merely
refreshing derived bytes.
TEST_ONLY, GENERATED_ARTIFACT_ONLY, INTERNAL_REFACTOR,
NO_SEMANTIC_CHANGE, and DOCS_ALREADY_CURRENT are mutually exclusive,
evidence-bearing dispositions; none receives credit merely because an arbitrary
document changed. INTERNAL_REFACTOR and NO_SEMANTIC_CHANGE remain unavailable
unless a versioned adapter already registered and digest-bound by the merge-base
policy supplies the exact identity or invariant result. The declaration names
probe IDs only; the family, disposition, changed-path coverage, adapter,
assertions, revisions, and equal base/head identities are validated outside the
declaration. Adapters execute twice with a scrubbed environment and bounded
output. Candidate decision modules execute in a nested observation process and
return unhashed data; the immutable adapter parent alone hashes Git source,
decision identities, and evidence. A newly added head-policy probe, malformed result, failed assertion,
nondeterministic output, or caller-authored hash/command fails closed. The
classifier refactor probe binds the complete exported rule/effect inventory and
exact decision-function identity, then compares every base/head tracked path,
registered boundary sentinel, and add/modify/delete/rename/copy parser case.
The Required PR Gate invariant probe binds its complete mandatory-field,
review-kind, state, gate, selection, terminal-result, and decision-function
identity as well as the positive/negative matrix. An unsampled new rule or
admitted value therefore changes the identity. Probe evidence still does not
certify the technical adequacy of the contract. A generated-only disposition executes
the policy-registered direct argv after
Stage 0.6 provisions its closed Node or Rust/WASM toolchain;
it cannot be redirected by editing `package.json`. The command runs against a
temporary exact-head archive and tracked-file mutation fails. The hosted checkout is the
exact pull-request head rather than GitHub's synthetic merge tree. Semantic
schema/storage/VSR facets
additionally require their registered
Unreleased migration section. Repository-policy tests always run, and an
unknown or unclassified tracked path makes policy validation fail. Documentation and agent-harness
changes do not consume application, Rust, container, or PostGIS runners. Web,
simulation, database/API, dependency, workflow, and infrastructure paths each
add their owning gates. Shared mission, scenario, environment, model, Worker and
Vector Simulation Record contracts select the Rust/parity and integration gates
that consume them. The single Required PR Gate is always emitted and verifies
that the documentation-impact job succeeded, every selected job passed, and
every unselected job was skipped. Failed,
cancelled, timed-out, action-required or unexpectedly skipped selected jobs all
fail the gate. Workflow-level path exclusions are not used because they can
strand a required check.

The classifier names the tracked contract locations rather than legacy logical
names. `lib/record/**`, mission and spatial admission, the canonical frontend
selectors, browser Worker protocols, runtime security adapters, compiled model
packs, and `governance/environment-sources/**` each select their actual
consumers. The quality job runs the environment-source, aircraft-evidence, and
public-aircraft-reference validators as well as generated model and symbol
checks. An unclassified evidence artifact still fails closed through the full
matrix; it is not silently treated as documentation.

Regression fixtures distinguish the browser simulation Worker from the
Cloudflare delivery Worker. They also prove that a change to canonical JSON
identity selects browser, Rust/parity, and persistence consumers; that every
generic-AAM verifier source, adapter, generated artifact, generator, and Rust
crate selects its Rust owner; and that each registered seed, database-upgrade,
or credibility-catalog executable selects integration. The generic-AAM
generated-only disposition is available only through its registered Rust
source, exact generated output, direct generator command, and successful
freshness reconstruction. Ownership tests additionally keep generic delivery
harnesses out of the simulation-Worker family, bind the runtime capability
validator to both descriptor and Worker contracts, and require the public
aircraft fixture/evaluator/verifier chain to update its numerical-evidence
contract when that chain changes. They also bind the model-pack compiler to its
digest/admission/runtime sections, evidence registries to admission and subject
validity, VSR digest/event sources to every replay consumer, and real
TypeScript/Rust physics producers to the integrated-model and Rust/WASM proof
sections. This prevents backend documentation from becoming a substitute for
the actual physics or recording contract.

Precision regressions also prohibit broad semantic ownership where distinct
authorities merely share a directory. They bind geospatial datum, environment,
terrain, source-admission, verification, installation, and scenario-spatial
paths to different headings; require the built-browser gate for every
browser-consumed geospatial/catalog producer; and keep offline source admission
out of that product claim. Generic database migrations prove platform
migration/provisioning mechanics only. Exact model-pack and saved-run schema,
migration, seed, verifier, and integration-test paths additionally select their
respective persistence contracts. Mission tests distinguish authored scenario,
information-state/replay, spatial, and orchestration facets. Generic-AAM
source/evaluator/workload changes select their isolated verification family,
while production engine and capacity changes select only engine/backend and
performance contracts. Negative assertions prove object-catalog facts cannot
acquire RASP ownership, catalog admission selects its model/database consumers,
and saved-run lifecycle admission cannot acquire VSR archive or replay sections.
The same matrix rejects a broad security-directory owner: exact saved-run,
basemap relay, browser-response, and delivery paths must resolve only to their
corresponding security-boundary heading, with declared multiownership for the
small shared public-admission helpers.
Replay/current-geometry selector code and its regression test belong to the
Observe family, while the renderless browser telemetry emitter belongs only to
operations observability; neither path may force capability-admission or VSR UI
documentation that it does not implement.
The anonymous comment route, schema/migration, live client, and mixed boundary
regression own the blog publishing Notes section and are explicitly excluded
from the Saved runs family.

`make integration-ci` uses the tracked managed-server runner. The runner writes
the built application output to `outputs/integration/application.log`, stops and
awaits the complete server process group after success, verifier failure, early
server exit, or cancellation, and returns the verifier status. CI retains that
directory on failure. The policy regression deliberately fails a verifier,
checks that the log remains readable, and binds the same port again to prove
cleanup. This process evidence is separate from the Browser Contract runner. CI
builds the application once, then `scripts/run-browser-contracts.mjs` executes
the five Playwright projects serially with a fresh managed Wrangler/Workerd
process group for each viewport. The policy is `RUN_ALL_PROJECTS_ONCE`: all 20
cases execute without retries even after one project fails, so later-viewport
evidence is not suppressed. An external `SIGINT` or `SIGTERM` is different: it
terminates the active server and test process groups, records the interruption,
does not start later projects, and exits nonzero. Any project, server,
interruption, cleanup, or evidence-retention failure makes the aggregate command
fail. A pass requires a nonempty managed-server log and parseable Playwright JSON
bound to the expected project, exactly four executed cases, and their successful
statuses. The four governed case identities are exact and distinct; global or
per-result errors cannot coexist with a passing status. Every governed project
entry must bind to the selected project's isolated output directory.
Browser-test failures require retained trace, screenshot, and video
attachments. Early-server/interruption and Playwright harness-startup failures
are separate closed evidence variants because browser artifacts cannot exist
before a browser test begins. Per-project evidence is retained below
`outputs/playwright/`; the deterministic aggregate is
`browser-contract-summary.json`.

This isolation boundary responds to two hosted, cross-branch late-suite
failures in which Wrangler 4.123/Miniflare reported `ProxyController: Network
connection lost` and the listener then refused requests. Exact-head reruns and
three matched local runs per branch passed, so no deterministic application-
bundle defect was claimed. Matched local server groups peaked at approximately
1.23–1.34 GiB RSS. Issue #63 owns the remaining soak, hosted-runtime diagnosis,
and broader harness acceptance; this slice limits one server group to one
viewport project and preserves evidence when the nondeterministic failure
recurs.

The later exact-head diagnosis matched Cloudflare workers-sdk issue `#14926`:
Wrangler `4.114.0` and newer can treat a ProxyWorker-to-UserWorker keep-alive
race as a fatal network loss. Upstream pull request `#15252` is still unreleased.
VECTOR therefore uses the complete last-known-good compatible set declared in
`governance/browser-toolchain-compatibility.v1.json`: Vite adapter `1.46.0`,
Wrangler `4.113.0`, and Workers types `5.20260721.1`. This is a temporary release-
infrastructure pin, not an application workaround. The five governed projects,
one worker, zero retries, evidence checks, process-group cleanup, and failure
classification remain unchanged. The pin cannot be removed until a released
upstream fix passes the record's hosted and local revalidation requirements.
Miniflare's transitive Undici `7.28.0` is overridden to patched `7.29.0`; the
browser matrix and clean-clone gates validate that security override with the
pinned runtime set.

## Framework decision

Node's built-in test runner and Cargo remain the domain and engine runners.
Vitest with React Testing Library and user-event owns component interactions.
`@playwright/test` owns built-application browser journeys, traces, screenshots,
retries and the required 390×844, 768×1024, 1366×768, 1440×900 and 1920×1080
projects. `playwright-core` remains only for the existing specialized responsive
inspection scripts and is not a test runner.

- `npm run test:component` runs component contracts.
- `npm run test:browser` builds and starts the application when `VECTOR_URL` is
  absent, or tests the supplied built application when it is present.
- `npm run test:browser:ci` builds once and gives each governed Playwright
  project its own Wrangler/Workerd lifecycle. It is the Browser Contract CI
  command and deliberately forces one worker and zero retries.
- `make browser-local` runs component tests and the isolated CI browser runner.
- The change classifier selects the Browser Contract job for app, component,
  scenario-admission, capability and runner changes. The Required PR Gate fails
  when that selected job does not pass.

The first suites prove deployment-disabled scenario presentation and direct-link
admission with semantic assertions. #62 remains open for canonical playback
selectors, real Worker author/run/scrub journeys, accessibility, visual baselines
and performance budgets.

`lib/frontend/selectors.ts` is the first canonical selector boundary. Telemetry
uses its selected recorded frame and model time for both the marker and current
values. An entity that is absent or stowed produces a series gap and `N/A`, not
an invented zero. Map, 3D, timeline, report and the remaining telemetry selectors
still require migration before #62 can close.

## Release evidence

The release steward requires passing unit, contract, parity, migration, API, frontend, browser, visual, security, performance, observability, cancellation, recovery, load and soak evidence for the applicable release scope. Targets in [`performance-capacity.md`](performance-capacity.md) remain targets until a reproducible benchmark record marks them measured.

Release evidence must also include the exact contract-documentation declaration,
base/head/merge-base identities, affected family inventory, and the Stage 0.6
verdict. A passing policy job does not substitute for that independent result;
failure, cancellation, skip, missing PR association, or stale section evidence
must remain visible to the Required PR Gate.
