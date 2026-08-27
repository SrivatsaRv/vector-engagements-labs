# Executable model-pack and credibility contract

Status: v1 runtime foundation plus non-promotable governed-aircraft Stage B,
schema family v2, 2026-08-25.

This contract makes VECTOR object data executable without claiming that the
current scalar assumptions are a flight model. It is the shared boundary for
aircraft dynamics, guided-weapon fly-out, sensing, scenario authoring,
recording, reports, and both engine backends.

## Artifact boundaries

Weapon-termination authority is a model-pack component compiled into each
runtime store; it is not scenario presentation state, renderer state or an
environment value. Its content participates in the immutable pack digest.

The object/model pack and EnvironmentPack remain separate immutable artifacts.
The compiler binds both digests; neither may absorb or silently override the
other's source authority.

Persistence declarations for intended use, source packs, credibility, and
compiled packs are isolated in `db/schema/model-pack.ts`; `db/schema.ts`
remains the single aggregate Drizzle export.

The following artifacts have different owners and must not be collapsed:

| Artifact | Identity | Mutable | Responsibility |
| --- | --- | --- | --- |
| Intended-use requirement profile | `(id, version, digest)` | no after publication | Closed data families, selectors, applicability, evidence roles, and computed completeness |
| Raw source artifact | `(id, version)` plus exact byte digest | no | Subject/configuration, locator/retrieval, rights/export state, eligibility and nonclaims; bytes stay in research storage |
| Lawful derivative | `(id, version)` plus ordered input/output digests | no | Reproducible recipe/tool/environment, transforms, uncertainty propagation, and normalized bytes |
| Catalog identity | `catalogObjectId` | only by a new catalog revision | Human-facing object identity, designation, source assertions, and public facts |
| Model-pack source | `(id, version)` plus source hash | no after publication | Human-readable quantities with units, evidence, component references, domains, and limitations |
| Compiled model pack | `(id, version, digest)` | no | Resolved indexes and SI-normalized numeric arrays used to construct runtime inputs |
| Scenario instance | stable scenario entity ID plus pack digest and model ID | editable only as a new draft revision | Selected object, configuration, loadout, and explicit scenario-local patches |
| Runtime state | scenario instance ID | yes, engine-owned | Lifecycle, position, velocity, mass, fuel, and other advancing state |

Presentation labels, icons, meshes, map state, and camera state do not belong in
physical model definitions. A runtime state never becomes catalog authority.
The Air mission's authored station/rule IDs and ground-envelope digest are
scenario bindings; the resolved capacity and `MODEL_ASSUMPTION` envelope are
compiled artifacts. Neither may be replaced by presentation or import labels.

## Versioned schemas

`vector.compiled-aircraft-ground-envelope.v2` nests the exact-key
`vector.compiled-aircraft-ground-dynamics.v1` projection. The projection seals
SI mass, fuel, rolling resistance, rotation/liftoff, lift, climb, wind and
enroute-transition values with validity, value state, evidence, limitations and
a content digest.

Air mission authoring adds `vector.air-mission.v1`, `vector.flight-plan.v1`,
`vector.loadout-plan.v1`, and `vector.compiled-air-mission.v1` as mission-owned
adapters. They reference this model pack by exact digest; they do not redefine
aircraft, weapon, station, or coefficient schemas.

The mission adapter also emits
`vector.compiled-aircraft-ground-envelope.v2` from one content-addressed
resolver bound to the pack digest, aircraft model ID, assumption evidence, and
limitations. The authored mission retains only
`vector.aircraft-ground-envelope-binding.v1` identity/digest fields. Imported
runway minima, surface lists, tailwind limits, or self-labelled
`SOURCED`/`CALIBRATED` values are not executable authority. This remains the
explicit `MODEL_ASSUMPTION` allowed by STUB-24. Its nested
`vector.compiled-aircraft-ground-dynamics.v1` closes SI inputs for generic
rolling resistance, rotation/liftoff speed, lift, climb speed/gradient, mass,
fuel and crosswind and is content-addressed independently. It authorizes only
the versioned `PUBLIC_EDUCATIONAL` runway-roll/rotation/climbout validity and
declares the 50 m relative-height `ENROUTE` boundary as an SI input rather than
a hidden phase timer. It authorizes only the issue #182 educational mechanism until #64 replaces it with governed
aircraft ground-performance evidence. Issue #61 separately replaces
the runway geometry/provenance boundary with a sourced immutable catalogue.
Engine scenarios now additionally carry `vector.environment-runtime-grid.v1`;
this does not change model-pack schemas or authorize environmental values as
named-platform evidence.

Ground-start scenarios carry `vector.aircraft-ground-operation.v2`. The flat
tick projection binds the compiled mission, runway evidence, exact ground
dynamics digest, mass/fuel limits, force/rotation/liftoff/climb inputs and
sourced runway geometry. TypeScript and direct Rust/WASM independently bind it
to the full compiled Air mission before execution. Missing/unknown fields,
stale or caller-recomputed compact digests, physical invalidity and authority
mismatch reject; no hidden fallback to the scalar envelope exists.

The schema-module split changes ownership granularity only. Existing table,
column, constraint, and JSON payload contracts are unchanged.

