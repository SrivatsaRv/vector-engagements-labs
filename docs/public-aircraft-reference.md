# Public aircraft dynamics verification

VECTOR admits a public aircraft reference only as an isolated verification asset. It does not silently replace operational scenario coefficients or convert a public F-16 check case into a claim about a PAF F-16C Block 52, an IAF Su-30MKI, tactics, weapons employment or mission outcome.

## Admitted check case

The first asset is NASA NESC 2015 Atmospheric Case 11, a 180-second subsonic, wings-level trimmed F-16 flyout. NASA publishes the case specification, an F-16 DAVE-ML package, and trajectory CSVs from independent implementations.

| Evidence | Immutable identity |
| --- | --- |
| [Case 11 specification](https://nescacademy.nasa.gov/flightsim/2015/atmospheric/acc11) | Public NASA NESC case page |
| [F-16 DAVE-ML package](https://nescacademy.nasa.gov/workshop/FlightSim/2015/models/F16_package.zip) | SHA-256 `20c60f615ae8e87d81c9d98b54fff45a2832840201499cbcfe3f45a60ef3e5b2` |
| [Sim 04 trajectory](https://nescacademy.nasa.gov/workshop/FlightSim/2015/atmos_scn_11/Atmos_11_sim_04.csv) | SHA-256 `c6b8c1210c31fa440d271297ad219b5ad89264f4bb8a25f636c14f53d9b04a07` |

The committed fixture retains four SI-normalized checkpoints at 0, 60, 120 and 180 seconds. It records geodetic position, NED velocity, MSL altitude, Euler attitude, body angular rate, aerodynamic body force and moment, Mach and dynamic pressure. The trim record also preserves mass, inertia, pilot/control positions and required thrust.

## Executable gate

`lib/validation/public-aircraft-reference.ts` and `engine-rust/src/public_aircraft_reference.rs` independently propagate the same admitted trim state. They hold the trim condition while moving its geodetic position along the declared spherical-Earth great-circle model. Both backends emit the same versioned state and specific energy. The verifier then compares that output with the external time history.

The committed gates are:

| Channel | Maximum admitted error |
| --- | ---: |
| Geodesic position | 100 m |
| MSL altitude | 0.1 m |
| Speed | 0.02 m/s |
| Yaw / pitch / roll | 0.6° / 0.01° / 0.1° |
| Body angular-rate vector | 0.0001 rad/s |
| Aerodynamic force / moment vectors | 2 N / 0.1 N·m |
| Mach / dynamic pressure | 0.0001 / 1 Pa |
| Trim force residual | 400 N |
| TypeScript/Rust-WASM parity | 1×10⁻⁹ per compared numeric channel |

`make reference-aircraft-local` runs the evidence, determinism, external-history and cross-backend parity gate. `make ci-local` includes the same gate and rebuild-verifies the embedded WASM artifact.

## Current evidence

Measured locally on 2026-08-12 using Node.js v24.3.0 on Apple M5 arm64:

- maximum geodesic error: 69.098 m;
- maximum speed error: 0.001968 m/s;
- maximum altitude error: 0.026640 m;
- trim force residual: 342.205 N;
- every declared external-history tolerance passed;
- every compared TypeScript/Rust-WASM value stayed within 1×10⁻⁹;
- 200-run microbenchmark p95: 0.010 ms TypeScript and 0.023 ms Rust/WASM.

These numbers are a local regression record, not an x86-64, browser rendering, capacity or named-aircraft performance claim.

## Deliberate limitations and next causal step

This slice validates evidence ingestion, unit normalization, trim propagation, six-state telemetry, force/moment/control metadata, external time-history comparison, bounded execution and backend parity. It does not yet execute every nonlinear DAVE-ML coefficient table, propulsion map or controller transient. It does not validate departure, high-angle-of-attack, supersonic, damage or combat behavior.

The next flight-model expansion must add a separately versioned maneuvering case and full coefficient/control evaluator before the platform upgrades the operational scenario from its current educational point-mass claim. Corrections create a new fixture version and digest; published evidence is never mutated in place.

The reference fixture is a verification asset only. It cannot expand the
validity domain of a scenario aircraft or satisfy an aircraft model-pack
component that has incomplete coverage. Compiled-pack admission checks those
domains independently in TypeScript and Rust/WASM, and rejects a gap rather
than borrowing values from this trim fixture or a scalar regression model.

It also cannot admit named-aircraft performance. A future named aircraft pack
must bind every required capability class to immutable source evidence and a
separate independent validation artifact. Until then, its compiled admission
state is `UNSUPPORTED`, and any named-performance consumer must fail closed.
