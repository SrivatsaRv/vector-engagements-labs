# Governed aircraft model-pack onboarding

Status: Stage-B foundation implemented and verified by issue #170, non-promotable, 2026-08-25.

This guide defines the aircraft-agnostic path from governed evidence bytes to an
immutable compiled identity. It is the acceptance-complete Stage-B slice of
issue #170 under parent #161. It does not
select a pack in a scenario, load a Worker, admit a production runtime, write a
VECTOR Simulation Record (VSR), or render an Evidence Inspector. Those steps
remain owned by #154, later #161 stages, and #155 in that causal order.

## Authority layers

The migration-017 correction recognizes only the exact migration-007 and
pre-#54 intended-use tuples. It adds no model authority.

#197 adds no aircraft-model authority layer. Its exact scenario-package
reference, bounded run duration, and optional authored-route profile belong to
scenario orchestration and VSR binding downstream of the compiled model pack.
They cannot supply evidence, promote a pack, select coefficients, or change the
engine's governed physical models.

Weapon termination is a separate, exact-key model-pack authority layer. Its
criterion, intended use, radius and maximum flight time must be compiled and
validated before runtime; catalog designation never supplies those values.

```text
requirement profile
        |
        v
raw artifact metadata ---- immutable bytes (research storage only)
        |
        v
derivative record -------- immutable derivative bytes (research storage only)
        |
        v
ModelPackSource v2 ------- field selectors + exact evidence lineage
        |
        v
CompiledModelPack v2 ----- SI projection + bounded lineage, no source corpora
        |
        v
exact Stage-B resolver ---- (id, version, digest), foundation-only
        |
        +---- #154 scenario binding (not implemented here)
        +---- #161 Worker/runtime/VSR (not implemented here)
        +---- #155 Evidence Inspector (not implemented here)
```

| Layer | Authority | Identity and mutability | Stage-B consumer |
| --- | --- | --- | --- |
| Requirement profile | intended-use owner | schema, stable ID, semantic version, content digest; append-only | completeness evaluator |
| Raw source record | evidence/source owner | exact subject/configuration, locator/retrieval record, rights/export decision, byte length and SHA-256; immutable | derivative verifier and research export |
| Derivative record | evidence/verification owner | ordered input digests, exact recipe/tool/version/arguments/environment, transforms, uncertainty rule, output digest; immutable | v2 compiler and offline rebuild |
| Authored source | model-pack owner | `vector.model-pack-source.v2`, source digest; immutable after publication | v2 compiler |
| Compiled pack | model-pack owner | `vector.compiled-model-pack.v2`, exact `(id, version, digest)`; strict identity validation in TypeScript and the Rust/WASM core; immutable | Stage-B resolver and compiled-only export |
| Scenario binding | #154 | exact pack/configuration/station reference | deliberately absent |
| Runtime projection and VSR | later #161 stage | compiled-pack load identity and bounded offline lineage | deliberately absent |
| UI projection | #155 over #156 descriptors | read-only evidence/nonclaim/gap projection | deliberately absent |

Raw or derivative bytes never become catalog, scenario, runtime, VSR, or UI
authority. A rendered label cannot upgrade a gap state or make a pack admitted.
Regional terrain, atmosphere, wind, datum and runway evidence remain a parallel
content-addressed `EnvironmentPack` authority. They are composed only at the
scenario/runtime boundary and never enter the Stage-B aircraft evidence chain.

## Schema and migration reference

Pending migration 017 preserves the exact pre-#54 intended-use row while
publishing the current model-pack rows beside it.

Forward migration 018 publishes the three #197 `vector.scenario.v4` packages
at 1.2.0 while retaining their retired 1.1.0 rows; migration 017 remains
byte- and checksum-frozen. The `vector.scenario-package-reference.v1` and
`vector.authored-route-profile.v1` contracts are scenario/VSR schemas, not new
model-pack schemas. No authored-source, compiled-pack, requirement, evidence,
or model-pack digest version changes for #197.

The current reference pack is 0.9.0 and adds
`vector.weapon-termination-model.v1`. Forward migration 017 publishes that
version and its intended-use/credibility identities while preserving prior
compiled fixtures and migrations as immutable history.

Stage B extends the existing model-pack family; it does not create a parallel
aircraft schema.

