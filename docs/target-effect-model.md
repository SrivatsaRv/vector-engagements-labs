# Generic target-effect model

Status: issue #196 implementation in progress. The owned schemas are
`vector.target-effect-model.v1`, `vector.target-effect-authority.v1`,
`vector.target-effect-commit.v1`, and
`vector.simulation-event-payload.target-effect-committed.v1`.

## Authority boundary

Weapon termination and target effect are separate causal decisions. A
`GEOMETRIC_CLOSEST_APPROACH` termination proves only that the admitted weapon
trajectory crossed its verification radius. It continues to record
`targetEffect: NOT_MODELLED` in the termination payload. A target effect exists
only when a separately content-addressed authority consumes that committed
termination receipt and the target state from the same canonical tick/frame.

The compiler binds the current public-educational Air projection by exact
weapon model ID/version/model-pack digest and target model
ID/version/model-pack digest. Resolution has no nearest match and no branch on
designation, callsign, affiliation, scenario ID, or UI label. A valid authority
without an exact binding produces `EFFECT_UNAVAILABLE`; it cannot change target
lifecycle.

The initial evaluator is a deterministic generic radial threshold study:

- evaluator: `DETERMINISTIC_RADIAL_THRESHOLD_BANDS`;
- sampling: `NONE`;
- value state: `MODEL_ASSUMPTION`;
- closed results: `NO_EFFECT`, `DEGRADED`, `MISSION_KILL`, `KILL`, and
  `EFFECT_UNAVAILABLE`;
- thresholds and target-domain limits are authority data, not code branches;
- `MISSION_KILL` and `KILL` terminate the target lifecycle exactly once;
- `DEGRADED`, `NO_EFFECT`, and `EFFECT_UNAVAILABLE` preserve lifecycle.

This model does not claim named Astra/AIM-120 lethality, Su-30MKI/F-16
susceptibility, probability of kill, fuze or warhead fidelity, structural
damage, pilot outcome, debris, multi-hit accumulation, or operational combat
effectiveness.

## Canonical commit and replay

`TARGET_EFFECT_COMMITTED` cites exactly one earlier `WEAPON_TERMINATED` event.
Its content-addressed commit seals authority identity, effect-model and target-
profile identity, weapon/target identity, termination tick/local key/cause/time,
closest approach, same-frame target mass/speed/altitude, result, reason, selected
threshold, and target before/after lifecycle. The effect event owns any target
lifecycle transition; a duplicate generic lifecycle event is forbidden.

Before domain evaluation or commit hashing, closest approach, termination model
time, and target mass, speed and altitude are projected to the canonical event
precision of six decimal places, with negative zero normalized to zero. Strict
commit admission rejects a hash-resealed value carrying more precision. This
keeps the effect decision and identity independent of unretained sub-precision
floating-point drift between TypeScript and Rust/WASM.

The canonical target frame carries only `{ commitId, state }`. Presentation
surfaces join that projection to the typed event; they do not derive an effect
from rendered distance. Before authorizing wording, the selector requires the
retained authority and exact weapon/assigned-target binding, validates the
commit digest and prior-frame lifecycle, independently repeats the deterministic
evaluation from the causal termination receipt and exact retained effect-frame
target state, and requires complete equality with the recorded commit. `kill`
wording is admitted only for a reproduced `KILL` commit whose exact event frame
and after-lifecycle both show `TERMINATED`.

VSR frame schema v7 preserves the target-frame projection. The compiled member
contains the full authority, while manifest and report bind the same authority,
event, frame, commit, result, target, and lifecycle identity. Open validates
member digests, strict authority/commit shape, event causality, deterministic
reproduction, exact frame state, and manifest/report equality before playback.
The frozen pre-effect VSR remains readable under frame schema v6 and retains
`NOT_MODELLED` with an active target.

## Verification requirements

Completion requires independent below/equal/above threshold oracles, two-pack
configuration contrast, label-invariance, non-geometric and out-of-domain
controls, strict malformed/resealed-contradiction rejection, duplicate/reorder
rejection, complete TypeScript/Rust-WASM frame/event/hash parity, Worker and
server admission, VSR mutation/readback, exact-frame browser projection, and
performance evidence. Parity is necessary but is not its own oracle.

The verification-owned optimized Rust/WASM ceiling is now strictly below
620,000 decoded bytes. This is a measured rebaseline, not a size waiver: the
611,235-byte candidate is 5.18% above the exact pre-#196 artifact, remains below
240,000 gzip and 190,000 Brotli bytes, keeps production Worker raw/gzip/Brotli
growth below 5%, holds initial WASM memory at 1,114,112 bytes, and limits an
interleaved 20-context Chromium initialization p95 regression to 10%. The
100-run high-energy soak reaches 11,534,336 bytes on run one and remains exactly
flat; retained growth is only 0.63% above the exact baseline module. The ceiling
leaves 8,765 bytes (1.43%) of explicit headroom; later features do not inherit
permission to consume it without their own evidence.
