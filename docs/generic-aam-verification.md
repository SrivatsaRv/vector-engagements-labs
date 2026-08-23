# NASA TM-109057 generic AAM verification foundation

Status: `ENGINE_VERIFICATION_ONLY` foundation for #140. Parent issues #28, #39, and #47 remain open.

## Authority and immutable artifacts

The sole source is NASA-TM-109057, *The Analysis of a Generic Air-to-Air Missile Simulation Model* (June 1994), NTRS citation `19940031931`. Canonical record: `https://ntrs.nasa.gov/citations/19940031931`. Canonical PDF: `https://ntrs.nasa.gov/api/citations/19940031931/downloads/19940031931.pdf`.

The source was accessed and reviewed on 2026-08-24. NTRS reported `PUBLIC`, `DOCUMENT_AND_METADATA`, curated, `GOV_PUBLIC_USE_PERMITTED`, export-control `NO`, EAR `NO`, and ITAR `NO`. Two independent downloads produced the same 48-page, 2,606,172-byte PDF with SHA-256 `30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa`.

The separate corpus is `governance/nasa-tm-109057-generic-aam-verification-corpus.v1.json`. Its canonical object SHA-256 is `465b1ade2d6d4521ee062a5f732e1d7d4717ae3ad07e63b4b11afba2ccbb76f0`; its decision-array SHA-256 is `eb3bcd43d11e4fb10c6c5211b8997d56813b194c1805d6b87f6948b5381479a6`. It does not mutate the aircraft evidence registry.

The governed bounded workload is `fixtures/public-reference/nasa-tm-109057/workload.v1.json`, 5,919 bytes, SHA-256 `be35b25977f85bb7953a508df0b67d2b92a0950cc17b217c1d5a6039467cea70`. Its sorted 15-case normalized batch digest is `eb79f30e80387db05e8b48b462eb4895042dc58e7b374a518037b6f3a5590bda`. Normalized run digests retain every frame, terminal, backend, semantics, role, and limitation; only self-referential corpus/decision/input bindings are omitted. Independent arithmetic and qualitative invariants must also pass.

## Roles, ancestry, and exclusions

- Appendix B, PDF pages 25–26: `SOURCE` for test-program initial values, grid bounds, and tick rates.
- Appendix C, PDF pages 27–38: `SOURCE` for the literal printed equations and execution order.
- Figures 2–10, PDF pages 12–20: `COMPARISON_ONLY` for qualitative symmetry, near-launch narrowing, and seeker-angle comparison. No pixel becomes an exact oracle.

DCS, War Thunder, game telemetry, community extraction, reverse-engineered tables, forums, videos, screenshots, and derivative spreadsheets are ineligible for every evidence role.

## Closed discrepancy decisions

1. Use 56.7 kg launch and 22.7 kg burnout mass; 125/50 lb are rounded equivalents.
2. Use active-listing thrust 6,800 N. Table 1's 690 lbf is conflict sensitivity only.
3. Require explicit 15°, 20°, or 30° seeker half-angle; there is no default.
4. Use Appendix B's 200 m/s missile and 234.375 m/s target; a Mach-derived case is withheld.
5. Use Appendix B bounds: x 0–4,500 m, y -4,000–4,000 m, altitude 2,000–12,000 m.
6. Use only printed lumped `K1=0.009412` and `K2=93850/(9.8^2)`; infer no missing aerodynamic inputs.
7. Preserve literal `(pitchRate-cos(pitch))/speed`; insert no gravity factor or dimensional repair.
8. Use fixed-order binary64. The unspecified original compiler/`REAL` cannot support a bit-reproduction claim.
9. Use the printed constant-relative-velocity closest-approach estimator as a numerical rule, not a validated fuze.
10. Treat figures as same-model qualitative comparison; exact trajectories and hit sets remain withheld.

Any new output-affecting ambiguity requires a successor corpus and decision review.

## Executable contract

`vector.generic-aam-verification-input.v1` is exact-key, bounded, SI, and bound to subject `NASA_TM_109057_GENERIC_AAM_REFERENCE`, axes `EARTH_X_FORWARD_Y_RIGHT_Z_DOWN`, and semantics `TM_109057_PRINTED_LISTING_BINARY64_V1`.

At integer tick `n`, time is `n/tickRateHz`. The evaluator advances the constant-velocity target, evaluates prior missile state, applies the printed explicit update order, burns mass through second 8, recomputes relative geometry, creates PN signals, applies the printed speed/mass g-limit and control response, then evaluates:

1. `MISS_GROUND_OR_ZERO_SPEED`
2. `HIT`
3. `MISS_SEEKER_LIMIT`
4. `MISS_OPENING_AFTER_BURN`
5. `TIME_LIMIT`

`vector.generic-aam-verification-run.v1` retains every tick: positions, speed, pitch/yaw and rates/signals, mass, thrust, drag, relative geometry, seeker angle, LOS rate, signed range rate, commands, closest approach, and state. Unknown fields/enums, nonfinite values, inconsistent ticks, forged identity/digests, or missing limitations reject. `TABLE_THRUST_CONFLICT_SENSITIVITY` and `COMMAND_LIMIT_SENSITIVITY` are explicitly non-authoritative causal contrasts.

## Verification and performance

Independent tests cover range/LOS/LOS-rate, closest approach, thrust/drag/speed, exact mass burn, axial command, PN sign/limit, first-order lag, seeker equality/epsilon, ground, and simultaneous-cause precedence. A one-second control-lag fixture converges monotonically at 32/64/128/256 Hz against its closed form.

The workload covers 32/64/128 Hz × 15°/20°/30°, exact Appendix B x/y/altitude extrema, and the thrust conflict. Forward/reversed execution preserves per-case and sorted-batch digests. All TypeScript and actual Rust-WASM frame values compare within `1e-9`; terminal state/tick and bindings are exact.

The size-oriented Rust release profile keeps the combined artifact under the unchanged 500,000-byte gate. Current pre-freeze output is 451,665 bytes; final SHA is recorded after the immutable commit.

On Apple M5 / macOS arm64 / Node v24.3.0, three isolated final 20-batch runs (15 cases, 12,145 frames, approximately 11.08 MB JSON per batch) observed TypeScript p95 11.243–14.286 ms and Node-hosted Rust-WASM p95 110.317–120.265 ms. Default gates are 30 and 200 ms. The benchmark emits p50/p95/p99/max, RSS growth, frames, and bytes. It makes no Worker, UI, 100-entity, or product-capacity claim.

Run:

```sh
npm run reference-aam:verify
node --import tsx --test tests/generic-aam-verification.test.mjs tests/generic-aam-oracles.test.mjs
npm run reference-aam:performance
npm run engine:rust:verify
make ci-local
make clean-clone-local
```

Browser, Worker, VSR, UI, database, migration, integration, and visual tests are omitted because this evaluator is prohibited from those boundaries.

## Claims boundary

This can prove a deterministic, tamper-evident port of declared generic NASA arithmetic, reviewed TS/Rust-WASM parity, and timestep/configuration sensitivity. It cannot prove named-missile performance, radar detection/false alarm/tracking, support/datalink, launch authorization, seeker acquisition, countermeasures, lethality, target manoeuvre validity, pilot tactics, or a Su-30MKI/F-16 result. It emits no `SimulationEventV2`, Situation Log, VSR, or named capability. Production truth-target/support/event defects remain owned by #28 and related issues.
