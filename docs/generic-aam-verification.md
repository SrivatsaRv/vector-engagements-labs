# NASA TM-109057 generic AAM verification foundation

Status: `ENGINE_VERIFICATION_ONLY` foundation for #140. Parent issues #28, #39, and #47 remain open.

## Authority and immutable artifacts

The sole source is NASA-TM-109057, *The Analysis of a Generic Air-to-Air Missile Simulation Model* (June 1994), NTRS citation `19940031931`. Canonical record: `https://ntrs.nasa.gov/citations/19940031931`. Canonical PDF: `https://ntrs.nasa.gov/api/citations/19940031931/downloads/19940031931.pdf`.

The source was accessed and reviewed on 2026-08-24. NTRS reported `PUBLIC`, `DOCUMENT_AND_METADATA`, curated, `GOV_PUBLIC_USE_PERMITTED`, export-control `NO`, EAR `NO`, and ITAR `NO`. Two independent downloads produced the same 48-page, 2,606,172-byte PDF with SHA-256 `30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa`.

The current separate corpus is `governance/nasa-tm-109057-generic-aam-verification-corpus.v3.json`. Its canonical object SHA-256 is `e4d0b37e08aff711d0f7260d0ba10d8ee73b0b6ef84ad81616116988eae3a7a7`; its decision-array SHA-256 is `884bca829ac1b94f959ecff1be6b9cf9847512810c7010f36d8b78cf6cef22f2`. Immutable v1 and v2 remain readable for ancestry; v3 owns executable admission. The imported corpus is frozen behind a private module boundary and its source, corpus, and decision identities are fixed compiled constants. Callers receive recursively frozen copies, never the trusted singleton. Mutation of a caller view, forged source/hash values, or mutation of the DCS/War Thunder and prohibited-surface lists cannot change current or later admission.

The current governed bounded workload is `fixtures/public-reference/nasa-tm-109057/workload.v3.json`, 8,223 bytes, SHA-256 `0b7f7ba1395ff58629c26aaa62e46c239121d37e4197a2246e1064aa8caeb556`. Its sorted 15-case normalized batch digest is `4e9a8c39cc19e21a9d988ccd3c68f4f5c51d5a628c23b06b148957f7fa805e7c`. Immutable workload v2 remains unchanged. Normalized run digests retain every frame, terminal, backend, semantics, role, and limitation; only self-referential corpus/decision/input bindings are omitted. These digests prove repeatability only. Exact arithmetic, boundary, convergence, parity, and controlled-configuration claims require the independent anchors below.

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

`vector.generic-aam-verification-run.v3` retains every tick: positions, speed, pitch/yaw and rates/signals, mass, thrust, drag, relative geometry, seeker angle, LOS rate, signed range rate, commands, closest approach, and state. Every integration stage rejects nonfinite or unsafe dynamic values. The output decoder is exact-key and exhaustive: every scalar and vector component must be a finite JSON number; nulls, strings, unknown keys/enums, invalid state/cause pairs, inconsistent ticks, inconsistent range/relative geometry, forged identity/digests, or missing limitations reject. `outputSha256` directly addresses frames plus terminal. Its encoding is closed: a big-endian 32-bit frame count; for each frame, the 19 scalar fields in declared contract order as big-endian IEEE-754 binary64, the four x/y/z vectors in declared contract order as binary64, and a one-byte closed state code; then terminal tick as binary64 plus closed one-byte state and cause codes. `contentSha256` addresses canonical identity/provenance/backend/role/limitations metadata plus `outputSha256`, thereby transitively binding the complete run except itself. Any field mutation without matching digest recomputation rejects. These hashes detect accidental/casual tamper and bind content; they do not establish cryptographic authenticity against an attacker who can alter content and recompute hashes.

Rust verification is compiled from the separate `verification-rust/generic-aam` crate with serde_json `float_roundtrip`. Its generated adapter lives under `lib/validation`, is imported only by verification scripts, tests, and the benchmark, and deep-validates the decoded output. The production `engine-rust` crate, production WASM ABI, `lib/engine/backend.ts`, and built simulation Worker contain no generic-AAM module, export, subject string, or adapter. Rust uses a local strict generic DTO; the shared production `Vec3` remains byte-for-byte unchanged. `TABLE_THRUST_CONFLICT_SENSITIVITY` and `COMMAND_LIMIT_SENSITIVITY` are explicitly non-authoritative causal contrasts.

