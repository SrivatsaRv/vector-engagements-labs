# VECTOR information-state contract

Status: #26 generic TrackStore verification slice. The deployed reference pack
still has no positive-range `RADAR`, `INFRARED`, or `VISUAL` model, so normal
runs remain explicitly unavailable. A separately authored
`ENGINE_VERIFICATION_ONLY` pack exercises observation and track mechanics; it
is not admitted by the production deployment and makes no named-sensor claim.

## Canonical boundary

Target effect is downstream of, and distinct from, weapon termination and RASP
observation. Exactly one `TARGET_EFFECT_COMMITTED` event may consume one exact
termination receipt and same-frame target state. It may transition the target
lifecycle only for the admitted `MISSION_KILL` or `KILL` result; it never
creates a detection, track, identification or weapon-support state.

Numeric syntax, structured type/finiteness/range/precision and whole-scenario
relational admission all precede canonical runtime state. RASP receives only a
compiled admitted scenario; it cannot round, coerce, default or otherwise
repair an invalid authoring value into a picture, track, event or explanation.

The #190 crossing run does not promote model truth into an observation: both
side pictures remain `sensorState=UNSUPPORTED`, `trackState=UNSUPPORTED`,
invisible and position-free at every recorded tick, including the engine-owned
25 m geometric-intercept boundary.

The ground-operation state sequence is fixed and one-way for the admitted
mechanism: `PARKED`/`HOLD_SHORT` → `TAKEOFF_ROLL` → `ROTATE` → `CLIMBOUT` →
`ENROUTE`. At most one transition commits per integer tick; skipped or forbidden
edges reject instead of being inferred from elapsed time.

`vector.compiled-air-mission.v1` is immutable run provenance beside the engine
scenario, not a second track/picture state machine. Start, route, fuel and store
consequences enter through ordinary canonical entities and frames.
The three current Air-combat packages may additionally carry the closed,
optional `vector.authored-route-profile.v1` description. Its profile label,
side-owned leg-intent labels and limitations have `AUTHORED_ROUTE` authority
only: they describe the exact package route but cannot select a controller,
autonomous pilot response, tactic or target effect. Runtime authority remains
the admitted WGS84/MSL route points, route-plan transitions and acceptance
radii, compiled Blue flight-plan roles, and recorded aircraft-control state.
Only a recorded route-point-index change may be reported as an achieved route
transition.

`Scenario.runDurationSeconds` is a separate optional causal input. When
present, its admitted finite value in `[0.001, 3600] s` becomes the exact engine
terminal duration; when absent, the versioned domain default remains
authoritative for historical packages. Neither the descriptive profile nor a
scenario title can extend or terminate a run.

Environment sampling is causal state input: sourced density/wind and DEM
collision can change motion or termination, but do not invent RASP knowledge,
sensor detection, decisions, or narrative state.
Ground-held aircraft now expose achieved `PARKED`/`HOLD_SHORT` operational
state and movement `UNAVAILABLE` with the stable ground-dynamics cause. This is
canonical entity state, not a RASP observation or inferred intent.
Airborne store transfer is also an engine-owned lifecycle boundary, not a RASP
decision. Its canonical outcome records requested/accepted/achieved,
limiter/cause and exact store identity; RASP consumers cannot turn a rejected
request into an observation or an achieved world entity.

Every A2A tick emits one state owned by `IAF` and one owned by `PAF`. Without a
compiled admission, `vector.observer-state.v2` has
`sensorState: UNSUPPORTED`, `observationCount: 0`, `trackState: UNSUPPORTED`,
`visible: false`, and `availabilityReason: SENSOR_MODEL_UNAVAILABLE`.

`vector.observer-sensor-admission.v1` remains the non-positional PLOT input:
digest, sensor identity/version, evidence references, kind, mode, positive
detection/minimum range, scan period, and azimuth/elevation field of view.
The TypeScript compiler may bind it only from an aircraft's compiled
positive-range `RADAR`, `INFRARED`, or `VISUAL` model. A
`DECLARED_ENVELOPE`, zero range, missing evidence, invalid bounds, or digest
mismatch cannot become a generic radar.

