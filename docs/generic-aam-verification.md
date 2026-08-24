# NASA TM-109057 generic AAM verification foundation

Status: `ENGINE_VERIFICATION_ONLY` foundation for #140. Parent issues #28, #39, and #47 remain open.

## Authority and immutable artifacts

The sole source is NASA-TM-109057, *The Analysis of a Generic Air-to-Air Missile Simulation Model* (June 1994), NTRS citation `19940031931`. Canonical record: `https://ntrs.nasa.gov/citations/19940031931`. Canonical PDF: `https://ntrs.nasa.gov/api/citations/19940031931/downloads/19940031931.pdf`.

The source was accessed and reviewed on 2026-08-24. NTRS reported `PUBLIC`, `DOCUMENT_AND_METADATA`, curated, `GOV_PUBLIC_USE_PERMITTED`, export-control `NO`, EAR `NO`, and ITAR `NO`. Two independent downloads produced the same 48-page, 2,606,172-byte PDF with SHA-256 `30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa`.

The current separate corpus is `governance/nasa-tm-109057-generic-aam-verification-corpus.v5.json`, 11,521 bytes with raw-file SHA-256 `bb8599aefa2b698396db6aa2dbdbae2e541532486e189e5a34b993a9f2bd9204`. Its canonical object SHA-256 is `e799212813fba8b635ee4b8bce114af842ba6a38ef0fb3fbcf21f32b4be55420`; its decision-array SHA-256 is `884bca829ac1b94f959ecff1be6b9cf9847512810c7010f36d8b78cf6cef22f2`. Immutable v1–v4 remain readable for ancestry; v5 owns executable admission. In particular, v3 remains exactly 7,456 bytes with raw-file SHA-256 `57af85c0bafdb47563e4bd09cce08d329f4044b52adbf50c6e1a072e228d81b3`, and reviewed v4 remains exactly 7,456 bytes with raw-file SHA-256 `7d680b9417e074757f0ab7426ff46bb773e8000191c501a99d386a4d023061a5`. The imported corpus is frozen behind a private module boundary and its source, corpus, and decision identities are fixed compiled constants. Callers receive recursively frozen copies, never the trusted singleton. Mutation of a caller view, forged source/hash values, or mutation of the DCS/War Thunder, parity-policy, and prohibited-surface lists cannot change current or later admission.

The current governed bounded workload is `fixtures/public-reference/nasa-tm-109057/workload.v5.json`, 7,922 bytes, SHA-256 `b1f2092dc810909ffa0b4c9c1b2cf33102ca02f0a10a9bbb24d653ed2bc7c4be`. Its sorted 15-case cross-platform semantic batch digest is `430a2a8a5ffa120f86e9ea2d9e5128526a397d2aa4f53609b0aff9cfae2c87e2`. Immutable workload v2–v4 remain unchanged; v3 is exactly 8,223 bytes with SHA-256 `0b7f7ba1395ff58629c26aaa62e46c239121d37e4197a2246e1064aa8caeb556`, and reviewed v4 is exactly 7,922 bytes with SHA-256 `9df2c63309e22931deed24c2ee267b7efed2fc7783061ad84b2628f8e577012d`. Each evaluator run used by these workloads still owns raw `outputSha256` and `contentSha256` identities over all binary64 frames and terminal metadata. Those raw identities prove exact same-runtime repeatability and field tamper detection; they are deliberately not cross-host goldens. Exact arithmetic, boundary, convergence, parity, and controlled-configuration claims require the independent anchors below.

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

The repository-wide Rust contract pins 1.97.1. The generic-AAM module is
compiled through the immutable Linux/amd64
`rust:1.97.1-bookworm@sha256:408fe88047cef61a2087653b0c5255fa51c0f2d6d94ddedd7a2562a9b91a46f6`
builder used for private verification artifacts. The repository is mounted
read-only and the Cargo target is isolated. Source, builder, exact byte digest,
byte length, and ABI exports must all match; host-native output is diagnostic
only and is never an admitted alternate artifact.

## Verification and performance

Independent tests cover range/LOS/LOS-rate, between-tick and receding closest approach, strict hit epsilon, thrust/drag/speed, exact burnout transition, axial command, PN sign/limit boundaries, first-order lag, printed-radian seeker equality/epsilon, ground, D09 exceptions, and simultaneous-cause precedence. A one-second control-lag fixture converges monotonically at 32/64/128/256 Hz against its closed form, and full evaluator trajectories show decreasing endpoint differences across the same four rates.

