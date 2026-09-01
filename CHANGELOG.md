# Changelog

All notable changes will be documented here. The project follows Semantic Versioning and uses Keep a Changelog categories.

## Unreleased

### Contract-family release notes

Each governed contract family records its own release impact below. A change to
one family must not imply changes to unrelated contracts.

#### Model packs

- Database verification for migration 019 now distinguishes the additional
  retired BVR scenario version from the unchanged compiled model-pack,
  intended-use, credibility, loadout, and named-performance authorities.

- Keep the compiled generic aircraft, weapon, credibility and target-effect
  model-pack contracts byte-identical while three new scenario-package versions
  bind those existing identities. Authored tactic names and route profiles do
  not promote named-aircraft or named-weapon evidence.
- Add a separate content-addressed generic target-effect authority with exact
  weapon/target/model-pack bindings, deterministic `MODEL_ASSUMPTION` threshold
  bands, closed effect results, explicit target domain and named-effectiveness
  nonclaims. Missing exact bindings fail closed as `EFFECT_UNAVAILABLE`.

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
- Authenticate complete engine-verification packs independently inside the raw
  Rust/WASM run boundary and reject malformed termination patches before their
  values can affect execution.
- Require TypeScript and raw Rust/WASM to reject the same digest-valid supplied
  packs when their compiled-v1 key inventory, intended-use identities or weapon
  identities are malformed.
- Bind the complete ordered runtime observer-sensor projection back to its
  authenticated compiled pack, reject duplicate evidence identities and keep
  source/validation evidence roles disjoint at the direct Rust/WASM boundary.
- Require supplied verification packs and no-release record recompilation to
  retain the compiler-owned exact coordinate conventions and to qualify every
  positive named-aircraft performance admission through the separate governed
  evidence registry; a resealed pack cannot promote unsupported performance
  with arbitrary in-pack artifacts or an alternate frame.
- Validate every compiled weapon field and physical domain before a supplied
  verification pack can authorize execution or no-release Air-record
  recompilation; a resealed string-valued launch mass now fails identically at
  the TypeScript and raw Rust/WASM boundaries.
- Validate the complete compiled aircraft shape and physical domains before an
  unretained pack can authorize Air-mission recompilation, and enforce semantic
  weapon versions at both TypeScript and direct Rust/WASM boundaries.
- Validate complete compiled loadout stations and compatibility relations before
  supplied-pack Air-mission recompilation, including exact shapes, integer
  capacities, bounded references, platform/station linkage and in-pack evidence.
  Loadout validity must cover the owning aircraft through the canonical compiler
  predicate, while unused stations may retain an empty compatible-store list.
- Require complete, uniquely identified supplied evidence records with closed
  kinds, absolute URIs, valid access dates and valid optional locators/digests;
  a canonical pack digest no longer authenticates an `{ id }` placeholder.
- Require every aircraft's referenced aerodynamic model/tables, propulsion
  model/thrust/fuel tables, sensors and loadout to cover the aircraft's complete
  validity domain before either backend or no-release Air-record recompilation.
- Reject supplied aircraft authority whose referenced aerodynamic model has no
  coefficient tables, including no-release Air records that skip engine replay.
- Admit every supplied aerodynamic, propulsion, sensor and coefficient-table
  record through its complete compiled-v1 structure before use. Exact fields,
  SI axis/output units, finite monotonic coordinates, tensor cardinality,
  finite values and evidence links now fail closed even under a valid resealed
  content digest and on no-release VSR readback.
- Enforce the canonical positive-sensor evidence boundary on supplied packs:
  admitted source and independent-validation references retain their required
  roles and immutable lowercase SHA-256 artifact digests after resealing. The
  raw Rust/WASM request envelope now repeats the complete admission schema,
  exact coverage inventory, `VALIDATED` coverage states and sensor-provenance
  binding, with direct ABI falsifiers proving the TypeScript wrapper is not the
  only enforcement point.
