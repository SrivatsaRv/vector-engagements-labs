# Changelog

All notable changes will be documented here. The project follows Semantic Versioning and uses Keep a Changelog categories.

## Unreleased

### Contract-family release notes

Each governed contract family records its own release impact below. A change to
one family must not imply changes to unrelated contracts.

#### Model packs

Model-pack persistence table declarations now live in the domain-owned
`db/schema/model-pack.ts` module behind the unchanged aggregate Drizzle facade.
Air flight assignments bind exact model-pack, aircraft and compatible
station/store identities; mission authoring does not duplicate model schemas.

#### Database schema

The aggregate `db/schema.ts` facade now re-exports domain-owned schema modules;
table names, columns, constraints, and prior migrations are unchanged.
Forward-only migration `013_air_mission_contract.sql` replaces exact v3 scenario
packages/hashes with canonical v4 packages and rejects mixed or residual rows.

#### Engine ABI

Engine scenarios carry an optional compiled Air mission lineage envelope. The
generic physics ABI is unchanged; Rust/WASM results reattach the verified
envelope for backend-independent VSR provenance.

#### Generic AAM verification

No pending family-specific entry.

#### Simulation physics

Compiled Air start, route speed, fuel and installed-store quantity now drive
generic initial state, mass and endurance without mission-class or named-case
physics branches.

#### Browser Worker protocol

The Worker independently recompiles and verifies Air mission/model/environment
identity before caching or executing a runtime adapter.

#### Vector simulation records

Saved-run record and admission tables now have separate domain-owned schema
modules without changing their persisted representation.
Air VSRs bind authored and compiled mission identities across scenario,
compiled, manifest and report members and revalidate them before replay.

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