| Constant | Value | TypeScript owner |
| --- | --- | --- |
| source | `vector.model-pack-source.v1` | `ModelPackSource` |
| compiled pack | `vector.compiled-model-pack.v1` | `CompiledModelPack` |
| governed aircraft requirements | `vector.model-pack-requirement-profile.v1` | `ModelPackRequirementProfile` |
| governed raw artifact | `vector.aircraft-raw-source-artifact.v1` | `AircraftRawSourceArtifact` |
| governed derivative | `vector.aircraft-derivative.v1` | `AircraftDerivativeRecord` |
| governed source | `vector.model-pack-source.v2` | `ModelPackSourceV2` |
| governed compiled pack | `vector.compiled-model-pack.v2` | `CompiledModelPackV2` |
| governed research export | `vector.governed-model-pack-export.v1` | `GovernedModelPackResearchExport` |
| compiled-only export | `vector.compiled-model-pack-export.v1` | `CompiledModelPackExport` |
| intended use | `vector.intended-use.v1` | `IntendedUseContract` |
| credibility | `vector.credibility-manifest.v1` | `CredibilityManifest` |
| scenario patch | `vector.model-patch.v1` | `ScenarioModelPatch` |
| scenario package | `vector.scenario.v4` | `ScenarioDefinition` / `StoredScenarioPackage` |
| scenario draft | `vector.scenario-draft.v1` | `ScenarioDraft` |
| weapon termination model | `vector.weapon-termination-model.v1` | `WeaponTerminationModelSource` / `CompiledWeaponTerminationModel` |

The source of truth is [`lib/model-pack.ts`](../lib/model-pack.ts). Rust consumes
the same compiled JSON contract in
[`engine-rust/src/model_pack.rs`](../engine-rust/src/model_pack.rs). The committed
cross-language fixture is
[`fixtures/model-packs/vector-scalar-study-v0.9.compiled.json`](../fixtures/model-packs/vector-scalar-study-v0.9.compiled.json).

The v2 contracts extend this family for generic aircraft onboarding. V1 remains
digest-verifiable and readable for its existing declared uses, but it cannot be
promoted through the v2 onboarding boundary because it lacks closed requirement,
raw-byte, derivative, and field-lineage semantics. Stage-B v2 packs are likewise
foundation-only: deployment resolution rejects until #154 and the later
Worker/runtime/VSR admission stages land. See the normative
[`aircraft onboarding guide`](aircraft-model-pack-onboarding.md).

## Source definition

`WeaponTerminationModelSource` requires an explicit schema, intended use,
criterion, positive SI radius and positive SI maximum flight time. The current
25 m/180 s values are model assumptions and carry no named-system source claim.
Any executable runtime projection resolved to a compiled pack containing this
authority must carry the exact v3 runtime-projection digest. Omitting the digest
does not select a legacy mode; TypeScript, Rust/WASM and VSR admission reject
before integration or replay.

ETOPO, NASA POWER and OurAirports citations belong to the EnvironmentPack
source manifest. They are not aircraft, weapon, sensor or performance sources.

The immutable source-definition row remains represented by
`modelPackSources`; only its TypeScript declaration moved to the domain module.

One `ModelPackSource` contains:

- coordinate conventions;
- intended-use contracts;
- evidence references;
- catalog-to-model identity mappings;
- aerodynamic, propulsion, sensor, aircraft, weapon, and loadout definitions;
- explicit platform/store/station compatibility rules;
- one credibility-manifest source.

The current source declares a maximum quantity of two on each teaching station
and its matching supported compatibility rule because every canonical template
already authors two stores. Any future quantity change is a source-model change
that regenerates the compiled digest; it is not inferred from scenario demand.

`ModelPackSourceV2` preserves that executable source projection and adds one
strict `governance` member containing the intended-use requirement profile,
raw-source artifact metadata, lawful derivative records, and per-field lineage.
The compiler enumerates every executable scalar and categorical authority,
including sensor kind, weapon seeker/support/launch state, every table axis/cell,
station group/capacity/store membership, and compatibility status/capacity.
Stable component-relative selectors bind each value and every owning
configuration to an exact value digest, component, evidence role,
raw and derivative digest, URI and record locator, unit, frame, datum,
uncertainty, and validity. The derivative ancestry and transformation selector
must preserve the same subject, configuration, unit, frame, and datum;
the selector must resolve inside the component/data-family authority rather
than naming a conceptual, missing, object, or array value. Transformation
selectors are unique within a derivative.
`REFERENCE_ONLY` or `INELIGIBLE` evidence cannot satisfy executable coverage.
When both roles are required, validation must use raw and derivative identities
independent from source evidence.
`UNKNOWN`, `UNAVAILABLE`, `ASSUMPTION`, `REFERENCE_ONLY`, `UNSUPPORTED`, and
`NOT_APPLICABLE` require a gap reason and cannot carry executable lineage. Zero
never represents missing data.

Every physical quantity is `{ value, unit, evidenceRefIds }`. Supported source
units are deliberately closed: dimensionless, kg/g, m/km/ft, m²/cm², s/ms,
N/kN, m/s or km/h, rad/deg, g0, and kg/(N·s). Unsupported or absent units are a
compile error. Coefficient tables declare output units, ordered axes, axis
units, evidence, and their own validity domain. The product of all axis lengths
must equal the flattened value length; axes must be finite and strictly
increasing.

Stable model, station, store, rule, and table IDs are structural references and
are already bound once by canonical source identity; scalar lineage does not
duplicate those IDs as values. Set-like compatible-store membership is different:
each member is executable permission and therefore has its own stable ID-token
selector and lineage.

Every model and table carries a non-empty validity domain:

- altitude;
- Mach;
- angle of attack;
- load factor;
- named configurations;
- named environments.

The current pack uses WGS84, local east/north/up, body and aerodynamic
X-forward/Y-right/Z-down axes, radians, metres, metres per second, and mean sea
level as the declared vertical reference. A future model may select ellipsoid
height only by publishing a new pack and resolving the scenario conversion
before simulation.

