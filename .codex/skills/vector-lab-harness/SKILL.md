---
name: vector-lab-harness
description: Project-level operating harness for Vector Engagement Labs. Use when implementing, reviewing, planning, testing, or coordinating work in this repository, especially simulation engine, model data, geospatial, browser runtime, release-train, database, observability, or documentation tasks. Routes work to the correct stream, loads only relevant docs and pending-work context, and enforces branch, contract, verification, and handoff rules.
---

# Vector Lab Harness

Use this skill as the repository's low-token steering layer. Treat tracked code and documentation as authoritative; do not reconstruct project history from conversation summaries.

## Start every task

1. Confirm the current worktree and branch with `git status --short --branch`.
2. Run `scripts/context-slice.sh <stream>` from the repository root. Choose `data`, `geo`, `browser`, `release`, `server`, `ui`, `security`, or `general`.
3. Read only the listed contract documents and directly relevant source files. Read full files when changing their contract; otherwise use headings and targeted searches first.
4. Inspect existing tests before changing behavior. Preserve unrelated user changes.
5. State a short execution plan, then implement rather than stopping at analysis.

## Stream routing

Use [references/workstreams.md](references/workstreams.md) to select ownership, branch, worktree, dependencies, and non-goals. Never create a competing schema or duplicate a contract owned by another stream.

The release train is `release/x86-runtime`; feature PRs target it, never `main`. The current merge order is data foundation, geospatial environment, browser runtime, then native server foundation. Rebase or merge the current release branch before handoff.

## Context discipline

- Prefer the context-slice script and targeted `rg` searches over dumping `docs/`, `pending-work/`, or whole source trees.
- Load detailed references only when the task enters that area: [references/contracts.md](references/contracts.md) contains invariants that must not be violated.
- Do not repeat project background in code comments or task updates when a concise link to the governing document is enough.
- Record new decisions in the owning `docs/` file or pending-work item so future agents do not need this conversation.

## Engineering rules

- Keep one versioned simulation contract across TypeScript, Rust/WASM, records, playback, reports, and persistence.
- Keep physics truth, observer estimates, map/render state, UI state, and durable records owned by separate layers.
- Use deterministic fixed-step behavior, stable IDs, explicit units/datums, bounded inputs, immutable saved artifacts, and forward-only migrations.
- Keep database access out of simulation ticks and keep the browser UI responsive by using Workers for expensive batches.
- Do not silently fall back from missing evidence, incompatible model packs, invalid coordinates, or unsupported combinations.
- Avoid unrelated feature work, UI redesign, high-resolution terrain, classified/operational claims, or production cutover unless explicitly assigned.

## Verification and handoff

Before commit, update relevant documentation and run `make ci-local`. Add targeted database, integration, observability, performance, browser, geospatial, Rust, or parity checks as applicable. Report failures honestly; do not weaken tests or claim a target is measured without evidence.

Every feature handoff includes worktree, branch, commit SHA, PR target/URL, concise diff summary, contracts changed, migrations, tests and results, benchmark evidence where relevant, docs changed, and blockers. Release work also includes grouped integration, deterministic parity, migration, container, observability, load, soak, cancellation, and recovery evidence before promotion.
