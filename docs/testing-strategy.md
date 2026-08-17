# Testing strategy

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
assumption, named-duel identifier, scripted guidance hold, sinusoidal behavior,
or source-less public reference must update its owning ledger entry; an
unclassified occurrence fails. The named targeted contracts are `make worker-local`,
`make frontend-local`, `make integration-local`, `make container-verify`,
`make observability-local`, `make performance-local` and
`make air-reference-local`. `frontend-local` requires `VECTOR_URL` to identify
an already running built application; it does not start or silently substitute
a development server. `make integration-local` validates Compose, builds and
inspects the non-root production image, starts the authoritative topology,
verifies governed migration data before fixture admission, covers the live
PostGIS/API path, and runs automated responsive interaction checks. The image
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

## Framework decision

Keep Node's built-in test runner and Cargo for the existing domain and engine suites. Add `@playwright/test` as the browser end-to-end and visual runner; `playwright-core` alone is not a test framework. Add Vitest plus Testing Library only when component tests require mocking, coverage and watch mode that the built-in runner cannot provide efficiently. Introduce each dependency with a real suite, CI/local command, documentation and maintenance rationale. Do not add multiple overlapping frontend runners.

## Release evidence

The release steward requires passing unit, contract, parity, migration, API, frontend, browser, visual, security, performance, observability, cancellation, recovery, load and soak evidence for the applicable release scope. Targets in [`performance-capacity.md`](performance-capacity.md) remain targets until a reproducible benchmark record marks them measured.
