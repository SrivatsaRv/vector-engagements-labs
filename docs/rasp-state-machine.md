# VECTOR information-state contract

Status: #26 generic TrackStore verification slice. The deployed reference pack
still has no positive-range `RADAR`, `INFRARED`, or `VISUAL` model, so normal
runs remain explicitly unavailable. A separately authored
`ENGINE_VERIFICATION_ONLY` pack exercises observation and track mechanics; it
is not admitted by the production deployment and makes no named-sensor claim.

## Canonical boundary

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
valid model-pack digest. Transport of the binding itself remains STUB-13 work.

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

New records use `vector.frames.columnar.v5` and `vector.pictures.v4`. They are
the immutable projection of
the tick boundary. During replay, the verified pictures member is reattached
to decoded frames; replay never derives a track from stored world positions.
The admission check rejects a picture with a position, observed entity ID, or
truth position. It verifies byte-for-byte equivalence to the tick projection;
therefore a PLOT cannot be promoted by replay into an estimate or a renderable
target. The reader retains explicit read-only compatibility with the previous
`vector.frames.columnar.v4` / `vector.pictures.v3` pair, which may contain only
observer state v2. A legacy member cannot carry v3 tracks. Cross-paired,
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

`tests/sensor-model-admission.test.mjs` proves production fail-closed behavior,
source-pack determinism, exact TypeScript/Rust-WASM whole-state and event parity,
two simultaneous mixed-lifecycle tracks, mixed-batch invariance, VSR round-trip,
observation-cause retention, and contradictory/extra/truth-leaking
state rejection. `tests/track-store.test.mjs` covers transition, multi-track
association, transactionality, and admission causes.
`tests/vector-record.test.mjs` covers new/legacy reads, schema-pair admission,
and consistent all-member source forgery.
`npm run performance:track-store:verify` gates two side-owned stores retaining
50 tracks each at 20 Hz for five seconds below 75 ms p95 with bounded heap, a
brute-force association oracle, and repeat digest. The same 100-track fixture
has a shared TypeScript/Rust digest; an actual browser Worker proves the same
50-track-per-side canonical frame/picture round trip, cancellation, and
same-Worker recovery. Component/selector tests preserve and display every
retained track while continuing to prevent Model Truth fallback.
