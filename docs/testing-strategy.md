# Testing strategy

## Frozen TP-1538 evidence

`npm run tp1538:sources:verify` checks the immutable source and metadata hashes, exact 59-page mapping, exhaustive manifest descriptors, source-render and upright lossless-display hashes/dimensions/orientation lineage, rights/export fields, visual-QA inventory, path confinement, and verification-only production isolation. `npm run tp1538:sources:generate` is deliberately pinned to Poppler `pdftoppm` 26.05.0 and Sharp 0.35.0; repeated generation must be byte-identical before any regenerated artifact is admitted.

The verifier is offline and cannot fetch replacement evidence. Numeric transcription, interpolation, and runtime tests belong to later #142 children and must not be credited to #143.

Testing is part of the implementation contract. An executable action is incomplete until its behavior is covered at the appropriate test layers and the result is recorded. The project uses focused tests for fast feedback and staged integration evidence for release confidence.

## Required layers

- **Unit:** pure math, coordinate transforms, parsers, reducers, validators, compilers, and state machines.
- **Contract and regression:** schemas, canonical hashes, lifecycle transitions, backend boundaries, saved records, error cases, and every bug fix.
- **Engine:** Rust unit/integration tests, TypeScript reference tests, strict lint/Clippy/rustdoc, and deterministic parity fixtures.
- **Database and API integration:** empty-database migration, upgrade migration, deterministic seed/verifier, route admission, persistence, report replay, and failure paths.
- **Frontend:** component and interaction tests for builder, maps, playback, reports, keyboard/touch behavior, loading, cancellation and errors.
- **Browser end-to-end:** built-app journeys proving Enter → Construct → Simulate → Observe → Explain → Compare → Report, including save and replay.
- **Visual/responsive:** supported viewport checks, changed-breakpoint screenshots or traces, and map interaction evidence.
- **Performance and operations:** p95/allocation benchmarks, Worker cancellation/recovery, load/soak, health, metrics, traces and logs.

Use the smallest complete set for a change. State why any applicable layer was omitted. A passing build is not a passing behavioral test.

## Existing baseline

`make ci-local` runs quality, Rust, TypeScript, contract, parity and
production-audit checks. It first verifies the machine-readable runtime stub
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
backend; it must not hardcode a TypeScript or Rust/WASM selection. The image
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

Generic-AAM crate, adapter, generated module, build, benchmark, verification,
test, and package-command paths select the hosted Rust owner explicitly. Stage
2B caches the private crate and runs rustfmt, strict Clippy, a canonical rebuild
check, native tests, rustdoc, the full reference verifier, and its bounded
performance check. Stage 2C audits the crate's independent lockfile. The
generated bytes use the repository-pinned Rust 1.97.1 Linux/amd64 builder; the
exact source, builder, byte digest, size, and ABI identity fail closed.

Six-degree-of-freedom foundation changes select the hosted Rust owner. This
includes the private crate, TypeScript and WASM adapters, generated verifier,
build and benchmark scripts, numerical suite, and `package.json` command
definitions; manifest and lockfile changes additionally select dependency
audit. Stage 2B caches the private crate and explicitly runs its rustfmt, strict
Clippy, rebuild verification, native tests, rustdoc, TypeScript/actual-WASM
numerical suite, centralized exact-marker production-isolation falsifiers, and
bounded 10,000-tick benchmark. The isolation falsifier injects the real private
ABI into a production-style bundle; generated-module, schema, adapter, crate,
and ABI markers all fail closed. Stage 2C audits its independent lockfile. These
commands preserve
the production engine's separate unchanged 500,000-byte gate; they do not make
the verifier available to the engine, backend, or Worker.

`rust-toolchain.toml` and every hosted Rust setup pin Rust 1.97.1. Private 6DOF
and generic-AAM raw bytes are rebuilt through one immutable Linux/amd64 Rust
image rather than the caller's host compiler; each embedded builder identity,
source digest, byte digest, size, and ABI exports must match. This closes
floating-stable and cross-host codegen drift without normalizing code/data
sections or admitting platform-specific alternate artifacts.

GitHub CI uses `scripts/classify-ci-changes.mjs` to select the smallest complete
automated gate from changed paths. Repository-policy tests always run, and an
unknown path fails closed through every CI job. Documentation and agent-harness
changes do not consume application, Rust, container, or PostGIS runners. Web,
simulation, database/API, dependency, workflow, and infrastructure paths each
add their owning gates. Shared mission, scenario, environment, model, Worker and
Vector Simulation Record contracts select the Rust/parity and integration gates
that consume them. The single Required PR Gate is always emitted and verifies
that every selected job passed and every unselected job was skipped. Failed,
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

`make integration-ci` uses the tracked managed-server runner. The runner writes
the built application output to `outputs/integration/application.log`, stops and
awaits the complete server process group after success, verifier failure, early
server exit, or cancellation, and returns the verifier status. CI retains that
directory on failure. The policy regression deliberately fails a verifier,
checks that the log remains readable, and binds the same port again to prove
cleanup. This process evidence is separate from the Browser Contract runner. CI
builds the application once, then `scripts/run-browser-contracts.mjs` executes
the five Playwright projects serially with a fresh managed Wrangler/Workerd
process group for each viewport. The policy is `RUN_ALL_PROJECTS_ONCE`: all 15
cases execute without retries even after one project fails, so later-viewport
evidence is not suppressed. An external `SIGINT` or `SIGTERM` is different: it
terminates the active server and test process groups, records the interruption,
does not start later projects, and exits nonzero. Any project, server,
interruption, cleanup, or evidence-retention failure makes the aggregate command
fail. A pass requires a nonempty managed-server log and parseable Playwright JSON
bound to the expected project, exactly three executed cases, and their successful
statuses. The three governed case identities are exact and distinct; global or
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
