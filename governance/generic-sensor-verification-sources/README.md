# Generic sensor verification source freeze

This directory is the immutable Stage-0 source bundle owned by issue #148. Its
only intended use is `ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE`. It preserves
official source bytes, official metadata, exact page/file locations, full-page
offline renders, a complete archive inventory, selected reference-only files,
and separately governed legal decisions. It is not a model pack and nothing in
this directory is imported by production code.

## Current authority state

Redistribution is `SOURCE_TERMS_AUTHORIZED` for the exact frozen artifacts and
declared derivatives only. `redistribution-authority.v1.json` binds that state
to the exact official NASA `PUBLIC` / `GOV_PUBLIC_USE_PERMITTED` metadata and
the exact Zenodo open/MIT metadata plus preserved MIT notice. Missing or changed
source evidence fails closed; this is a direct source grant, not a human or
agent-authored legal approval. Reference execution and adaptation remain
`PENDING_REVIEW`. A human approval requires an allowlisted reviewer, canonical
calendar date, closed jurisdiction and scope,
conditions, evidence digest, and a detached Ed25519 decision attestation
verified through the digest-pinned policy at
`../generic-sensor-legal-authority-policy.v1.json`. The policy is outside this
bundle and currently registers no approval authority. Request-supplied roots or
allowlists are ignored. The signed evidence must resolve to exact regular-file
bytes under the external governed evidence root. Self-declared reviewer kinds,
invented or unresolved records/evidence, agent assertions, and bundle-local keys
cannot create authority.

In particular, this bundle does not authorize executing or importing Stone
Soup, adapting its code, generating reference vectors, transcribing equations
or parameters, or claiming any production or named-system behavior. The
unsigned annotated tag object and its resolved verified signed commit are
recorded separately. The withdrawn CR-160557 digest is not a historical source
identity; it exists only in a rejection regression.

## Layout

- `manifest.v1.json` is the canonical, content-addressed source manifest.
- `legal-decisions.v1.json` preserves the three independent legal decision
  dimensions for every source.
- `legal-authority-registry.v1.json` is the fail-closed, currently empty
  signed-decision-record registry. It is bound to the external pinned authority
  policy and cannot declare reviewers, grants, trusted keys, or evidence bytes.
- `archive-inventory.v1.json` declares every member of the frozen Stone Soup
  archive before bounded extraction.
- `redistribution-authority.v1.json` records the exact authoritative source
  terms that permit repository redistribution without permitting execution or
  adaptation.
- `visual-inspection.v1.json` records deterministic full-page machine
  inspection. The independent gate rerenders every declared PDF page, compares
  exact PNG bytes, checks valid non-blank image structure, reproduces each
  upright derivative, and verifies the source/display mapping. Its distinct
  `RELEASE_OWNER_REVIEW` section binds the non-legal semantic inspection to the
  exact render-set and contact-sheet digests and records identity, context
  category, mapping, and limitation/nonclaim consistency without transcribing
  equations or numeric values.
- `production-isolation-evidence.v1.json` measures the frozen artifact set and
  declares the production-import regression boundary.
- `raw/` contains exact official artifacts; `extracted/` contains only declared
  reference files; `renders/` contains the Darwin-arm64 non-authoritative
  full-page navigation images and three explicitly mapped upright display
  derivatives; `renders-linux-amd64/` contains the separately
  content-addressed Linux-amd64 profile over the same exact 44 PDF pages.

OCR and extracted text, if produced during review, are
`NON_AUTHORITATIVE_DISCOVERY_AID` material. They cannot supply numeric values or
equations. The exact source PDF or archive member remains authoritative.

## Offline verification

From the repository root, with no network access:

```sh
npm run generic-sensor:sources:verify
node --test tests/generic-sensor-source-bundle.test.mjs
```

The first command is also a mandatory `make ci-quality` gate. It checks that
generated records are current and then runs the full verifier; neither step
can perform network access because the command preloads the tracked deny-all
Node guard and proves TCP, HTTP, and every callback, promise,
resolver-instance, and ESM DNS lookup, `resolve*`, and reverse call fails. The same command is run
again after the production application build so bundle exclusion is measured
against populated output directories. `--write` is reserved for an intentional, reviewed
regeneration from already frozen local bytes. The verifier pins the complete
canonical manifest digest, so caller resealing cannot alter any manifest,
source, artifact, render, claim, or policy field. It hashes every declared
artifact, parses the ZIP with bounded expansion, compares all archive members and selected
extractions, validates official metadata and page mappings, validates pending
decision structure, and scans production roots for exposure. The governed
boundary includes the entire `fixtures/` tree, including public-reference and
performance workloads; frozen source bytes are forbidden in every runtime
fixture subtree.

The render recipe is Poppler `pdftoppm` 26.05.0 at 150 DPI, grayscale, full
page. Its Darwin-arm64 conda-forge and Linux-amd64 pinned-Ubuntu profiles each
reproduce exact bytes within the profile; the manifest does not assert that
Poppler emits identical PNG bytes across platforms. Both profiles cover the
same exact 44 pages and are bound to the release-owner review. CR-160557 PDF
pages 8, 11, and 14 are intrinsically rotated; their source renders are
preserved and separate Sharp 0.35.0 90-degree-clockwise display derivatives are
manifest-hashed. Sharp uses deterministic PNG options
`compressionLevel: 9`, `adaptiveFiltering: false`, and `palette: false`. The
display derivative never replaces the source-page identity.

GitHub's Ubuntu runner does not provide this pinned renderer. A dedicated job
runs `scripts/install-pinned-poppler-ubuntu.sh` once, builds inside the exact
Ubuntu image digest recorded in the manifest, and rejects any Poppler source
archive digest other than
`6fef27ff04f37db43054c86bcdff6128c9fb1f6af4ef3c8b369a7e9abd68d0bb`.
A digest-keyed Actions cache supplies that image to quality and integration;
the runtime wrapper disables container networking. The networked source
bootstrap is separate from the deny-all source verifier and cannot replace or
fetch any governed source artifact.

## Explicitly omitted layers

Browser, database, migration, numerical-parity, and performance validation are
not applicable to this Stage-0 source-only change. No runtime TypeScript,
Rust/WASM, backend, Worker, browser, model-pack, or VSR behavior is added. Full
repository gates still guard against unintended regression; an independent
review must pass on the exact commit before publication.