### Positive sensor evidence admission

A `DECLARED_ENVELOPE` is presentation-only and cannot enter the observer
runtime. A positive `RADAR`, `INFRARED`, or `VISUAL` sensor must instead carry
`vector.sensor-evidence-admission.v1`. It separates immutable `SOURCE` and
independent `VALIDATION` artifacts, each with a SHA-256 digest, and requires
the source model to name both artifacts in its normal provenance list.

The admission also marks detection range, minimum range, scan period,
azimuth/elevation field of view, measurement uncertainty, and target
applicability as `VALIDATED` or `UNKNOWN`. Compilation rejects a positive
sensor unless every one is `VALIDATED`; a numeric zero is not an “unknown”
minimum range. This contract does not add a positive sensor to the deployed
pack or make a track. It prevents incomplete public research evidence from
becoming a generic radar by accident.

### Generic track verification pack

`vector.intended-use.engine-verification` is a separate non-production intended
use for bounded engine tests. A source-authored sensor may attach
`vector.generic-track-model.v1` only under that intended use and only with
`TEST_FIXTURE / ENGINE_VERIFICATION_ONLY` state. The model freezes position and
velocity bias, diagonal standard deviation, confirmation count, maximum source
age, coast/loss thresholds, and deterministic observation windows. It is
compiled and content-addressed through the same model-pack path as every other
model; it is not an entity-level test mutation or a weapon/sensor-name heuristic.

The engine scenario also binds a SHA-256 digest over the compact runtime
model-pack projection. `vector.runtime-model-pack-digest.v2` hashes a closed,
ordered binary projection: length-prefixed UTF-8 strings, fixed-width unsigned
integers, and exact big-endian IEEE-754 bits. TypeScript and Rust recompute the
same bytes before constructing runtime state. A changed projection, missing
digest, wrong intended use, or unknown field fails admission. The production
deployment manifest does not admit this pack, so the browser Worker rejects it.
This contract proves generic
TrackStore mechanics only; no named aircraft sensor is thereby available.

## Compilation and digest

Compilation exact-key validates the termination source and includes its frozen
projection in the compiled-pack digest. Changing radius, time, criterion or
intended use necessarily creates a different immutable pack identity.

Compilation verifies model-pack and environment-pack digests independently,
then freezes their exact runtime projections without mutable catalog lookups.

`compileModelPack(source)` performs all work before the engine starts:

1. validates versions, stable IDs, evidence, units, ranges, table dimensions,
   physical-domain constraints, and limitation references;
2. detects missing references and dependency cycles;
3. resolves component, loadout, store, and sensor references to array indexes;
4. validates compatibility rules against station groups and capacity;
5. converts all quantities and table axes to SI numeric values;
6. builds the immutable compiled payload;
7. computes the SHA-256 content digest;
8. binds the credibility manifest to that exact digest; and
9. recursively freezes the returned bundle.

Air mission compilation then invokes the same
`validateScenarioModelInstance` authority for its exact aircraft model,
station, store model, quantity, and pack digest. The separately exported ground
envelope resolver hashes only governed `MODEL_ASSUMPTION` values plus the
compiled aircraft evidence/limitation identity; it does not parse authored
performance values.

`compileGovernedModelPack(input)` is the v2 Stage-B compiler. Before invoking
the unchanged v1 SI projection it enforces exact v2 keys, immutable byte hashes,
subject/configuration/locator equality, ordered derivative ancestry, recipe and
tool identity, explicit units/frames/datums/uncertainty/validity, eligibility,
and admission bounds. It reruns the one pinned offline derivative recipe and
requires byte-exact output. It canonicalizes model registries, governance arrays
and nested sets whose order has no authored meaning while retaining ordered
table dimensions, derivative inputs, recipe arguments and coefficient values.
The result binds requirement-profile, source, lineage, legacy SI
projection, and final compiled digests. A raw-byte change rejects against the
old chain and changes every downstream identity after a lawful rebuild.

Before source serialization or governed-field materialization, one bounded
table preflight checks 1..6 axes, positive axis cardinalities, safe-integer axis
products, exact flattened-value cardinality, and the cumulative 2,000,000-cell
limit. Shape failures use `[MODEL_PACK_TABLE_SHAPE]` with the exact table path;
cumulative capacity failures use `[MODEL_PACK_TABLE_BOUNDS]`. The preflight
reads array lengths only, so an oversized or overflow-shaped table cannot force
millions of lineage objects or requirement matches before rejection.

The digest excludes only the outer `digest` member. Object keys use Unicode
code-point order. Semantically ordered arrays retain authored order; registry
and set-like arrays are ordered canonically before compilation. To avoid JavaScript/Rust
floating-point formatting differences, numbers are hashed as normalized
scientific strings with 12 digits after the decimal point and a normalized
exponent. The compiled payload still contains numbers, not strings. Changing a
governed value at that precision changes the digest. TypeScript
`validateCompiledModelPackV2` and Rust
`validate_compiled_model_pack_v2_json` enforce exact keys, the v1 projection,
closed completeness/admission identity and the same final digest. The Rust
function is schema/identity parity inside the WASM-capable core, not independent
physical validation or runtime admission.

Compiled component references are zero-based indexes into the corresponding
pack array. An index outside the array is invalid. The compiler and Rust loader
validate indexes before runtime construction. Tick code receives resolved
numbers and indexes; it does not parse units, traverse source JSON, or query a
database.

## Intended use and credibility