Positive production sensors must additionally compile `vector.sensor-evidence-admission.v1`.
It binds distinct immutable `SOURCE` and `VALIDATION` artifacts and requires a
validated detection range, minimum range, scan period, azimuth/elevation FOV,
measurement uncertainty, and target applicability. An `UNKNOWN` field blocks
compilation; it is never represented by a numerical zero. This is an admission
gate only. In production it does not create a measurement, track, renderer-visible estimate,
data link, EW effect, or weapon support.

The run binding also carries a compiler-produced projection of the compiled
observer models. Both engines require every entity admission field to exactly
match one member of that projection. An entity admission cannot manufacture a
sensor, range, field of view, kind, version, or evidence list by reusing a
valid model-pack digest. Transport of the binding itself remains STUB-07 work.

On a due v1 `SEARCH` scan, range and field-of-view checks may emit one `PLOT`.
The PLOT is a non-positional measurement boundary: it has no observed entity
identity, position, covariance, confidence, visible marker, datalink,
electronic-warfare effect, or weapon-support authority. `OFF`, an out-of-volume
target, a non-due scan, or an invalid admission emits zero observations and no
track. This is not a radar equation or named-system claim.

The source-authored verification pack uses
`vector.observer-sensor-admission.v2` and
`vector.generic-track-model.v1`. The model declares bias, diagonal standard
deviation, confirmation count, observation-age bound, coast/loss times, and
deterministic observation windows. Its intended use and value state are closed
to `ENGINE_VERIFICATION_ONLY` / `TEST_FIXTURE`. Compilation includes the model
in the content-addressed pack; a second digest binds the compact runtime
projection. TypeScript and Rust reject changed inner content, wrong intended
use, unknown fields, missing evidence, or a projection-digest mismatch.

Each side owns an independent tick-local `TrackStore`. Inputs are opaque
`vector.observation.v1` values containing source pack/model identity, source
sequence and model time, an opaque source-local association ID, an estimated
position/velocity, and explicit
uncertainty. Inputs with the wrong side, stale or duplicate sequence/time,
wrong source digest, non-positional/non-finite values, or any truth identity
fail closed. Track IDs (`IAF-TRACK-NNNN` / `PAF-TRACK-NNNN`) do not encode the
world entity identity. The generic verification engine assigns stable opaque
source slots from deterministic compiled opposing-aircraft order, including
inactive entries so lifecycle changes cannot renumber a surviving track;
side-owned output never carries the internal world-entity association. One store retains
multiple tracks keyed by that opaque
association; a rejected batch is transactional and cannot partially update
another track. `vector.track.v1` moves exhaustively through
`TENTATIVE`, `CONFIRMED`, `COASTING`, `LOST`, and reacquisition. Confirmation
and coasting may be visible in a side-owned picture; tentative and lost tracks
are not. No confidence scalar is invented.

`vector.observer-state.v3` is one complete side/frame picture. It retains every
observation and track plus exact observation, retained-track, and visible-track
counts. It has one scan-level reason but no scalar track lifecycle, visibility,
or availability summary. Mixed `TENTATIVE`, `CONFIRMED`, `COASTING`, and
`LOST` tracks therefore coexist without selecting `tracks[0]`; visibility is
derived independently for every retained track.

The bounded verification slice admits one sensor producer per side. When more
than one active aircraft on a side carries an admitted observer sensor, the
engine selects the aircraft with the lowest stable entity ID in unsigned UTF-8
order. Scenario insertion order therefore cannot change the producer, side
picture, events, or record. Per-sensor TrackStores, association and fusion are
future #26 work; this deterministic selection is not a fusion substitute.

