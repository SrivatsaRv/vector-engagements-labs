# Changelog

All notable changes will be documented here. The project follows Semantic Versioning and uses Keep a Changelog categories.

## Unreleased

### Contract-family release notes

Each governed contract family records its own release impact below. A change to
one family must not imply changes to unrelated contracts.

#### Model packs

- Bind the #190 high-energy crossing scenario to the unchanged current generic
  model-pack ID/version/digest and existing compatibility rules. No coefficient,
  source, credibility, intended-use, named-performance or pack schema changes.
- Bind the independent regional EnvironmentPack/runtime-grid digest beside the
  compiled model pack without changing named-system evidence authority.
- Add a content-addressed generic `MODEL_ASSUMPTION` ground-dynamics projection
  and exact `ADMITTED_GENERIC_EDUCATIONAL` runtime binding. This authorizes only
  bounded runway roll/rotation/climbout; no TP-1538 value, named-aircraft,
  landing/recovery, store-release, named propulsion or control-law claim is added.
- Bind generic airborne-transfer store mass/station/rule identity to the admitted
  model pack while preserving the authored `[0.001, 1] m²` installed-drag
  assumption and all named-fidelity nonclaims.
- Publish model-pack 0.9.0 with exact verification-only 25 m geometric
  closest-approach and 180 s maximum-flight-time termination authority. The
  intended-use advances to 1.1.0 to prohibit target damage, destruction or kill
  inference from geometric intercept.

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

- Add forward-only migration 017 for intended-use 1.1.0, model-pack 0.9.0,
  credibility 1.3.0 and new `1.1.0` versions of all nine exact scenario
  bindings while retaining every `1.0.0` row and freezing migrations 015 and
  016 by SHA-256.
- Add forward-only migration 016 for the exact governed high-energy
  Su-30MKI/F-16C crossing-challenge package. The migration is independently
  generated and verified, self-upserts the ninth immutable scenario, and reads
  back its complete identity/hash without modifying migration 015's eight-row
  historical snapshot.
- Add forward-only migration 015 to refresh immutable canonical v4 scenario
  packages/hashes after the ground-envelope v2 digest change. It self-upserts
  all eight rows before seed and reads back exact identity/schema/hash/environment
  values while ignoring unrelated rows; migration 014 remains byte-frozen and
  retains sole ownership of sourced runway and EnvironmentPack rows.
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
- Correct the documented production ABI inventory: the NASA generic-AAM symbol
  belongs only to the separately built verification Rust/WASM artifact.
- Register the value-free TP-1538 evaluator as another separately built
  verification artifact whose ABI and digest cannot enter production backend
  selection, `EngineScenario`, `EngineRun`, Worker, or VSR authority.
- Add `vector.aircraft-ground-operation.v2` and the
  `AIRCRAFT_OPERATIONAL_STATE_CHANGED` payload. TypeScript and direct Rust/WASM
  bind compact tick fields to the full Air mission, then preserve exact
  hold/roll/rotate/climbout/enroute transitions, fuel/mass/store histories and
  controller requested/accepted/achieved values through Worker and VSR replay.
- Add the independently sealed airborne-transfer projection and exact
  accepted/rejected event parity to the existing TypeScript/Rust ABI, retaining
  the optimized module below the explicit 575,000-byte ceiling.
- Add exact TypeScript/Rust `vector.weapon-termination-model.v1` admission,
  between-step closest approach, closed terminal states and canonical
  `WEAPON_TERMINATED` event parity. The optimized artifact is 556,589 bytes.
- Pin the Rust/WASM post-link size policy to Binaryen 131.0.0 with an explicit
  admitted feature set; bind that policy into the generated module identity and
  retain an explicit sub-575,000-byte browser artifact gate.
- Admit the exact-key `vector.aircraft-ground-operation.v1` safety artifact in
  both backends and validate its mission/start/release/runway lineage before
  holding movement unavailable.

No pending family-specific entry.

#### Generic AAM verification

- Bind offline admission to the exact raw NASA TM-109057 corpus bytes, correct
  the production-ABI documentation to preserve the separate verification-only
  Rust/WASM boundary, and close the named Apple M5 performance evidence
  contract over immutable workload identity, exact Git state, both backend
  distributions, memory and output size without mutable threshold overrides.
- Reject dirty or unidentified benchmark state before measurement, and require
  every measured TypeScript and Rust-WASM batch to reproduce the exact governed
  per-case semantic outcomes, 12,145-frame total and sorted batch digest before
  its timings can be admitted.