The #190 crossing package remains bound to
`vector.intended-use.geometry-teaching@1.1.0`, the current generic model pack,
and `MODEL_ASSUMPTION` scenario provenance. Familiar platform/weapon labels do
not raise its credibility or admit named performance.

Every Air mission declares `PUBLIC_EDUCATIONAL`, explicit assumptions and
validity limits. A mission/task label cannot promote context evidence or a
named-aircraft association into executable performance authority.
Both artifacts remain `PUBLIC_EDUCATIONAL`; environment source provenance does
not raise named-system credibility or remove model-pack limitations.

The current intended-use identity is
`vector.intended-use.geometry-teaching@1.1.0`. It supports geometry teaching and
controlled comparison of declared inputs. It explicitly does not support named
aircraft handling, named weapon effectiveness, probability of kill, target
damage/destruction/kill inferred from a geometric intercept, or operational
sensor/EW/launch-zone claims.

`CredibilityManifest` records its subject kind, subject identity and digest;
model-pack and engine digests; intended-use references; validity domain;
requirements; verification and validation cases; numerical tolerances;
uncertainty; limitations; and approval state. `APPROVED_FOR_DECLARED_USE` is
accepted only when every case passes against the current model-pack digest. A
one-value model change therefore invalidates the prior reviewed evidence.

The current pack and engine manifests are intentionally `DRAFT`. Their blocking
limitation states that the v0.5 scalar assumptions cannot be interpreted as
named-system performance. Reports load this limitation from the manifest; they
do not maintain independent technical wording.

For v2, completeness is computed rather than authored. Every closed requirement
is `SATISFIED`, `INCOMPLETE`, or `NOT_APPLICABLE` according to its exact field,
component, configuration, and `SOURCE`/`VALIDATION` role coverage. A complete
profile produces only `COMPLETE_FOUNDATION_NON_PROMOTABLE`; an incomplete one
produces `INCOMPLETE`. Neither state is deployment admission.

### Named-aircraft performance admission

An aircraft's catalog identity is not performance evidence. Every compiled
aircraft therefore carries a `performanceAdmission` value with one of two
states:

- `UNSUPPORTED` gives a blocking limitation ID and a concise reason. A consumer
  requesting a named-platform performance interpretation must fail closed with
  that reason.
- `ADMITTED` is allowed only when the pack supplies all five capability classes:
  aerodynamics, propulsion, flight controls, mass/stores, and sensors. Each
  class requires at least one immutable `SOURCE` artifact and one different,
  immutable `VALIDATION` artifact. Both records carry a SHA-256 content digest.

`ASSUMPTION`, requirement, or self-verification records never qualify as either
kind of evidence. The compiler rejects missing capability classes, duplicate
classes, absent/digest-less artifacts, the wrong evidence kind, or one artifact
used as both source and independent validation. Rust/WASM performs the same
validation while loading the compiled pack. Geometry-teaching execution is
governed separately by the intended-use contract; it does not become a
named-platform performance claim because a familiar catalog label appears in a
scenario.

Evidence rows also must exactly match a governed claim in the current v2
[`aircraft evidence registry`](aircraft-evidence-registry.md). The registry
checks immutable artifact identity, capability coverage, source/validation
separation, completed license review, admission eligibility, and the exact
aircraft/variant subject. A pack cannot self-admit a named platform by adding
arbitrary hashed rows or reclassifying a catalog source. Current IAF Su-30MKI,
PAF F-16C Block 52 Peace Drive I, and catalog-only PAF F-16D Block 52 Peace
Drive I claims are deliberately unsupported; the NASA NESC F-16 trim asset is
not an interchangeable Peace Drive I performance model. Categorical engine,
radar, data-link, weapon, or hardpoint associations supply no runtime authority.
For an admitted claim, TypeScript and Rust additionally require every referenced
pack evidence row to match the governed artifact ID, evidence kind, immutable
SHA-256, exact subject claim, admission eligibility, and declared capability
coverage. A digest-valid pack cannot substitute C/D, NASA-reference, or
cross-capability evidence under a familiar ID.

### Historical F-16 external-store source-only boundary

The source-only contract
`vector.nasa-historical-f16-store-source-manifest.v1` is not a model-pack
evidence kind. It freezes three historical NASA artifacts and their exact
page/render lineage in a quarantine. Pinned NASA source terms authorize only
internal verification use and redistribution of the exact source bytes and
declared renders. The separate `RELEASE_OWNER_REVIEW` is technical and
non-legal; it binds all 16 page/report/anchor mappings and records that no
numeric value or equation was transcribed. Adaptation, execution, model
admission, numeric/equation transcription and runtime permissions remain
false. The compiler, Rust/WASM loader, Worker, browser, VSR, database, and
model-pack fixtures must not import its schema, subjects, values, authority or
review artifacts. A matching hash alone cannot promote it into `SOURCE` or
`VALIDATION` evidence.

The manifest also prevents unit and datum laundering. NASA-CR-172354's printed
`kN·m²`/`lb·in²` values remain legacy force-times-length-squared quantities; a
future conversion to `kg·m²` must explicitly divide the SI numerator by
`g0 = 9.80665 m/s²` and pass an independent unit oracle. Aircraft station
numbers, span stations, semi-span fractions, fuselage stations, and
forward-hook-relative distances remain distinct. A complete 3D station datum
and body-frame transform are unavailable.

### Generic mission-policy source-only boundary

`vector.generic-mission-policy-verification-source-manifest.v1` is not a model
pack, model-pack source, derivative, executable intended-use profile or runtime
policy. It addresses three exact, external civil research/training artifacts
and their bounded page roles only. Its local redistribution and adaptation
decisions are closed denied; its execution, runtime, model-pack, production and
catalog permissions are false. A later pack cannot convert public availability,
NASA metadata, a release-owner technical review, page text, a claim category or
the manifest digest into executable evidence.