- Keep deterministic terminal-record replay and uploaded-record verification
  inside the dedicated browser simulation Worker; the rendering thread receives
  only an already-admitted playback result.

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

- Add forward-only migration 019 for BVR `1.3.0`, preserving and retiring the
  exact BVR `1.2.0` row while leaving the current WVR and transition packages at
  `1.2.0`; migration 018 is checksum-frozen and never rewritten.
- Add forward-only migration 018 for the exact three Air-combat `1.2.0`
  packages, retaining their immutable superseded `1.1.0` rows as `RETIRED` and
  rejecting a conflicting pre-existing package identity on exact readback.
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

- Carry the scenario-owned run duration and governed scenario-package reference
  through the existing prepared-runtime envelope without adding an exported
  Rust/WASM symbol, changing the numerical ABI, or raising the production WASM
  size and memory ceilings.
- Extend both production backends with optional strict target-effect authority,
  canonical six-decimal effect inputs, identical commit/event/lifecycle output
  and legacy no-authority behavior. No renderer or caller-authored proximity
  value can enter the ABI as an effect result.
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
  the optimized module below the explicit 585,000-byte ceiling.
- Add exact TypeScript/Rust `vector.weapon-termination-model.v1` admission,
  between-step closest approach, closed terminal states and canonical
  `WEAPON_TERMINATED` event parity. Source discriminators are mandatory,
  pre-launch geometry is excluded, off-grid lifetime begins at achieved world
  entry, replay recomputes exact expiry authority, and the optimized artifact
  is 556,940 bytes.
- Rebind the immutable model-pack foundation performance workload to the
  compiler-produced anonymous-pack identity after termination authority became
  mandatory, preserving fail-closed benchmark admission.
- Pin the Rust/WASM post-link size policy to Binaryen 131.0.0 with an explicit
  admitted feature set; bind that policy into the generated module identity and
  retain an explicit sub-585,000-byte browser artifact gate.
- Admit the exact-key `vector.aircraft-ground-operation.v1` safety artifact in
  both backends and validate its mission/start/release/runway lineage before
  holding movement unavailable.

No pending family-specific entry.

#### Generic target effect

- Bind the BVR `1.3.0` package to a reproducible generic `KILL` at 36.000 s and
  a release-time-only `NO_EFFECT` control at 1.950 s. Both aircraft transition
  through authored turn legs; the result does not claim autonomous defence,
  Red weapon employment, or named-system effectiveness.
- Bind the three 1.2.0 Air-combat studies to the retained generic effect
  authority and prove the WVR `KILL` against a release-time-only non-kill
  control. Update selector, map, report, replay and legacy `NOT_MODELLED`
  regressions to require coherent event, frame and lifecycle state rather than
  pre-#197 frame numbers or historical closest-approach constants.
- Enforce the target-effect projection as persistent causal state: it is absent
  before the exact commit frame, present only on the committed target from that
  frame onward, and forbidden without a causal event. Align Rust/WASM with the
  TypeScript six-decimal binary64 tie rule through one shared signed-boundary
  oracle so effect class and content-addressed commit identity cannot diverge.
- Require VSR replay to resolve the exact retained target-effect authority, and
  require presentation to reproduce the stored evaluation from its retained
  binding, causal termination and exact target frames before it can authorize
  effect wording. Jointly resealed authority archives, stale commits and
  internally valid invented thresholds now fail closed.
- Correct the Browser Contract admission inventory for governed target-effect
  presentation: the exact causal-frame proof runs without skips across all five
  responsive viewports. The fail-closed runner now requires the complete twelve-
  case inventory on each viewport, 60/60 expected results, rather than retaining
  the previous four-case project manifest.
