---
name: vector-lab-harness
description: Project-level operating harness for Vector Engagement Labs. Use for implementation, review, planning, testing, or coordination in this repository. Routes work through GitHub issues and maintained docs, feature-branch worktrees, stacked pull requests into main, defect-first review, and proportionate verification.
---

# Vector Lab Harness

Use this file as the repository's workflow authority. GitHub issues own executable scope and status; maintained `docs/` files own durable contracts. Worktrees are temporary checkouts, never planning or integration authorities.

## Start every task

1. Run `git status --short --branch`, `git worktree list`, and `git fetch --prune origin`. Preserve unrelated and uncommitted work.
2. Find and read the owning GitHub issue, including dependencies and acceptance criteria. Use issue labels and targeted `rg` searches to identify the affected domain; do not rely on a static worktree or workstream table.
3. Read `docs/README.md`, the directly governing contract documents, [references/contracts.md](references/contracts.md), and relevant source and tests. Read full documents only when changing their contract.
4. Confirm the task is in a dedicated `feat/<scope>` branch worktree. State the base branch, PR dependency, intended tests, and smallest regression test before editing.
5. Keep shared schemas and contracts versioned and owned by one domain. Record durable behavior in `docs/` and executable scope/status in the owning issue.

If the issue or current checkout conflicts with this policy, stop before editing and resolve the branch/issue ownership without discarding local work.

## Feature worktrees and stacked pull requests

`origin/main` is the protected integration branch and the eventual target of every change. Do not create a long-lived release/integration worktree. Create only short-lived `feat/<scope>` worktrees for active changes.

For the first change in a stack:

```bash
git fetch --prune origin
git worktree add -b feat/<scope> <worktree-path> origin/main
```

Push the branch and open the bottom pull request against `main`. For a dependent change, create another `feat/<child>` worktree from the parent feature branch and open its pull request against the parent branch so GitHub reviews only that stack layer. The stack still terminates at remote `main`. After the parent merges, fetch `origin/main`, rebase the child onto it, rerun affected tests, push with `--force-with-lease` only to the agent-owned child branch, and retarget the child pull request to `main`.

Each branch, worktree, commit, and pull request owns one coherent slice. Never share uncommitted files between worktrees, copy files to simulate integration, use two worktrees on one branch, or delete/prune a worktree until `git status` proves it clean. A dependency becomes shareable only after it is committed and pushed. Use Git history and the PR stack—not a local release branch—to express ordering.

## Defect-first review

Before push and after any rebase, run a read-only review of the exact change that would merge. Use `$review-agent` when it is available; it must not edit, commit, push, post comments, or delegate.

For the bottom PR, compare with the freshest resolvable `origin/main`. For a stacked PR, compare with its current parent branch. Resolve the merge base, then inspect the whole diff and relevant tests/call sites:

```bash
git merge-base HEAD <comparison-ref>
git diff <merge-base-sha>
```

Report every concrete regression as a prioritized, actionable finding with a changed-line citation. Fix qualifying findings, rerun the affected checks, and repeat the review. If no issue qualifies, record `No findings.` plus material test gaps or residual risks. Review each stack layer separately; a review of the cumulative stack is not evidence for an individual child PR.

## Engineering invariants

- Keep one versioned simulation contract across TypeScript, Rust/WASM, records, playback, reports, and persistence.
- Keep physics truth, observer estimates, render/map state, UI state, and durable records in separate layers.
- Use deterministic fixed steps, stable IDs, explicit units/datums, bounded inputs, immutable saved artifacts, and forward-only migrations.
- Keep database and remote-terrain access out of ticks; keep expensive browser work behind Workers.
- Fail closed for missing evidence, incompatible model packs, invalid coordinates, and unsupported combinations.
- Do not add unrelated features, classified/operational claims, or production cutover work unless the issue explicitly owns them.

## Test-first execution

Every executable change needs the smallest focused test that fails before the fix, the implementation, and the applicable regression layers. A build alone is not behavioral evidence. Select the smallest complete set:

| Change | Required evidence |
|---|---|
| Pure math, parser, reducer, compiler, or validator | focused unit tests, boundaries/errors, deterministic repeat |
| Schema, model pack, scenario, record, or API contract | round-trip, malformed rejection, digest/compatibility regression |
| Rust engine or ABI | Rust unit/integration, Clippy/rustdoc, TypeScript/Rust parity, WASM integrity |
| Database, migration, seed, or repository | empty and upgrade migration, seed/verifier, API integration |
| API, saved run, report, or trust boundary | handler/service, admission/errors, live persistence/binding integration |
| React, builder, map, playback, or state interaction | component/interaction, keyboard/touch/loading/error, rendered regression |
| User journey or cross-page behavior | browser end-to-end against a built app, persistence/replay assertions |
| Layout, viewport, map, or visual behavior | responsive contract plus changed-breakpoint screenshot/trace |
| Performance, Worker, batching, or concurrency | benchmark/environment, p95/allocation, cancellation/timeout/recovery |
| Observability or operations | metric/trace/log assertions and dashboard/health verification |
| Bug fix | a regression test that reproduces the original failure |
| Documentation or workflow | link, command, shell, and configuration validation |

Keep Node's built-in runner and Cargo for existing suites. Introduce a browser/component framework only with a useful first suite, CI/local command, documentation, and maintenance rationale. Do not weaken or delete coverage to make a gate pass. A red or flaky test blocks handoff unless it is quarantined with an owner and issue or explicitly accepted by the maintainer.

`make ci-local` is the required baseline before commit. Add the applicable integration, frontend, browser, responsive/visual, database, observability, performance, security, parity, migration, cancellation, recovery, load, and soak checks. State every omitted applicable layer and why.

## Hot reload and container hygiene

Keep the developer feedback loop live while editing:

- Detect an existing host `npm run dev` or containerized development session before changing runtime state. Do not stop or rebuild it for ordinary source edits.
- Use `make dev-up` for source-mounted container development. Confirm a representative edit is reflected by hot reload and that `/api/health` remains healthy; restore the development session after any test that temporarily replaces it.
- Keep immutable production-like Compose execution for integration and release evidence. Do not mistake hot-reload behavior for a production-build test.
- Rebuild only when dependencies, Dockerfile stages, build inputs, or generated artifacts require it. Prefer focused test processes alongside the live frontend.
- Use the single `vector-lab` Compose project from every worktree and keep the `:dev` image separate from immutable version tags.
- Before cleanup, inspect `docker compose -p vector-lab ps -a` and `docker image ls "reachdefence/vector-engagement-lab"`. Remove only stopped/orphaned containers belonging to this Compose project, using `docker compose -p vector-lab down --remove-orphans` only when no active session is needed. Remove stale image IDs explicitly only after proving no container references them.
- Never run `docker system prune`, broad image globs, or volume removal as routine cleanup. Preserve named database and observability volumes unless the user explicitly authorizes their deletion.

## Verification and handoff

Before commit, update the relevant `docs/` contract and owning issue when scope, behavior, or acceptance changes. Run focused checks and `make ci-local`, then perform the defect-first review. Commit intentionally, push the `feat/...` branch, and open or update the correct stack-layer PR.

Every handoff records worktree, branch, commit SHA, parent/base branch, PR URL and eventual `main` target, diff summary, contracts/docs changed, migrations, each test command and result, artifacts/benchmark environment where relevant, omitted layers with reasons, review result, container/dev-session state, and blockers.
