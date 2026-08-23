# NASA TM-109057 generic AAM verification foundation

Status: `ENGINE_VERIFICATION_ONLY` foundation for #140. Parent issues #28, #39, and #47 remain open.

## Authority and immutable artifacts

The sole source is NASA-TM-109057, *The Analysis of a Generic Air-to-Air Missile Simulation Model* (June 1994), NTRS citation `19940031931`. Canonical record: `https://ntrs.nasa.gov/citations/19940031931`. Canonical PDF: `https://ntrs.nasa.gov/api/citations/19940031931/downloads/19940031931.pdf`.

The source was accessed and reviewed on 2026-08-24. NTRS reported `PUBLIC`, `DOCUMENT_AND_METADATA`, curated, `GOV_PUBLIC_USE_PERMITTED`, export-control `NO`, EAR `NO`, and ITAR `NO`. Two independent downloads produced the same 48-page, 2,606,172-byte PDF with SHA-256 `30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa`.

The current separate corpus is `governance/nasa-tm-109057-generic-aam-verification-corpus.v2.json`. Its canonical object SHA-256 is `fad3f712102ad6172c09e68c0c5445842c5ea170323e873f1a7bc409079e788c`; its decision-array SHA-256 is `884bca829ac1b94f959ecff1be6b9cf9847512810c7010f36d8b78cf6cef22f2`. Immutable v1 remains readable for ancestry; v2 owns executable admission. Neither version mutates the aircraft evidence registry or shared production `Vec3` contract.

The current governed bounded workload is `fixtures/public-reference/nasa-tm-109057/workload.v2.json`, 8,223 bytes, SHA-256 `0e9dd8b658f60476c8ab99c97bbd20b2ed42f3b54c3c5648e51f53b37a1592d7`. Its sorted 15-case normalized batch digest is `12ee51d5fa982f7152f4de8b19d7e650f765b24994f383ba3417b302249d9f2c`. Normalized run digests retain every frame, terminal, backend, semantics, role, and limitation; only self-referential corpus/decision/input bindings are omitted. These digests prove repeatability only. Exact arithmetic, boundary, convergence, parity, and controlled-configuration claims require the independent anchors below.

## Roles, ancestry, and exclusions

- Appendix B, PDF pages 25–26: `SOURCE` for test-program initial values, grid bounds, and tick rates.
- Appendix C, PDF pages 27–38: `SOURCE` for the literal printed equations and execution order.
- Figures 2–10, PDF pages 12–20: `COMPARISON_ONLY` for qualitative symmetry, near-launch narrowing, and seeker-angle comparison. No pixel becomes an exact oracle.

DCS, War Thunder, game telemetry, community extraction, reverse-engineered tables, forums, videos, screenshots, and derivative spreadsheets are ineligible for every evidence role.

## Closed discrepancy decisions

1. Use 56.7 kg launch and 22.7 kg burnout mass; set the declared 8-second burnout boundary to exactly 22.7 kg so accumulated binary64 subtraction residue cannot alter the coast transition. The 125/50 lb values are rounded equivalents.
2. Use active-listing thrust 6,800 N. Table 1's 690 lbf is conflict sensitivity only.
3. Bind the case identifiers 15°, 20°, and 30° to the printed executable literals `0.261798`, `0.349064`, and `0.523596` rad respectively. The evaluator compares the bound radian literal exactly and never recomputes degrees × π/180. There is no default.
4. Use Appendix B's 200 m/s missile and 234.375 m/s target; a Mach-derived case is withheld.
5. Use Appendix B bounds: x 0–4,500 m, y -4,000–4,000 m, altitude 2,000–12,000 m.
6. Use only printed lumped `K1=0.009412` and `K2=93850/(9.8^2)`; infer no missing aerodynamic inputs.
7. Preserve literal `(pitchRate-cos(pitch))/speed`; insert no gravity factor or dimensional repair.
8. Use fixed-order binary64. The unspecified original compiler/`REAL` cannot support a bit-reproduction claim.
9. Reject initial zero range and zero relative speed. A dynamically reached exact zero range closes as `HIT/EXACT_ZERO_RANGE` with CPA `(t=0,d=0)`; a dynamically reached exact zero relative speed closes as `MISS_ZERO_RELATIVE_SPEED/EXACT_ZERO_RELATIVE_SPEED` with `(t=0,d=currentRange)`. A CPA hit requires a future closest point in the current interval, `0 <= t <= dt`; a negative/receding closest time cannot hit. These are closed numerical semantics, not a validated fuze.
10. Treat figures as same-model qualitative comparison; exact trajectories and hit sets remain withheld.

Any new output-affecting ambiguity requires a successor corpus and decision review.

## Executable contract

`vector.generic-aam-verification-input.v2` is exact-key, bounded, SI, and bound to subject `NASA_TM_109057_GENERIC_AAM_REFERENCE`, axes `EARTH_X_FORWARD_Y_RIGHT_Z_DOWN`, and semantics `TM_109057_PRINTED_LISTING_BINARY64_V1`. Admission caps work at 7,680 ticks and 1,500,000 estimated scalar operations. It also bounds positions, speed, angular rates, control signals, pitch/yaw, mass, constants, target state, and the exact degree/radian seeker pair. Values such as `1e308`, a mismatched literal, and any input outside the closed safe domain reject before integration.

