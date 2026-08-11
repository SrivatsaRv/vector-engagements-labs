# Repository governance and delivery

## Status

The repository is public, Apache-2.0 licensed, and currently **pre-alpha research software**. `main` is the integration branch. It should always be buildable, but results and schemas may change before `v1.0.0` when changes are documented and versioned.

## Protected delivery path

All contributor work enters through a pull request. The `main` branch requires:

- an up-to-date branch;
- resolution of review conversations;
- passing the staged Required PR Gate, which always verifies repository policy
  and requires every quality, security, test, integration, or container gate
  selected from the changed contracts;
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

`ci.yml` is one change-aware pull-request and `main` pipeline. Stage 0 computes
the changed files from immutable base and head revisions with the tracked
classifier and always runs repository-policy regression tests. Independent
quality, JavaScript supply-chain/CodeQL, web-contract, Rust/WASM/parity,
RustSec, PostGIS/API, and container-rebuild jobs then run in parallel only when
their owned paths or an unclassified path changed. Workflow and Dependabot
changes deliberately fail closed through every gate. Stage 4 retains the one
stable branch-protection context and fails unless every selected job passed;
jobs skipped by the classifier are not treated as missing evidence.

Documentation, project-skill, and governance-only changes run the classifier,
policy suite, and final gate without rebuilding the application, Rust engine,
container, or PostGIS. Blog content and thumbnails build and test the rendered
web product but do not invoke Rust or PostGIS. Frontend code adds lint,
typecheck, CodeQL, and web contracts. Rust and shared engine contracts add
Rust/WASM/parity checks; Cargo manifest changes also run the pinned RustSec
audit. Database, migration, and API changes add PostGIS integration. Container,
Compose, runtime-binding, dependency, and workflow changes add an image rebuild
and the integration gates. Unknown paths run everything until ownership is
declared in `scripts/classify-ci-changes.mjs`.

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

The commit gate rejects high-severity production dependency advisories. Cargo
manifest changes and releases also audit `engine-rust/Cargo.lock` with the
pinned `cargo-audit` version and current RustSec advisory database. The
Cloudflare Vite adapter, Wrangler, and Workers type package are upgraded as one
tested compatibility set and are no longer excluded from Dependabot. Remaining
npm audit findings are development-only advisories inherited through local
migration and Cloudflare tooling; they are not shipped in the Worker runtime
dependency surface and remain tracked for upstream removal. Production
dependencies currently audit cleanly.

## Continuous delivery

A maintainer dispatches the release workflow from `main` with an existing
semantic tag. The workflow verifies that the tag matches `package.json`,
resolves to reviewed `main` history, and already has a successful Required PR
Gate on that exact commit. It then reruns quality, unit, parity, production
dependency, RustSec, PostGIS migration, and application integration checks,
generates an SPDX SBOM and SHA-256 manifest, attests the archive, and publishes
through the protected `release` environment. Tag pushes alone cannot execute
release code. The `release` environment accepts protected branches and requires
an explicit maintainer approval before publication.

Cloudflare delivery is deliberately manual and protected by the GitHub
`production` environment. Both verification and deployment require a full
40-character commit SHA from `main` with a successful Required PR Gate before
any production credential is exposed. Verification checks source, Hyperdrive,
and the production catalog read-only. Deployment alone applies forward-only
migrations, deploys the admitted revision, and verifies production health. It
never seeds production implicitly. The environment accepts protected branches
and requires an explicit maintainer approval before credentials are released.
The workflow requires two protected secrets and three non-secret environment
variables:

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
