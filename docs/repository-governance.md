# Repository governance and delivery

## Status

The repository is public, Apache-2.0 licensed, and currently **pre-alpha research software**. `main` is the integration branch. It should always be buildable, but results and schemas may change before `v1.0.0` when changes are documented and versioned.

## Protected delivery path

All contributor work enters through a pull request. The `main` branch requires:

- an up-to-date branch;
- resolution of review conversations;
- passing the staged Required PR Gate, which always verifies repository policy
  and requires every quality, security, test, integration, or container gate
  selected from the changed contracts;
- linear history;
- no force pushes and no branch deletion.

GitHub does not permit an author to approve their own pull request. During the
solo-maintainer phase, the required approving-review count is therefore zero.
The maintainer can merge an authored pull request only after every required
check passes and every review conversation is resolved. `CODEOWNERS` still
routes sensitive changes for review, and external contributors cannot merge
their own work. When a second trusted maintainer is onboarded, the repository
will restore one required approval and required CODEOWNER review.

Repository administrators retain emergency recovery authority but should not use it to bypass ordinary checks. Security fixes follow `SECURITY.md`.

## Continuous integration

All Rust jobs install repository-owned Rust 1.97.1 rather than a floating
channel. The hosted Rust/WASM job removes cached outputs for the production
engine and both verification crates, then reconstructs and byte-verifies every
committed WASM artifact. A compiler update therefore requires an explicit,
reviewed artifact transition and cannot first appear in production delivery.
The production-engine builder discards ambient Cargo, compiler, wrapper,
target, profile and Rust-flag overrides and writes to its repository-owned
target directory. Its check compares the complete fresh optimized bytes and
canonical generated source with the committed module. Export-name and
self-hash checks alone are not freshness evidence.
The two verification artifacts additionally have one governed build target:
Linux/amd64. Their builders replace workspace, Cargo-home and Rustup-home paths,
discard ambient Rust flags, and use digest-pinned `rust@sha256:0e2bcaef…` on
other developer hosts. This prevents host linker layout or registry paths from
creating a locally green artifact that differs in deployment.

Node 22.18.0 and npm 10.9.3 are exact repository authorities, recorded in
`.node-version` and `package.json`. `make ci-local` checks Node, npm, Rust and
the WASM target before starting expensive work. PDF rendering is not a product
build prerequisite. The pinned Poppler 26.05.0 image runs only in the selected
source-evidence reproduction job or the explicit `source-evidence-local` target.

Cloudflare delivery has one checked-in static `wrangler.jsonc` authority plus a
Vite overlay for environment-derived bindings. Pull-request and local gates
exercise the no-upload packaging contract. After a green `main` run, CI builds
the Worker once with non-secret fixture bindings, verifies the generated output,
normalizes environment-owned values, inventories every byte, and uploads that
exact candidate. Production downloads and verifies the candidate, applies the
real binding overlay, and asks Wrangler to deploy with `--no-bundle`. It does
not install application dependencies, rebuild Vinext, run Rust, render PDFs, or
repeat `make ci-local`.
The deploy lifecycle also prepares and byte-checks MapLibre's ignored public
worker assets before Vinext's internal build, matching the existing application
build prerequisite on a clean runner.

Issue #207 extends the governed contract inventory for the run-information
projection and the current Worker evidence directory. CI treats the new
frontend projector, notice, unit/component regressions, migration 019 and
`fixtures/vector-record/issue-207/` as owned contract artifacts; the prior #197
evidence remains mapped and immutable.

#197 registers its exact three-scenario geometry oracle, causal/runtime tests,
forward migration generator, scenario-package reference and canonical report
debrief under the existing mission-scenario and VSR owners. These paths select
their admission, datum, digest, schema, storage, unit, runtime and verification
facets; authored tactic labels remain non-causal presentation metadata and do
not create a new pilot-policy contract family.

#196 registers `GENERIC_TARGET_EFFECT` as a distinct simulation-systems
contract family with exact authority, evaluator, presentation, VSR fixture,
parity and performance paths. Its declaration must accompany the pre-existing
engine, physics, model-pack, mission, VSR and UI owners selected by shared-file
changes; the new family cannot be hidden inside one of those broader contracts.