| Contract | Version | Promotion state |
| --- | --- | --- |
| Legacy authored source | `vector.model-pack-source.v1` | readable for its existing declared uses; cannot satisfy v2 onboarding requirements |
| Legacy compiled pack | `vector.compiled-model-pack.v1` | digest-verifiable and readable through `readLegacyCompiledModelPack`; returned as `promotable: false` for v2 onboarding |
| Intended-use requirements | `vector.model-pack-requirement-profile.v1` | closed, machine-readable input to computed completeness |
| Raw artifact | `vector.aircraft-raw-source-artifact.v1` | immutable research record; bytes stored separately |
| Lawful derivative | `vector.aircraft-derivative.v1` | immutable research record; bytes stored separately |
| Governed authored source | `vector.model-pack-source.v2` | Stage-B compilation input |
| Governed compiled pack | `vector.compiled-model-pack.v2` | exact-key validated with the same canonical digest in TypeScript and Rust/WASM; `INCOMPLETE` or `COMPLETE_FOUNDATION_NON_PROMOTABLE`; never author-declared admitted |
| Research backup/export | `vector.governed-model-pack-export.v1` | exact metadata and byte arrays for offline restore |
| Compiled-only export | `vector.compiled-model-pack-export.v1` | compiled bundle only; source and derivative corpora excluded |

There is no automatic v1-to-v2 promotion. An author must supply the requirement,
raw artifact, derivative, and field-lineage records. `readLegacyCompiledModelPack`
exists for audit/read compatibility only. The Stage-B repository's
`resolveForDeployment` always rejects; a later runtime-admission owner must add
that authority without weakening this foundation.
Migration 014's EnvironmentPack/runway tables and governed rows are therefore
separate persistence contracts; they do not add aircraft-pack keys or silently
promote a Stage-B identity.

## Closed requirements and evidence states

No requirement or evidence state is promoted by the migration correction. The
pre-#54 definition remains historical and cannot authorize current model use.

Production catalog verification now reads these authorities inside a
database-enforced read-only snapshot after migrations. It cannot promote an
evidence state or alter a pack while checking it.

Issue #207 does not add named-aircraft evidence: database verification counts
the new retired scenario version while continuing to require the same exact
intended-use, credibility, and generic model-pack authorities.

The #197 routes, study-regime labels, expected outcomes, and run durations are
scenario assumptions and regression descriptors. They do not satisfy an
aircraft requirement, change a field-lineage state, or turn the displayed
Su-30MKI, Astra, F-16C, or AIM-120 associations into named-performance
authority. All existing evidence gaps and non-promotion rules remain in force.

The #190 scenario does not admit a new aircraft or weapon model pack. It binds
the published `vector-scalar-study-models@0.9.0` identity and retains
named Su-30MKI/F-16C performance as unsupported; scenario inputs remain
`MODEL_ASSUMPTION` rather than new source evidence. The v0.9 change adds only a
verification-only geometric weapon-termination projection; it is not aircraft
or named-weapon onboarding evidence.

The requirement profile uses stable requirement IDs and the closed data-family
set: aerodynamics, propulsion, flight controls, mass properties,
stations/stores, and sensors. Every requirement declares:

- whether it is required;
- exact applicable component IDs and configuration IDs;
- exact governed field selectors;
- required `SOURCE` and/or `VALIDATION` roles.

The compiler derives one deterministic result per requirement. Missing required
selector/role coverage yields `INCOMPLETE`; optional uncovered requirements are
`NOT_APPLICABLE`; only closed coverage yields `SATISFIED`. Authors cannot write
the result or an `ADMITTED` value.

The compiler enumerates every authored executable numeric and categorical
authority: sensor kind; weapon seeker, support, and launch state; every table
axis value and cell; station group, capacity, and compatible-store membership;
and compatibility status/capacity. Requirement selectors are
component-relative RFC-6901 pointers whose object-array tokens are stable IDs or
closed axis semantics, never insertion-sensitive component indexes. Each
available row also binds a canonical `valueDigest`; editing an authored value
without rebuilding its lineage fails closed.

Stable component, station, store, rule, and table IDs are already canonical
structural identity and are not redundantly governed as scalar values. A
compatible-store set member is executable permission rather than mere identity,
so it is bound with a stable ID-token selector. Compatibility-rule lineage uses
the exact rule subject and inherits the owning loadout configuration/validity
domain; it does not acquire a parallel configuration schema.

