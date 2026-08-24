# Generic 6DOF numerical foundation

Status: isolated verification kernel, schema v1, 2026-08-24.

This foundation proves the source-independent rigid-body equations and the
TypeScript/Rust-WASM boundary required by #134. Rust is compiled into a separate
verification-only artifact from `verification-rust/sixdof-foundation`; the
production Rust engine, backend adapter, WASM module, and Worker contain no
6DOF verifier. The foundation is deliberately not connected to `EngineScenario`,
a model-pack compiler, Workers, VSR, playback, or named aircraft. It cannot be
selected in the product and supplies no Su-30MKI, Su-30, F-16, weapon, sensor,
control-law, or handling-quality evidence.

## Versioned contract

`vector.sixdof-verification-input.v1` is an exact-key JSON contract. It declares:

- `RIGHT_HANDED_INERTIAL_XYZ` world axes;
- `RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN` body axes;
- a scalar-first body-to-world quaternion;
- position at and body forces/moments about the centre of gravity;
- SI units only;
- an integer tick count and fixed step in seconds;
- mass in the governed `[1, 1e9] kg` safe domain, an exactly symmetric,
  scale-conditioned positive-definite inertia tensor in kg·m² with largest
  diagonal in `[1e-6, 1e15]`, and an exact zero `cgBodyM` because the kernel
  datum is the centre of gravity;
- world position, body linear velocity, body angular rate, attitude, and a
  constant body-axis wrench.

The output is `vector.sixdof-verification-run.v1`. It retains every integer tick,
derives time only as `tick × fixedStepSeconds`, records the complete achieved
state, and identifies the backend and numerical method. Quaternion norm is
always diagnostic. Rotational-energy and inertial-angular-momentum drift are
reported only for an exactly zero applied force and moment; a nonzero wrench
returns typed `NOT_APPLICABLE_NONZERO_WRENCH` with both drift values `null`.

Both input paths reject unknown/missing keys, non-finite values, invalid schema
or convention identities, non-integer or excessive work, mass or inertia scale
below the governed safe domain, non-symmetric or poorly conditioned inertia,
nonzero CG offset, invalid
quaternion norm, excessive angular increment, invalid RK4 stage quaternion, and
out-of-bound state or wrench values. There is no clamp, extrapolation, default,
or fallback.

The private Rust/WASM JSON ABI enables `serde_json`'s correctly rounded binary64
decoder. A finite JavaScript number therefore reaches Rust as the same IEEE-754
value encoded by `JSON.stringify`; admission is never evaluated against a
one-ULP-rounded neighbour. Verification retains the authored value at frame
zero and sweeps scalar, angular-increment, and full-cross Cholesky boundaries
through the actual isolated WASM transport.

Positive definiteness and the solve use the same scale-normalized Cholesky
decomposition in TypeScript and Rust. Every normalized diagonal pivot must be at
least the exact binary fraction `2^-32` of the largest tensor diagonal. This is
stricter than the superseded decimal `1e-10` threshold and gives both runtimes
one exactly representable comparison boundary. The triangular Cholesky solve
replaces the determinant/adjugate inverse, so an admitted minimum-scale tensor
does not underflow its determinant. Full symmetric cross-term tensors are
admitted when all three conditioned pivots pass.

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
each RK stage quaternion norm is within `[0.5, 2]`. Angular admission never calls
a runtime-specific `hypot`: both implementations multiply each rate component
by the step, evaluate `((x² + y²) + z²)` in that order, and compare it with the
exact binary value `0.25²`. Quaternion admission uses the corresponding ordered
squared norm. These identical constraints prevent finite-but-unresolved attitude
steps and ULP-dependent cross-runtime admission from entering the equations.
Every intermediate and committed position, velocity and angular
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
- the previously divergent angular vector
  `{14.485848611447416, 16.020079621048747, 12.590362939227987}` plus deterministic
  adjacent-ULP sweeps around multiple angular boundaries;
- exact and adjacent-ULP Cholesky boundaries at multiple tensor scales, explicit
  rejection of `Number.MIN_VALUE` mass and `diag(1e-108)` inertia, and one finite
  zero-wrench tick at every minimum/maximum mass and conditioned-inertia scale
  combination;
- actual isolated-WASM preservation of authored binary64 values plus a
  deterministic 3,360-case angular and full-cross Cholesky admission sweep;
- conservation diagnostic applicability for zero versus nonzero wrench;
- TypeScript and independent Rust/WASM fail-closed admission cases.
- production-isolation regression across the Rust crate, WASM export table,
  backend adapter, and built simulation Worker.

The production artifact remains independently generated at 493,585 bytes,
below its unchanged 500,000-byte gate, with no verifier export. The standalone
verification artifact is 161,590 bytes and has its own 500,000-byte gate. Its
SHA-256 is
`b06b28cdb364477dbc9413e644bca2f0b2fa894e1436a28355269ae2f4321f37`;
its exact Rust source/lock identity is
`824200fca11e562779c1f6b871e302baa421ba2d6b4653684b3974e53c2aa637`.

`npm run sixdof-foundation:performance` runs a 10,000-tick TypeScript and
Node-hosted Rust/WASM benchmark. Its deliberately broad regression thresholds
are 1,000 ms and 2,000 ms respectively; recorded handoff evidence must name the
host, architecture, runtime, workload, and measured time.
`ci-tests` invokes this command directly, so `make ci-local` and
`make clean-clone-local` cannot omit the performance gate. The focused
`make sixdof-foundation-local` first rebuild-verifies the private artifact, then
runs the numerical suite and benchmark. `make ci-local` additionally runs its
Rustfmt, strict Clippy, native Rust, and rustdoc gates independently of the
production engine crate.

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
