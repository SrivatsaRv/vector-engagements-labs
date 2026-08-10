# Local release-train integration

## What is shared

All worktrees point to the same local Git object database, but each branch has its own working tree and `HEAD`. Uncommitted edits are private to the worktree. A commit is shareable by Git; a pushed branch is shareable with other chats and GitHub; a merge into `release/x86-runtime` is the integration state.

## Feature-chat handoff

From the assigned feature worktree:

```bash
git status --short --branch
git fetch origin --prune
make ci-local
git add <scoped-files>
git commit -m "feat: <scoped change>"
git push -u origin <feature-branch>
```

Open the PR against `release/x86-runtime`. Include the commit SHA, tests, docs, migrations and blockers. Do not open the PR against `main`.

## Release-steward merge

From `/Users/one2n/vector-lab-worktrees/release-x86-runtime`:

```bash
git fetch origin --prune
git switch release/x86-runtime
git pull --ff-only origin release/x86-runtime
git log --oneline --decorate -5
```

Merge only a reviewed feature PR whose required checks pass. After merging:

```bash
git pull --ff-only origin release/x86-runtime
make ci-local
make integration-local
make observability-local
make performance-local
```

The expensive commands may be run according to the release gate, but their results must be recorded. The release branch is the only place where cross-stream behavior is evaluated.

## Dependent feature sync

Before consuming a merged upstream contract, a feature chat must save its local work, then from its own worktree run:

```bash
git status --short --branch
git fetch origin --prune
git rebase origin/release/x86-runtime
```

Resolve conflicts in the feature worktree, rerun affected tests, then force-push only with an explicit branch policy; otherwise push a new commit. Never reset, clean, or discard another chat's worktree.

## Current practical state

The data, geo and browser worktrees currently contain uncommitted private edits. They cannot see one another's changes yet. The first shared state will exist after the owning chat commits and pushes, and the release steward merges that branch.