No cadence, threshold, priority, tie-break, hysteresis, timeout, fuel/reserve
number, route geometry, action mapping or command bound exists in this source
freeze. Each class is explicitly `MODEL_ASSUMPTION` with `valuePresent: false`.
Compilation must reject any reference from an executable policy or model-pack
capability to this source-only manifest. The NASA civil state/module concepts
and FAA human-pilot training loop do not validate an autonomous policy, combat
mission behavior, doctrine, tactics, rules of engagement, track/support state,
release authority, sensor use or named-platform behavior.

### Catalog admission enforcement

Catalog admission checks that every aircraft carries this boundary before the
catalog API returns a validated template. The API exposes the state and reason
as provenance for a future capability-specific surface; the current Lab and
report instead retain the pack's blocking limitation verbatim. Neither surface
may upgrade a geometry-teaching fixture into an `ADMITTED` named-performance
claim.

The separately versioned `NASA_NESC_GENERIC_F16_REFERENCE` verification corpus
is an `ENGINE_VERIFICATION_ONLY` boundary; it does not mutate or extend the
published aircraft evidence registry v2. Its first #135 slice registers
immutable source and comparison identities but deliberately withholds an
executable derivative because the public reports do not contain every Case
13.2 propulsion/control table and a new descendant of the NESC package requires
explicit licence and ancestry review. The previously reviewed Case 11 fixture
remains preserved in registry v2, with its narrow ancestry and digest unchanged.
A verification corpus with `runtimeAuthority: NONE` cannot satisfy a compiled
aircraft component, expand a model validity domain, or be promoted through a
catalog identity.

The TP-1538 aerodynamic corpus uses a second, separately owned
`NASA_GENERIC_F16` / `ENGINE_VERIFICATION_ONLY` adapter. Its identity binds the
exact official-source manifest, both isolated manual transcripts, comparator,
adjudication decisions, final corpus and evaluator contract. It is admitted
only by the verification evaluator after all 14,705 cell states and values are
validated. It is not an `AircraftModelDefinition`, governed production model
pack, catalog entry, scenario patch, or alternative to the published model-pack
compiler. Production admission cannot consume or relabel this adapter.

## Scenario binding and patches

Scenario patches may change a termination scalar only through its declared
component-relative path with old/new value, SI unit, reason and provenance.
They cannot introduce a second threshold or a renderer-owned override.

The ninth governed template records the exact current model-pack ID, version
and digest in both its package and relational columns. Its non-default geometry,
fuel and loadout are scenario inputs, not patches to compiled coefficients or
catalog facts.

Ground Air scenarios add one exact `vector.aircraft-ground-operation.v2`
binding beside the existing model-pack identity. Its mission, runway evidence,
posture, and release fields are compiler-owned and exact-key validated; it does
not add or override aerodynamic, propulsion, or control values.
An authored airborne transfer binds the same pack identity to exact aircraft,
store, station, rule and store mass, while operation/time/installed-drag intent
remains separately authored and authority-sealed. It is not a catalog patch and
cannot rewrite pack content.

User-authored wind/temperature changes create a distinct environment-pack
digest. They are not model-pack patches and cannot rewrite sourced grid fields.

Every `vector.scenario.v4` package contains:

```text
intendedUse: { id, version }
modelPack: { id, version, digest }
airMission: vector.air-mission.v1 (required for Air-domain packages)
```

Every compiled engine scenario contains the same binding under `modelPack`.
Every entity provenance contains `sourceObjectId`, `modelId`, `modelVersion`,
`modelPackDigest`, and `valueState`. All entity digests must equal the scenario
digest. Stable entity IDs survive draft editing, compilation, runtime state,
recording, save, and report replay.

Stage B adds `ExactModelPackReference` only to the foundation repository port;
it does not change this scenario schema or its compiler. #154 retains sole
authority for scenario pack, configuration, and station migration. No Stage-B
v2 bundle is promoted through scenario binding merely because the repository
can resolve its exact identity.

A scenario-local patch never edits catalog or compiled-pack data. It records:

- stable patch ID;
- model-pack digest and model ID;
- a closed, patchable field path;
- exact old value and new value;
- SI unit;
- reason;
- author ID and ISO-8601 time;
- evidence references.

The old value must equal the compiled value and the unit must match the field.
Unknown fields, stale digests, missing evidence, or non-finite values fail.
Draft patch addition creates a new revision.

## Loadout compatibility

Station/store compatibility resolves the store that owns the compiled
termination model; compatibility itself does not authorize launch, intercept,
damage or kill. Every instantiated store retains the exact model-pack authority.

The #190 template selects two Astra stores for Blue and two AIM-120C-5 stores
for Red only through existing station/store compatibility and quantity limits.
It adds no station, compatibility rule, store property or release authority.

An installed store remains inventory while its launch platform carries a
ground-operation binding and has not reached `ENROUTE`. Neither scheduled launch time nor an
otherwise valid station/rule admission can release it; mass and store identity
remain on the aircraft until a future governed ground/air transition exists.

An Air `FlightAssignment` binds the exact aircraft, compiled model-pack digest,
one admitted station/store/compatibility-rule identity and positive quantity.
The shared `validateScenarioModelInstance` validator is the station membership,
store compatibility, station capacity, and rule-capacity authority. Compilation rejects
missing or mismatched compatibility before store count can affect entity count,
aircraft mass, or endurance.
Runway eligibility and terrain coverage do not assert platform occupancy,
readiness or loadout compatibility; those remain independently admitted.

