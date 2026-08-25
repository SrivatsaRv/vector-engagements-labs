# Executable model-pack and credibility contract

Status: implemented foundation, schema family v1, 2026-08-06.

This contract makes VECTOR object data executable without claiming that the
current scalar assumptions are a flight model. It is the shared boundary for
aircraft dynamics, guided-weapon fly-out, sensing, scenario authoring,
recording, reports, and both engine backends.

## Artifact boundaries

Persistence declarations for intended use, source packs, credibility, and
compiled packs are isolated in `db/schema/model-pack.ts`; `db/schema.ts`
remains the single aggregate Drizzle export.

The following artifacts have different owners and must not be collapsed:

| Artifact | Identity | Mutable | Responsibility |
| --- | --- | --- | --- |
| Catalog identity | `catalogObjectId` | only by a new catalog revision | Human-facing object identity, designation, source assertions, and public facts |
| Model-pack source | `(id, version)` plus source hash | no after publication | Human-readable quantities with units, evidence, component references, domains, and limitations |
| Compiled model pack | `(id, version, digest)` | no | Resolved indexes and SI-normalized numeric arrays used to construct runtime inputs |
| Scenario instance | stable scenario entity ID plus pack digest and model ID | editable only as a new draft revision | Selected object, configuration, loadout, and explicit scenario-local patches |
| Runtime state | scenario instance ID | yes, engine-owned | Lifecycle, position, velocity, mass, fuel, and other advancing state |

Presentation labels, icons, meshes, map state, and camera state do not belong in
physical model definitions. A runtime state never becomes catalog authority.

## Versioned schemas

Air mission authoring adds `vector.air-mission.v1`, `vector.flight-plan.v1`,
`vector.loadout-plan.v1`, and `vector.compiled-air-mission.v1` as mission-owned
adapters. They reference this model pack by exact digest; they do not redefine
aircraft, weapon, station, or coefficient schemas.

The schema-module split changes ownership granularity only. Existing table,
column, constraint, and JSON payload contracts are unchanged.

| Constant | Value | TypeScript owner |
| --- | --- | --- |
| source | `vector.model-pack-source.v1` | `ModelPackSource` |
| compiled pack | `vector.compiled-model-pack.v1` | `CompiledModelPack` |
| intended use | `vector.intended-use.v1` | `IntendedUseContract` |
| credibility | `vector.credibility-manifest.v1` | `CredibilityManifest` |
| scenario patch | `vector.model-patch.v1` | `ScenarioModelPatch` |
| scenario package | `vector.scenario.v4` | `ScenarioDefinition` / `StoredScenarioPackage` |
| scenario draft | `vector.scenario-draft.v1` | `ScenarioDraft` |

The source of truth is [`lib/model-pack.ts`](../lib/model-pack.ts). Rust consumes
the same compiled JSON contract in
[`engine-rust/src/model_pack.rs`](../engine-rust/src/model_pack.rs). The committed
cross-language fixture is
[`fixtures/model-packs/vector-scalar-study-v0.8.compiled.json`](../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json).

## Source definition

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

Every physical quantity is `{ value, unit, evidenceRefIds }`. Supported source
units are deliberately closed: dimensionless, kg/g, m/km/ft, m²/cm², s/ms,
N/kN, m/s or km/h, rad/deg, g0, and kg/(N·s). Unsupported or absent units are a
compile error. Coefficient tables declare output units, ordered axes, axis
units, evidence, and their own validity domain. The product of all axis lengths
must equal the flattened value length; axes must be finite and strictly
increasing.

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

The digest excludes only the outer `digest` member. Object keys use Unicode
code-point order. Arrays retain authored order. To avoid JavaScript/Rust
floating-point formatting differences, numbers are hashed as normalized
scientific strings with 12 digits after the decimal point and a normalized
exponent. The compiled payload still contains numbers, not strings. Changing a
governed value at that precision changes the digest. TypeScript
`verifyCompiledModelPackDigest` and Rust `validate_model_pack_json` implement the
same rule.

Compiled component references are zero-based indexes into the corresponding
pack array. An index outside the array is invalid. The compiler and Rust loader
validate indexes before runtime construction. Tick code receives resolved
numbers and indexes; it does not parse units, traverse source JSON, or query a
database.

## Intended use and credibility

Every Air mission declares `PUBLIC_EDUCATIONAL`, explicit assumptions and
validity limits. A mission/task label cannot promote context evidence or a
named-aircraft association into executable performance authority.

The current intended-use identity is
`vector.intended-use.geometry-teaching@1.0.0`. It supports geometry teaching and
controlled comparison of declared inputs. It explicitly does not support named
aircraft handling, named weapon effectiveness, probability of kill, or
operational sensor/EW/launch-zone claims.

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

