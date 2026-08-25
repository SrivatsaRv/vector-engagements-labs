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

Regional environment changes run the offline source/digest verifier in
`ci-local`; release evidence additionally includes the built Worker
cancel/retry gate and the bounded environment throughput/memory benchmark.
`performance-local` runs the isolated generic-AAM verifier first so its closed
named-hardware profile is measured before unrelated capacity workloads can
consume the host. The gate rejects a dirty or unidentified repository before
measurement and rejects every backend batch whose governed frame count or
semantic outcome differs; only an uncontaminated clean-commit run is
publication evidence.

The value-free TP-1538 tooling child adds its generated Rust-schema freshness,
Rust formatting/clippy/test/rustdoc and embedded-WASM freshness checks to the
same `ci-local` sequence. The production audit and ordinary application build
must remain free of its verification-only subject, corpus and evaluator
markers. Real transcript, comparison, adjudication and corpus artifacts are
not CI fixtures for this tooling child.

`ci.yml` is one change-aware pull-request and `main` pipeline. Stage 0 computes
the rename/copy-aware change set from the exact merge base and head revisions with the tracked
classifier and always runs repository-policy regression tests. Independent
quality, JavaScript supply-chain/CodeQL, web-contract, Rust/WASM/parity,
RustSec, PostGIS/API, and container-rebuild jobs then run in parallel only when
their owned paths or an unclassified path changed. Workflow and Dependabot
changes deliberately fail closed through every gate. Stage 4 retains the one
stable branch-protection context and fails unless every selected job passed;
jobs skipped by the classifier are not treated as missing evidence.

Stage 0.6 separately enforces the versioned
`vector.contract-doc-ownership.v1` policy. Every tracked path is either owned by
a contract family or belongs to one closed, exact non-contract class; there is
no blanket documentation or product-runtime escape hatch. Each governed
change supplies exactly one bounded `vector.contract-doc-impact-declaration.v1`
block naming every affected family and its exact stable Markdown section IDs.
New issue-owned contract families are registered in the introducing semantic
revision with exact executable, test, maintained-document and changelog paths;
the policy regression suite proves their paths have one owner and that every
changelog-owning family retains a distinct heading without a fixed family-count
ceiling.
Rules carry a closed semantic-facet inventory (`schema`, `unit`, `datum`,
`evidence`, `admission`, `validity`, `digest`, `runtime`, `vsr`, `ui`,
`storage`, `delivery`, and `verification`), so only the sections and
migration/changelog records owned by the affected facets are required. The
required inventory is the union of sections selected by executable/test facets
and every independently changed owning section. Migration/changelog sections
are tracked separately, so they cannot broaden owning-document requirements and
an executable or test change cannot mask a second changed contract section. The
validator proves every registered document is a regular Git blob with exactly
one registered heading, reads section bodies at the merge base and head,
retains both endpoints of rename/copy records with `--find-copies-harder`, and
rejects invalid UTF-8, control-bearing paths, whitespace-only changes, and
unrelated-section churn. For policy changes it
audits old endpoints under the base policy and new endpoints under the head
policy; existing ownership cannot be erased by the policy being reviewed. The
head policy may introduce a new family or add an owning or migration section to
an existing family only when that exact document changes in the same revision.
The exact heading must be absent from the merge-base document, exist
exactly once as a regular tracked blob at head, contain material contract
content visible after Markdown rendering, and appear in the diff-derived
declaration under `SEMANTIC`. HTML comments, raw empty tags, and empty heading
hierarchies do not count as contract content. The validator uses the pinned
Markdown lexer and renderer, rejects the whole candidate section from
establishing authority when any raw-HTML token appears anywhere, excludes
headings and definitions, extracts decoded DOM text, ignores Unicode separator,
control, and formatting code points, and requires a rendered letter or number.
Reference definitions, empty links, whitespace-only entities, hidden/style/
title/dialog HTML, cross-block HTML containers or stylesheets, and HTML-wrapped
placeholder text therefore do not create contract authority, while visible
Markdown prose, code, lists, and autolinks remain admissible. `marked` is a
direct locked development dependency. Stage 0.6 installs the exact lockfile
with lifecycle scripts disabled before executing the parser-backed validator.
The classifier and the documentation verifier share one dependency-free
name-status parser; the trusted classifier adapter materializes and hashes that
parser beside the classifier, so Stage 0, Stage 0.5, and isolated probes require
no package installation.
The immutable V1 classifier probe remains executable compatibility authority as
well as historical ledger evidence; the classifier therefore owns the one
dependency-free parser implementation without importing the narrow helper. V2
is the current probe and additionally binds the helper that re-exports that
same parser authority. Both unchanged self-comparisons must pass. A new
registration cannot relabel an unchanged pre-existing heading or use
`DOCS_ALREADY_CURRENT`, `TEST_ONLY`, `GENERATED_ARTIFACT_ONLY`,
`INTERNAL_REFACTOR`, or `NO_SEMANTIC_CHANGE` in its introducing revision.
Existing registered sections remain governed solely by the merge-base policy
and retain the normal material-change and anti-weakening rules. The initial
#162 landing is the only explicit bootstrap and is bound to exact base
`661d280699f260e32c53d6a1b0a6f5cf3415dde7`; both the integration tip and the
merge base must lack the policy. A stale branch whose integration tip already
has the policy must rebase. Later missing, malformed, weakened, unclassified,
or unmapped policy state fails closed.

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