- Add the separately governed generic target-effect authority, deterministic
  commit, once-only target lifecycle transition, canonical event/frame/VSR v7
  identity and exact-frame Map/3D/telemetry/report presentation. Rebaseline the
  production engine module to a strict sub-620,000-byte ceiling only after
  compressed artifact, built Worker, interleaved Chromium initialization,
  memory, latency and complete TypeScript/Rust parity evidence pass.
- Register the generic threshold/profile values as release-blocking STUB-28
  assumptions while separately classifying fail-closed validation text and
  non-causal display-label defaults; no scanner suppression or named-system
  effect claim is admitted.

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

- Consume a committed weapon-termination receipt and same-frame target state in
  one deterministic generic target-effect evaluator. Emit one causal
  `TARGET_EFFECT_COMMITTED` event and let it own any exactly-once target
  lifecycle transition; geometric intercept alone remains `NOT_MODELLED`.
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
- Require direct Rust/WASM callers to bind every entity termination model to
  the authenticated runtime-pack projection; an empty projection can no longer
  admit arbitrary radius or lifetime values.
- Execute the three #197 BVR, WVR and transition packages through one generic
  authored-route, duration, release and target-effect path with no actor,
  scenario or presentation-name branch. Each intended effect now has a nearby
  one-field release-time control with a different canonical result.
- Publish the installed-drag event scalar as the same non-negative six-decimal
  SI value in TypeScript and Rust/WASM while retaining full `f64` force and
  trajectory precision inside both integrators.

No pending family-specific entry.

#### Browser Worker protocol

- Expand the unchanged built-Worker protocol gate to BVR `1.3.0`, WVR and
  transition plus BVR/WVR release-only controls; regenerate and independently
  reopen the five exact #207 records without changing message shapes.
The prepared request now binds the optional governed scenario-package
ID/version/content hash and scenario-owned run duration before execution. The
message inventory and transfer protocol are unchanged; Worker admission rejects
a divergent reference before ticks and the built verification opens the same
reference from the resulting VSR.

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
- Add a verification-owned Chromium/laptop regression policy for all three
  exact #197 studies. It binds Worker load/run timing to canonical 3D effect
  selection, live playback cadence, Long Task observations, retained VSR bytes,
  and garbage-collected heap without making a production-capacity or
  named-platform performance claim.

No pending family-specific entry.

#### Vector simulation records

- Retain a new #207 evidence inventory for the three current studies and two
  matched controls while preserving #197 as immutable historical evidence.
  Exact package mismatch continues to fail without replacing the prior verified
  record state.
- Bind the exact governed scenario package ID, version and content hash across
  browser runtime and VSR compiled/manifest/report artifacts, with malformed and
  divergent-reference rejection and legacy read compatibility.
- Require the frozen report's exact eight-field result projection, including
  governed reason text, to equal the reconstructed canonical result and bind
  its report-facing engine projection to deterministic replay where replay is
  already required. Coherently resealed false kill/no-effect language,
  missing/additional result fields and coordinated peak-demand rewrites now fail
  open-record admission.
- Add frame schema v7 target-effect projection plus manifest/report authority,
  event, frame, commit, result and lifecycle binding. VSR open rejects mutation
  or causal disagreement without rerunning the effect, while the frozen v6
  pre-effect record remains byte-compatible and readable.
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
  approach, exact event-distance to frozen-report binding, exact
  terminal-state/cause to run-outcome binding and explicit `NOT_MODELLED`
  target effect. Miss, expiry and failure reports retain their exact causal
  result reason instead of falling through to a time-limit explanation. Expiry
  occurrence time is bound to achieved launch plus admitted maximum lifetime,
  and boundary-only miss, terrain and target-unavailable causes are bound to
  their exact terminal event time, so hash-resealed timestamp substitutions
  fail replay.
- Advance the weapon-termination payload to v2 with the exact retained
  closest-approach witness pair. VSR admission replays termination-capable
  records through their recorded deterministic backend, so deleting the real
  lifetime minimum and substituting another retained pair fails closed.