Each field-lineage row preserves one of `AVAILABLE`, `UNKNOWN`, `UNAVAILABLE`,
`ASSUMPTION`, `REFERENCE_ONLY`, `UNSUPPORTED`, or `NOT_APPLICABLE`. Only
`AVAILABLE` rows with an exact raw digest, derivative digest, locator, record
identity, subject/configuration, unit, frame, datum, uncertainty, and validity
domain can satisfy a required role. The derivative must transform that exact
RFC-6901-style scalar selector inside the declared component and data-family
authority, preserve its declared unit/frame/datum, and descend only through
records for the same subject and configuration. A conceptual label or a pointer
to an object/array cannot masquerade as field lineage. `REFERENCE_ONLY` and
`INELIGIBLE` artifacts cannot establish executable lineage. An explicit
`UNKNOWN` export disposition remains research metadata but is likewise
non-executable; it is never silently promoted or rewritten. When a requirement
needs both roles, validation must use raw and derivative identities independent
from its source evidence. Every non-available state requires a gap reason and
cannot carry digests or a locator. Zero is a numeric value and never represents
absence.
Environment coverage, source time, terrain cells and runway eligibility cannot
satisfy an aircraft requirement or repair an aircraft evidence gap; each family
must pass its own admission contract before later scenario composition.

## Step-by-step onboarding

The upgrade regression recreates the August 10 migration-and-seed sequence and
proves that migration 017 neither updates nor deletes its historical row.

The deployment preflight checks only the checksum-bound migration prefix. It
does not run final pack admission against the old schema. Full pack readback
runs after the pending migration suffix is applied.

Migration 019 reuses the existing compiled pack and therefore adds no onboarding
step; the database gate verifies that scenario versioning cannot create or
replace a model-pack identity.

#197 performs none of the onboarding steps below. Each study resolves the
already-published model pack by its exact ID, version, and digest; the scenario
content hash identifies the outer scenario definition, not model evidence or a
replacement compiled-pack digest. Authored duration and route-profile metadata
cannot select or modify a model during resolution.

An onboarded weapon that can reach runtime must now declare one admissible
termination model with positive finite SI radius and flight time, explicit
intended use and provenance. Compilation fails rather than inheriting a global
or named-weapon default.

No onboarding publication step is performed for #190. The scenario migration
may reference only the exact existing compiled-pack ID, version and digest, and
database readback fails if any of those three fields diverges.

1. Define one intended-use requirement profile. Keep requirement IDs stable;
   declare only the data families, selectors, configurations, source coverage,
   and independent validation coverage needed by that intended use.
2. Retrieve each lawful source artifact outside the production tree. Record its
   exact subject/configuration, canonical URI and record/page locator, retrieval
   timestamp, media type, byte length, SHA-256, licence, redistribution state,
   export disposition, eligibility, and nonclaims.
3. Store source bytes behind the research-storage port keyed only by their
   SHA-256. The metadata row and bytes must agree exactly.
4. Rebuild each normalized derivative offline with
   `vector.aircraft-derivative.canonical-envelope@1.0.0` and
   `vector-model-pack-offline-rebuilder@1.0.0`. The compiler reruns this exact
   recipe over the ordered raw/derivative bytes and rejects an output-byte
   mismatch. Record ordered input digests,
   recipe and tool semantic versions, exact arguments, environment digest,
   unit/frame/datum transforms, uncertainty propagation, output identity, media
   type, byte length, and SHA-256.
5. Add v2 field-lineage rows for every enumerated executable field selector and
   every configuration in the owning component validity domain. Preserve the
   canonical authored-value digest, source URI, and page/record identity.
   Cross-subject, cross-configuration, cross-capability, changed-locator,
   changed-record, nonexistent/non-scalar selector, ineligible-evidence,
   transformation-selector, duplicate transformation, and non-descendant
   derivative bindings reject. Source and validation roles that
   reuse the same raw or derivative identity do not satisfy independent
   validation coverage.
6. Call `compileGovernedModelPack`. It validates exact v2 keys and performs a
   length-only table preflight before source serialization or field
   materialization. The preflight rejects more than six axes, empty axes,
   unsafe-integer axis products, flattened-value cardinality mismatch, and more
   than 2,000,000 cumulative cells with stable code/path diagnostics. It then
   validates the remaining bounds,
   rebuilds the existing v1 SI projection for compatibility, computes closed
   requirement completeness, then binds source, lineage, legacy projection, and
   compiled digests into one frozen v2 bundle. Before publication,
   `validateCompiledModelPackV2` and Rust
   `validate_compiled_model_pack_v2_json` independently enforce the same exact
   compiled keys, v1 projection identity, completeness identity, admission
   state, and final digest. This is schema/identity parity, not a new physical
   validation claim.
