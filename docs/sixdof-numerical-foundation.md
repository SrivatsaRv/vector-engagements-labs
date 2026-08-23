# Generic 6DOF numerical foundation

Status: isolated verification kernel, schema v1, 2026-08-23.

This foundation proves the source-independent rigid-body equations and the
TypeScript/Rust-WASM boundary required by #134. It is deliberately not connected
to `EngineScenario`, a model-pack compiler, Workers, VSR, playback, or named
aircraft. It cannot be selected in the product and supplies no Su-30MKI, Su-30,
F-16, weapon, sensor, control-law, or handling-quality evidence.

## Versioned contract

`vector.sixdof-verification-input.v1` is an exact-key JSON contract. It declares:

- `RIGHT_HANDED_INERTIAL_XYZ` world axes;
- `RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN` body axes;
- a scalar-first body-to-world quaternion;
- position at and body forces/moments about the centre of gravity;
- SI units only;
- an integer tick count and fixed step in seconds;
- positive mass, an exactly symmetric positive-definite inertia tensor in
  kg·m², and the CG location in body metres;
- world position, body linear velocity, body angular rate, attitude, and a
  constant body-axis wrench.

The output is `vector.sixdof-verification-run.v1`. It retains every integer tick,
derives time only as `tick × fixedStepSeconds`, records the complete achieved
state, identifies the backend and numerical method, and reports quaternion norm,
rotational-energy, and inertial-angular-momentum drift diagnostics.

Both input paths reject unknown/missing keys, non-finite values, invalid schema
or convention identities, non-integer or excessive work, non-positive mass,
non-symmetric or non-positive-definite inertia, invalid quaternion norm, and
out-of-bound state or wrench values. There is no clamp, extrapolation, default,
or fallback.

## Equations and numerical method

For mass `m`, body velocity `v`, body angular rate `ω`, body-to-world rotation
`R(q)`, body force `F`, body moment `M`, and CG inertia tensor `I`:

```text
world_position_dot = R(q) v
body_velocity_dot  = F / m - ω × v
body_rate_dot      = I^-1 (M - ω × (I ω))
quaternion_dot     = 1/2 q ⊗ [0, ω]
```

The kernel uses fixed-step fourth-order Runge-Kutta and normalizes the quaternion
after each committed tick. There is one clock and no wall-clock, network,
database, atmosphere, gravity, ground, actuator, aerodynamic, propulsion, fuel,
or store callback. A future runtime slice must define those forces and moments
through admitted, bounded contracts rather than adding aircraft-name branches.

The constant wrench is evaluated in the rotating body frame about the declared
CG reference. CG is static in this slice; its presence defines the reference
contract but does not claim fuel-burn or store-release evolution.

## Verification evidence

`tests/sixdof-foundation.test.mjs` provides independent analytical and
falsification cases:

- force/moment-free fixed state and integer tick time;
- constant force against `v = at`, `x = 1/2 at²`;
- constant principal-axis moment against `ω = Mt/I` and the analytical attitude;
- torque-free asymmetric-body gyroscopic coupling with rotational-energy and
  inertial-angular-momentum conservation bounds;
- coupled force/moment timestep convergence;
- exact repeat determinism and per-frame TypeScript/Rust-WASM parity;
- TypeScript and independent Rust/WASM fail-closed admission cases.

`npm run sixdof-foundation:verify` also runs a 10,000-tick TypeScript and
Node-hosted Rust/WASM benchmark. Its deliberately broad regression thresholds
are 1,000 ms and 2,000 ms respectively; recorded handoff evidence must name the
host, architecture, runtime, workload, and measured time.

## Explicitly unmet #134 scope

This foundation does not satisfy #134 completion. Still required are:

- a versioned 6DOF source/compiler/compiled model-pack contract;
- independently approved public reference-aircraft cases and tolerances;
- bounded aerodynamic and propulsion force/moment lookup across the admitted
  domain;
- actuator, control-surface, control-mixing, and flight-control-law state;
- causal mass, fuel, CG, inertia, station/store, release, and jettison changes;
- gravity, atmosphere, environment, ground/contact, stall/departure, and explicit
  envelope rejection as applicable;
- explicit production 3DOF/6DOF admission without substitution;
- Worker cancellation/recovery, VSR/replay, browser synchronized-view, capacity,
  and end-to-end configuration-contrast evidence;
- exact-subject evidence before any named-aircraft handling claim.

Until those criteria are implemented and independently reviewed, #134, #64, and
#47 remain open and the deployed engine remains its separately governed 3DOF
mode.
