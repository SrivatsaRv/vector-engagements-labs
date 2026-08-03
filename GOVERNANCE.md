# Governance

Vector Engagement Labs uses maintainer review with protected branches.

## Roles

- **Contributors** propose issues, documentation, tests, data, or code through pull requests.
- **Reviewers** may review changes but cannot bypass required checks or merge their own unreviewed work.
- **Maintainers** own releases, repository policy, security response, model-contract changes, and final merge authority.

## Decision rules

- Routine changes require one approving review and all required checks.
- Engine contracts, numerical methods, schema versions, provenance rules, security boundaries, and governance changes require CODEOWNER approval.
- A maintainer with a material conflict should request another reviewer.
- History is preserved through pull requests. Force pushes and branch deletion on `main` are prohibited.
- Emergency security fixes may use an expedited private fork or advisory branch, but still require tests and post-merge documentation.

## Releases

Releases use semantic versioning. Tags are signed when maintainer tooling permits and follow `vMAJOR.MINOR.PATCH`. A release must identify model-contract changes, numerical changes, migrations, compatibility impact, limitations, and verification evidence.
