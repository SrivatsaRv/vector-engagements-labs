# Executable model-pack and credibility contract

Status: implemented foundation, schema family v1, 2026-08-06.

This contract makes VECTOR object data executable without claiming that the
current scalar assumptions are a flight model. It is the shared boundary for
aircraft dynamics, guided-weapon fly-out, sensing, scenario authoring,
recording, reports, and both engine backends.

## Artifact boundaries

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

| Constant | Value | TypeScript owner |
| --- | --- | --- |
| source | `vector.model-pack-source.v1` | `ModelPackSource` |
| compiled pack | `vector.compiled-model-pack.v1` | `CompiledModelPack` |
| intended use | `vector.intended-use.v1` | `IntendedUseContract` |
| credibility | `vector.credibility-manifest.v1` | `CredibilityManifest` |
| scenario patch | `vector.model-patch.v1` | `ScenarioModelPatch` |
| scenario package | `vector.scenario.v3` | `ScenarioDefinition` / `StoredScenarioPackage` |
| scenario draft | `vector.scenario-draft.v1` | `ScenarioDraft` |

The source of truth is [`lib/model-pack.ts`](../lib/model-pack.ts). Rust consumes
the same compiled JSON contract in
[`engine-rust/src/model_pack.rs`](../engine-rust/src/model_pack.rs). The committed
cross-language fixture is
[`fixtures/model-packs/vector-scalar-study-v0.7.compiled.json`](../fixtures/model-packs/vector-scalar-study-v0.7.compiled.json).

## Source definition

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

## Scenario binding and patches

Every `vector.scenario.v3` package contains:

```text
intendedUse: { id, version }
modelPack: { id, version, digest }
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
version: 0.7.0
digest:  a27f1060f523c8b9552dec67f26eabdb5bc8b0528d1f389fe5a79ae256f993c2
state:   DRAFT
```

It contains the existing four aircraft scalar assumption records, eight weapon
scalar assumption records, explicit aerodynamic/propulsion/sensor/loadout
components, and the eight configured compatibility relationships. This is a
contract migration and regression-continuity fixture, not a fidelity upgrade.

## Consumption rules for dependent workstreams

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
