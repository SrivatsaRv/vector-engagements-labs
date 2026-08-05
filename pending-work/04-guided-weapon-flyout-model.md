# Work item 04: Guided-weapon fly-out model

Priority: P0

Depends on: model-pack contract and verified coordinate/atmosphere primitives

Blocks: defensible A2A outcomes, engagement envelopes, and ACMI launch records

## Outcome

One public reference guided weapon executes a dynamic fly-out from launch to termination with verified propulsion, mass, aerodynamics, guidance, support, seeker, closest-approach, and recording behavior.

## Current gap

VECTOR already has a useful launch lifecycle and a 3DOF point-mass fly-out. The weak points are constant drag, simplified thrust, range-derived seeker activation, simple update cadence, no fuze geometry, and named public weapons mapped to educational coefficient sets.

## Required model

### Physical state

- launch position, velocity, attitude or direction inherited at the exact launch event;
- mass and center-of-mass progression;
- thrust curve and stage state;
- aerodynamic force coefficients by Mach, angle of attack, and configuration;
- gravity and atmosphere;
- commanded and achievable normal acceleration;
- energy and maneuver margin.

### Guidance and support state

```text
STOWED
  -> LAUNCHED
  -> BOOST
  -> MIDCOURSE_INERTIAL
  -> MIDCOURSE_UPDATED
  -> SEEKER_SEARCH
  -> SEEKER_TRACK
  -> TERMINAL
  -> CLOSEST_APPROACH
  -> TERMINATED
```

Each transition has a timestamp, cause, required input, and failure path. A datalink interruption changes the available estimate and guidance state. It does not simply multiply range.

### Termination

- closest approach with interpolation inside the integration step;
- fuze-volume entry only if a fuze model is enabled;
- ground or terrain impact;
- loss of controllability;
- seeker or track loss under declared rules;
- energy or time limit;
- invalid numerical state.

The first release should report geometric intercept or miss distance. It must not report probability of kill until fuze, warhead, vulnerability, countermeasure, and damage models exist and are validated for that intended use.

## Engagement-envelope generation

Detection or weapon circles must not be treated as physical reach. Generate an engagement study envelope by sweeping the same dynamic fly-out across launch altitude, speed, aspect, target maneuver, support state, and environment. Store the sweep definition, model digest, success criterion, and uncertainty with the derived surface.

NASA's [generic air-to-air missile work](https://ntrs.nasa.gov/citations/19940031931) distinguishes cheap launch-time envelope models from dynamic fly-out models that evaluate movement, guidance, propulsion, and miss distance. That is the correct boundary for VECTOR.

## Acceptance criteria

- A weapon is absent from world frames before launch and appears at the exact inherited launch state.
- Propellant never becomes negative and dry mass is never crossed.
- Energy, speed, acceleration, guidance phase, support state, seeker state, and miss distance are recorded.
- Closest approach converges when the time step is halved.
- A support interruption produces a traceable state change and reproducible outcome effect.
- Derived engagement envelopes are generated from versioned fly-out batches, not hard-coded maximum ranges.
- Unsupported named weapons cannot select a generic coefficient set silently.

## Tests

- Analytic constant-thrust, ballistic, vacuum, gravity, and drag cases.
- Launch-state inheritance at multiple headings, attitudes, speeds, and altitudes.
- Guidance zero-crossing and constant-bearing cases.
- Proportional-navigation regression cases.
- Seeker acquisition, loss, reacquisition, and support-interruption matrix.
- Closest-approach interpolation and fuze-volume boundary cases.
- Time-step convergence and non-finite rejection.
- TypeScript/Rust parity until the TypeScript reference is intentionally retired.

## Non-goals

- Classified missile coefficients.
- Probability-of-kill claims in the first fly-out release.
- Full 6DOF missile body dynamics unless control-body coupling changes the intended result.