#193 registers the raw numeric authoring component and the legacy Scenario
control-authority inventory as exact UI-authoring and mission-contract paths.
Their focused parser/matrix and component regressions are part of `ci-local`;
new contract-looking controls or tests must retain focused regression coverage.
The #28 gate verifies the forward-only weapon-termination migration, the
between-step closest-approach oracle, model-pack admission, TypeScript/Rust
event parity and the production Worker/VSR result.

#182 adds the generic ground-dynamics migration generator and its schema,
digest, storage, and forward-migration regressions.

#187 registers its composed takeoff-plus-transfer workload, benchmark and
focused regression as exact engine-verification paths. The existing #182
takeoff fixture/benchmark remain unchanged; `performance-local` runs the
separate 3-warmup/20-sample transfer process and retains the maximum beside p95.

Regional environment changes run the offline source/digest verifier in
`ci-local`; release evidence additionally includes the built Worker
cancel/retry gate and the bounded environment throughput/memory benchmark.
`performance-local` runs the isolated generic-AAM verifier first so its closed
named-hardware profile is measured before unrelated capacity workloads can
consume the host. The gate rejects a dirty or unidentified repository before
measurement and rejects every backend batch whose governed frame count or
semantic outcome differs; only an uncontaminated clean-commit run is
publication evidence. It then runs the generic takeoff benchmark in its own
process with explicit warmups and 20 retained samples per backend; the parallel
unit-test process validates the profile but is never timing authority.

The TP-1538 family adds generated Rust-schema and 4,096-operation workload
freshness, Rust formatting/clippy/test/rustdoc, embedded-WASM freshness, and
real-corpus page-oracle/parity/Worker/readback checks to the same `ci-local`
sequence. The corpus and workload paths select quality, web-contract and Rust
verification, while verifier source paths select their Rust owner. The
production audit and ordinary application build must remain free of this
verification-only subject, corpus and evaluator authority.

The same family owns the offline adjudication manager and its focused hostile
test as exact governed paths. `ci-quality` runs
`tp1538:aero:adjudication:verify`, which uses only bounded
`TEST_ONLY_SYNTHETIC` mismatches to prove comparison admission, exact decision
coverage, immutable freeze/readback, finalizer consumption, and corpus replay
of the frozen adjudication content digest plus comparison raw/canonical
binding. `make tp1538-aero-local` separately verifies the admitted real corpus
and deterministic workload; `npm run tp1538:aero:benchmark` additionally
requires an exact clean commit and records admission, TypeScript, Rust/WASM,
Worker, RSS, output and module-size evidence against predeclared limits. The family also
owns its distinct TP-1538 changelog heading; adding those rules is a semantic
ownership-policy change and does not grant the verification corpus production
or named-aircraft authority.

`ci.yml` is one change-aware pull-request and `main` pipeline. Stage 0 computes
the rename/copy-aware change set from the exact merge base and head revisions with the tracked
classifier and always runs repository-policy regression tests. Independent
quality, JavaScript supply-chain/CodeQL, web-contract, Rust/WASM/parity,
RustSec, PostGIS/API, and container-rebuild jobs then run in parallel only when
their owned paths or an unclassified path changed. Workflow and Dependabot
changes deliberately fail closed through every gate. Stage 4 retains the one
stable branch-protection context and fails unless every selected job passed;
jobs skipped by the classifier are not treated as missing evidence.

The former Stage 0.6 contract-document declaration gate is not part of local,
pull-request, `main`, release, or deployment admission. Documentation remains a
normal reviewed change. The ownership inventory and template command remain
available as advisory maintenance tools, but their declaration is never a
required check and is not consumed by the Required PR Gate.

The `UI_RESPONSIVE_INTERACTION` family owns the shared overlay implementation,
its focused component regressions, and the dedicated responsive overlay
contract section. Adding those exact paths and section is a semantic policy
change; later edits must update the same owned documentation and evidence.

Offline verification-source families register raw and rendered artifacts as
generator inputs, derived manifests and inspection records as exact generated
outputs, and the offline verifier as their freshness authority. This keeps a
source freeze bound to its catalog, model-pack, physics, information-state,
security, testing, and family-specific changelog sections without granting the
source bundle production-runtime ownership.