7. Publish one or more bundles with `InMemoryModelPackRepository.publishBatch`.
   Validation completes before any record is visible. A corrupt member leaves
   the whole batch unpublished. An existing `(id, version)` cannot acquire new
   bytes or a different digest; corrections publish a new version.
8. Resolve only with `resolveExact({ id, version, digest })`. Missing, stale,
   malformed, corrupt, or incomplete identities fail closed. Multiple versions
   and packs may coexist; no `CURRENT_*` value participates in this path.
9. Use `exportResearch`/`importResearch` for exact offline backup, restore, and
   readback. Use `exportCompiled` for a compiled-only handoff. The latter contains
   bounded field lineage but never raw/derivative byte corpora or recipes.
10. Stop. #154 must own scenario pack/configuration/station migration before a
    later #161 stage may load the pack in a Worker or retain it in a VSR.
    That later composition must bind the aircraft pack and EnvironmentPack by
    their independent exact identities; neither digest is derived from or
    substituted for the other.

The focused verification command is:

```sh
npm exec tsx -- --test tests/model-pack.test.mjs
npm run models:aircraft-foundation:verify
npm run performance:model-pack-foundation:verify
cargo test --manifest-path engine-rust/Cargo.toml --locked model_pack
```

Before handoff also run `npm run typecheck`, the relevant lint command, and
`make ci-local` with the semantic documentation-impact declaration required by
the repository policy.

## Anonymous worked example

The anonymous model-pack proof is unchanged. The isolated database upgrade
fixture is migration evidence, not a new model-validation result.

The production read-only mode verifies the same anonymous pack rows as the
disposable integration verifier but omits deliberate UPDATE probes. It changes
neither the example inputs nor their content digests.

The issue #207 database readback is an additional negative control for this
example: a new scenario version changes catalog history, not anonymous pack
content, configuration coverage, or verification evidence.

The #197 named study packages do not alter the anonymous Stage-B proof. They
consume the current governed reference pack through normal scenario admission;
their platform/tactical labels remain non-causal, and no anonymous or named pack
is promoted by reproducing a study outcome.

The anonymous fixtures were regenerated through the same compiler with exact
termination authority and new content digests. Their different names and
ordering still cannot create a special runtime branch.

The #190 named presentation does not alter or supersede the anonymous onboarding
proof. Its regression consumes the current compiled pack only after ordinary
admission and makes no new named-data assertion.

The generated serialized archives
`anonymous-pack-alpha.governed.v2.json` and
`anonymous-pack-bravo.governed.v2.json` use the same generator, compiler,
repository, export/import, resolver, and Rust identity validator. Their six
closed data families have separate source and independent validation rows,
exact `CONFIGURATION_ALPHA` and `CONFIGURATION_BRAVO` bindings, immutable bytes,
reproducible derivatives, units/datums, uncertainty, and validity. The pack has
a two-dimensional throttle/altitude propulsion table and an exact governed
station. Bravo changes one governed thrust cell and increases that station's
capacity by one; both contrasts change the compiled identity without a named-
aircraft branch or a second schema.

The example also proves that reordering non-semantic requirement, raw record,
derivative, lineage, and byte-map entries preserves canonical compiled identity.
Nested applicability, evidence-role, nonclaim, and transformation sets are
canonicalized where order has no authored meaning; derivative inputs and recipe
arguments retain their declared semantic order.
Changing one raw byte fails against the old hash. After the raw record,
derivative ancestry, and field binding are rebuilt, source, lineage, and compiled
digests all change. Neither anonymous pack is production-admitted.
The examples intentionally contain no terrain, atmosphere, wind or runway
payload. Pairing either example with a regional EnvironmentPack would create a
separate scenario identity without changing the compiled aircraft-pack digest.

## Bounds, storage, and recovery

Recovery retains the allowlisted historical intended-use tuple exactly as it
was stored; an unknown tuple still fails closed.

Production verification holds one repeatable-read, read-only snapshot. The
trigger and lifecycle mutation matrix remains confined to disposable databases,
so verification cannot create a recovery event.

Backup and recovery verification now expects 22 scenario rows after migration
019 while preserving the existing compiled-model-pack and credibility rows
byte-for-byte.

#197 persists each scenario revision append-only and retains its exact package
reference in saved-run/VSR admission so a current catalogue label cannot replace
historical bytes. The optional profile and bounded, three-decimal
`runDurationSeconds` remain inside the scenario envelope; no raw research bytes
or model-pack corpus are copied into the VSR. Existing model-pack storage,
recovery, and resource bounds are unchanged.