Every lifecycle transition is committed at its exact tick through the shared
`vector.simulation-event.v2` journal as `TRACK_STATE_CHANGED`. Events carry
typed transition facts and journal receipts, never presentation text or a
parallel transition stream. The frame referenced by the event must contain the
same side-owned track state. Payload
`vector.simulation-event-payload.track-state-changed.v3` carries the exact
opaque observation ID for observation-driven transitions and `null` for
freshness/expiry transitions. Each later transition cites the prior event for
that opaque track.

`lib/engine/core.ts` and `engine-rust/src/lib.rs` emit this state. The browser
projection in `lib/information-state.ts` is a pure conversion of that state to
the displayed `RaspTrack`; it does not read world entities or scenario sensor
controls. Model Truth remains a separately labelled view. An observer view
hides entities while this state is selected.

## Record and replay

VSR v7 retains the effect authority, sealed commit, causal event IDs and target-
frame `{commitId,state}` projection. Replay validates their exact agreement and
then presents the recorded result; it does not rerun an effect model or infer
damage from stored geometry. Historical v6 records remain active-target
`NOT_MODELLED` evidence.

For a run prepared from a governed package,
`vector.scenario-package-reference.v1` binds the exact package ID, version and
content hash. `compiled.json`, `manifest.json` and `report.json` must carry the
same exact-key tuple, and the manifest must declare its viewer feature. A
missing member, malformed hash, independently valid but different tuple, or
feature declaration without a value rejects before replay. Historical records
that predate this optional reference remain readable and do not acquire a
reference through a current catalogue lookup.

A draft that fails control, structured or relational admission produces no run
and therefore no VSR. Replay is not a second authoring boundary: it verifies
the archived admitted identities and bytes and never reinterprets malformed
text, rounds a value, or supplies a missing default.

For #190 the Worker writes the same canonical frames, events, unsupported
pictures and `weapon_intercept` report into one content-addressed VSR. The
built verifier reads `report.json`, `events.jsonl` and `frames.arrow` from that
record, then requires the typed geometric-intercept event, terminated weapon,
active target and `targetEffect: NOT_MODELLED`; replay does not rerun physics or
infer a successful engagement from a title or path.

Ground-operation frames and `AIRCRAFT_OPERATIONAL_STATE_CHANGED` events replay
as recorded, including tick/frame identity, movement value state, controller
request/accept/achievement, fuel, mass and installed-store inventory. Replay
never recalculates phase or motion from mission inputs.

The Rust compiled-model-pack v2 identity validator is confined to offline
publication/readback. It adds no RASP event, picture, observer state, VSR field,
or replay authority.
Replay uses the complete archived regional pack and preprocessed runtime grid;
it never looks up a current PostGIS pack or silently upgrades a superseded
environment identity.

Separating saved-record and admission table declarations does not change RASP
event, picture, or replay authority.
Air mission lineage extends record admission only; it does not permit replay to
derive observer information from model truth or re-run mission behavior.
Frame schema v6 replays ground operational/movement availability exactly; RASP
consumers may not convert unavailable movement into an observation or track.
Accepted or rejected store-transfer outcomes replay from the archived event and
boundary frame. Replay never reruns release physics or reconstructs a missing
store, and a rejected outcome leaves the store stowed.

Authored routes and optional run duration replay from `scenario.json` and their
compiled projection; missing historical duration retains the archived
versioned domain-default behavior. The separately saved report may preserve an
optional authored-route profile, but replay never reconstructs profile intent
from geometry or uses a profile label as execution authority.
New saved reports retain a separate `vector.authored-profile-binding.v1`
baseline containing the template's exact causal profile inputs. Report
projection compares the current admitted scenario against that baseline across
both starts and WGS84/MSL routes, transitions, acceptance radii, headings/TAS,
guidance, regime, Blue flight-leg roles, store-transfer request and duration.
Exact equality is `MATCHED`; any difference is `MODIFIED_FROM`. A modified run
retains source-profile ancestry but does not present the source leg intents as
the edited run's achieved or selected tactic. A historical profile without the
binding remains explicitly unverified rather than being promoted to a match.

