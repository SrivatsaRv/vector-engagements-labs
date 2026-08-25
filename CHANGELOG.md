# Changelog

All notable changes will be documented here. The project follows Semantic Versioning and uses Keep a Changelog categories.

## Unreleased

### Contract-family release notes

Each governed contract family records its own release impact below. A change to
one family must not imply changes to unrelated contracts.

#### Model packs

- Bind the independent regional EnvironmentPack/runtime-grid digest beside the
  compiled model pack without changing named-system evidence authority.

Model-pack persistence table declarations now live in the domain-owned
`db/schema/model-pack.ts` module behind the unchanged aggregate Drizzle facade.
Air flight assignments bind exact model-pack, aircraft and compatible
station/store identities; mission authoring does not duplicate model schemas.
The existing model-pack family now also defines the non-promotable v2 aircraft
onboarding foundation: closed intended-use requirements, immutable raw and
derivative lineage, deterministic completeness and digest chaining, exact
multi-pack resolution, atomic append-only publication, byte-exact research
export/import, compiled-only export, and two anonymous regression packs. V1
remains readable but cannot be promoted through the v2 onboarding boundary.
The completion slice now covers every authored physical scalar and valid
configuration with stable selectors and value digests. This includes executable
sensor/weapon admission categories, station/store membership, and compatibility
status/capacity; canonical structural IDs remain singly bound as identity rather
than duplicated scalar lineage. A length-only safe-integer table preflight now
rejects pathological shapes and more than 2,000,000 cumulative cells before
source serialization or lineage materialization. Repository publication now
binds canonical content digests for every independently versioned intended-use
contract, requirement profile, raw-source record, derivative, and credibility
manifest across staged and prior batches, so a
reused `(schema, id, version)` can share only identical content. Research import
preflights exact entry counts and length-only per-entry and cumulative corpus
bounds before scanning or copying archive bytes. The slice reproduces derivative
bytes through one pinned offline recipe, validates the compiled v2 identity in
both TypeScript and Rust/WASM, publishes two generated anonymous research
archives, and gates compile/publish/lookup/export/import plus 1/10/100/500 reuse
against an immutable measured workload. Scenario, Worker, runtime, VSR and UI
promotion remain downstream under #154, later #161 stages and #155.

#### Database schema

- Add migration 014 for immutable PostGIS environment packs, sourced runway
  geometry/elevation/provenance, exact catalogue readback, and canonical v4
  scenario-package EnvironmentPack wording/hashes.
- Make migration 014 self-sufficient for production by installing its governed
  source/installation prerequisites, 24 runways and 12 regional packs before
  seed; protect every pack column except `superseded_at` with a live mutation
  matrix.

The aggregate `db/schema.ts` facade now re-exports domain-owned schema modules;
table names, columns, constraints, and prior migrations are unchanged.
Forward-only migration `013_air_mission_contract.sql` replaces exact v3 scenario
packages/hashes with canonical v4 packages and rejects mixed or residual rows.

#### Engine ABI

Engine scenarios carry an optional compiled Air mission lineage envelope. The
generic physics ABI is unchanged; Rust/WASM results reattach the verified
envelope for backend-independent VSR provenance.
The WASM-capable Rust core also validates the exact-key compiled model-pack v2
schema and reproduces the TypeScript digest on an anonymous fixture. This adds
no exported simulation ABI, backend-selection rule or v2 runtime admission.
- Add `vector.environment-runtime-grid.v1` terrain/atmosphere fields with exact
  TypeScript/Rust interpolation and collision parity.
- Propagate regional terrain/atmosphere coverage, validity and no-data failures
  as stable Rust engine errors instead of a zero-surface or `NaN` substitute.

No pending family-specific entry.

#### Generic AAM verification

No pending family-specific entry.

#### Generic sensor source freeze

Added an immutable, offline-verifiable Stage-0 bundle for the exact Stone Soup
v1.9.1 and four NASA generic sensor reference sources. The bundle remains
outside every production runtime and model-pack boundary; execution,
and adaptation remain blocked pending separately authorized human decisions.
Redistribution of the exact frozen records and declared derivatives is bound to
pinned NASA public-use and Stone Soup open/MIT source terms, and deterministic
machine inspection independently reproduces every declared page render. A
non-legal release-owner semantic review is bound to separately
content-addressed Darwin-arm64 and Linux-amd64 44-page render sets and eight
profile/contact-sheet identities without admitting numeric values or equations.
Hosted quality, web-contract, and post-build integration restore a digest-keyed
renderer image built once from the SHA-pinned official Poppler 26.05.0 source
on a pinned Ubuntu base. Both `pdftoppm` and `pdfinfo` come from that image, so
the mandatory source suite cannot consume an ambient runner tool. Production
quarantine now covers the entire `fixtures/` tree,
including public-reference and performance subtrees.

#### Simulation physics

Compiled Air start, route speed, fuel and installed-store quantity now drive
generic initial state, mass and endurance without mission-class or named-case
physics branches.
The Rust compiled-model-pack v2 identity validator is schema-only offline
publication/readback support; it changes no equation, numerical path, runtime
admission, or tick behavior.

- Consume sourced density/wind per entity/time and use one admitted DEM for
  AGL, below-terrain rejection and guided-vehicle impact.
