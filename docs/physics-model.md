# Physics and information-model status

Vector currently uses a deterministic three-dimensional point-mass reference engine intended for inspectable sensitivity research, not verified prediction of named-system performance.

## Integrated model

- fixed 50 ms integration step and sampled immutable frames;
- WGS84/ECEF-derived local east/north/up coordinates with an immutable scenario origin;
- educational standard atmosphere, density, speed of sound, and Mach;
- air-relative velocity with an explicit three-axis wind vector;
- launch-state inheritance;
- thrust taper, propellant mass depletion, aerodynamic drag, and gravity;
- aircraft empty, fuel, and installed-store mass; thrust demand; parasitic drag; induced drag; and load-factor-limited three-axis route steering;
- direct and commanded-loft guidance;
- proportional-navigation acceleration demand with command limits;
- deterministic execution of authored airborne route points;
- G2G commanded cruise altitude, with a terminal blend to objective elevation for direct paths and a higher commanded apex for lofted paths;
- governed wind-shift events;
- closest approach, completion, energy, target-unavailable, and time termination; non-finite-state checks; and dry-mass margin diagnostics.

Weapon frames carry a closed achieved flight-state value: `STOWED`, `BOOST`,
`COAST`, `TERMINAL_GUIDANCE`, or `TARGET_UNAVAILABLE`. It is derived by the
engine from launch/lifecycle and propulsion/guidance conditions and is replayed
unchanged by consumers. It is not a seeker, target-track, data-link, or support
claim. Typed seeker and support state remains blocked on the #26/#28 interface
and must fail closed rather than being inferred from a weapon name or truth.
The current compiled weapon admissions explicitly record `UNAVAILABLE` seeker
and support requirements plus `SCHEDULED_TEST_ONLY` launch authorization. The
existing deterministic fly-out remains a bounded educational trajectory test;
it does not claim operational seeker acquisition, data-link support, warning,
or support loss/recovery.

If an admitted weapon's assigned target is already terminated or becomes
terminated, both engines set its achieved state to `TARGET_UNAVAILABLE`,
terminate that weapon, and end the run with `target_unavailable` in the same
fixed step. They do not continue toward a substitute, cached, or truth-derived
target state. This is a typed lifecycle boundary, not seeker or support
modelling.

The current scalar source assumptions remain in versioned `simulation_models` rows for
catalog delivery and are compiled into the immutable
`vector.compiled-model-pack.v1` regression fixture. Public source assertions,
unit-bearing model sources, compiled SI data, and credibility evidence remain
separate. Every engine entity records the exact model ID, version, value state,
and pack digest. This foundation does not add flight dynamics or increase the
fidelity claim.

An isolated public-aircraft verification runner now admits NASA NESC 2015
Atmospheric Case 11 with content hashes and SI-normalized checkpoints. It
reproduces the published subsonic trim flyout in TypeScript and Rust/WASM within
declared position, velocity, attitude, angular-rate, force, moment, Mach,
dynamic-pressure, energy and trim-residual tolerances. This is a validation of
the trim-propagation and evidence pipeline, not an upgrade to the operational
scenario flight model. See [`public-aircraft-reference.md`](public-aircraft-reference.md).

The separate governed aircraft-evidence registry hashes the committed NASA
derivative, records its source/validation ancestry, and requires exact
per-capability subject coverage before a named-aircraft admission can be
compiled. Registry v2 currently blocks IAF Su-30MKI, PAF F-16C Block 52 Peace
Drive I, and catalog-only PAF F-16D Block 52 Peace Drive I performance claims.
Categorical associations remain outside the equations. See
[`aircraft-evidence-registry.md`](aircraft-evidence-registry.md).

Aircraft motion uses the same standard atmosphere and wind field as a launched vehicle. Each fixed step consumes identity-bearing, compiled one-dimensional tables for zero-lift drag by Mach, induced drag at the admitted reference angle of attack, thrust by throttle, and fuel-flow coefficient by throttle. The TypeScript and Rust engines linearly interpolate only within an ordered table's declared coverage; an invalid table, missing full-throttle value, or an out-of-coverage input rejects the run instead of extrapolating or falling back to a compiler scalar. The present tables are still versioned model assumptions, not named-aircraft fidelity data. The engine resolves dynamic pressure, load-factor lift demand, drag, available thrust, fuel flow, mass, and the steering limit on every fixed step. Aircraft admission requires initial mass to equal admitted empty mass, initial fuel, and the launch mass of every linked stowed store. Fuel burn cannot reduce mass below empty mass plus installed-store mass. Release removes the store identity and its declared launch mass once, and the weapon inherits launcher position, velocity, and heading. The engine steers the velocity vector towards the next authored three-dimensional route point. `vector.route-plan.v1` supplies a typed fly-by acceptance radius in metres for each waypoint after the start. The route controller changes to the next leg only after entering that declared capture distance (or the fixed-step travel guard); this transition is executed by both engines and is visible in the recorded route-point index and trajectory. It records the requested velocity and steering acceleration, controller-accepted steering acceleration, achieved velocity, active route-point index, load-factor limiter state, store mass, and installed-store identities. The requested steering acceleration is the controller's instantaneous route-change demand before limiting; it is not an aerodynamic capability, pilot input, or named-aircraft performance claim. It does not use the scenario intent label to invent a turn or a permanent circular path. An aircraft without an admitted aircraft model is rejected. This is an educational point-mass route executor, not a flight-manual or manufacturer engine deck.

