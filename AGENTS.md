# Vector Engagement Labs agent harness

Use the project skill at `.codex/skills/vector-lab-harness/SKILL.md` for repository work. It is the compact routing layer for maintained `docs/` contracts and the GitHub issue backlog; use its context slice instead of loading the entire project.

Before editing:

- Confirm worktree and branch; preserve unrelated changes.
- Route the task to one workstream and read only its governing documents first.
- Keep shared contracts versioned and owned by one stream. Do not invent parallel schemas.
- Read the owning GitHub issue and confirm its dependencies and acceptance criteria before editing.
- Feature work starts from the protected integration branch declared by the owning issue. Use `origin/main` when no active release train is declared.
- Classify the change's test layers before writing code. Every executable action requires tests and a regression check where behavior can change.
- Worktree edits are private until committed and pushed; share changes through reviewed PRs into the declared integration branch, never by copying files between worktrees.

Before handoff:

- Update the relevant `docs/` contract and the owning issue's acceptance/status when scope or behavior changes.
- Run `make ci-local` plus targeted checks appropriate to the change.
- Record passing and omitted test layers with reasons; report branch, commit, PR target, tests/results, benchmark evidence, migrations, docs and blockers.

Project invariants include deterministic TypeScript/Rust parity, explicit units and datums, provenance-separated facts and assumptions, immutable content-addressed records, migration-only database changes, no database or remote-terrain access in ticks, and browser-heavy work behind Workers.
