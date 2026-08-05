# Vector Engagement Labs agent harness

Use the project skill at `.codex/skills/vector-lab-harness/SKILL.md` for repository work. It is the compact routing layer for `docs/` and `pending-work/`; use its context slice instead of loading the entire project.

Before editing:

- Confirm worktree and branch; preserve unrelated changes.
- Route the task to one workstream and read only its governing documents first.
- Keep shared contracts versioned and owned by one stream. Do not invent parallel schemas.
- Feature work starts from `origin/release/x86-runtime` and targets that branch; `main` is not a feature PR target.

Before handoff:

- Update the relevant `docs/` or `pending-work/` contract.
- Run `make ci-local` plus targeted checks appropriate to the change.
- Report branch, commit, PR target, tests/results, benchmark evidence, migrations, docs and blockers.

Project invariants include deterministic TypeScript/Rust parity, explicit units and datums, provenance-separated facts and assumptions, immutable content-addressed records, migration-only database changes, no database or remote-terrain access in ticks, and browser-heavy work behind Workers.