The generic mission-policy source family is deliberately external-byte-only.
`ci-quality` runs its canonical governance, hostile-tamper and production
isolation gate under the deny-all network guard, and `worker-local` repeats it
after production bundles exist. Exact source reproduction is a separate
completion gate requiring `VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR`; absence
of that directory fails rather than skips. The external gate is recorded in PR
evidence but its AIAA/FAA PDFs, metadata and renders are never uploaded to Git
or hosted CI. The family owns the civil-context/nonpromotion sections in the
catalog, model-pack, physics, mission-authority and testing contracts.
Its committed isolation record is a content-addressed policy template, not a
reusable PASS assertion. Runtime PASS output binds exact candidate/runtime Git
heads, every attested policy/verifier/input byte, and the scanned production
tree. Whole-file hashes and SHA-256-confirmed raw/base64 rolling fingerprints
deny all governed source, metadata, render and contact-sheet identities even
when their text markers are absent.

Post-bootstrap contract additions use that same revision-bound mechanism when
they extend an existing family. The `MODEL_PACK_COMPILER_RESOLVER` family owns
the registered authority, schema/migration, requirement/evidence, procedure,
anonymous-proof, storage/recovery, and nonclaim sections in
`aircraft-model-pack-onboarding.md`. Its introducing revision changes that exact
document and declares those sections `SEMANTIC`; the guide does not create a
parallel aircraft schema or inherit authority from an unchanged heading.
Its existing `COMPILED_MODEL_PACK_FIXTURES` generated group remains the single
prefix owner for model-pack fixtures and retains the original freshness command.
That command now verifies both the legacy v1 fixture and the two v2 anonymous
research archives through registered generator and input rules, so one clean
archive check detects drift across the whole model-pack fixture family.

The historical F-16 external-store source gate runs byte, quarantine,
source-terms, release-owner, production-isolation, and hostile regressions under
the shared deny-all network preload. Routine gates do not render its PDFs. The
selected source-evidence job alone reproduces the 16 review pages with pinned
Poppler and Sharp versions. No gate fetches mutable NTRS or policy URLs.

Governed `EXACT` implementation, test, or generated rules may leave the active
inventory only through an append-only `ruleRetirements` tombstone. The
tombstone binds the exact merge-base commit, canonical base-policy digest,
family, rule inventory, facets, and Git delete or rename operation. A deletion
has no replacement; a rename must add an active exact rule for the new endpoint
under the same family, generated group where applicable, inventory, and facets.
Prefix rules, families, sections, generated groups, toolchains, commands, and
workstreams cannot use this mechanism. Tombstones never classify current paths,
cannot be edited or removed, and are unavailable during the one-time bootstrap.

The `SCENARIO_COMPOSITION_KERNEL` family
therefore registers each kernel, capability-registry, typed-history,
request-guard, downstream-adapter, focused-test and benchmark path explicitly;
adding a nearby `lib/`, `tests/` or `scripts/` file does not inherit ownership.
Every active implementation, test, input, output, and generator rule must still
match a tracked head path; a tombstone never excuses an active rule in the same
or another inventory. Historical multi-family and probe entries may remain
inert only when they already existed in the base policy and the same old
endpoint has a validated tombstone. Newly added inert ledger or probe entries
reject. Historical rename destinations need not remain tracked forever: a later
delete or rename is governed by its own new tombstone, preserving the full
append-only chain without preventing lifecycle evolution.
Retiring a generated output is always semantic documentation work and cannot
claim `GENERATED_ARTIFACT_ONLY`, `INTERNAL_REFACTOR`, `NO_SEMANTIC_CHANGE`, or
another exemption; freshness and probes govern ordinary changes, not removal
of the output contract itself.

The classifier and Required PR Gate expose complete, versioned decision
inventories that their production implementations consume. The classifier
compiles every matcher and applies every gate effect only from its deep-frozen
inventory; no parallel mutable rule arrays exist. Their probes bind
those inventories, the classifier's complete module-source identity, and the
exact decision-function identities in addition to
evaluating the union of base/head tracked paths, registered boundary sentinels,
add/modify/delete/rename/copy parser classes, every mandatory field, every
selected/unselected gate, and the closed terminal-result classes. Adding an
unsampled namespace, review kind, state, gate, or hard-coded decision changes
the identity and cannot use a non-semantic exemption. These probes protect
their declared decision contracts; they do not replace architectural review of
technical adequacy.

Classifier and Required PR Gate module identities are computed from exact Git
blobs before their temporary modules are written or executed. Candidate modules
run in observation children and return unhashed observations; only the trusted
adapter parent computes decision and evidence hashes. The parent checks each
materialized module before execution and again after all decision/parser cases,
so candidate code cannot replace its source or the adapter's hashing authority.

