# Repository governance and delivery

## Status

The repository is public, Apache-2.0 licensed, and currently **pre-alpha research software**. `main` is the integration branch. It should always be buildable, but results and schemas may change before `v1.0.0` when changes are documented and versioned.

## Protected delivery path

All contributor work enters through a pull request. The `main` branch requires:

- an up-to-date branch;
- resolution of review conversations;
- passing the staged Required PR Gate, which depends on quality, supply-chain,
  security, unit, contract, database, and API checks;
- linear history;
- no force pushes and no branch deletion.

GitHub does not permit an author to approve their own pull request. During the
solo-maintainer phase, the required approving-review count is therefore zero.
The maintainer can merge an authored pull request only after every required
check passes and every review conversation is resolved. `CODEOWNERS` still
routes sensitive changes for review, and external contributors cannot merge
their own work. When a second trusted maintainer is onboarded, the repository
will restore one required approval and required CODEOWNER review.

Repository administrators retain emergency recovery authority but should not use it to bypass ordinary checks. Security fixes follow `SECURITY.md`.

## Continuous integration

`ci.yml` is one causal pull-request pipeline. Stage 1 verifies source generation,
Rust formatting, lint, and type safety. Stage 1.5 performs the production
dependency audit, dependency review, and CodeQL analysis. Stage 2 verifies the
Rust/WASM module, Rust tests and documentation, the production build, and the
TypeScript contract suite. Stage 3 runs migrations and validates PostGIS, the
catalog API, saved-run verification, and report replay against the built
application. Stage 4 emits the single required PR gate only after every prior
stage succeeds.

Browser/responsive checks and performance benchmarks are deliberately not run
on GitHub-hosted pull-request runners. They remain explicit maintainer checks
through `make integration-local` and `make performance-local`, where the
browser, GPU/software renderer, display dimensions, and machine class are
controlled and the evidence is interpretable. The scheduled `codeql.yml`
workflow retains weekly security analysis without creating a second PR run.

Rust sources carry a deterministic source digest; the embedded module carries
its own byte digest and required-export check; CI also compiles the module
afresh on its runner. This avoids incorrectly requiring different compiler
platforms to emit byte-identical WASM. Actions are pinned to immutable commit
SHAs.

Pull requests receive CodeQL and dependency review inside the causal `ci.yml`
pipeline. `codeql.yml` is reserved for the weekly scheduled scan and explicit
maintainer dispatches. Dependabot permits one open maintenance pull request per
ecosystem, groups routine npm, Cargo, and Actions updates, and excludes major
versions so they require an intentional maintainer proposal.

The commit gate rejects high-severity production dependency advisories. The Cloudflare Vite adapter, Wrangler, and Workers type package are upgraded as one tested compatibility set and are no longer excluded from Dependabot. Remaining npm audit findings are development-only advisories inherited through local migration and Cloudflare tooling; they are not shipped in the Worker runtime dependency surface and remain tracked for upstream removal. Production dependencies currently audit cleanly.

## Continuous delivery

A maintainer dispatches the release workflow from `main` with an existing semantic tag. The workflow verifies that the tag matches `package.json` and resolves to reviewed `main` history, runs the full gate, generates an SPDX SBOM and SHA-256 manifest, attests the archive, and publishes through the protected `release` environment. Tag pushes alone cannot execute release code.

Cloudflare delivery is deliberately manual and protected by the GitHub `production` environment. It deploys an explicit commit SHA only after CI and requires two protected secrets and two non-secret environment variables:

- `CLOUDFLARE_API_TOKEN` with least-privilege Worker deployment access;
- `DATABASE_ORIGIN_URL` as a protected environment secret for migrations and
  direct origin verification only.
- `CLOUDFLARE_ACCOUNT_ID` as a non-secret production environment variable;
- `CLOUDFLARE_HYPERDRIVE_ID` as a non-secret production environment variable
  for the PostgreSQL/PostGIS binding.
- `VECTOR_PRODUCTION_HOST` as the non-secret production custom domain.

No Cloudflare secret is stored in the repository. R2 is optional and should be introduced only with an explicit `ARTIFACTS` binding and object-custody contract.

## Version and tag policy

- Tags follow `vMAJOR.MINOR.PATCH` and Semantic Versioning.
- `0.x` releases may change unstable contracts but must document migration and compatibility impact.
- `1.x` begins only after scenario, engine, recording, and model-version contracts are declared stable.
- Numerical or coefficient changes that can alter an outcome must appear prominently in the changelog and release notes.
- Tags should be annotated and signed by a maintainer when local signing is configured.
- Published tags are immutable. Corrections receive a new patch release.

## Ownership and contributor safety

`CODEOWNERS` assigns default ownership across engine, database, workflow,
governance, and security surfaces. Contributors cannot merge directly to
`main`, bypass checks, or force-push protected history. The solo maintainer may
merge their own pull request after all mandatory checks and conversations pass;
GitHub self-approval is neither possible nor treated as evidence.
