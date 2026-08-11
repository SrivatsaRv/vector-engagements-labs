# Local branch and worktree integration

## What is shared

All worktrees point to the same local Git object database, but each branch has its own working tree and `HEAD`. Uncommitted edits are private to that worktree. A commit is shareable locally; a pushed branch is shareable with other tasks and GitHub; a merge into the protected integration branch is the shared product state.

The owning GitHub issue declares the integration branch. Use `main` when no active release train is declared. Never assume a historical release branch still exists.

## Feature handoff

From the assigned branch or worktree:

```bash
git status --short --branch
git fetch origin --prune
make ci-local
git add <scoped-files>
git commit -m "feat: <scoped change>"
git push -u origin <feature-branch>
```

Open the PR against the integration branch declared by the issue. Include the commit SHA, tests, docs, migrations, benchmarks where relevant, and blockers. Do not target another branch merely because it was used by a previous release train.

## Integration steward

From the integration worktree:

```bash
git fetch origin --prune
git switch <integration-branch>
git pull --ff-only origin <integration-branch>
git log --oneline --decorate -5
```

Merge only a reviewed feature PR whose required checks pass. After merging:

```bash
git pull --ff-only origin <integration-branch>
make ci-local
make integration-local
make observability-local
make performance-local
```

Run expensive gates according to the owning issue and release policy, and record every result or justified omission. Cross-stream behavior is evaluated only from the integrated state.

## Dependent feature sync

Before consuming a merged upstream contract, save local work and run:

```bash
git status --short --branch
git fetch origin --prune
git rebase origin/<integration-branch>
```

Resolve conflicts in the owning worktree, rerun affected tests, and push according to branch policy. Never reset, clean, or discard another task's worktree. Never copy uncommitted files between worktrees to simulate integration.