Documentation, project-skill, and governance-only changes run the classifier,
policy suite, and final gate without rebuilding the application, Rust engine,
container, or PostGIS. Blog content and thumbnails build and test the rendered
web product but do not invoke Rust or PostGIS. Frontend code adds lint,
typecheck, CodeQL, and web contracts. Runtime, engine, and environment-Worker
changes also select the browser-contract job: it builds the production Worker,
executes component and viewport contracts, then verifies an actual browser
Worker load/run/cancel/recycle exchange against the built assets. Rust and
shared engine contracts add Rust/WASM/parity checks; Cargo manifest changes
also run the pinned RustSec audit. Database, migration, and API changes add
PostGIS integration. Container,
Compose, runtime-binding, dependency, and workflow changes add an image rebuild
and the integration gates. Unknown paths run everything until ownership is
declared in `scripts/classify-ci-changes.mjs`.

Protected production promotion selects the successful `main` CI run for the
admitted SHA and downloads its one unexpired, SHA-named Worker candidate. A
later `main` advance cannot substitute different application bytes.

Tracked record, mission/spatial-admission, frontend-selector, runtime-security,
compiled-model, governed-environment-source, Worker, and VSR paths have explicit
classifier ownership. A path alias for a file that does not exist is not gate
coverage. Policy regressions use the repository's real paths and verify that
every classifier output is represented by the Required PR Gate.

Worker ownership is deliberately split by runtime. `lib/runtime/simulation.worker.ts`
and its protocol/build/verifier paths belong to the browser simulation-Worker
contract; `worker/index.ts` is the Cloudflare application Worker and belongs to
security/delivery integration. The generic managed-server harness and Node
runtime/admin bundler belong to delivery governance, not the simulation-Worker
protocol. Shared canonical JSON changes select the
model-pack, Rust/parity, built-browser Worker, and persistence consumers because
they can change compiled-pack and VSR identities. Generic-AAM verifier sources,
unit/datum adapters, the generated verifier module, and its direct generator are
one governed Rust/WASM verification group. The runtime deployment-capability
validator is jointly owned by the capability descriptor and Worker contracts.
Public-aircraft fixtures, evaluators, and verifier commands require their
numerical-verification section as well as evidence/admission documentation.
Database seeds and evidence/catalog upgrade verifiers always select the
database/API integration gate. Model-pack compilation, digest, admission, and
runtime binding are all explicit facets of the model-pack implementation—not
schema-only. Evidence-registry revisions select evidence, admission, subject
validity, and change-procedure documentation. VSR digest and event authorities
are jointly owned with their engine/Worker producers and select replay,
integration, parity, and built-browser consumers. Finally, executable
TypeScript/Rust atmosphere, primitives, dynamics, tracking, and weapon-admission
producers belong to a dedicated physics-runtime family whose owning contract is
the integrated physics model rather than the backend-selection document.

Phase-one ownership is intentionally precise rather than prefix-shaped.
Geospatial transforms, vertical datums, environment-pack schemas, terrain/LOS,
source admission, installation coverage, and scenario-spatial authoring each
select only their exact contract sections; browser-consumed geospatial and
object-catalog authorities additionally select the built-browser gate. Mission
ownership separately maps information-state/replay, scenario admission,
authoring, spatial transforms, and simulation orchestration instead of treating
all mission files as one semantic surface. The Air mission schema/compiler and
its regression suite are exact-path members of that existing family; downstream
capability work consumes the exported `AirMissionDefinition` and
`CompiledAirMission` boundary through the identity-only
`bindAirMissionToScenarioKernel` adapter rather than registering a parallel
mission authority. Generic database mechanics own
migration/backup, provisioning, and database-test documentation, while only
the exact model-pack and saved-run tables, migrations, seed/verifier paths, and
Drizzle representations jointly own their model-pack or VSR persistence
contracts. The verification-only generic-AAM corpus, private Rust evaluator,
generated module, workload, oracles, and performance evidence form a dedicated
family; unrelated production-engine or capacity changes cannot force changes
to its source-evidence contract. Source-backed object-catalog facts own the
fixed-fixture documentation, while catalog credibility admission and its API
projection jointly own model-pack identity, digest, persistence, and geospatial
installation coverage. Saved-run quota and lifecycle admission select only the
Saved runs boundary; they do not claim VSR archive, replay, or digest authority.
Security ownership is exact-path rather than `lib/security/**`: saved-run and
public-admission code owns Saved runs, basemap relay code owns Catalog and
basemap relay, response-header code owns Browser response baseline, and release
scripts/governance own Delivery trust. A shared admission helper may be
explicitly multi-owned, but a saved-run edit cannot force unrelated basemap,
response-header, or delivery documentation.
Anonymous blog-comment routes, persistence schema/migration, and live client
instead own the blog publishing Notes section; they do not acquire saved-run
semantics merely because both use bounded public-API helpers.
Observe replay selectors and their direct regression test share one UI Observe
owner. The renderless browser telemetry emitter is operations-observability
only, so neither test-only nor instrumentation-only changes create unrelated
capability or VSR documentation churn.
`db/schema.ts` is a stable aggregate export only. Domain-owned table
definitions live under `db/schema/`, so a comments-table change cannot select
model-pack, VSR, catalog, or saved-run contracts. Every module still belongs to
the generic database family and is loaded through the one aggregate Drizzle
schema; these are ownership boundaries, not parallel schemas. Likewise, each
changelog-owning family has one distinct heading below `CHANGELOG.md` /
`Unreleased`, so one contract's release note cannot select unrelated families.