- Preserve all generic-AAM corpus, discrepancy, evaluator and performance
  authority while #178 establishes a distinct TP-1538 schema, ABI, artifact and
  result identity with no shared values or admission decisions.

#### TP-1538 verification tooling

- Admit the complete content-addressed NASA TP-1538 generic-F-16 aerodynamic
  corpus after two isolated 14,705-position transcriptions, deterministic
  comparison, and 1,311 page-grounded adjudications. Preserve all 13,587
  available, 37 printed-blank, one illegible, and 1,080 out-of-domain states.
- Add independent page/cell, interpolation, derivative and Appendix B assembly
  oracles; a frozen mixed 4,096-operation workload; full TypeScript/Rust-WASM
  semantic parity; bounded record readback; Worker replacement; production
  isolation; clean-repository performance evidence; and a generated WASM-size
  gate. The admitted subject remains `NASA_GENERIC_F16` with deployment class
  `ENGINE_VERIFICATION_ONLY` and provides no named F-16 runtime authority.
- Add the offline `vector.tp1538-adjudication-decisions.v1` create, source-read
  apply, exact-coverage validation and immutable freeze CLI. The finalizer now
  requires and embeds its digest-named, read-only artifact, content digest, and
  comparison raw/canonical binding so raw-distinct evidence chains cannot
  collapse to one corpus identity. Repository evidence uses only bounded
  `TEST_ONLY_SYNTHETIC` mismatches and admits no source value or corpus.

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
- Bind every admitted ground start to an exact versioned mission/runway/release
  artifact. A generic `MODEL_ASSUMPTION` projection now drives force-based
  runway roll, achieved rotation/liftoff and bounded climbout with one state
  transition per integer tick, exact fuel/mass/store continuity and explicit
  controller values. Taxi, braking, landing, recovery, ground-held store release
  and named-aircraft performance remain unavailable.
- Require both runtimes to bind both compact ground-operation copies to the
  authoritative compiled Air mission, and make Worker/VSR presentation select
  the actual held aircraft instead of dereferencing or materializing its stowed
  primary store.
- Add the #187 generic public-educational airborne transfer contract. Authored
  RELEASE/JETTISON requests bind exact launcher, station, store ordinal,
  integer tick, installed drag area, loadout/model evidence and one independent
  compiler-owned authority seal. TypeScript and direct Rust/WASM remove exactly
  one store mass and installed drag contribution, preserve fuel, inherit the
  launcher boundary position/velocity, and emit one VSR-owned requested /
  accepted / achieved outcome. This is not safe-separation, weapon-guidance,
  named-aircraft, named-store, carriage-performance, landing or recovery
  fidelity; TP-1538 supplies no value or runtime authority here. The exact
  installed-drag-area validity is the inclusive `[0.001, 1] m²` interval, and
  #187 owns a separate 25-second takeoff-plus-transfer performance workload so
  the governed #182 takeoff workload remains unchanged.
- Replace the released-weapon use of the legacy scenario distance allowance
  with engine-owned target-unavailable, geometric intercept, terrain failure,
  flight-time expiry and energy-miss precedence. A geometric intercept
  terminates the weapon but leaves the target active and records no target
  effect.

No pending family-specific entry.

#### Browser Worker protocol

The production-built Worker verifier now conducts the governed #190
high-energy crossing package and opens its transferred VSR to assert the
terminal `report.json`, `events.jsonl` and `frames.arrow` evidence, including a
terminated weapon, active target and `NOT_MODELLED` target effect. The Worker
protocol and deployment-selected backend remain unchanged.

The Worker independently recompiles and verifies Air mission/model/environment
identity before caching or executing a runtime adapter.
- Admit complete regional packs with four-pack cache bounds, 4,096-query limits,
  cooperative 128-sample cancellation chunks and same-Worker retry recovery.
- Re-admit the full authored/compiled/compact airborne-transfer lineage and
  return its exact canonical outcome through the real built Worker.

No pending family-specific entry.

#### Vector simulation records

- Reject malformed numeric types, non-finite values, range/integer violations
  and excess authored precision before saved-run recomputation, VSR creation or
  persistence. This reuses browser/Worker admission codes and field paths and
  does not change the VSR schema or replay authority.

- Archive the complete regional pack/runtime projection and reject replay
  substitution by a later or superseding pack identity.
- Add `vector.frames.columnar.v6` operational/movement value-state metadata for
  ground-held and admitted takeoff aircraft, exact controller values and
  lifecycle transition events while retaining read-only v5/v4 and v4/v3
  frame/picture compatibility. Replay rejects tampered or synthesized movement.