The workload covers 32/64/128 Hz × all three bound printed seeker literals, exact Appendix B x/y/altitude extrema without admitting the D09 zero-range singularity, and the thrust conflict. Forward/reversed execution preserves each raw per-backend run digest within one runtime, all per-case semantic digests, and the sorted semantic batch digest. Controlled seeker-only configurations prove nested actual hit sets on a declared grid. Before semantic projection, the verifier requires exact finite terminal/frame-count/tick/state prerequisites and compares all 30 numeric scalar/vector leaves in all 12,145 frames: 364,350 comparisons. Twenty-eight fields retain the `1e-9` absolute gate. Cancellation-conditioned `closestApproachTimeS` uses `1e-9 + 5e-12*max(abs(ts),abs(rust))`; `closestApproachDistanceM` uses `1e-9 + 3e-11*max(abs(ts),abs(rust))`. Table-driven actual-WASM probes exercise equality and just-outside rejection for every declared speed, rate, signal, angle, missile-position, target-position, tick/work, and seeker-literal bound. Frame-zero retained scalars prove exact float decoding/serialization with `float_roundtrip`. Output falsifiers cover every numeric field and vector component with null/string inputs, every run binding and both content digests, unknown fields, cause forgery, nonfinite/extreme input, operation limits, malformed parity policy, comparator boundaries, and mutations at least twice the admitted field bound.

The v5 cross-platform projection is intentionally narrower than a raw trajectory but remains numerically meaningful. It binds the governed parity-policy identity, case role/configuration/target, exact terminal state/tick/cause and frame count; initial, interior, and final missile position, speed, mass, range, seeker angle, and pitch/yaw command samples; and minimum range plus maximum absolute pitch/yaw command aggregates. Physical values are rounded into `1e-6` SI/radian integer bins using ECMAScript `Math.round` (ties toward positive infinity), with `-0` normalized to `0`; nonfinite or unsafe-integer conversions reject. The exhaustive field-specific TypeScript/Rust comparison occurs before projection. Tests cover both sides of each half-bin (`±0.499999e-6` and `±0.500001e-6`), exact ties, negative zero, conversion overflow, order, duplicates, workload/per-case/aggregate tamper, a stable adjacent-binary64 drift, and detection of a 1 mm nonterminal interior trajectory mutation and controlled configuration change.

The v4 successor was prompted by a real cross-host falsifier at immutable `b77f6c03ea3da157d860ef0f4dd7338e408641d2`: macOS arm64 / Node 24.3.0 produced the v3 raw batch `4e9a8c39…`; Linux arm64 / Node 22.18.0 produced `2d9f58…`; hosted Linux x64 / Node 22.18.0 produced `4d0991c7…`. All 15 terminal states/ticks/causes and frame counts were identical, and Rust-WASM frames were bit-identical. Only six TypeScript cases differed (`RATE{32,64,128}_SEEKER{20,30}`). The observed maximum absolute deltas were: closest-approach distance `1.1878498185069475e-10`; yaw signal/command `6.014211351157428e-11`; yaw rate `3.5935698861067067e-12`; drag `9.094947017729282e-13`; vector y `2.2737367544323206e-13`; closest-approach time `1.2612133559741778e-13`; pitch signal/command `1.5765166949677223e-14`; vector z `3.4093821515979172e-15`; pitch rate `8.881784197001252e-16`; yaw angle `3.3306690738754696e-16`; seeker angle `5.551115123125783e-17`; vector x `3.1916201452542037e-18`; and pitch angle `1.0842021724855044e-19`. This evidence supports a libm/runtime serialization cause, not a terminal-semantics difference. The corrected v4 verifier produced the same `4cfabe5d…` semantic batch on macOS arm64 / Node 24.3.0 and Linux x64 / Node 22.18.0. The verifier reports Node version, platform, and architecture without including host provenance in the governed semantic digest.

Independent review of immutable v4 SHA `6a97c3b230c6751080cb88485859b4743dba3593` then exposed the short-horizon parity gap: the prior test stopped after two seconds. The full governed workload had 36 values above `1e-9`, only in CPA distance (34) and time (2): `CONFLICT_THRUST` 20, `RATE128_SEEKER30` 10, `RATE64_SEEKER20` 4, and `RATE32_SEEKER30` 2. Maximum distance delta was `2.0713287085527554e-8` at `CONFLICT_THRUST` tick 101 (relative `1.3612619218727864e-11`); maximum time delta was `3.499962986097671e-9` at tick 100 (relative `2.033981575206581e-12`). Results were identical on macOS arm64 / Node 24.3.0 and Linux x64 / Node 22.18.0. Direct point, cross-product, and direct-square-root recomputations retained the same maximum distance delta, showing cancellation amplification from already-admitted sub-`1e-9` trajectory drift rather than an implementation-order defect. V5 therefore leaves printed evaluator arithmetic unchanged and binds the proportionate CPA-only combined tolerances above. The corpus records the exact per-rate/seeker maxima, host identities, values, counts, formula, and rationale. The v5 verifier produces the same semantic batch `430a2a8a…`, 12,145-frame/364,350-comparison parity report, and 36/36 focused pass on both declared hosts.