`make clean-clone-local` forwards the same explicit declaration input and proves the documented release context slice resolves
from a new clone, installs the locked dependencies, then runs the deterministic
baseline and `worker-local`. It therefore verifies the production-built Worker
without relying on stale assets in the source checkout.

The live application inside `make integration-ci` is owned by
`scripts/run-managed-server.mjs`. It retains server output under
`outputs/integration/`, terminates and awaits the server process group on every
exit path, and propagates verifier failure. The integration workflow uploads
that directory on failure. The Browser Contract job reuses the same process-
group boundary through `scripts/run-browser-contracts.mjs`, but starts a new
Wrangler/Workerd group for each fixed Playwright project. The exported runner
accepts only the exact ordered five-project inventory—subsets, reordering,
duplicates, unknown names, and path-like names fail before filesystem work. It
runs those five projects exactly once, aggregates their statuses deterministically, and retains
server logs plus Playwright JSON, trace, screenshot, and video evidence below
`outputs/playwright/`. Empty or malformed evidence cannot produce a passing
summary. Server logs, JSON reports, summaries, and artifact paths must resolve
to single-link regular files inside their exact governed output directory. The
output, server, reports, artifact-root, and project directories are
identity-checked real directories before and after evidence inspection and
summary persistence. Replacing any governed directory or evidence file with a
symbolic or hard link fails evidence admission and does not modify or delete the
external target. Summary updates use a no-follow temporary file, atomic rename,
and canonical readback. Browser-test failure,
harness-startup failure, early-server exit, and
external interruption have explicit evidence states. The managed boundary
always terminates the detached task process group, including descendants that
outlive a successfully exited task leader, before returning. Interruption state
is preserved whether the signal arrives before readiness, during a browser
case, or while cleanup reports another error; later projects are not started.
Direct
`npm run test:browser` remains available for a caller-owned `VECTOR_URL`; only
CI and `make browser-local` select the isolated runner.

The gate implementation is a tracked, unit-tested script rather than inline
workflow shell. It accepts only explicit `true` or `false` selections, requires
success for every selected job, requires `skipped` for every unselected job,
and rejects missing, cancelled, timed-out or action-required results. Shared
mission, scenario, environment, model, Worker and recording contracts select
their TypeScript/Rust parity and integration consumers.

### Parent-issue closure governance

A merged bounded pull request proves only its stated slice. It does not close a
governed parent capability issue. Feature slices must use `Refs #NN`, state the
acceptance criteria still unmet, and state the closure verdict `parent remains
open`. They must not use `Fixes`, `Closes`, or `Resolves` for governed parent
issues.

The tracked
[`governance/issue-closure-governance.v1.json`](../governance/issue-closure-governance.v1.json)
lists governed parent issues, their acceptance-criterion IDs and required test
layers. CI reads the pull-request event and classifies it as `slice`,
`completion-review`, or `not-applicable` for a non-PR build. The Required PR
Gate receives that classification; a green build therefore proves the selected
slice, never automatic parent completion.

Only a dedicated completion-review PR may close a governed parent. It must have
the `completion-review` label, close exactly one governed parent, and include
this machine-readable checklist in its body:

```html
<!-- vector-completion-review
{
  "parentIssue": 64,
  "acceptanceCriteria": [
    { "id": "external-reference-case", "evidence": "link to independent evidence" }
  ],
  "testLayers": [
    { "name": "unit-numerical", "result": "passed", "evidence": "command and artifact" }
  ],
  "omittedLayers": []
}
-->
```

The actual checklist must include every acceptance ID and every required test
layer declared for that parent, each with non-empty evidence and `passed`
result. It cannot omit a required layer. The policy has regressions for partial
closures of #64 and #41 and for incomplete checklists. Add a parent to the
governed list before accepting its first feature slice; update its IDs only when
the owning issue acceptance criteria change.

The release gate also consumes
`governance/runtime-stub-ledger.v1.json`. The ledger records each known causal
stub, evidence path, owning issue, classification and required resolution.
`npm run policy:runtime-stubs:verify` fails when an indicator is added, removed,
renamed or suppressed without updating the ledger. Every current entry remains
release-blocking until its owning issue replaces the behavior or makes the
capability explicitly unavailable.

Policy controls are evidence, not a suppression switch. Each classified
production indicator must have one or more observed lines: zero-match
allowances are invalid. Allowances inherit accountable issue ownership from
their ledger entries. Exemptions are permitted only for non-causal code paths
and must state their rationale and the owning issue; #66 owns those policy
exceptions. A new fallback or model-assumption indicator without that evidence
fails the local and PR gate.

`STUB-28` inventories the generic target-effect threshold and target-profile
assumptions under #196/#28. Its runtime occurrences are allowances tied to
that release-blocking row; fail-closed validation comments and non-causal
display-label defaults are separately justified exemptions. This preserves a
machine-checked distinction between executable assumption data, explicit
rejection behavior and presentation resilience.

Air mission ground-start authoring consumes the exact sourced runway geometry
from the immutable EnvironmentPack. `STUB-24` remains a release-blocking
explicit assumption owned by #60/#64 only for the content-addressed
`vector.compiled-aircraft-ground-envelope.v2` and nested
`vector.compiled-aircraft-ground-dynamics.v1` resolved from the model pack.
Scenario-authored minima, surface/tailwind values, or self-labelled evidence
states are rejected; no installation or production claim may treat the ground
performance envelope as validated platform data.

`vector.aircraft-ground-operation.v2` now makes one generic educational
mechanism executable: valid readiness hold, force-driven runway roll, achieved
rotation/liftoff and bounded climbout with fuel/mass/store continuity. The
content-addressed inputs remain `MODEL_ASSUMPTION`, and direct TS/Rust authority
checks reject hidden fallback or compact-copy promotion. This does not retire
STUB-24 or satisfy #64's named takeoff/recovery evidence; taxi, braking,
landing, recovery and store release remain outside authority.

`STUB-25` separately owns #61's visible runway/DEM elevation reconciliation.
The regional pack uses the higher surface plus 0.01 m only inside its declared
30 m disagreement envelope and rejects larger conflicts. It remains
release-blocking until datum-compatible, cell-specific runway elevation
evidence replaces that bounded public-educational assumption; it does not
broaden `STUB-24` or turn the ground-performance envelope into sourced data.

The change-selected browser contract runs on GitHub-hosted pull-request runners
with pinned Chromium, five governed viewports, zero retries and retained
failure evidence. Hardware-sensitive visual and performance claims remain
explicit maintainer checks through `make integration-local` and
`make performance-local`, where the renderer, display dimensions and machine
class are controlled. The scheduled `codeql.yml` workflow retains weekly
security analysis without creating a second PR run.

Rust sources carry a deterministic source digest; the embedded module carries
its own byte digest and required-export check; CI also compiles the module
afresh and requires exact equality with the committed bytes. Developer-host
output is not release authority when its governed builder path differs.
Actions are pinned to immutable commit SHAs.

Pull requests receive CodeQL and dependency review inside the causal `ci.yml`
pipeline. `codeql.yml` is reserved for the weekly scheduled scan and explicit
maintainer dispatches. Dependabot permits one open maintenance pull request per
ecosystem, groups routine npm, Cargo, and Actions updates, and excludes major
versions so they require an intentional maintainer proposal.

