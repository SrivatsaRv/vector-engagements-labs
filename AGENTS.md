# Vector Engagement Labs agent harness

Use the project skill at `.codex/skills/vector-lab-harness/SKILL.md` for repository work. It is the single workflow authority for GitHub-issue routing, maintained `docs/` contracts, feature worktrees, stacked pull requests, and verification.

Before editing:

- Confirm worktree and branch; preserve unrelated changes.
- Route the task through its owning GitHub issue and read only its governing documents first.
- Keep shared contracts versioned and owned by one stream. Do not invent parallel schemas.
- Read the owning GitHub issue and confirm its dependencies and acceptance criteria before editing.
- Feature work uses a dedicated `feat/<scope>` worktree. The bottom pull request starts from and targets `origin/main`; dependent pull requests form a reviewable stack and are retargeted to `main` as parents merge.
- Classify the change's test layers before writing code. Every executable action requires tests and a regression check where behavior can change.
- Worktree edits are private until committed and pushed; share changes through reviewed PRs that terminate at `main`, never by copying files between worktrees.

Before handoff:

- Update the relevant `docs/` contract and the owning issue's acceptance/status when scope or behavior changes.
- Keep existing frontend/container hot reload alive during edits, run `make ci-local` plus targeted checks, and use project-scoped, inspection-first container cleanup.
- Record passing and omitted test layers with reasons; report branch, commit, PR target, tests/results, benchmark evidence, migrations, docs and blockers.

Project invariants include deterministic TypeScript/Rust parity, explicit units and datums, provenance-separated facts and assumptions, immutable content-addressed records, migration-only database changes, no database or remote-terrain access in ticks, and browser-heavy work behind Workers.