The report debrief is a pure recorded-causal projection. It may join preserved
profile identity and route-leg descriptions to recorded route-index changes,
world-entry and store-transfer receipts, weapon termination and target-effect
events, initial/final aircraft fuel, mass and installed stores, and final
aircraft separation. It cannot invent an unrecorded transition or pilot
decision. Kill wording requires the exact admitted `KILL` commit and lifecycle
proof and must identify the generic educational model/authority, model time and
limitations; it is not named-aircraft, named-weapon or pilot effectiveness.
The launch-geometry row is bound to the unique primary-weapon
`ENTITY_ENTERED_WORLD` event and its exact retained frame; range/closure are the
recorded weapon-to-target values at that boundary, while both aircraft
altitudes come from the same frame. Closest-aircraft approach is the minimum
aircraft-to-aircraft separation across retained frames in which both aircraft
remain active. Initial `INTERCEPT` and `RECOMMIT` geometry may be labelled only
for an exactly `MATCHED` authored profile and the first retained active-aircraft
frame on that route leg. If a leg is never reached, the report says so instead
of relabelling the final frame or declared route point as achieved geometry.
The exact report input block uses `vector.report-causal-inputs.v1` and shows the
effective duration plus authored/legacy-default status, mission start, guidance,
regime, release request, leg roles and both side-owned starts/routes. Primary-
weapon flight-state history is a compact projection of recorded
`weaponFlightState` changes only; observer/track availability is copied from the
typed final retained frame and is never inferred from range or guidance.

## Air mission record storage

Saved-run creation repeats the shared structured numeric and Air-mission
compiler checks before recomputation or persistence. An invalid type,
non-finite value, out-of-range value or excess precision returns the same stable
code and field path used by browser/Worker admission and creates no database
row or record member.
Migration 017 publishes the immutable 0.9.0 model pack and new `1.1.0`
versions of all nine canonical scenario packages without rewriting either the
existing `1.0.0` rows or migrations 015 and 016.
Saved-run identity therefore retains the exact termination authority that
produced its terminal event.
The authored scenario member retains every exact Blue/Red route point,
transition method and acceptance radius plus optional `runDurationSeconds`.
Compilation retains the causal Blue Air-mission route and engine duration;
recorded Red execution remains ordinary entity/controller state. The optional
`vector.authored-route-profile.v1` is package/report metadata only and is never
inserted into engine state or RASP pictures.

When target-effect authority is retained, storage also preserves the ordered
termination event, its single dependent effect event and the final completion
event. The effect commit seals the termination receipt and same-frame target
state; readback rejects a missing, duplicated, reordered or independently
resealed link rather than inferring the result from archived geometry.

Migration 016 stores the exact canonical #190 v4 package, content hash, current
model-pack digest and North Punjab study-area identity as a ninth immutable
template. `ON CONFLICT DO NOTHING` plus full readback prevents an existing
identity from being silently rewritten.

Runway lifecycle storage retains the full compiled mission lineage plus the
exact ground-dynamics, runway and environment bindings used during execution.
Older held-only records remain readable as historical unavailable evidence and
are not upgraded into executable takeoff records.

For `vector.scenario.v4` Air runs, the VSR manifest also binds
`vector.compiled-air-mission.v1` by mission ID/version, authored digest, and
compiled digest. The same lineage appears in `compiled.json` and `report.json`;
`scenario.json` retains the authored `vector.air-mission.v1`. Opening recompiles
that authored artifact against the archived environment pack and model-pack
binding, then requires exact equality across all four members before any replay
is exposed. A current catalog lookup, UI default, or report label cannot repair
or replace missing mission intent.

New governed-package records also bind the same
`vector.scenario-package-reference.v1` value through `compiled.json`,
`manifest.json` and `report.json`. That cross-artifact equality is independent
of Air-mission digest equality: both gates must pass. Historical records may
omit the package reference, authored profile and scenario-owned duration; the
reader preserves their older mission/frame schemas and domain-default duration
rather than synthesizing current package metadata.

