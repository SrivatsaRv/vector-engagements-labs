# VECTOR information-state contract

Status: #26 sensor-admission slice. The deployed reference pack has no
positive-range `RADAR`, `INFRARED`, or `VISUAL` model, so normal runs remain
explicitly unavailable. The engine can now execute an immutable, versioned
sensor admission only when its inputs were compiled from a pack.

## Canonical boundary

Every A2A tick emits two `vector.observer-state.v2` values, one for `IAF` and
one for `PAF`. Without a compiled admission each has
`sensorState: UNSUPPORTED`, `observationCount: 0`, `trackState: UNSUPPORTED`,
`visible: false`, and `availabilityReason: SENSOR_MODEL_UNAVAILABLE`.

`vector.observer-sensor-admission.v1` is the complete tick input: model-pack
digest, sensor identity/version, evidence references, kind, mode, positive
detection/minimum range, scan period, and azimuth/elevation field of view.
The TypeScript compiler may bind it only from an aircraft's compiled
positive-range `RADAR`, `INFRARED`, or `VISUAL` model. A
`DECLARED_ENVELOPE`, zero range, missing evidence, invalid bounds, or digest
mismatch cannot become a generic radar.

The run binding also carries a compiler-produced projection of the compiled
observer models. Both engines require every entity admission field to exactly
match one member of that projection. An entity admission cannot manufacture a
sensor, range, field of view, kind, version, or evidence list by reusing a
valid model-pack digest. Transport of the binding itself remains STUB-13 work.

On a due `SEARCH` scan, range and field-of-view checks may emit one `PLOT`.
The PLOT is a non-positional measurement boundary: it has no observed entity
identity, position, covariance, confidence, visible marker, datalink,
electronic-warfare effect, or weapon-support authority. `OFF`, an out-of-volume
target, a non-due scan, or an invalid admission emits zero observations and no
track. This is not a radar equation or named-system claim.

`lib/engine/core.ts` and `engine-rust/src/lib.rs` emit this state. The browser
projection in `lib/information-state.ts` is a pure conversion of that state to
the displayed `RaspTrack`; it does not read world entities or scenario sensor
controls. Model Truth remains a separately labelled view. An observer view
hides entities while this state is selected.

## Record and replay

`pictures.jsonl` uses `vector.pictures.v3`. It is the immutable projection of
the tick boundary. During replay, the verified pictures member is reattached
to decoded frames; replay never derives a track from stored world positions.
The admission check rejects a picture with a position, observed entity ID, or
truth position. It verifies byte-for-byte equivalence to the tick projection;
therefore a PLOT cannot be promoted by replay into an estimate or a renderable
target.

## Deferred contract

The next #26 slice must add a sourced measurement/uncertainty model and a
track-store with confirmation, coasting, loss, association and freshness. It
must then add typed data-link/AEW, EW and terrain LOS inputs. Only a later
versioned #26/#28 support interface may consume track quality. This slice does
not make tactical decisions or weapon-support claims.

## Regression evidence

`tests/sensor-model-admission.test.mjs` proves that an entity admission cannot
manufacture a PLOT beside a valid pack digest; range, mode, and digest mutation
fail closed in TypeScript and Rust/WASM; and the production record remains
unavailable without a world estimate. `tests/rasp-state-machine.test.mjs` continues to
prove no 80 km range, covariance, jammer-derived value, entity identity, or
position survives. The production fixture remains unavailable, and
component/selector tests continue to prevent Model Truth fallback.