Compatibility is explicit and four-part: platform catalog identity, compiled
loadout, compiled store, and station group. A `SUPPORTED` rule and station
membership are both required. Station capacity and rule capacity are enforced.
An absent rule is not permission and no generic weapon coefficient fallback
exists. The configured-template compiler now also rejects unknown catalog
objects, missing aircraft/weapon models, domain mismatch, and incompatible
platform/store combinations. The compiled engine package derives installed
aircraft inventory only from linked stowed weapon entities. Their declared
launch masses are included in aircraft initial mass and transferred out of the
aircraft exactly once at release. Store drag, station moments, and jettison
must not be inferred from compatibility metadata. #187 adds only an explicitly
authored generic installed-drag-area contribution in `[0.001, 1] m²` and an
unpowered JETTISON coast; station moments, ejector transients, safe separation
and named carriage aerodynamics remain outside the model.

The v2 governance configuration IDs and exact resolver do not alter these v1
station/loadout rules, create a scenario configuration selector, or infer
station geometry or compatibility. That authority remains excluded from Stage
B and owned by #154 and the existing station/store contracts.

Each compiled weapon also declares a closed seeker mode, support requirement,
and launch authorization. The current reference pack declares all three as
unavailable or scheduled-test-only. This is explicit admission evidence, not an
operational seeker, data-link, or warning claim. A compiler selects a store only
after resolving its catalog identity, compiled weapon model, aircraft/loadout,
station, supported compatibility rule, and matching content digest. Missing or
incompatible data rejects the scenario; it never falls back to the legacy model
authoring list or a weapon-name heuristic.

## Persistence

Migration 017 publishes the immutable intended-use 1.1.0, model-pack 0.9.0,
credibility-manifest 1.3.0 and compiled-pack records, then publishes `1.1.0`
versions of all nine canonical scenario packages against those exact
identities. The historical `1.0.0` rows remain addressable. It uses append-only
`ON CONFLICT DO NOTHING` semantics and exact readback; migrations 015 and 016
remain byte-frozen.

The historical intended-use row is the exact definition and legacy
identity-string hash first published by migration 007. Migration 017 reads that
exact JSON value and hash back rather than reconstructing or normalizing it
under the newer canonical-definition hash convention. The separately published 0.8.0
source remains bound to its own frozen content hash.

Air scenario packages persist the authored mission and exact model-pack digest
inside canonical v4 JSON. Saved runs and VSRs additionally retain the compiled
mission digests; readback resolves an exact retained `(id, version, digest)` and
revalidates against that archived pack rather than the current catalogue. A
missing or partial identity match is a replay-admission failure.
PostGIS stores immutable environment packs separately from compiled model packs,
with an update-rejection trigger and content-addressed runway binding.

Model-pack storage consumers import the unchanged aggregate schema facade,
while contract-document ownership follows `db/schema/model-pack.ts` directly.

Stage B also provides `InMemoryModelPackRepository` as the exact resolver and
storage-port reference, not as durable production persistence. Metadata and
immutable bytes remain separate. `publishBatch` recompiles every member before
atomically publishing any; published pack `(id, version)` identities cannot
change digest. The same transaction stages canonical content-digest identities
for every independently versioned intended-use contract, requirement profile,
raw-source artifact, derivative, and credibility manifest. A same-batch or
later publication may share an exact
`(schema, id, version)` only when canonical content is identical; conflict
rejects atomically before any staged member becomes visible. `resolveExact`
accepts only exact `(id, version, digest)` and rejects
malformed, missing, stale, corrupt, or incomplete packs. Research export/import
preserves exact bytes for offline backup/restore/readback, including incomplete
gap-bearing publications through a separate integrity-only read path;
compiled-only export accepts complete foundation identities, contains bounded
lineage, and excludes raw/derivative corpora and recipes.

Admission bounds are 32 MiB per artifact, 64 MiB per raw or derivative corpus,
8 MiB per v2 source, 2,048 governed records, 128 configurations, six axes per
table, and 2,000,000 cumulative table cells. Shape/cardinality and table-cell
bounds reject before source serialization or lineage materialization. The port accepts no
compression. Research import applies the same 32/64 MiB byte limits across the
entire archive corpus and a 2,048-entry cap before it scans any byte or calls
the bounded owned-byte allocator; malformed or unsafe lengths fail with stable
archive codes.
Durable database/blob adapters, cache lifecycle, Worker recovery,
and runtime cache/load remain later-stage dependencies. The immutable Stage-B
performance workload covers compile, publish, exact lookup, research
export/import, and 1/10/100/500-instance compiled reuse.

Forward migration
[`db/migrations/007_model_pack_foundation.sql`](../db/migrations/007_model_pack_foundation.sql)
adds:

- `intended_use_contracts`;
- `model_pack_sources`;
- `compiled_model_packs`;
- `credibility_manifests`;
- intended-use and model-pack identity columns on scenario templates and saved
  runs.

Hashes have database format constraints. Source, compiled pack, and credibility
rows use immutable `(id, version)` identities. The deterministic seed publishes
one current source/pack, a model-pack manifest, an engine manifest, and binds all
nine scenario fixtures to them. `scripts/verify-db.mjs` verifies row counts,
digest equality, SI state, manifest binding, and scenario-package binding.