## Verification and performance

Independent tests cover range/LOS/LOS-rate, between-tick and receding closest approach, strict hit epsilon, thrust/drag/speed, exact burnout transition, axial command, PN sign/limit boundaries, first-order lag, printed-radian seeker equality/epsilon, ground, D09 exceptions, and simultaneous-cause precedence. A one-second control-lag fixture converges monotonically at 32/64/128/256 Hz against its closed form, and full evaluator trajectories show decreasing endpoint differences across the same four rates.

The workload covers 32/64/128 Hz × all three bound printed seeker literals, exact Appendix B x/y/altitude extrema without admitting the D09 zero-range singularity, and the thrust conflict. Forward/reversed execution preserves per-case and sorted-batch digests. Controlled seeker-only configurations prove nested actual hit sets on a declared grid. All TypeScript and actual Rust-WASM frame values compare within `1e-9`; terminal state/tick and bindings are exact. Table-driven actual-WASM probes exercise equality and just-outside rejection for every declared speed, rate, signal, angle, missile-position, target-position, tick/work, and seeker-literal bound. Frame-zero retained scalars prove exact float decoding/serialization with `float_roundtrip`. Output falsifiers cover every numeric field and vector component with null/string inputs, every run binding and both content digests, unknown fields, cause forgery, nonfinite/extreme input, and operation limits.

Two independently generated artifacts have separate integrity and size gates. The production Rust/WASM artifact retains its existing 500,000-byte ceiling and contains no generic-AAM code; the current pre-freeze artifact is 410,994 bytes, SHA-256 `22e250cb506d1464544b6b25f05d5db3c0914fc6fe7bfdc9290141fe01dac1bd`, from production-source identity `e78eb3302d48d916e0bbcd934a13627be85c37d9f17d328027d71ab2830cc678`. The verification-only artifact also has an unchanged 500,000-byte ceiling; the current pre-freeze artifact is 205,536 bytes, SHA-256 `6a94ea3bd13ba7f9b054354a887b34aa317de71fdb07be9f4b5eb106957e1749`, from verification-source identity `25d86c626257f717b0d021a6daadfab17dcdbb2202746e142a5aa3e4eb57588b`. Both exact identities are rebuilt and verified in a clean clone before freeze.

On Apple M5 / macOS arm64 / Node v24.3.0, three isolated final 20-batch runs (15 cases, 12,145 frames, approximately 11.0 MB JSON per batch) observed TypeScript p95 21.024–23.928 ms and Node-hosted Rust-WASM p95 157.955–159.503 ms. Default gates remain 30 and 200 ms. The benchmark emits p50/p95/p99/max, RSS growth, frames, and bytes. It makes no Worker, UI, 100-entity, or product-capacity claim. A regression-first canonical-text digest implementation produced a 1,366.461 ms TypeScript p95 and was rejected; the admitted fixed-order binary64 output encoding preserves all governed fields while keeping both unchanged performance gates.

Run:

```sh
npm run reference-aam:verify
node --import tsx scripts/generate-nasa-generic-aam-workload.mjs --write # explicit governed rewrite only
node --import tsx --test tests/generic-aam-verification.test.mjs tests/generic-aam-oracles.test.mjs
npm run reference-aam:performance
npm run engine:rust:verify
npm run reference-aam:rust:verify
npm run reference-aam:rust:test
make ci-local
make clean-clone-local
```

Product browser behavior, Worker execution of the verifier, VSR, UI, database, migration, integration, and visual tests are omitted because this evaluator is prohibited from those boundaries. The production build and Worker are nevertheless scanned as isolation falsifiers: verifier code or identities appearing there fail the gate.

## Claims boundary

This can prove a deterministic, content-addressed port of declared generic NASA arithmetic, reviewed TS/Rust-WASM parity, and timestep/configuration sensitivity. Content hashes provide repeatability and tamper detection, not signer authenticity or protection from a capable attacker who recomputes them. It cannot prove named-missile performance, radar detection/false alarm/tracking, support/datalink, launch authorization, seeker acquisition, countermeasures, lethality, target manoeuvre validity, pilot tactics, or a Su-30MKI/F-16 result. It emits no `SimulationEventV2`, Situation Log, VSR, or named capability. Production truth-target/support/event defects remain owned by #28 and related issues.