At integer tick `n`, time is `n/tickRateHz`. The evaluator advances the constant-velocity target, evaluates prior missile state, applies the printed explicit update order, burns mass through second 8, recomputes relative geometry, creates PN signals, applies the printed speed/mass g-limit and control response, then evaluates:

1. `MISS_GROUND_OR_ZERO_SPEED`
2. exact-zero-range `HIT`
3. `MISS_ZERO_RELATIVE_SPEED`
4. future-interval CPA `HIT`
5. `MISS_SEEKER_LIMIT`
6. `MISS_OPENING_AFTER_BURN`
7. `TIME_LIMIT`

`vector.generic-aam-verification-run.v2` retains every tick: positions, speed, pitch/yaw and rates/signals, mass, thrust, drag, relative geometry, seeker angle, LOS rate, signed range rate, commands, closest approach, and state. Every integration stage rejects nonfinite or unsafe dynamic values. The output decoder is exact-key and exhaustive: every scalar and vector component must be a finite JSON number; nulls, strings, unknown keys/enums, invalid state/cause pairs, inconsistent ticks, forged identity/digests, or missing limitations reject. The Rust-WASM wrapper deep-validates this entire decoded contract rather than trusting a type assertion. Rust uses a local strict generic DTO; the shared production `Vec3` remains byte-for-byte unchanged. `TABLE_THRUST_CONFLICT_SENSITIVITY` and `COMMAND_LIMIT_SENSITIVITY` are explicitly non-authoritative causal contrasts.

## Verification and performance

Independent tests cover range/LOS/LOS-rate, between-tick and receding closest approach, strict hit epsilon, thrust/drag/speed, exact burnout transition, axial command, PN sign/limit boundaries, first-order lag, printed-radian seeker equality/epsilon, ground, D09 exceptions, and simultaneous-cause precedence. A one-second control-lag fixture converges monotonically at 32/64/128/256 Hz against its closed form, and full evaluator trajectories show decreasing endpoint differences across the same four rates.

The workload covers 32/64/128 Hz × all three bound printed seeker literals, exact Appendix B x/y/altitude extrema without admitting the D09 zero-range singularity, and the thrust conflict. Forward/reversed execution preserves per-case and sorted-batch digests. Controlled seeker-only configurations prove nested actual hit sets on a declared grid. All TypeScript and actual Rust-WASM frame values compare within `1e-9`; terminal state/tick and bindings are exact. Table-driven falsifiers cover every numeric output field and vector component with null/string inputs, plus ABI float preservation, unknown fields, cause forgery, nonfinite/extreme input, and operation limits.

The size-oriented Rust release profile keeps the combined artifact under the unchanged 500,000-byte gate. Current pre-freeze output is 455,471 bytes (44,529 bytes of headroom), SHA-256 `4b3512cde441910ff5eeef76c3b1bdc585ab1edfb5e7f1bfb828131be65ddb2c`, from Rust source identity `34ae56d206c03f6019af35dbaab291b477226e34f95fa9ec69544d69dd155828`; the exact value is reverified in a clean clone before freeze.

On Apple M5 / macOS arm64 / Node v24.3.0, three isolated final 20-batch runs (15 cases, 12,145 frames, approximately 11.0 MB JSON per batch) observed TypeScript p95 12.498–15.506 ms and Node-hosted Rust-WASM p95 126.672–180.377 ms. Default gates are 30 and 200 ms. The benchmark emits p50/p95/p99/max, RSS growth, frames, and bytes. It makes no Worker, UI, 100-entity, or product-capacity claim. Earlier back-to-back execution under competing process load produced one 232.210 ms Rust-WASM p95; the three isolated runs above are the acceptance evidence and the load sensitivity remains a documented operational caveat rather than a relaxed gate.

Run:

```sh
npm run reference-aam:verify
node --import tsx scripts/generate-nasa-generic-aam-workload.mjs --write # explicit governed rewrite only
node --import tsx --test tests/generic-aam-verification.test.mjs tests/generic-aam-oracles.test.mjs
npm run reference-aam:performance
npm run engine:rust:verify
make ci-local
make clean-clone-local
```

Browser, Worker, VSR, UI, database, migration, integration, and visual tests are omitted because this evaluator is prohibited from those boundaries.

## Claims boundary

This can prove a deterministic, tamper-evident port of declared generic NASA arithmetic, reviewed TS/Rust-WASM parity, and timestep/configuration sensitivity. It cannot prove named-missile performance, radar detection/false alarm/tracking, support/datalink, launch authorization, seeker acquisition, countermeasures, lethality, target manoeuvre validity, pilot tactics, or a Su-30MKI/F-16 result. It emits no `SimulationEventV2`, Situation Log, VSR, or named capability. Production truth-target/support/event defects remain owned by #28 and related issues.