The commit gate rejects high-severity production dependency advisories. Cargo
manifest changes and releases audit all three lockfiles through one Make-owned
target with the pinned `cargo-audit` version and current RustSec advisory
database. The
Cloudflare Vite adapter, Wrangler, and Workers type package are upgraded as one
tested compatibility set. They are temporarily frozen at adapter `1.46.0`,
Wrangler `4.113.0`, and Workers types `5.20260721.1` by
`governance/browser-toolchain-compatibility.v1.json`. Wrangler `4.114.0` and
newer reproduce an upstream ProxyWorker/Miniflare network-loss regression; the
upstream correction is not released as of 2026-08-24. Dependabot ignores only
this three-package set until the governed removal trigger is satisfied. Removal
requires a released version containing the upstream fix, three hosted exact-head
browser-contract repeats, process/port cleanup evidence, full local gates, and
independent review. Retries, viewport omission, ignored server exits, or weaker
evidence admission are prohibited substitutes. Remaining
npm audit findings are development-only advisories inherited through local
migration and Cloudflare tooling; they are not shipped in the Worker runtime
dependency surface and remain tracked for upstream removal. The last-known-good
Miniflare release requests Undici `7.28.0`; VECTOR overrides that transitive
development-server dependency to patched `7.29.0` and binds the override in the
same compatibility record. Production
dependencies currently audit cleanly.

## Continuous delivery

A maintainer dispatches the release workflow from `main` with an existing
semantic tag. The workflow verifies that the tag matches `package.json`,
resolves to reviewed `main` history, and already has a successful Required PR
Gate on that exact commit. It then reruns quality, unit, parity, production
dependency, RustSec, PostGIS migration, and application integration checks,
builds the production image for `linux/amd64` and `linux/arm64`, generates an
SPDX SBOM and SHA-256 manifest, and publishes the archive plus image through the
protected `release` environment. The image is written to GHCR with only the
exact SemVer and full commit-SHA tags, then attested and recorded by digest.
There is no moving `latest`, major, or minor tag. Promotion and rollback change
the `VECTOR_IMAGE` digest consumed by Compose; they do not retag the artifact.
The current publication job still rebuilds the image after verification, so it
does not yet prove build-once byte promotion. Issue #111 owns that remaining
release-plane correction. Tag pushes alone cannot execute release code. The `release`
environment accepts protected branches and requires an explicit maintainer
approval before publication. Docker Hub is not configured.

Cloudflare delivery is deliberately manual and protected by the GitHub
`production` environment. Both verification and deployment require a full
40-character commit SHA from `main`, one successful completed `main` CI run,
and its exact unexpired Worker candidate before any production credential is
exposed. Verification checks candidate bytes, Hyperdrive, and the
checksum-bound production migration prefix in a read-only transaction.
Deployment alone applies forward-only migrations, runs the full catalog
verifier in a repeatable-read, read-only transaction, deploys the already-built
candidate without bundling, records Wrangler's deployment output, and verifies
production health and critical static assets. Mutation probes remain confined
to disposable integration databases. It never seeds production implicitly.
The workflow requires two protected secrets and three non-secret environment
variables:

- `CLOUDFLARE_API_TOKEN` with least-privilege Worker deployment access;
- `DATABASE_ORIGIN_URL` as a protected environment secret for migrations and
  direct origin verification only.
- `CLOUDFLARE_ACCOUNT_ID` as a non-secret production environment variable;
- `CLOUDFLARE_HYPERDRIVE_ID` as a non-secret production environment variable
  for the PostgreSQL/PostGIS binding.
- `VECTOR_PRODUCTION_HOST` as the non-secret production custom domain.

No Cloudflare secret is stored in the repository. R2 is optional and should be introduced only with an explicit `ARTIFACTS` binding and object-custody contract.

## Version and tag policy

- Tags follow `vMAJOR.MINOR.PATCH` and Semantic Versioning.
- `0.x` releases may change unstable contracts but must document migration and compatibility impact.
- `1.x` begins only after scenario, engine, recording, and model-version contracts are declared stable.
- Numerical or coefficient changes that can alter an outcome must appear prominently in the changelog and release notes.
- Tags should be annotated and signed by a maintainer when local signing is configured.
- Published tags are immutable. Corrections receive a new patch release.
- Container promotion uses the published manifest digest; release tags are not
  repointed and mutable convenience tags are not created.

## Ownership and contributor safety

`CODEOWNERS` assigns default ownership across engine, database, workflow,
governance, and security surfaces. Contributors cannot merge directly to
`main`, bypass checks, or force-push protected history. The solo maintainer may
merge their own pull request after all mandatory checks and conversations pass;
GitHub self-approval is neither possible nor treated as evidence.