The ninth scenario remains a separate immutable template row; it does not copy
or mutate Stage-B source or derivative records. Recovery restores migration 017
and its append-only intended-use 1.1.0, v0.9 compiled pack, credibility 1.3.0
and scenario bindings as independent content-addressed artifacts while
preserving migrations 015 and 016 byte-for-byte.

Stage B rejects before publication when any artifact exceeds 32 MiB, either raw
or derivative corpus exceeds 64 MiB total, the v2 source exceeds 8 MiB,
governed records exceed 2,048, configurations exceed 128, a table exceeds six
axes, or cumulative compiled table cells exceed 2,000,000. Axis products must
also remain safe integers and exactly match flattened values. These checks run
before governed-field materialization and are admission-safety bounds, not
performance claims. Decompression is not supported, so compressed or
decompression-bomb payloads cannot enter this port.

The in-memory repository is the exact append-only resolver/storage reference
implementation, not a claim of durable production infrastructure. It separates metadata from
immutable byte maps and proves atomic publication, append-only identities,
export/import, corruption rejection, and readback. A production database/blob
adapter, backup medium, cache eviction, cancellation, and Worker recovery remain
later-stage work. Exact research export is the portable backup format; importing
it first preflights the whole archive before any byte scan or copy: raw and
derivative entry counts are each capped at 2,048, every declared byte-array
length must be a safe nonnegative integer, each entry is capped at 32 MiB, and
each corpus is capped at 64 MiB across all publications. Stable
`MODEL_PACK_ARCHIVE_ENTRY_COUNT`, `MODEL_PACK_ARCHIVE_BYTE_LENGTH`,
`MODEL_PACK_ARCHIVE_ARTIFACT_BOUNDS`, and `MODEL_PACK_ARCHIVE_CORPUS_BOUNDS`
failures expose the rejecting boundary. Only then does import validate each byte
and replay compilation before one atomic batch becomes visible.

Append-only identity applies below the pack envelope as well as to it. The
repository stages canonical content digests for every independently versioned
intended-use contract, requirement profile, raw-source record, derivative, and
credibility manifest. It compares those staged
identities with both earlier members of the same batch and all prior
publications. Reusing an exact `(schema, id, version)` with identical content is
valid sharing; changing its canonical content fails the whole batch with
`MODEL_PACK_STORAGE_IDENTITY_CONFLICT` and leaves prior publications untouched.

Incomplete publications remain exportable through the integrity-only research
backup/readback path so governed gaps are recoverable; they remain unavailable
from `resolveExact` and every deployment path. Compiled-only export likewise
accepts only complete foundation identities.
EnvironmentPack database immutability and `superseded_at` lifecycle handling
are verified by the geospatial persistence contract, not by this repository or
its aircraft research backup format.

## Performance evidence

The added upgrade fixture runs only in database verification and does not alter
simulation-tick, Worker, bundle-size, or browser performance budgets.

Migration-prefix admission and post-migration readback are release gates, not
model-pack performance results. Existing engine and capacity budgets are
unchanged.

The additional retired scenario row is verified as catalog history and is not
loaded into the per-tick model-pack runtime or counted as a new execution pack.

The three #197 scenario outcomes and their matched WVR control are scenario
regression evidence, not aircraft-model validation or a new capacity benchmark.
They add no numerical core or compiled-pack tables. The historical
585,000-byte WASM evidence gate and the current strict sub-620,000-byte optimized
WASM ceiling remain unchanged, with no #197 budget exception.

The archived #190 release evidence ran the nine-scenario engine benchmark with the same
compiled-pack reuse path. The eight historical workloads retain their 75 ms p95
budget and the new six-entity challenge has a separately reported 110 ms p95
tier. Its 131.9-second geometric-intercept model time is a deterministic
simulated duration, not 131.9 seconds of wall time or a new pack-capacity claim.

The immutable workload
`fixtures/performance/model-pack-foundation-workload.v1.json` has digest
`80853b04efb2396524217edac7937db2be673b7bd5e9ccdea70f44ae161c0796`
and measures compile, atomic publish, exact lookup, research export/import and
1/10/100/500-instance compiled reuse. On 2026-08-25, Node v24.3.0 on an Apple M5
arm64 with 10 logical cores and 16 GiB memory measured p99 values of 95.936,
89.550, 13.506, 22.244, 113.104 and 0.015/0.007/0.078/0.118 ms respectively.
All p50, p95, p99, and maximum measurements were below their committed
regression budgets. These are local
foundation measurements, not browser/runtime throughput, x86-64 capacity, or a
named-aircraft performance claim.
The regional sampler has its own workload and memory/latency budgets; those
measurements are not folded into Stage-B compile, publication or reuse timing.

