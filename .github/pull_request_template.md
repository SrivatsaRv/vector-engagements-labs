## Contract documentation declaration

Keep exactly one block. Follow the [contract-document ownership policy](/SrivatsaRv/vector-engagements-labs/blob/main/governance/contract-doc-ownership.v1.json); replace the empty family inventory whenever governed contract paths change. Generate the exact diff-derived family and section inventory with `npm run --silent policy:contract-docs:template`, then replace its deliberately invalid rationale/evidence placeholders. The hosted gate binds this declaration to the exact Git change and owning Markdown sections and renders the validated declaration in the job summary for reviewers and assistive-reading flows.

<!-- vector-contract-doc-impact
{
  "schemaVersion": "vector.contract-doc-impact-declaration.v1",
  "families": []
}
-->

Example shape (do not add a second HTML declaration block):

```json
{
  "schemaVersion": "vector.contract-doc-impact-declaration.v1",
  "families": [
    {
      "familyId": "DELIVERY_CONTRACT_GOVERNANCE",
      "disposition": "SEMANTIC",
      "owningSections": [
        {
          "sectionId": "DELIVERY_CONTINUOUS_INTEGRATION",
          "path": "docs/repository-governance.md",
          "heading": "## Continuous integration",
          "facets": ["delivery"]
        }
      ],
      "rationale": "State the exact contract behavior changed by this pull request.",
      "evidence": [{ "kind": "TEST", "value": "State the exact verification command and result." }],
      "migration": {
        "state": "NOT_APPLICABLE",
        "documents": [],
        "rationale": "State the exact persistence, migration, and changelog impact."
      },
      "exemptionEvidence": null
    }
  ]
}
```

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
