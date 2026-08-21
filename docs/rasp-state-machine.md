# VECTOR information-state contract

Status: #26 precondition slice. The current runtime has no admitted sensor
model pack. It records a tick-owned, explicit unavailable state; it does not
simulate radar, visual acquisition, data link, AEW, jamming, or a side-owned
position estimate.

## Canonical boundary

Every A2A tick emits two `vector.observer-state.v1` values, one for `IAF` and
one for `PAF`. Each has `sensorState: UNSUPPORTED`, `observationCount: 0`,
`trackState: UNSUPPORTED`, `visible: false`, and
`availabilityReason: SENSOR_MODEL_UNAVAILABLE`. No value contains an observed
entity ID, position, range, covariance, sensor range, or jammer effect.

`lib/engine/core.ts` and `engine-rust/src/lib.rs` emit this state. The browser
projection in `lib/information-state.ts` is a pure conversion of that state to
the displayed `RaspTrack`; it does not read world entities or scenario sensor
controls. Model Truth remains a separately labelled view. An observer view
hides entities while this state is selected.

## Record and replay

`pictures.jsonl` uses `vector.pictures.v2`. It is the immutable projection of
the tick boundary. During replay, the verified pictures member is reattached
to decoded frames; replay never derives a track from stored world positions.
The admission check rejects a picture with a position, observed entity ID,
truth position, non-zero observation count, confidence, uncertainty, or any
state other than the declared unavailable contract.

## Deferred contract

An admitted sensor pack must later declare versioned sensing, observation,
track-store, data-link, EW, uncertainty, validity-envelope, provenance, and
TypeScript/Rust implementation data. Only then may a tick emit an observation
or track and only that tick-owned state may support a later policy command.
This slice does not make tactical decisions or weapon support claims. #26
remains open for that work.

## Regression evidence

`tests/rasp-state-machine.test.mjs` proves no 80 km range, covariance,
jammer-derived value, entity identity, or position survives. It also proves
the saved record rejects fabricated observer content. `tests/engine-backends.test.mjs`
proves TypeScript/Rust parity. `tests/vector-record.test.mjs` proves VSR replay
uses the immutable member. Component and selector tests prove unavailable UI
state does not fall back to Model Truth.