An archived compiled-mission v1 assignment with no authored transfer plan keeps
its historical key set and digest during that recompilation. Readback does not
insert an empty `storeTransfers` array or an authority seal; non-empty transfer
plans require both exact fields. This is backward compatibility for existing
records, not a downgrade path for malformed new transfer authority.

When the archived mission starts on a runway, its installation, runway geometry,
MSL elevations, datum, source identity and evidence digest must equal the runway
inside that archived pack. A later PostGIS row, catalogue revision or pack with
the same regional label cannot replace it. This extends record identity only;
it does not add a track, observation or RASP transition.

New records use `vector.frames.columnar.v6` and `vector.pictures.v4`. They are
the immutable projection of
the tick boundary. During replay, the verified pictures member is reattached
to decoded frames; replay never derives a track from stored world positions.
The admission check rejects a picture with a position, observed entity ID, or
truth position. It verifies byte-for-byte equivalence to the tick projection;
therefore a PLOT cannot be promoted by replay into an estimate or a renderable
target. The reader retains explicit read-only compatibility with the previous
`vector.frames.columnar.v5` / `vector.pictures.v4` pair and with the older
`vector.frames.columnar.v4` / `vector.pictures.v3` pair, which may contain only
observer state v2. A v4 member cannot carry v3 tracks. Cross-paired,
missing, extra, or future frame/picture versions fail closed. Observation,
track, and event source identities must also match the exact compiled scenario
sensor projection; a valid pack digest beside a forged model ID is rejected.
The capacity gate round-trips 50 retained tracks per side through the columnar
frame member, pictures JSONL, exact picture validation, and replay attachment;
truncating either side fails the gate.

## Deferred contract

Production admission still needs evidence-backed platform sensor models,
multi-object measurement association, terrain/propagation inputs, and validated
uncertainty behavior. Typed data-link/AEW and EW remain later #26 work. Only a
versioned #28 interface may turn side-owned track quality into weapon support.
This slice does not make tactical decisions, launch-authority, weapon-support,
or Su-30MKI/F-16 radar claims. Parent issue #26 remains open.

## Regression evidence

Target-effect regression proves once-only event/lifecycle causality, exact
TypeScript/Rust/WASM commit parity, malformed and reordered rejection, VSR v7
mutation rejection, frozen v6 byte compatibility and exact-frame browser
presentation. The no-effect control remains separate from unsupported RASP.

Issue #197 regression fixes three exact multi-leg Air-combat packages and proves
that descriptive profile/leg labels cannot change frames or events, while route
geometry, release time and optional duration remain causal. It covers the
three-decimal duration boundary and historical omission, rejects malformed or
unknown profile fields, and compares independent geographic, route-transition,
mass/fuel/store, termination and effect oracles. VSR tests require exact
scenario-package reference equality across compiled, manifest and report
artifacts and retain no-reference compatibility. Report tests require the
recorded-causal debrief, distinct non-kill wording and the exact generic-model
limitations for an authorized `KILL`; component tests expose the same event,
frame and model-time identity. Edited-route tests require `MODIFIED_FROM` and
suppressed leg intent, while exact all-three-package and historical-duration
tests cover `MATCHED`, authored duration and versioned-default omission.

Issue #193 adds exhaustive authority inventory and malformed-number tests,
boundary/adjacent/precision cases, a component proof that rejected raw text is
retained but never committed, and browser/server/final-engine agreement on the
same error code and field path. Existing Air-mission tests remain the
cross-field admission matrix for route identity, timing, fuel/reserve,
loadout, runway/weather and class-specific task relationships.

#182 adds direct TypeScript/Rust hostile admission, one-transition-per-tick,
force/energy/fuel/climb/convergence oracles, Worker completion, VSR tamper and
five-viewport canonical-frame regressions. The evidence is generic educational
mechanism verification, not named-aircraft validation.

Issue #61 adds cross-backend environment parity plus archived-pack
supersession regression without changing the governed RASP transition table.

