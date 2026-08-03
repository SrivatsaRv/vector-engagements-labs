# Repository governance and delivery

## Status

The repository is public, Apache-2.0 licensed, and currently **pre-alpha research software**. `main` is the integration branch. It should always be buildable, but results and schemas may change before `v1.0.0` when changes are documented and versioned.

## Protected delivery path

All contributor work enters through a pull request. The `main` branch requires:

- an up-to-date branch;
- at least one approving review;
- CODEOWNER review for protected contracts;
- resolution of review conversations;
- passing Quality, Integration, Performance, CodeQL, and Dependency Review checks;
- linear history;
- no force pushes and no branch deletion.

Repository administrators retain emergency recovery authority but should not use it to bypass ordinary review. Security fixes follow `SECURITY.md`.

## Continuous integration

`ci.yml` verifies source generation, Rust/WASM integrity, Rust tests, lint, type safety, production build, behavioral tests, PostGIS/API/report integration, supported responsive breakpoints, and an engine performance guard. Rust sources carry a deterministic source digest; the embedded module carries its own byte digest and required-export check; CI also compiles the module afresh on its runner. This avoids incorrectly requiring different compiler platforms to emit byte-identical WASM. Actions are pinned to immutable commit SHAs.

`codeql.yml` performs JavaScript and TypeScript security analysis on changes to `main`, pull requests, and a weekly schedule. `dependency-review.yml` rejects vulnerable or incompatible new dependencies in pull requests. Dependabot permits one open maintenance pull request per ecosystem, groups routine npm, Cargo, and Actions updates, and excludes major versions so they require an intentional maintainer proposal.

The commit gate rejects high-severity production dependency advisories. The current remaining npm audit findings are development-only advisories inherited through `drizzle-kit` and the locally proven Cloudflare Vite/Wrangler adapter. They are not shipped in the Worker runtime dependency surface and remain tracked for upstream removal. The latest Cloudflare adapter was evaluated and rejected because its alpha Miniflare dependency crashed during the responsive integration suite; using `--force` would also incorrectly downgrade the migration tool. Production dependencies currently audit cleanly.

## Continuous delivery

Pushing a semantic tag creates a GitHub release only when the tag exactly matches `package.json`, the commit gate passes, and the release archive receives a SHA-256 manifest.

Cloudflare delivery is deliberately manual and protected by the GitHub `production` environment. It deploys an explicit commit or tag only after CI and requires three repository secrets:

- `CLOUDFLARE_API_TOKEN` with least-privilege Worker deployment access;
- `CLOUDFLARE_ACCOUNT_ID`;
- `DATABASE_ORIGIN_URL` as a protected environment secret for migrations and
  direct origin verification only.
- `CLOUDFLARE_HYPERDRIVE_ID` as a non-secret production environment variable
  for the PostgreSQL/PostGIS binding.

No Cloudflare secret is stored in the repository. R2 is optional and should be introduced only with an explicit `ARTIFACTS` binding and object-custody contract.

## Version and tag policy

- Tags follow `vMAJOR.MINOR.PATCH` and Semantic Versioning.
- `0.x` releases may change unstable contracts but must document migration and compatibility impact.
- `1.x` begins only after scenario, engine, recording, and model-version contracts are declared stable.
- Numerical or coefficient changes that can alter an outcome must appear prominently in the changelog and release notes.
- Tags should be annotated and signed by a maintainer when local signing is configured.
- Published tags are immutable. Corrections receive a new patch release.

## Ownership and contributor safety

`CODEOWNERS` assigns default ownership and explicitly protects engine, database, workflow, governance, and security surfaces. Contributors cannot merge directly to `main`, dismiss reviews, bypass checks, or force-push protected history.
