# Physics and information-model status

VECTOR currently uses a deterministic three-dimensional point-mass reference engine intended for inspectable sensitivity research—not verified prediction of named-system performance.

## Integrated model

- fixed 50 ms integration step and sampled immutable frames;
- local east/north/up coordinates;
- educational standard atmosphere, density, speed of sound, and Mach;
- air-relative velocity with an explicit three-axis wind vector;
- launch-state inheritance;
- thrust taper, propellant mass depletion, aerodynamic drag, and gravity;
- direct and commanded-loft guidance;
- proportional-navigation acceleration demand with command limits;
- moving target behavior and decision modifiers;
- G2G commanded cruise altitude, with a terminal blend to objective elevation for direct paths and a higher commanded apex for lofted paths;
- guidance-hold and wind-shift events;
- closest approach, completion, energy/time termination, non-finite-state checks, and dry-mass margin diagnostics.

Model coefficients are in versioned `simulation_models` rows. Public source assertions remain separate. Current coefficients are labeled model assumptions unless a field is genuinely source-backed.

## Presentation truth

Every movement trail is reconstructed only from recorded engine frames. The 3D surface adds a ground projection, vertical altitude stem, and translucent altitude curtain; these are views of the same position samples, not newly generated trajectories. A weapon does not appear before its launch lifecycle event.

Model Truth remains separate from IAF and PAF RASP estimates. IAF RASP estimates the selected Red aircraft track; PAF RASP estimates the selected Blue aircraft track. Onboard radar requires an active own-side radar and the declared model range; data-link and airborne-early-warning sources require an available own-side link; visual source requires the model visual range. Opposing jamming, range, and track age degrade confidence and increase uncertainty. An unavailable path yields `NO_TRACK` and removes the opposing marker instead of falling back to truth. This is not a verified radar equation or operational C2 model.

## Still outside the fidelity claim

Validated aircraft coefficient tables and engine maps; full 6DOF attitude/control; detailed seeker/autopilot/fuze/warhead behavior; terrain masking; waveform-level EW and countermeasures; probability of kill; operational routes or current force disposition.

## Rust/WASM gate

The Rust integrator may replace the TypeScript numerical loop only after deterministic parity, numerical-tolerance, malformed-package, extreme-condition, lifecycle, and benchmark tests pass. JavaScript remains responsible for product state and rendering; batches will use a browser Worker.
