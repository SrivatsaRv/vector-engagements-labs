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

The current scalar coefficients remain in versioned `simulation_models` rows for
catalog delivery and are also compiled into the immutable
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

Aircraft motion uses the same standard atmosphere and wind field as a launched vehicle. The current aircraft coefficient set resolves dynamic pressure, load-factor lift demand, parasitic and induced drag, available thrust, fuel flow, mass, and the steering limit on every fixed step. Aircraft admission requires initial mass to equal admitted empty mass, initial fuel, and the launch mass of every linked stowed store. Fuel burn cannot reduce mass below empty mass plus installed-store mass. Release removes the store identity and its declared launch mass once, and the weapon inherits launcher position, velocity, and heading. The engine steers the velocity vector towards the next authored three-dimensional route point. It records the requested velocity and steering acceleration, controller-accepted steering acceleration, achieved velocity, active route-point index, load-factor limiter state, store mass, and installed-store identities. The requested steering acceleration is the controller's instantaneous route-change demand before limiting; it is not an aerodynamic capability, pilot input, or named-aircraft performance claim. It does not use the scenario intent label to invent a turn or a permanent circular path. An aircraft without an admitted aircraft model is rejected. This is an educational point-mass route executor, not a flight-manual or manufacturer engine deck.

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

The admitted #26 information adapter consumes recorded truth frames to make
side-owned measurements at its declared scan cadence. It derives observations,
track confirmation/coasting/loss, covariance and a bounded compatible-jamming
effect without exposing a truth position in the observer record. It is an
educational measurement model with explicit constants, not named-system sensor
performance. Datalink/AEW and weapon support fail closed until their typed
sender/message and #28 interfaces are implemented.

## Presentation truth

Every movement trail is reconstructed only from recorded engine frames. The 3D surface adds a ground projection, vertical altitude stem, and translucent altitude curtain; these are views of the same position samples, not newly generated trajectories. A weapon does not appear before its launch lifecycle event.

Model Truth remains separate from IAF and PAF RASP estimates. IAF RASP estimates the selected Red aircraft track; PAF RASP estimates the selected Blue aircraft track. Onboard radar requires an active own-side radar and the declared model range; data-link and airborne-early-warning sources require an available own-side link; visual source requires the model visual range. Opposing jamming, range, and track age degrade confidence and increase uncertainty. An unavailable path yields `NO_TRACK` and removes the opposing marker instead of falling back to truth. This is not a verified radar equation or operational C2 model.

## Still outside the fidelity claim

Complete nonlinear aircraft coefficient-table and engine-map execution; store drag, station moments, jettison, and other store-consumption events; maneuvering 6DOF attitude/control transients; pilot decision logic; take-off, landing, and runway operations; detailed seeker/autopilot/fuze/warhead behavior; production terrain ingestion or terrain-aware sensor state; waveform-level EW and countermeasures; probability of kill; validated operational routes or current force disposition.

## Rust/WASM gate

The Rust integrator may replace the TypeScript numerical loop only after deterministic parity, numerical-tolerance, malformed-package, extreme-condition, lifecycle, and benchmark tests pass. JavaScript remains responsible for product state and rendering; batches will use a browser Worker.