`tests/sensor-model-admission.test.mjs` proves production fail-closed behavior,
source-pack determinism, exact TypeScript/Rust-WASM whole-state and event parity,
two simultaneous mixed-lifecycle tracks, mixed-batch invariance, VSR round-trip,
full VSR byte identity under reversed same-side entity definitions,
observation-cause retention, and contradictory/extra/truth-leaking
state rejection. `tests/track-store.test.mjs` covers transition, multi-track
association, transactionality, and admission causes.
`tests/vector-record.test.mjs` covers new/legacy reads, schema-pair admission,
and consistent all-member source forgery.
`tests/air-mission.test.mjs` additionally covers deterministic mission identity,
all classes/overlays/start postures, negative admission, server preservation,
and exact VSR/report mission-lineage readback.
For #190 it also fixes one demanding non-default A2A package and one nearby
harder control. It requires exact authored inputs and governance, repeated-run
determinism, completion after 120 seconds but before the 140 second ceiling, a
21.836104 m closest approach inside the compiled 25 m verification-only radius,
and time-limit failure of the otherwise-identical 46 km control at 530.164926 m.
The same regression compares the complete
TypeScript/Rust terminal frame and causal-event stream and keeps every observer
picture fail-closed as `UNSUPPORTED`.
It also pins the pre-transfer compiled-mission v1 digest and exact assignment
key set for a mission without a transfer plan, proving that new compilation and
VSR readback do not synthesize empty transfer authority into legacy records.
`tests/airborne-store-transfer.test.mjs` proves a recorded rejected outcome
cannot fall through to a legacy launch marker after VSR replay.
Its ground-held regressions prove TS/Rust `PARKED`/`HOLD_SHORT` parity,
unchanged position/fuel/mass/stores, rejected launch, and explicit unavailable
movement; `tests/vector-record.test.mjs` proves v6 round-trip and v5/v4 plus
v4/v3 read compatibility.
`npm run performance:track-store:verify` gates two side-owned stores retaining
50 tracks each at 20 Hz for five seconds below 75 ms p95 with bounded heap, a
brute-force association oracle, and repeat digest. The same 100-track fixture
has a shared TypeScript/Rust digest; an actual browser Worker proves the same
50-track-per-side canonical frame/picture round trip, cancellation, and
same-Worker recovery. Component/selector tests preserve and display every
retained track while continuing to prevent Model Truth fallback.

The capacity inputs and exact expected counts, member sizes, and TypeScript/Rust/
Worker digest are owned by the immutable
`fixtures/performance/track-store-capacity-workload.v1.json` artifact. Its
byte hash is pinned by the TrackStore regression test; both benchmark and
browser Worker import that artifact instead of maintaining parallel constants.
Compiled entity admission is canonical by entity ID in TypeScript and Rust,
and VSR serialization defensively canonicalizes entity/frame/source projections.
Reversing same-side definitions must therefore preserve the full VSR bytes,
not merely a sorted test projection.

## Stage-0 source-freeze dependency

The issue #148 generic sensor source manifest is deliberately outside the RASP
state machine. It cannot create `SensorState`, an observation, a PLOT, a track,
visibility, data-link state, EW state, support authority, or an event. Neither
the browser nor replay may import or project its source, render, archive,
manifest, or decision artifacts.

Later generic verification implementation remains blocked until the exact
source-freeze commit passes deterministic source-to-render machine verification
and the exact-render-set `RELEASE_OWNER_REVIEW`, and an authorized human approves
reference execution for the required jurisdiction and scope through an
allowlisted record in the digest-pinned external authority policy, an externally
rooted detached attestation, and resolvable exact evidence bytes. Stone Soup
adaptation additionally requires its distinct adaptation approval. Those gates
still do not admit runtime behavior: #26 must separately implement and validate
the owned information-state contracts. Pending, rejected, self-declared, or
untrusted decisions continue to yield the existing unsupported/no-track
behavior, never a fallback.

The separate `SOURCE_TERMS_AUTHORIZED` redistribution state is bound to exact
NASA public-use and Stone Soup open/MIT evidence. It permits repository
redistribution only and is intentionally absent from every RASP admission path.