Two independently generated artifacts have separate integrity and size gates. The production Rust/WASM artifact retains its existing 500,000-byte ceiling and contains no generic-AAM code. The historical #144 pre-merge freeze was 410,994 bytes, SHA-256 `22e250cb506d1464544b6b25f05d5db3c0914fc6fe7bfdc9290141fe01dac1bd`, from production-source identity `e78eb3302d48d916e0bbcd934a13627be85c37d9f17d328027d71ab2830cc678`. After current-main integration and the separate 6DOF-verifier boundary, the production artifact is 493,585 bytes, SHA-256 `e1105047cd06edd50f13d8b212e1292bda747468ee7421a977112fadeef65b8c`, from production-source identity `331b0bae4336f88a1ef81e26c5f068a01c89ece1a732d30eae21b0e74b42f2bc`; it still contains no generic-AAM or 6DOF-verifier ABI. The canonical generic-AAM verification-only artifact is 205,464 bytes, SHA-256 `44cd233b65ff82832bdf5853f78b763edfb3f12ae00d1ddc7c63df4ff693c435`, from unchanged verification-source identity `4156fb4e400ebc9aa4a735896472264e61b17ef382311ef048c8eff9963892b8`. These current identities are rebuilt and verified in a clean clone before freeze.

On Apple M5 / macOS arm64 / Node v24.3.0, three isolated final 20-batch runs (15 cases, 12,145 frames, approximately 11.0 MB JSON per batch) observed TypeScript p95 23.220–25.989 ms and Node-hosted Rust-WASM p95 158.133–177.073 ms. A ten-run pre-change calibration on the same named host observed TypeScript p95 20.629–25.676 ms and Rust-WASM p95 157.117–160.720 ms; the post-policy ten-run recheck observed 21.199–25.996 ms and 159.438–164.396 ms respectively. The closed `APPLE_M5_NODE24` regression profile therefore retains 30 and 200 ms; it rejects a different runtime, platform, architecture, CPU, or GitHub-hosted context instead of presenting that machine's result under the M5 label. Two prior TypeScript p95 results of 35.614 and 119.161 ms remain excluded as contaminated because concurrent clean-clone Vitest workers occupied 70–90% CPU across eight processes.

Hosted Stage 2B now selects the separate closed `GITHUB_HOSTED_UBUNTU24_X64_NODE22` profile explicitly. The unchanged exact-`d9023793…` diagnostic campaign on run `32727846075`, Ubuntu 24.04 image `20260816.277`, Linux x64 and Node v22.18.0 observed TypeScript p95 46.208, 52.163, 45.081, and 34.857 ms in the original job `97433307768` and sequential diagnostic jobs `97435257856`, `97436000926`, and `97436705551`. These failed reruns are calibration evidence, never release evidence. The hosted TypeScript ceiling is 65 ms: 24.6 percent above the largest calibration sample while still rejecting a greater-than-2.16-times regression against the 30 ms M5 ceiling. Rust-WASM was not reached by the old fail-fast script, so the existing stricter 200 ms limit is retained until complete hosted evidence justifies any successor policy.

The v2 benchmark measures both backends before evaluation and emits its environment, selected profile, all 20 sorted samples, p50/p95/p99/maximum, RSS growth, frames, and bytes before an aggregate nonzero failure. Profile selection never auto-detects a more permissive ceiling; missing, unknown, or environment-mismatched profiles reject, and the removed `VECTOR_MAX_GENERIC_AAM_*_P95_MS` variables cannot override either closed policy. The benchmark makes no Worker, UI, 100-entity, or product-capacity claim. A regression-first canonical-text digest implementation produced a 1,366.461 ms TypeScript p95 and was rejected; the admitted fixed-order binary64 output encoding preserves all governed fields.

The first aggregate local gate ran the M5 benchmark after the engine, TrackStore, and capacity workloads and correctly failed at Rust-WASM p95 205.777 ms while still emitting both distributions. An immediately isolated run measured 192.779 ms, and the aggregate target reordered to run this load-sensitive named baseline first passed at 199.375 ms. A harness regression fixes that order; the 200 ms policy was not weakened and the failed contaminated run is not release evidence.

Run:

```sh
npm run reference-aam:verify
node --import tsx scripts/generate-nasa-generic-aam-workload.mjs --write # explicit governed rewrite only
node --import tsx --test tests/generic-aam-verification.test.mjs tests/generic-aam-oracles.test.mjs
npm run reference-aam:performance
npm run reference-aam:performance:hosted-linux-x64 # GitHub-hosted Ubuntu 24 x64 / Node 22.18.0 only
npm run engine:rust:verify
npm run reference-aam:rust:verify
npm run reference-aam:rust:fmt
npm run reference-aam:rust:clippy
npm run reference-aam:rust:test
npm run reference-aam:rust:doc
make ci-local
make clean-clone-local
```

Product browser behavior, Worker execution of the verifier, VSR, UI, database, migration, integration, and visual tests are omitted because this evaluator is prohibited from those boundaries. The production build and Worker are nevertheless scanned as isolation falsifiers: verifier code or identities appearing there fail the gate.

## Claims boundary

This can prove a deterministic, content-addressed port of declared generic NASA arithmetic, reviewed TS/Rust-WASM parity, and timestep/configuration sensitivity. Content hashes provide repeatability and tamper detection, not signer authenticity or protection from a capable attacker who recomputes them. It cannot prove named-missile performance, radar detection/false alarm/tracking, support/datalink, launch authorization, seeker acquisition, countermeasures, lethality, target manoeuvre validity, pilot tactics, or a Su-30MKI/F-16 result. It emits no `SimulationEventV2`, Situation Log, VSR, or named capability. Production truth-target/support/event defects remain owned by #28 and related issues.
