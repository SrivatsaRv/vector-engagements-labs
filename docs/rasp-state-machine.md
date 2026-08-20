# VECTOR information-state contract

Status: first deterministic TypeScript information-state slice for #26. It is
an educational measurement model, not a claim about a named radar, data link,
or jammer.

## Authority and separation

The engine records WorldTruth frames. `lib/information-state.ts` consumes a
frame only to create a side-owned `Observation`; it then derives `TrackState`
and an observer `RaspTrack`. The RASP read model contains no truth-position
field. Rendering consumes only the recorded observer picture when that view is
selected. A UI setting cannot create a track.

## Admitted model

`vector.a2a-information-study.v1@1.0.0` schedules a scan each 1 s. Its
declared public-educational assumptions are an 80 km maximum radar measurement
range, a 1 km minimum range, a 4 s coast interval, two observations to confirm
a track, a 150 m measurement floor, and range-proportional uncertainty. The
model ID, units, limitations, and constants are exported from the information
module and tests. They are not named-platform performance values.

Compatible opposing jamming scales the admitted radar measurement range and
increases covariance from the same model. It does not move a truth entity,
write an icon-only state, or affect weapon guidance. Terrain, waveform,
probability-of-detection, false targets, AEW entities and operational support
remain outside this slice.

## State transitions

```text
OFF/STANDBY/SEARCH -> scan due -> Observation -> PLOT -> CONFIRMED
no observation after a track -> COASTING -> LOST
missing sensor capability -> UNSUPPORTED
radar silent / outside range -> NONE (or COASTING while a previous observation is fresh)
```

`SensorState` values are `OFF`, `STANDBY`, `SEARCH`, `ACQUIRE`, `TRACK`,
`SUPPORT`, `DEGRADED`, and `FAILED`. `TrackState` values are `NONE`, `PLOT`,
`TENTATIVE`, `CONFIRMED`, `COASTING`, `LOST`, and `UNSUPPORTED`.

Data-link and AEW selections fail closed as `DATALINK_SOURCE_UNAVAILABLE`
until a sender-side observation and an admitted typed message path exist. A
link checkbox never injects truth. Weapon support remains unavailable pending
#28's versioned support interface.

## Record and parity boundary

VSR `pictures.jsonl` records each observer sample with owner, source,
timestamp, uncertainty, transition state and reason. The information derivation
is a TypeScript record/read-model adapter, outside the Rust integrator's current
physics-parity surface. #26 remains open for the Rust/Worker implementation,
typed datalink transport, terrain LOS, weapon-support interface, UI RASP view,
and performance/browser evidence.

## Regression evidence

`tests/rasp-state-machine.test.mjs` proves scan/confirmation, exact range
boundary, radar-silent contrast, EW range/covariance contrast, deterministic
output, absence of truth-position leakage, and fail-closed off-board sources.
`tests/vector-record.test.mjs` proves admitted observer pictures survive VSR
round-trip without a physics rerun.