The source-only contract
`vector.nasa-historical-f16-store-source-manifest.v1` is not a model-pack
evidence kind. It freezes three historical NASA artifacts and their page/render
lineage while every human admission decision remains pending. The compiler,
Rust/WASM loader, Worker, browser, VSR, database, and model-pack fixtures must
not import its schema, subjects, or values. A matching hash alone cannot promote
it into `SOURCE` or `VALIDATION` evidence.

The manifest also prevents unit and datum laundering. NASA-CR-172354's printed
`kN·m²`/`lb·in²` values remain legacy force-times-length-squared quantities; a
future conversion to `kg·m²` must explicitly divide the SI numerator by
`g0 = 9.80665 m/s²` and pass an independent unit oracle. Aircraft station
numbers, span stations, semi-span fractions, fuselage stations, and
forward-hook-relative distances remain distinct. A complete 3D station datum
and body-frame transform are unavailable.

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

## Scenario binding and patches

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

An Air `FlightAssignment` binds the exact aircraft, compiled model-pack digest,
one admitted station/store identity and positive quantity. Compilation rejects
missing or mismatched compatibility before store count can affect entity count,
aircraft mass, or endurance.

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
remain outside the current model and must not be inferred from compatibility
metadata.

Each compiled weapon also declares a closed seeker mode, support requirement,
and launch authorization. The current reference pack declares all three as
unavailable or scheduled-test-only. This is explicit admission evidence, not an
operational seeker, data-link, or warning claim. A compiler selects a store only
after resolving its catalog identity, compiled weapon model, aircraft/loadout,
station, supported compatibility rule, and matching content digest. Missing or
incompatible data rejects the scenario; it never falls back to the legacy model
authoring list or a weapon-name heuristic.

## Persistence

Air scenario packages persist the authored mission and exact model-pack digest
inside canonical v4 JSON. Saved runs and VSRs additionally retain the compiled
mission digests; readback revalidates them against the archived pack rather than
the current catalogue.

Model-pack storage consumers import the unchanged aggregate schema facade,
while contract-document ownership follows `db/schema/model-pack.ts` directly.

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
eight scenario fixtures to them. `scripts/verify-db.mjs` verifies row counts,
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
version: 0.8.0
digest:  4081605000d0e06e24b2a0bed1c2585de6d953f6f3688b5849052452d32e321a
state:   DRAFT
```

It contains the existing four aircraft scalar assumption records, eight weapon
scalar assumption records, explicit aerodynamic/propulsion/sensor/loadout
components, and the eight configured compatibility relationships. This is a
contract migration and regression-continuity fixture, not a fidelity upgrade.
Every aircraft in this pack has `performanceAdmission: UNSUPPORTED`; requests
for named aircraft performance fail closed. The preserved v0.7 fixture remains
an immutable historical artifact; v0.8 publishes this new admission boundary.

## Consumption rules for dependent workstreams

Mission/capability consumers import the exported `AirMissionDefinition` and
`CompiledAirMission` types from `lib/air-mission.ts`. They may attach downstream
behavior to those stable IDs and references but must not create a parallel
mission, flight-plan, fuel, loadout, or start schema.

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

Aircraft admission also proves that every selected aerodynamic model and its
tables, propulsion model and thrust/fuel tables, sensor model, and loadout
model covers the aircraft's full declared validity domain. A component with a
narrower altitude, Mach, angle-of-attack, load-factor, configuration, or
environment envelope rejects the pack during compilation and Rust/WASM
validation. The runtime must not fill the gap with a scalar fallback.

## Verification

`tests/air-mission.test.mjs` covers all class/overlay/start combinations,
canonical digest repeatability, units/datums, route/task references, runway and
fuel/loadout rejection, Worker/server parity, runtime mass/endurance effects,
and VSR readback against the unchanged compiled model-pack digest.

- `npm run models:verify` rejects a stale generated fixture.
- `tests/model-pack.test.mjs` covers units, validity domains, canonical digests,
  evidence invalidation, malformed inputs, cycles, references, compatibility,
  patches, immutability, and 1/10/100/500-object instantiation.
- `tests/scenario-draft.test.mjs` covers stable IDs, draft revisions, and patch
  preservation.
- `tests/engine-backends.test.mjs` checks model-pack and entity-provenance parity.
- `tests/catalog-admission.test.mjs` rejects missing packs, digest or approval
  mismatch, and unapproved packs without explicit limitations.
- `db:credibility:verify` proves immutable-update and malformed-insert rejection
  against live PostGIS without retaining test mutations.
- Rust native tests consume the same fixture and reject digest/index tampering.
- migration, seed, and live catalog behavior are checked by `db:verify` and
  `app:verify`.
