---
name: vector-lab-harness
description: Project-level operating harness for Vector Engagement Labs. Use when implementing, reviewing, planning, testing, or coordinating work in this repository, especially simulation physics, model data, sensing, mission behavior, 3D playback, geospatial, browser runtime, release-train, database, observability, or documentation tasks. Routes work to the owning GitHub issue and maintained docs, and enforces branch, contract, verification, and handoff rules.
---

# Vector Lab Harness

Use this skill as the repository's low-token steering layer. Treat tracked code and documentation as authoritative; do not reconstruct project history from conversation summaries.

## Start every task

1. Confirm the current worktree and branch with `git status --short --branch`.
2. Run the tracked `scripts/context-slice.sh <stream>` entry point from the repository root. Choose `data`, `physics`, `information`, `geo`, `browser`, `behavior`, `mission`, `visualization`, `release`, `server`, `ui`, `security`, or `general`. The entry point resolves the project skill implementation and must work in a clean clone.
3. Read the listed owning GitHub issue and only the listed contract documents and directly relevant source files. Read full files when changing their contract; otherwise use headings and targeted searches first.
4. Inspect existing tests before changing behavior. Preserve unrelated user changes.
5. State a short execution plan, then implement rather than stopping at analysis.

## Stream routing

Use [references/workstreams.md](references/workstreams.md) to select ownership, branch, worktree, dependencies, and non-goals. Never create a competing schema or duplicate a contract owned by another stream.

GitHub epic [#47](https://github.com/SrivatsaRv/vector-engagements-labs/issues/47) owns causal order. Feature PRs target the protected integration branch declared by their issue; use `origin/main` when no active release train is declared. Rebase or merge the current integration branch before handoff.

## Engineering personas

The harness is the shared operating protocol, not a fifth engineer. Invoke the smallest authoritative persona for the outcome:

- [$vector-staff-engineer](../vector-staff-engineer/SKILL.md) owns architecture, shared contracts, causal sequencing, and cross-stream integration.
- [$vector-simulation-systems-engineer](../vector-simulation-systems-engineer/SKILL.md) owns dynamics, control, mission behavior, guidance, weapons, sensors, tracking, datalinks, EW, and causal validation.
- [$vector-3d-frontend-engineer](../vector-3d-frontend-engineer/SKILL.md) owns scenario UX, canonical 2D/3D playback, interaction, telemetry, timelines, responsive presentation, and frontend performance.
- [$vector-verification-performance-engineer](../vector-verification-performance-engineer/SKILL.md) independently owns numerical, regression, parity, browser, visual, performance, security, recovery, CI/CD, and release evidence.

Do not let persona boundaries create handoff gaps. The Staff Architect owns the cross-stream outcome, specialists own their contracts, and the Verification Engineer independently decides whether the evidence proves the outcome.

## Worktree integration

Worktrees share Git objects but do not share uncommitted files. A task's edits become available to another task only after the owner commits and pushes its feature branch, followed by a merge into the integration branch declared by the owning issue.

Use this flow:

1. Feature chat works only in its assigned worktree and keeps changes scoped.
2. Feature chat runs focused tests, `make ci-local`, updates docs, commits, and pushes its branch.
3. The steward reviews the commit/PR and merges it into the declared integration branch.
4. Dependent feature work runs `git fetch origin` and rebases or merges the declared integration branch after saving/committing local work.
5. Run grouped integration and cross-stream tests from the integration worktree after every merge.

Never copy files between worktrees, cherry-pick another chat's uncommitted state, or have two chats edit the same branch. If a shared contract is needed early, commit the smallest contract slice, push it, and let the release steward merge it before dependent implementation proceeds. Use `git status`, `git log`, and `git diff` to prove which state is being shared.
## Context discipline

- Prefer the context-slice script, the owning GitHub issue, and targeted `rg` searches over dumping `docs/` or whole source trees.
- Load detailed references only when the task enters that area: [references/contracts.md](references/contracts.md) contains invariants that must not be violated.
- Do not repeat project background in code comments or task updates when a concise link to the governing document is enough.
- Record durable contract decisions in the owning `docs/` file and executable scope/status in the owning GitHub issue so future agents do not need this conversation.

## Engineering rules

- Keep one versioned simulation contract across TypeScript, Rust/WASM, records, playback, reports, and persistence.
- Keep physics truth, observer estimates, map/render state, UI state, and durable records owned by separate layers.
- Use deterministic fixed-step behavior, stable IDs, explicit units/datums, bounded inputs, immutable saved artifacts, and forward-only migrations.
- Keep database access out of simulation ticks and keep the browser UI responsive by using Workers for expensive batches.
- Do not silently fall back from missing evidence, incompatible model packs, invalid coordinates, or unsupported combinations.
- Avoid unrelated feature work, UI redesign, high-resolution terrain, classified/operational claims, or production cutover unless explicitly assigned.

## Test-first execution

Treat every executable action item as a contract with a test obligation. Before editing, classify the change using [references/testing.md](references/testing.md), name the smallest meaningful test that should fail before the fix, then implement the change and its tests together.

At minimum, choose the applicable layers: pure unit, schema/contract, Rust unit/integration, TypeScript/Rust parity, database/migration, API integration, frontend component/interaction, browser end-to-end, visual/responsive, security, regression, performance, cancellation/recovery, or observability. A documentation-only change still requires link/format validation when executable references or commands change.

Do not declare an action complete because the code builds. A completed action must have passing tests, a stated reason for any omitted layer, and evidence recorded in the handoff. New behavior without a regression test is incomplete. Fixes must include a test that would have caught the regression.

## Verification and handoff

Before commit, update relevant documentation and run `make ci-local`. Add targeted database, integration, observability, performance, browser, geospatial, Rust, parity, frontend, and regression checks as applicable. Report failures honestly; do not weaken tests, delete coverage to make a gate pass, or claim a target is measured without evidence.

Every feature handoff includes worktree, branch, commit SHA, PR target/URL, concise diff summary, contracts changed, migrations, tests and results, benchmark evidence where relevant, docs changed, and blockers. Release work also includes grouped integration, deterministic parity, migration, container, observability, load, soak, cancellation, and recovery evidence before promotion.
