# Work item 03: Reference aircraft flight model

Priority: P0

Depends on: compiled model-pack contract

Blocks: defensible WVR behavior and named-aircraft expansion

## Outcome

One public reference aircraft runs as a verified nonlinear flight model in the browser, with enough evidence to establish the model-pack, integration, control, and telemetry pipeline before Su-30MKI and F-16 variant expansion.

## Why one reference aircraft first

One credible object is primarily a data and verification project, not a compute project. Adding ten named aircraft before one model passes force, moment, trim, energy, and convergence tests would multiply unsupported assumptions.

The initial reference should use a public model with published verification time histories, such as the NASA NESC F-16 check case or a compatible JSBSim public model. This does not claim that the resulting F-16 model represents a PAF Block 52 mission configuration. It proves the engine and object pipeline against an external corpus.

## Required state

- WGS84/ECEF and local NED or ENU position;
- body attitude quaternion;
- body and Earth-relative velocity;
- body angular rates;
- mass, fuel, center of gravity, and inertia tensor;
- angle of attack, sideslip, dynamic pressure, Mach, and atmospheric state;
- control surface positions and rates;
- engine and throttle state;
- force and moment totals with component breakdown.

## Required behavior

1. Six-degree-of-freedom rigid-body propagation.
2. Aerodynamic forces and moments from coefficient functions.
3. Propulsion varying with throttle, mode, altitude, and Mach.
4. Mass, fuel, center-of-gravity, and inertia updates.
5. Actuator and flight-control dynamics with limits.
6. Trim and initialized flight conditions.
7. Ground or terrain termination only after the geospatial contract is available.
8. Deterministic fixed-step execution with explicit integrator selection.

## Fidelity promotion

The general engine should support mixed fidelity without changing entity identity:

- `AUTHORED_TRAJECTORY` for replay-only/background actors;
- `KINEMATIC_3DOF` for low-cost supporting aircraft;
- `ENERGY_MANEUVER_3DOF` for tactical background actors;
- `AIRCRAFT_6DOF` for the selected aircraft when handling matters.

A scenario declares the required fidelity per entity. Promotion changes the model component, not the entity or telemetry identity.

## Acceptance criteria

- The selected reference aircraft trims at declared test points.
- Straight and level flight remains inside published tolerances.
- Control-step, acceleration, climb, and coordinated-turn histories match the reference corpus within declared tolerances.
- Quaternion norm, fuel, mass, energy accounting, and finite-state invariants remain valid.
- Halving the time step produces convergent trajectories and reported error bounds.
- The same compiled model and commands produce stable deterministic digests across repeated runs.
- Rust/WASM and an independent reference implementation agree within field-specific tolerances.
- The main thread remains responsive because the model runs in the simulation Worker defined later.

## Tests

- NASA NESC atmospheric and F-16 check cases where licensing and data permit.
- Analytic vacuum, constant-force, constant-moment, gravity, and coordinated-turn cases.
- Trim residual tests.
- Control saturation and actuator-rate tests.
- Stall or out-of-domain handling tests.
- Fuel exhaustion and center-of-gravity progression.
- Time-step convergence at 5, 10, 20, and 50 ms where applicable.
- Long-duration numerical drift and non-finite state rejection.

## Expansion gate for Su-30MKI and F-16C Block 52

A named variant may be added only when its pack has:

- a documented configuration;
- enough aerodynamic and propulsion data for the intended-use envelope;
- flight-control and limit behavior appropriate to that configuration;
- loadout mass and drag integration;
- validation points and explicit gaps.

Public identity, service ceiling, top speed, and thrust are not sufficient by themselves.

## References

- [JSBSim manual](https://jsbsim-team.github.io/jsbsim-reference-manual/)
- [JSBSim state and reference frames](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/frames-of-reference/)
- [NASA 6DOF verification check cases](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20150001263.pdf)
- [NASA verification of the generalized aerospace simulation](https://ntrs.nasa.gov/citations/20230017903)
