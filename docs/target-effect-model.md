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

Issue #197 binds this same authority to three retained public-educational study
packages. Their presentation aircraft, route-profile labels, scenario IDs and
release times cannot select an effect. The WVR package reaches `KILL` only
because its canonical termination receipt and same-frame target state evaluate
under the retained generic authority; its one-field release-time control does
not. The BVR and transition packages retain their separately evaluated results.

Issue #207 versions the crossing study so its engine-owned between-step closest
approach enters the retained kill band. The resulting `KILL` and target
termination remain generic model-assumption outputs; neither the Astra label nor
the F-16 presentation identity selects or strengthens that effect.

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

The projection rounds the exact IEEE-754 binary64 value to the nearest integer
multiple of `10^-6`; an exact halfway case resolves away from zero. It does not
multiply the value by one million in floating point before rounding, because
that extra operation can manufacture a tie. TypeScript uses
`Number(value.toFixed(6))`; Rust decomposes the same binary64 sign, significand
and exponent before applying the identical integer rule. A shared signed,
half-boundary fixture is the cross-backend oracle.

The canonical target frame carries only `{ commitId, state }`. Presentation
surfaces join that projection to the typed event; they do not derive an effect
from rendered distance. Before authorizing wording, the selector requires the
retained authority and exact weapon/assigned-target binding, validates the
commit digest and prior-frame lifecycle, independently repeats the deterministic
evaluation from the causal termination receipt and exact retained effect-frame
target state, and requires complete equality with the recorded commit. `kill`
wording is admitted only for a reproduced `KILL` commit whose exact event frame
and after-lifecycle both show `TERMINATED`.

The projection is absent from every retained frame before the exact causal
effect frame. This is a temporal authority boundary, not a display convention:
record creation, archive open, and deterministic replay validation reject even
a correctly hash-resealed frame member that moves the projection earlier. From
the causal frame onward, every retained frame containing the committed target
must carry exactly the same `{ commitId, state }`; no other entity may carry a
target-effect projection, and a run without a causal effect event carries none.

VSR frame schema v7 preserves the target-frame projection. The compiled member
contains the full authority, while manifest and report bind the same authority,
event, frame, commit, result, target, and lifecycle identity. Open validates
member digests, strict authority/commit shape, event causality, deterministic
reproduction, exact frame state, and manifest/report equality before playback.
The frozen pre-effect VSR remains readable under frame schema v6 and retains
`NOT_MODELLED` with an active target.

For the three issue #197 records, replay also requires the exact retained
scenario-package tuple and authored-profile binding before joining profile text
to this commit. Moving a projection to an earlier frame, retaining the old
target lifecycle beside a kill, or replacing the frozen transition-study
closest approach with a historical value fails even if an attacker recomputes
archive hashes. Legacy reconstruction must remove both the authority projection
and its lifecycle consequence to remain a coherent `NOT_MODELLED` record.

The issue #207 crossing record applies the same rule in the opposite direction:
its target is `ACTIVE` before the committed effect and `TERMINATED` at the exact
effect frame, and every report or viewport must consume that retained transition
rather than infer a kill from plotted proximity.

## Verification requirements

Completion requires independent below/equal/above threshold oracles, two-pack
configuration contrast, label-invariance, non-geometric and out-of-domain
controls, strict malformed/resealed-contradiction rejection, duplicate/reorder
rejection, complete TypeScript/Rust-WASM frame/event/hash parity, Worker and
server admission, VSR mutation/readback, exact-frame browser projection, and
performance evidence. Parity is necessary but is not its own oracle.

Issue #207 adds a matched release-time control for the BVR kill, retains the WVR
kill control, proves exact TypeScript/Rust full-history parity for all three
current study outcomes, and covers selector, map, report and VSR regression over
BVR `1.3.0` and the retained WVR/transition `1.2.0` identities. The historical
BVR `1.2.0` package and #197 evidence remain immutable. The
legacy test path explicitly rebuilds a lifecycle-consistent pre-authority
record; it cannot obtain compatibility by ignoring a new commit or projection.

The verification-owned optimized Rust/WASM ceiling is now strictly below
620,000 decoded bytes. This is a measured rebaseline, not a size waiver: the
611,496-byte candidate is 5.23% above the exact pre-#196 artifact, remains below
240,000 gzip and 190,000 Brotli bytes, keeps production Worker raw/gzip/Brotli
growth below 5%, holds initial WASM memory at 1,114,112 bytes, and limits an
interleaved 20-context Chromium initialization p95 regression to 10%. The
100-run high-energy soak reaches 11,534,336 bytes on run one and remains exactly
flat; retained growth is only 0.63% above the exact baseline module. The ceiling
leaves 8,504 bytes (1.37%) of explicit headroom; later features do not inherit
permission to consume it without their own evidence.