- Stop TypeScript and Rust/WASM at the same first unavailable regional sample;
  legacy zero-plane/educational atmosphere behavior remains distinct and is
  used only when no regional runtime projection exists.

No pending family-specific entry.

#### Browser Worker protocol

The Worker independently recompiles and verifies Air mission/model/environment
identity before caching or executing a runtime adapter.
- Admit complete regional packs with four-pack cache bounds, 4,096-query limits,
  cooperative 128-sample cancellation chunks and same-Worker retry recovery.

No pending family-specific entry.

#### Vector simulation records

- Archive the complete regional pack/runtime projection and reject replay
  substitution by a later or superseding pack identity.

Saved-run record and admission tables now have separate domain-owned schema
modules without changing their persisted representation.
Air VSRs bind authored and compiled mission identities across scenario,
compiled, manifest and report members and revalidate them before replay.
The Rust compiled-model-pack v2 identity validator adds no VSR schema, member,
writer/reader, Worker, or replay behavior.

#### Capability descriptors

- Aircraft and weapon capability choices now consume the shared root-owned
  Select while preserving stale authored identities as unavailable. This is a
  presentation-only migration; deployment admission and catalog authority are
  unchanged.
- The deployment admits all four Air mission classes, three engagement overlays
  and four start postures while retaining explicit nonclaims for autonomous
  virtual-pilot policy behavior.

#### Mission scenarios

Air templates advance to `vector.scenario.v4` with one authored
`vector.air-mission.v1` and content-addressed `vector.compiled-air-mission.v1`.
All Air mission classes, overlays, flight plans, start postures, loadout/fuel,
recovery, Worker/server admission, and VSR/report lineage share that contract.
Migration `013_air_mission_contract.sql` freezes exact upgraded template JSON
and hashes; no production seed or fallback default performs the migration.
- Add exact `vector.installation-origin.v2` runway starts and fail-closed
  runway/DEM reconciliation within a declared 30 m model envelope.
- Validate ground-start tailwind from the sourced regional atmosphere plus
  authored modifiers sampled at the runway threshold and readiness time.

Scenario-template table declarations now live in `db/schema/scenarios.ts`
behind the unchanged aggregate schema export.

#### Scenario composition kernel

`vector.scenario-kernel.v1` now owns arbitrary affiliations, organization
structure, multi-domain entity identities, authored task graphs and six-surface
perspective projections. Owner-controlled content-addressed capability
descriptors replace scenario-authored descriptor authority. Canonical bytes,
iterative bounded graph admission, typed atomic mutation history, undo/redo,
request/draft/perspective stale-response guards, exact blank/template/import
intake, identity-only V1 migration and projection-only workspace discovery are
versioned and tested. An identity-only adapter closes exact task/entity and
capability references around #60's published authored/compiled Air mission
digests without copying mission fields or execution authority. #60 retains Air
compile/runtime authority; no database migration or new domain physics is
introduced.

### Added

- Governed North Punjab, Ladakh, Rajasthan, North East, Arabian Sea, and coastal
  Gujarat study-area selection backed by forward-only catalog data.
- An immutable catalog-credibility gate and a public NASA F-16 reference
  trajectory with TypeScript/Rust-WASM parity evidence and visible math-panel
  results.
- A non-root, multi-architecture production image release path with immutable
  GHCR tags, digest promotion, SBOM/provenance attestation, and Compose image
  verification.
- Versioned intended-use and credibility manifests, unit-bearing aircraft,
  weapon, sensor, propulsion, aerodynamic, loadout, and compatibility source
  schemas, plus deterministic immutable SI model-pack compilation shared by
  TypeScript and Rust.
- Scenario-local model patches with old/new values, SI units, reason,
  timestamp, author, evidence, and compiled-pack digest provenance.
- Forward-only persistence for intended uses, model-pack sources, compiled
  packs, and credibility manifests.
- Typed Rust engine states, structured admission errors, bounded WASM ABI v1,
  strict Rustfmt/Clippy/rustdoc gates, and native edge-condition coverage.
- Public repository governance, Apache-2.0 licensing, contributor guidance, security policy, CI, release automation, and guarded Cloudflare deployment workflow.
- Engineering principles for the open-source simulation-library boundary, SOLID design, twelve-factor operation, and release evidence.

### Changed

- Docker Compose now runs self-contained production, migration, and local-seed
  bundles from one `VECTOR_IMAGE`; database and telemetry values are supplied
  only at runtime and Docker Hub is not implied or configured.
- Scenario packages advance to `vector.scenario.v4` and saved runs now bind the
  intended-use identity and exact compiled model-pack digest. Unknown objects,
  missing coefficients, incompatible stores, and unsupported combinations fail
  closed instead of receiving generic fallback coefficients.
- Phone and tablet layouts now keep landing content, 3D replay controls,
  tactical labels, playback, and telemetry within the viewport. The responsive
  validation suite covers 320-pixel phones through 4K displays.
- Public landing copy now describes the user task directly: pick a scenario,
  change it, run it, and review the result.
- Rust release builds now retain overflow checks and publish explicit compute
  safety limits without changing valid scenario or replay contracts.
- Authoring and playback maps now package and load MapLibre's module worker
  from a verified same-origin production path.
- Product name standardized as Vector Engagement Labs.
- Codex Sites packaging and repository binding removed.