Migration
[`db/migrations/010_immutable_credibility_catalog.sql`](../db/migrations/010_immutable_credibility_catalog.sql)
turns those identities into an enforced database boundary. New rows must carry
payload ID/version/schema/digest fields matching their relational identity;
compiled packs must be SI and reference their exact credibility manifest.
Intended uses, source packs, compiled packs, and credibility manifests reject
update/delete operations. A correction or approval transition therefore
publishes a new version instead of rewriting evidence already referenced by a
scenario or saved run.

`/api/catalog` admits validated templates only when their intended use,
compiled pack, digest, credibility subject, content identity, approval state,
and explicit limitations form one complete chain. Missing or inconsistent
evidence fails the catalog request closed. The Construct/Validate surface shows
the admitted manifest state and blocking limitations before Simulate; saved
reports retain the same identity.

The PostgreSQL Drizzle baseline is in `drizzle/`. The prior SQLite-shaped
history was inconsistent with the PostgreSQL Drizzle configuration and is
preserved, unchanged, in `drizzle-legacy-sqlite/` for auditability. Operational
deployments continue to apply the forward-only numbered migrations in
`db/migrations/`.

## Current reference pack

```text
id:      vector-scalar-study-models
version: 0.9.0
digest:  aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c
state:   DRAFT
```

`CURRENT_MODEL_PACK_SOURCE` and `CURRENT_COMPILED_MODEL_PACK` remain the legacy
v1 reference authority for their existing consumers only. The Stage-B v2
compiler and repository never import or fall back to either singleton; this
slice does not migrate their scenario or production-runtime consumers.

It contains the existing four aircraft scalar assumption records, eight weapon
scalar assumption records, explicit aerodynamic/propulsion/sensor/loadout
components, and the eight configured compatibility relationships. The declared
study station and matching compatibility rule each admit at most two stores,
matching the existing two-store teaching templates; this is bounded regression
continuity, not a named-aircraft carriage claim. This is a
contract migration and regression-continuity fixture, not a fidelity upgrade.
Every aircraft in this pack has `performanceAdmission: UNSUPPORTED`; requests
for named aircraft performance fail closed. Preserved v0.7 and v0.8 fixtures
remain immutable historical artifacts. V0.9 adds the exact verification-only
weapon-termination authority described below.

## Consumption rules for dependent workstreams

Consumers must preserve the independently sealed full mission as authority over
both compact runtime bindings. They may not substitute the older scalar STUB-24
envelope, infer missing ground inputs, or accept caller-resealed compact copies.

Consumers may execute the generic ground projection only when the compiler has
sealed `ADMITTED_GENERIC_EDUCATIONAL`. A missing or unsupported projection
rejects new-run admission; historical v1 records retain their explicit
`GROUND_DYNAMICS_MODEL_UNAVAILABLE` state. Neither boundary permits
named-platform performance, landing/recovery, store release, or a fallback to
scalar envelope assumptions or the airborne controller.

Issue #187 adds one separate generic public-educational airborne store-transfer
consumer. The model pack remains authoritative for aircraft/store/station/rule
identity and store mass; authored mission intent owns operation, time and the
bounded installed-drag-area assumption. Its versioned validity projection fixes
the admitted inclusive interval at `[0.001, 1] m²`; both exact boundaries are
valid and any non-finite or out-of-range value fails compilation/admission. The
interval and authored/model-assumption value state are authority-sealed and
replayed independently by Rust, while the UI publishes the same limits. Runtime
admission requires an airborne
start or achieved `ENROUTE`, the independently sealed full AirMission, the exact
remaining installed inventory, and matching compact projection. One accepted
request removes one store mass and its installed drag contribution without
changing fuel, then instantiates the store at the launcher's exact boundary
position and velocity. RELEASE enables only the existing generic guided path;
JETTISON is an unpowered generic ballistic coast. Neither operation claims
ejection transients, safe separation, named carriage/aerodynamics, named weapon
fidelity, TP-1538 authority, landing or recovery.

Each compiled weapon now also carries one exact-key
`vector.weapon-termination-model.v1`: `ENGINE_VERIFICATION_ONLY`,
`GEOMETRIC_CLOSEST_APPROACH`, a positive SI intercept radius, and a positive SI
maximum flight time. The current pack uses 25 m and 180 s as visible model
assumptions. Source must explicitly carry the schema, intended-use and criterion
discriminators; absent fields reject instead of inheriting compiler defaults.
Both engines validate that projection before integration. It owns
only geometric intercept, flight-time expiry, energy miss, terrain failure and
target-unavailable termination; the legacy scenario completion distance and
all renderer distances have no weapon-terminal authority. It does not model a
fuze, warhead, damage, destruction, kill or probability of kill.

`modelPack.weaponTerminations` is the compact, digest-bound runtime projection
of those compiled values. It records exact model ID/version plus the effective
termination object after validated scenario patches. Entity fields must equal
that projection in both TypeScript and Rust/WASM; changing both the entity and
the compact projection while retaining a known pack identity is rejected
against the retained compiled pack.

Mission/capability consumers import the exported `AirMissionDefinition` and
`CompiledAirMission` types from `lib/air-mission.ts`. They may attach downstream
behavior to those stable IDs and references but must not create a parallel
mission, flight-plan, fuel, loadout, or start schema.
Consumers receive exact model and environment artifacts. Simulation ticks may
sample the precompiled environment grid but may not query PostGIS or providers.

1. Import schema constants and types from `lib/model-pack.ts`; do not duplicate
   them in a feature directory.
2. Select models with stable IDs and require the scenario's exact pack digest.
3. Use compiled array indexes and SI numeric values after admission.
4. Validate a pack once, instantiate it many times, and keep mutable state in a
   separate data structure.