## Troubleshooting

| Failure | Meaning | Required action |
| --- | --- | --- |
| raw or derivative bytes do not match | byte length or SHA-256 differs | recover the exact artifact or publish a new version and rebuild all descendants |
| archive entry/byte/corpus bound | research import would scan or allocate unbounded work | split the lawful archive into separately admitted bounded imports; never weaken the limit |
| storage identity conflict | an existing intended-use/requirement/raw/derivative/credibility `(schema, id, version)` has different canonical content | publish a new semantic version and rebuild dependent identities |
| unsupported field | exact-key schema rejected silent data loss | remove the field or version the owning schema |
| source locator does not match | field lineage points at different evidence | bind the exact governed raw record; never edit the locator in place |
| launders subject or configuration | record ancestry crosses governed identity | create a distinct subject/configuration record and derivative |
| requirement is incomplete | a required selector/component/configuration/role is absent | add lawful evidence or preserve the explicit gap; do not use zero/fallback data |
| exact compiled model pack was not found | `(id, version, digest)` is absent or stale | request the exact published identity; do not fall back to a current singleton |
| non-promotable until runtime admission lands | Stage B is being used as Stage D | complete #154 first, then the separately reviewed Worker/runtime/VSR admission stage |

## Nonclaims and deferred owners

Recognizing the exact historical intended-use tuple adds no named-platform,
weapon, sensor, pilot, or effectiveness claim.

Successful read-only catalog verification proves migration and identity
consistency only. It does not add named-platform fidelity or effectiveness
authority.

Neither the BVR KILL demonstration nor its retained database history admits
named Su-30MKI, F-16C, Astra, AIM-120, sensor, or pilot performance.

#197 demonstrates deterministic execution of three authored educational route
profiles; it does not validate named aircraft, weapons, pilot tactics,
probability of kill, operational doctrine, or real-world survivability. The
scenario package reference, duration, and profile are orchestration/VSR binding
around the unchanged governed model/engine contracts, not an engine ABI or
model-pack physics extension.

The generic target-effect authority added by #196 binds anonymous study model
identities only. It does not turn aircraft/store compatibility or public
Su-30MKI/F-16/Astra/AMRAAM context into susceptibility, warhead, fuze,
probability-of-kill or named-system effectiveness evidence.

The archived #190 package does not promote generic coefficients into Su-30MKI, F-16C or
Astra performance authority. Its compiled 25 m geometric-intercept assumption
and 21.836104 m achieved closest approach are not detection, launch-zone, fuze,
hit, damage, kill, probability-of-kill or tactical evidence. The target effect
remains explicitly not modelled.

The #182 ground-dynamics projection is a separately bounded
`MODEL_ASSUMPTION` for generic educational roll, rotation and climbout. It does
not consume either isolated TP-1538 transcription, authorize a named aircraft,
or close the #64 reference-aircraft, route, landing and recovery work.

#187 adds only a generic public-educational airborne transfer consumer. The
model pack supplies exact store/station/rule identity and store mass; authored
intent supplies RELEASE/JETTISON, requested time and a visibly assumption-backed
installed-drag area inside `[0.001, 1] m²`. It adds no named carriage,
safe-separation, store aerodynamics or weapon-effectiveness authority.

This foundation makes no named-aircraft, weapon, sensor, mission-policy, flight-
control, or UI capability claim. Rust/WASM participation validates only the
bounded compiled schema and digest; it does not admit the pack to execution or
duplicate the independently governed physical validators. This issue does not
change aircraft equations, scenario
authority, station selection, the browser Worker protocol, VSR contents, or
production persistence. The current Stage-B v2 contract is rejected before the
runtime boundary. #142 retains its TP-1538-specific corpus/evaluator schema,
and exact-subject evidence owners retain their admission authority.
In particular, Stage B makes no claim over regional source licensing, WGS84 or
vertical-datum conversion, sampled wind, terrain/LOS, runway admission, or
EnvironmentPack production migration/readback.
The separate ground-held safety boundary does not change these nonclaims. Its
`UNAVAILABLE` authority prevents motion and store launch; it supplies no
runway-force, propulsion, control, takeoff, climbout, or recovery evidence and
cannot promote a Stage-B or named-aircraft pack.
