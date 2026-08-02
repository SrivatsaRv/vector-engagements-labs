# Physics and air-picture model status

VECTOR uses a deterministic browser-side point-mass approximation. It is designed for inspectable sensitivity experiments, not verified prediction of named-system performance.

## Implemented physics

- Fixed-step three-dimensional point-mass integration.
- Powered acceleration followed by profile-defined post-burn speed loss.
- Direct and commanded-loft paths.
- Moving airborne targets and fixed surface objectives.
- Heading/aspect, altitude difference, speed, target maneuver demand, and line-of-sight rate.
- Educational standard-atmosphere calculation for temperature, pressure, density, speed of sound, and Mach.
- Simplified altitude-density and loadout effects on post-burn loss.
- Guidance-hold and increased-loss prepared conditions with explicit model effects.
- Blue tactical decision changes modeled mid-course guidance-update cadence; Red tactical decision scales the selected turn demand. These are declared teaching rules, not doctrine or verified avionics behavior.
- Reproducible seed, telemetry frames, termination codes, and outcome explanations.

## Named A2A study models

Astra Mk-I, AIM-120C-5, and MICA IR have separate public-study parameter records. Their modeled speed, burn time, maneuver authority, loss, and study boundary are assumptions stored independently of public facts. They are not published launch-acceptability regions, no-escape zones, probabilities of kill, or universal ranges.

## RASP

The Real Air Situation Picture layer derives a side-specific estimated track from:

- onboard radar state;
- data-link or airborne-early-warning source;
- jammer state;
- range and model time;
- prepared information interruption.

It outputs source, classification, identification, confidence, track age, position uncertainty, and tracking/degraded/coasting state. Model Truth remains a separate view. This is a synthetic information-quality model, not radar propagation or operational C2 software.

## Not yet modeled

- Aircraft aerodynamic coefficient tables, mass depletion, store drag, engine maps, and full six-degree-of-freedom flight.
- Verified instantaneous/sustained turn envelopes for aircraft variants.
- Radar equation, scan volume, detection probability, track filters, identification logic, terrain masking, or electronic-attack waveforms.
- Missile seeker acquisition, autopilot lag, control surfaces, fuzing, warhead effects, damage, or probability of kill.
- Cooperative multi-aircraft tactics, formation geometry, off-board platform movement, or command latency.
- Live weather, current force posture, operational routes, or strike-quality coordinates.

## Research path

1. Publish equations, units, integration-error tests, and calibration fixtures.
2. Replace scalar drag with atmosphere, aerodynamic, propulsion, and changing-mass modules.
3. Add aircraft energy-maneuverability models and explicit decision-state effects.
4. Add radar, data-link, seeker, and EW modules with source-level uncertainty.
5. Add seeded Monte Carlo analysis and sensitivity attribution.
6. Validate against public reference problems and keep calibration claims separate from source facts.

Scenario identity, basemap, authored replay, analytical simulation, air-picture derivation, and presentation state remain separate contracts.