## Generic configuration-contrast evidence

`tests/aircraft-configuration-contrast.test.mjs` executes one identical
three-dimensional route and controller request with three deliberately distinct,
compatible generic aircraft configurations. It independently checks the declared
table points, then requires recorded turn trajectory, climb, acceleration, and
fuel-burn differences in TypeScript. Rust/WASM must reproduce every reported
metric and final position within the declared parity tolerance. The configurations
are test-only model assumptions; they are not source packs, do not identify an
aircraft, and do not establish a named-aircraft performance claim. This proves
that the current table/control boundary is materially consumed rather than only
labelled. It does not replace the #64 external-reference, nonlinear-table,
ground-lifecycle, store-aerodynamic, Worker, browser, or independent-validation
requirements.

The runtime accepts only the governed wind-shift event. The removed guidance-hold
experiment cannot enter TypeScript, Rust/WASM, saved-run, RASP, report, or browser
state. Information loss will return only through the typed #26/#28 support path.

The legacy `maneuver`, `targetG`, and side tactical-decision controls are retired.
They were admitted and presented even though compilation discarded them and neither
engine could consume them. Saved-run admission now rejects a record that carries
one of these fields with `SCENARIO_RETIRED_BEHAVIOR_CONTROL` and its exact field
path. The compiled TypeScript/Rust entity contract contains no unused `behavior`
wire. Aircraft therefore continue only through their admitted authored routes until
#38 has a versioned policy pack, an in-tick side-picture interface, inventory and
achieved-state guards, and a bounded-command consumer.

Sensor and air-defence envelopes are scenario-declared volumes and are explicitly
labeled `DECLARED`. Detection, tracking, engagement, and minimum-range rings
remain separate, carry their own altitude bounds and value state, and follow
their owning entity in playback. A bounded geometric terrain-LOS port and
synthetic fixtures now exist, but the current engine does not feed LOS into
sensor state or infer radii from transmitter power, radar cross-section,
terrain, propagation, or electronic attack.

The #26 observer boundary is tick-owned and fail closed. The deployed
reference pack contains only a zero-range `DECLARED_ENVELOPE`, so each side
records `UNSUPPORTED` with zero observations and no track or position. It does
not derive measurements, covariance, radar range, or jamming effects from
truth frames. The engine now has a bounded `vector.observer-sensor-admission.v1`
path for a future compiled positive-range `RADAR`, `INFRARED`, or `VISUAL`
model: it binds every admission field exactly to the compiler-produced
observer-sensor projection carried in the run binding, then uses only the
declared scan/range/FOV inputs and produces a non-positional PLOT. An
entity-level caller cannot add a sensor beside a valid pack digest. The binding
transport itself remains governed by STUB-13. This is a mechanism test, not sensor fidelity. Datalink,
AEW, EW, track estimation and weapon support remain unavailable until their
typed interfaces and admitted model data exist.

Positive sensor compilation now also requires a separate source/independent-
validation artifact pair and explicit validation of every runtime bound,
uncertainty, and target applicability field. It is intentionally stricter than
the current PLOT mechanism: incomplete research data is represented as
unavailable, not converted into a range-only detector.

## Presentation truth

Every movement trail is reconstructed only from recorded engine frames. The 3D surface adds a ground projection, vertical altitude stem, and translucent altitude curtain; these are views of the same position samples, not newly generated trajectories. A weapon does not appear before its launch lifecycle event.

Model Truth remains separate from IAF and PAF RASP state. Today both RASP
views are `UNSUPPORTED` because the deployed pack has no admitted measurement
model. A later positive-range sensor admission can show only a non-positional
PLOT; it does not yet estimate the selected opposing aircraft, classify it,
apply jamming, link it, or support a weapon. An unavailable path yields
`NO_TRACK` and removes the opposing marker instead of falling back to truth.

## Still outside the fidelity claim

Complete nonlinear aircraft coefficient-table and engine-map execution; store drag, station moments, jettison, and other store-consumption events; maneuvering 6DOF attitude/control transients; pilot decision logic; take-off, landing, and runway operations; detailed seeker/autopilot/fuze/warhead behavior; production terrain ingestion or terrain-aware sensor state; waveform-level EW and countermeasures; probability of kill; validated operational routes or current force disposition.

## Rust/WASM gate

The Rust integrator may replace the TypeScript numerical loop only after deterministic parity, numerical-tolerance, malformed-package, extreme-condition, lifecycle, and benchmark tests pass. JavaScript remains responsible for product state and rendering; batches will use a browser Worker.