5. Never query Postgres/PostGIS or parse unit strings during a tick.
6. Runtime aircraft execution consumes compiled table IDs and SI axis/value arrays, not source-row scalar values. It linearly interpolates only inside declared coverage and rejects extrapolation.
7. Add new tables or coefficients to the source schema and compiler first, then
   update the shared fixture and Rust consumer in the same change.
7. Do not add presentation-only properties to the physical model.
8. Preserve the blocking named-performance limitation until representative
   verification and validation cases pass against the new digest.
9. For v2 onboarding resolve only the exact triple; never import `CURRENT_*`
   authority. Do not pass Stage-B v2 packs to scenarios, Workers, ticks, or VSR
   until their owning later stages explicitly admit that schema.

Aircraft admission also proves that every selected aerodynamic model and its
tables, propulsion model and thrust/fuel tables, sensor model, and loadout
model covers the aircraft's full declared validity domain. A component with a
narrower altitude, Mach, angle-of-attack, load-factor, configuration, or
environment envelope rejects the pack during compilation and Rust/WASM
validation. The runtime must not fill the gap with a scalar fallback.

## Verification

The #190 regression admits the same pack independently through TypeScript and
Rust/WASM, compares the complete terminal frame and event stream, and runs a
nearby failing control. Database verification separately requires the ninth
row's exact intended-use and model-pack bindings.

The challenge now reaches an engine-owned 21.836104 m geometric intercept at
131.9 s under the 25 m verification-only criterion; the 46 km control reaches
the time limit with a 530.164926 m closest approach. Tests independently cover
between-step closest approach, malformed termination authority, legacy-distance
non-authority, cumulative-minimum terminal-event parity, exact event-cause to
run-outcome binding and the explicit `NOT_MODELLED` target effect.

`tests/air-mission.test.mjs` covers all class/overlay/start combinations,
canonical digest repeatability, units/datums, closed route/task references,
exact station/rule/capacity admission, immutable ground-envelope binding,
runway and fuel/loadout rejection, Worker/server parity, runtime
mass/endurance effects, and VSR readback against the current compiled model-pack
digest.
It also proves that a QRA aircraft remains exactly parked before its admitted
release boundary, cannot launch an installed store from the ground, preserves
mass and fuel, rejects forged/extended ground-operation admission in both
backends, and round-trips the explicit operational/movement value state through
the v6 frame codec.
The release gate now pairs existing model-pack checks with exact environment
source verification, TS/Rust runtime parity and corrupt-binding rejection.

- `npm run models:verify` rejects a stale generated fixture.
- `npm run models:aircraft-foundation:verify` regenerates both anonymous
  serialized research archives and rejects identity drift.
- `tests/model-pack.test.mjs` covers units, validity domains, canonical digests,
  evidence invalidation, malformed inputs, cycles, references, compatibility,
  patches, immutability, and 1/10/100/500-object instantiation.
- The same suite covers v2 exact keys and bounds, two anonymous packs through one
  compiler/resolver, closed completeness, subject/configuration and locator
  laundering, raw/derivative tampering, downstream rebuild invalidation,
  insertion permutation, atomic publication, exact export/import/readback,
  compiled-only corpus isolation, v1 read-only migration, and nonpromotion. It
  also uses length-only hostile arrays to prove oversized, cumulative, mismatched,
  and safe-integer-overflow table shapes reject without value materialization,
  and mutates every executable categorical authority while retaining the old
  source/validation lineage to prove completeness cannot be laundered.
- `tests/scenario-draft.test.mjs` covers stable IDs, draft revisions, and patch
  preservation.
- `tests/engine-backends.test.mjs` checks model-pack and entity-provenance parity.
- `tests/catalog-admission.test.mjs` rejects missing packs, digest or approval
  mismatch, and unapproved packs without explicit limitations.
- `db:credibility:verify` proves immutable-update and malformed-insert rejection
  against live PostGIS without retaining test mutations.
- Rust native tests consume the same fixture and reject digest/index tampering.
- Rust v2 tests consume the TypeScript-generated anonymous fixture, reproduce
  its exact digest and reject unknown-key and last-field tampering.
- `npm run performance:model-pack-foundation:verify` enforces the immutable
  compile/publish/lookup/export/import/reuse p99 and maximum budgets recorded in
  `docs/performance-capacity.md`.
- migration, seed, and live catalog behavior are checked by `db:verify` and
  `app:verify`.

## Stage-0 generic sensor references are not model-pack evidence

The issue #148 generic sensor source freeze is outside every source-pack,
compiled-pack, credibility, validation, and aircraft installation admission
chain defined here. Its manifest permits only bibliographic and exact
source-location evidence. It contains no admitted numeric radar, measurement,
covariance, detection, clutter, filter, gate, or association parameter and may
not satisfy a `vector.sensor-evidence-admission.v1` field.

Reference execution remains blocked while its human decision is
`PENDING_REVIEW`; code copying or adaptation requires a separate approved
adaptation decision. Exact-byte redistribution is separately
`SOURCE_TERMS_AUTHORIZED` by pinned NASA public-use records and Stone Soup's
open/MIT record with its notice preserved; it creates no model-pack authority.
Human approval additionally requires the separately governed
digest-pinned reviewer/key policy, an externally rooted detached attestation,
and exact resolution of the signed evidence bytes. The required scope is fixed
per decision field and cannot be substituted. Even later approval would
authorize only its recorded
jurisdiction, scope, and conditions. It would not promote a source into a model
pack or establish target, platform, radar, or installation applicability.
Production pack generation and admission reject any import of the Stage-0
subject, schema, legal artifact, or source-bundle path.