The historical F-16 external-store source gate runs its evidence generator,
committed quarantine inventory, source-terms/release-owner verification,
production-isolation scan, and hostile regressions under the shared deny-all
network preload. Every required package, local CI, clean-clone, and hosted
quality/web-contract/integration invocation supplies the exact committed source directory
and reproduces all 16 pages with the pinned Poppler and Sharp versions; the CLI
has no source-omission success path. The normal quality gate does not fetch
mutable NTRS or policy URLs. Local Worker and
hosted integration builds rerun the same production-isolation check after the
built output exists; an absent build directory is not accepted as that final
evidence.

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

Pull requests obtain the declaration from the single structured template block.
`npm run --silent policy:contract-docs:template` derives the exact affected
family, owning-section, and migration-section inventory from the current
base/head diff; it does not emit an arbitrary first-family example. The hosted
job copies the exact validated declaration, including rationale and evidence,
into its visible GitHub step summary so the HTML-comment transport does not
hide the review record from reviewers or assistive-reading flows.
An edited body reruns CI. A `main` push resolves exactly one associated merged
pull request through the read-only GitHub API and binds its merge commit, base
commit, source-head identity, target branch, and declaration to the push;
zero, multiple, stale, or revision-mismatched associations fail. Local verification uses the same core and
an explicit `VECTOR_CONTRACT_DOC_DECLARATION_FILE` or
`VECTOR_CONTRACT_DOC_DECLARATION_JSON`. A dirty checkout is evaluated through a
temporary Git index/tree/commit without changing the developer's branch or
index. Missing local input is accepted only when the exact diff has no governed
families. The Stage 4 gate requires the independent documentation-impact job to
finish successfully with `VERIFIED` or `NO_RELEVANT_CHANGES`; cancelled,
skipped, malformed, or unavailable evidence cannot be aggregated as success.

This mechanism binds paths, identities, registered evidence, and owned section
changes. It does not certify that prose is technically adequate and cannot
replace CODEOWNER or human review of a policy that modifies its own verifier.
Generated-only exemptions invoke the policy's closed direct argv (`node` or the
job-provisioned Rust/WASM toolchain), never a declaration-provided or mutable
package script alias. Stage 0.6 checks out the exact pull-request head and
provisions each registered generated group's closed toolchain before executing
the same validator used locally and on push. Freshness runs in a temporary
archive of the exact head commit, with secrets and tool overrides absent, and
rejects any mutation of tracked head content. Refactor and no-semantic-change
declarations contain only versioned probe IDs. The merge-base policy—not the
pull request—owns each adapter path, exact adapter digest, family, disposition,
path coverage, and assertion inventory. The validator executes the immutable
base adapter twice in a scrubbed, bounded child process. That trusted adapter
materializes each exact Git blob and executes candidate decision code only in a
second child process; the adapter parent computes all source, comparison, and
evidence digests without importing candidate code. It accepts only an exact,
deterministic result whose base/head identity digests are equal. A probe
introduced by a pull request cannot authorize that pull request, probes are
unavailable during bootstrap, a head-added generated group cannot self-exempt,
and declaration-authored commands, hashes, or
prose never become exemption authority. `DOCS_ALREADY_CURRENT` separately
binds every applicable owning and migration/changelog section to the same exact
earlier ancestor and content digest.

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

Air mission ground-start authoring consumes the exact sourced runway geometry
from the immutable EnvironmentPack. `STUB-24` remains a release-blocking
explicit assumption owned by #60/#64 only for the content-addressed
`vector.compiled-aircraft-ground-envelope.v1` resolved from the model pack.
Scenario-authored minima, surface/tailwind values, or self-labelled evidence
states are rejected; no installation or production claim may treat the ground
performance envelope as validated platform data.

`STUB-25` separately owns #61's visible runway/DEM elevation reconciliation.
The regional pack uses the higher surface plus 0.01 m only inside its declared
30 m disagreement envelope and rejects larger conflicts. It remains
release-blocking until datum-compatible, cell-specific runway elevation
evidence replaces that bounded public-educational assumption; it does not
broaden `STUB-24` or turn the ground-performance envelope into sourced data.

Browser/responsive checks and performance benchmarks are deliberately not run
on GitHub-hosted pull-request runners. They remain explicit maintainer checks
through `make integration-local` and `make performance-local`, where the
browser, GPU/software renderer, display dimensions, and machine class are
controlled and the evidence is interpretable. The scheduled `codeql.yml`
workflow retains weekly security analysis without creating a second PR run.

Rust sources carry a deterministic source digest; the embedded module carries
its own byte digest and required-export check; CI also compiles the module
afresh on its runner. This avoids incorrectly requiring different compiler
platforms to emit byte-identical WASM. Actions are pinned to immutable commit
SHAs.

Pull requests receive CodeQL and dependency review inside the causal `ci.yml`
pipeline. `codeql.yml` is reserved for the weekly scheduled scan and explicit
maintainer dispatches. Dependabot permits one open maintenance pull request per
ecosystem, groups routine npm, Cargo, and Actions updates, and excludes major
versions so they require an intentional maintainer proposal.

The commit gate rejects high-severity production dependency advisories. Cargo
manifest changes and releases also audit `engine-rust/Cargo.lock` with the
pinned `cargo-audit` version and current RustSec advisory database. The
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
the `VECTOR_IMAGE` digest consumed by Compose; they never rebuild or retag the
artifact. Tag pushes alone cannot execute release code. The `release`
environment accepts protected branches and requires an explicit maintainer
approval before publication. Docker Hub is not configured.

Cloudflare delivery is deliberately manual and protected by the GitHub
`production` environment. Both verification and deployment require a full
40-character commit SHA from `main` with a successful Required PR Gate before
any production credential is exposed. Verification checks source, Hyperdrive,
and the production catalog read-only. Deployment alone applies forward-only
migrations, deploys the admitted revision, and verifies production health. It
never seeds production implicitly. The environment accepts protected branches
and requires an explicit maintainer approval before credentials are released.
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
