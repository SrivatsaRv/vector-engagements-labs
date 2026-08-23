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
- positive mass, an exactly symmetric, scale-conditioned positive-definite
  inertia tensor in kg·m², and an exact zero `cgBodyM` because the kernel datum
  is the centre of gravity;
- world position, body linear velocity, body angular rate, attitude, and a
  constant body-axis wrench.

The output is `vector.sixdof-verification-run.v1`. It retains every integer tick,
derives time only as `tick × fixedStepSeconds`, records the complete achieved
state, and identifies the backend and numerical method. Quaternion norm is
always diagnostic. Rotational-energy and inertial-angular-momentum drift are
reported only for an exactly zero applied force and moment; a nonzero wrench
returns typed `NOT_APPLICABLE_NONZERO_WRENCH` with both drift values `null`.

Both input paths reject unknown/missing keys, non-finite values, invalid schema
or convention identities, non-integer or excessive work, non-positive mass,
non-symmetric or poorly conditioned inertia, nonzero CG offset, invalid
quaternion norm, excessive angular increment, invalid RK4 stage quaternion, and
out-of-bound state or wrench values. There is no clamp, extrapolation, default,
or fallback.

Positive definiteness uses the same Cholesky decomposition in TypeScript and
Rust. Every diagonal pivot must be at least `1e-10` of the largest tensor
diagonal. This scale-aware gate rejects mathematically positive but numerically
near-singular tensors before the inverse is evaluated. Full symmetric cross-term
tensors are admitted when all three conditioned pivots pass.

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
after each committed tick. Initial, intermediate, combined and committed stages
fail closed unless the angular increment is at most `0.25 rad` per full step and
each RK stage quaternion norm is within `[0.5, 2]`. These identical TypeScript
and Rust constraints prevent finite-but-unresolved attitude steps from entering
the equations. Every intermediate and committed position, velocity and angular
rate must also remain inside the declared finite state bound; crossing it during
a step rejects instead of committing an out-of-domain state. There is one clock
and no wall-clock, network, database, atmosphere, gravity, ground, actuator,
aerodynamic, propulsion, fuel, or store callback. A future runtime slice must
define those forces and moments through admitted, bounded contracts rather than
adding aircraft-name branches.

The constant wrench is evaluated in the rotating body frame about the CG origin.
`cgBodyM` is retained as an explicit contract assertion and must be exactly zero;
the kernel does not pretend to consume an offset datum. This slice does not claim
fuel-burn or store-release CG evolution.

## Verification evidence

`tests/sixdof-foundation.test.mjs` provides independent analytical and
falsification cases:

- force/moment-free fixed state and integer tick time;
- constant force against `v = at`, `x = 1/2 at²`;
- constant principal-axis moment against `ω = Mt/I` and the analytical attitude;
- torque-free asymmetric-body gyroscopic coupling with rotational-energy and
  inertial-angular-momentum conservation bounds checked by independent expanded
  energy, angular-momentum and quaternion-rotation test oracles;
- independent 90-degree body/world rotation and rotating-body translation
  solutions;
- a fully cross-coupled SPD inertia tensor with an independently known eigenaxis
  force/moment solution in both backends;
- coupled force/moment timestep convergence;
- exact repeated serialized bytes and per-frame TypeScript/Rust-WASM parity;
- exact/cross-bound angular-step, dynamic RK-stage, scale-conditioned inertia,
  CG-origin and admitted numeric-extreme cases in both backends;
- conservation diagnostic applicability for zero versus nonzero wrench;
- TypeScript and independent Rust/WASM fail-closed admission cases.

`npm run sixdof-foundation:performance` runs a 10,000-tick TypeScript and
Node-hosted Rust/WASM benchmark. Its deliberately broad regression thresholds
are 1,000 ms and 2,000 ms respectively; recorded handoff evidence must name the
host, architecture, runtime, workload, and measured time.
`ci-tests` invokes this command directly, so `make ci-local` and
`make clean-clone-local` cannot omit the performance gate. The focused
`make sixdof-foundation-local` target runs both the numerical suite and benchmark.

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