- Bind VSR `time_limit` claims to the declared scenario terminal tick, rejecting
  hash-resealed terminal archives truncated to an earlier nonterminal pair.
- Bind direct Rust/WASM termination projections to the exact compiler-owned
  retained pack identity, model ordering and admitted scenario patches. A
  caller cannot promote jointly resealed entity, compact-pack and runtime-digest
  copies into termination authority.
- Force-retain the final fixed-step predecessor for every launched
  termination-capable run. Replay rejects a nonterminal claim when that exact
  pair is missing, preventing a hash-resealed record from deleting the boundary
  that proves a geometric intercept or another terminal cause.
- Deterministically rerun every termination-capable VSR, including records that
  claim no terminal event. A hash-resealed intercept cannot delete its terminal
  events, append duplicated earlier active frames at the nominal duration and
  manufacture a `time_limit` result.
- Bind the report's primary weapon and target identities to that deterministic
  replay for truthful nonterminal runs, rejecting a resealed report that
  substitutes an unlaunched carried store for the released weapon.
- Reuse an authenticated supplied engine-verification pack when recompiling an
  archived Air mission, so an exact unretained verification record can complete
  readback without falling through to the product retained-pack inventory.
- Authenticate that supplied pack through the complete compiled-v1 structure,
  canonical digest and engine-verification intended-use boundary even when a
  ground-start Air record has no executable guided release and skips engine
  rerun before mission recompilation.
- Route supplied-pack evidence completeness and aircraft dependency-domain
  coverage through the same Worker `open-record` authority boundary, including
  no-release Air records that legitimately skip deterministic engine replay.
- Validate the closed ground-dynamics validity fields semantically so canonical
  archive key ordering cannot reject an otherwise exact release replay.
- Keep an explicit unpowered `JETTISON` outside guided-weapon terminal
  authority in TypeScript, Rust/WASM and VSR replay; its governed store-transfer
  event remains replayable without a fabricated weapon-termination event.

Saved-run record and admission tables now have separate domain-owned schema
modules without changing their persisted representation.
Air VSRs bind authored and compiled mission identities across scenario,
compiled, manifest and report members and revalidate them before replay.
The Rust compiled-model-pack v2 identity validator adds no VSR schema, member,
writer/reader, Worker, or replay behavior.

#### Capability descriptors

- Project run information availability from both deployment policy and the
  exact compiled model pack. Missing sensors, data link, EW, or virtual-pilot
  authority now remains visibly unavailable even if a deployment switch is on;
  non-causal visibility and humidity values are removed from the authoring
  atmosphere card.
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

- Publish governed BVR `1.3.0` with Blue offset/recommit and Red authored
  defensive-turn geometry, a 2.000 s generic release, a canonical 36.000 s
  `KILL`, and a one-field 1.950 s `NO_EFFECT` control. Red retains both AIM-120
  stores and has no autonomous response or launch capability.
- Publish governed `1.2.0` BVR offset/support, WVR one-circle/defensive-break,
  and beam/drag/extend/recommit Su-30MKI/F-16 study packages with exact
  four-point routes, explicit release times and scenario-owned run durations.
- Add canonical 3D callsign/designation/altitude labels, declared routes and
  active-leg overlays, plus a report debrief derived from recorded route,
  transfer, termination and target-effect facts. KILL language remains limited
  to the generic admitted authority and explicitly excludes autonomous-pilot or
  named-system performance claims.
- Compile the separately content-addressed target-effect authority into current
  Air scenarios by exact weapon/target model-pack binding. The authority is not
  editable mission intent, and its absence retains historical `NOT_MODELLED`.
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

- Corrected the Observe and saved-report presentation contract: all governed basemap modes now use the versioned key-free OpenStreetMap authority, launch annotations retire after four model seconds, compact telemetry no longer duplicates detailed target-effect prose, short-wide maps restore bounded tactical-label scale, and saved reports lead with semantic run/route tables plus screen disclosures that expand for print.

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
