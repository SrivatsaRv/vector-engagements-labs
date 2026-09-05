## What changed

Describe the behavior and the owning contract.

Owning issue: <!-- Required. Use #number and state whether this closes the issue or delivers a named slice. -->

## Closure classification

- [ ] Feature slice: use `Refs #NN`; list the parent acceptance criteria still unmet below. Do not use `Fixes`, `Closes`, or `Resolves` for a governed parent issue.
- [ ] Completion review: use only when this PR proves every parent criterion. Add the `completion-review` label and the machine-readable checklist from `docs/repository-governance.md`. A completion review may close one governed parent issue only.

Acceptance criteria addressed (criterion → test/evidence):

- <!-- Required for every claimed criterion. -->

Acceptance criteria still unmet (and why):

- <!-- Required for slices. Write None only for a completion review. -->

Closure verdict: <!-- Required. State “parent remains open” for a slice. -->

## Why

State the problem, evidence, and intended user or engine outcome.

## Verification

- Pushed commit SHA: <!-- Exact SHA tested; do not cite a dirty working tree. -->
- Test layer / command / result / artifact:
  - <!-- Add one row for every applicable layer. -->
- Omitted layers and reasons:
  - <!-- Write None or identify the owning follow-up issue. -->

- [ ] `make ci-local`
- [ ] Integration checks when persistence, API, map, report, or UI behavior changed
- [ ] Performance checks when engine, rendering, or hot-path code changed
- [ ] Documentation updated
- [ ] Sources, licenses, and value states recorded for data changes
- [ ] Migration and release impact described when schemas changed

## Model and safety impact

Explain changes to equations, coefficients, numerical tolerance, provenance, observer state, or declared limitations. Write “None” when no such behavior changes.

## Screenshots or records

Attach only when visual or replay behavior materially changed. Do not include private or operational data.