- Retain the exact airborne-transfer outcome and boundary frame so replay,
  map/3D, telemetry, timeline and report never reconstruct release physics.
- Retain one typed `WEAPON_TERMINATED` event for every engine-owned weapon
  terminal outcome, including the cumulative admitted-lifetime closest
  approach, exact terminal-state/cause to run-outcome binding and explicit
  `NOT_MODELLED` target effect.

Saved-run record and admission tables now have separate domain-owned schema
modules without changing their persisted representation.
Air VSRs bind authored and compiled mission identities across scenario,
compiled, manifest and report members and revalidate them before replay.
The Rust compiled-model-pack v2 identity validator adds no VSR schema, member,
writer/reader, Worker, or replay behavior.

#### Capability descriptors

- Give live authoring controls stable semantic IDs and block Run while an
  editable numeric control contains raw text that has not passed syntax, range,
  integer and precision admission. Repeat structured type/range/precision,
  whole-mission relational, server and final-engine admission; ordinary
  authored scalars have a three-fractional-digit ceiling. This does not broaden
  deployment capability.
- Advance the deployment-admitted model-pack digest to 0.9.0 so the compiled
  verification-only termination projection is available to the engine. This
  adds no editable fuze, damage, kill or named-effectiveness capability.
- Aircraft and weapon capability choices now consume the shared root-owned
  Select while preserving stale authored identities as unavailable. This is a
  presentation-only migration; deployment admission and catalog authority are
  unchanged.
- The deployment admits all four Air mission classes, three engagement overlays
  and four start postures while retaining explicit nonclaims for autonomous
  virtual-pilot policy behavior.

#### Mission scenarios

- Add `vector.scenario-control-authority.v1` as the content-addressed migration
  inventory for all 40 legacy Scenario fields. Strict raw admission covers the
  current editable Air-mission numeric controls, and shared structured
  admission returns the same stable code/path from frontend, saved-run server
  and final engine preparation. The Air-mission compiler enforces the same
  scalar precision ceiling in the production Worker without creating a
  parallel canonical scenario schema; digest/runtime-contrast completion
  remains open under #193.
- Add the immutable `a2a-high-energy-crossing-challenge@1.0.0` package with
  explicit 44 km/105-degree geometry, airborne state, fuel, loadout, route,
  environment and generic-model nonclaims. TypeScript, Rust/WASM and the built
  browser Worker reach an engine-owned 21.836104 m geometric intercept at
  131.9 s inside the compiled 25 m verification radius, while an otherwise-
  identical 46 km control reaches the 140 s time limit at 530.164926 m.

Air templates advance to `vector.scenario.v4` with one authored
`vector.air-mission.v1` and content-addressed `vector.compiled-air-mission.v1`.
All Air mission classes, overlays, flight plans, start postures, loadout/fuel,
recovery, Worker/server admission, and VSR/report lineage share that contract.
Ground starts additionally compile an exact mission/runway/release safety
artifact plus a content-addressed generic educational ground-dynamics
projection. The runtime can execute only governed runway roll, rotation,
liftoff and climbout through `ENROUTE`; it does not claim taxi, braking,
approach, landing, recovery, named performance or TP-1538 authority.
Migration `013_air_mission_contract.sql` freezes exact upgraded template JSON
and hashes; no production seed or fallback default performs the migration.
- Add exact `vector.installation-origin.v2` runway starts and fail-closed
  runway/DEM reconciliation within a declared 30 m model envelope.
- Validate ground-start tailwind from the sourced regional atmosphere plus
  authored modifiers sampled at the runway threshold and readiness time.
- Add optional authored RELEASE/JETTISON requests with exact integer tick,
  store identity, operation, installed-drag validity, authority seal and
  requested/accepted/achieved runtime outcome.
- Preserve the historical compiled-mission v1 digest when no transfer plan is
  authored, and prevent rejected governed transfers from falling through to a
  legacy launch marker.

Scenario-template table declarations now live in `db/schema/scenarios.ts`
behind the unchanged aggregate schema export.

#### Scenario composition kernel

The kernel adapter now exact-key validates the generic ground-dynamics
projection and rejects unsupported authority or resealed compact promotion. It
continues to own identity/admission only and does not execute takeoff physics.
- Extend that identity/admission boundary to the ordered airborne-store
  transfer projection: exact authored request lineage, validity keys, per-item
  digests and the aggregate authority seal must all agree before execution;
  acceptance and achieved transfer state remain runtime-owned.

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
