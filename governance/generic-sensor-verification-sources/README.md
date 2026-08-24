# Generic sensor verification source freeze

This directory is the immutable Stage-0 source bundle owned by issue #148. Its
only intended use is `ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE`. It preserves
official source bytes, official metadata, exact page/file locations, full-page
offline renders, a complete archive inventory, selected reference-only files,
and separately governed legal decisions. It is not a model pack and nothing in
this directory is imported by production code.

## Current authority state

All redistribution, reference-execution, and adaptation decisions are
`PENDING_REVIEW`. That state fails closed. Only an authorized human reviewer
with a decision record, date, jurisdiction, scope, conditions, and evidence
digest may approve a decision. An agent-authored assertion is invalid.

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
- `archive-inventory.v1.json` declares every member of the frozen Stone Soup
  archive before bounded extraction.
- `visual-inspection.v1.json` records the primary full-page visual inspection
  and the still-required independent exact-commit review.
- `production-isolation-evidence.v1.json` measures the frozen artifact set and
  declares the production-import regression boundary.
- `raw/` contains exact official artifacts; `extracted/` contains only declared
  reference files; `renders/` contains non-authoritative full-page navigation
  images and three explicitly mapped upright display derivatives.

OCR and extracted text, if produced during review, are
`NON_AUTHORITATIVE_DISCOVERY_AID` material. They cannot supply numeric values or
equations. The exact source PDF or archive member remains authoritative.

## Offline verification

From the repository root, with no network access:

```sh
node scripts/generate-generic-sensor-source-manifest.mjs
node scripts/verify-generic-sensor-source-bundle.mjs
node --test tests/generic-sensor-source-bundle.test.mjs
```

The first command checks that generated records are current; it performs no
network access. `--write` is reserved for an intentional, reviewed regeneration
from already frozen local bytes. The verifier hashes every declared artifact,
parses the ZIP with bounded expansion, compares all archive members and selected
extractions, validates official metadata and page mappings, validates pending
decision structure, and scans production roots for exposure.

The render recipe is Poppler `pdftoppm` 26.05.0 at 150 DPI, grayscale, full
page. CR-160557 PDF pages 8, 11, and 14 are intrinsically rotated; their source
renders are preserved and separate Sharp 0.35.0 90-degree-clockwise display
derivatives are manifest-hashed. The display derivative never replaces the
source-page identity.

## Explicitly omitted layers

Browser, database, migration, numerical-parity, and performance validation are
not applicable to this Stage-0 source-only change. No runtime TypeScript,
Rust/WASM, backend, Worker, browser, model-pack, or VSR behavior is added. Full
repository gates still guard against unintended regression; an independent
review must pass on the exact commit before publication.
