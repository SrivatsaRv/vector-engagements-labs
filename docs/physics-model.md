# Physics model status

VECTOR currently uses a deterministic browser-side point-mass approximation. It is intended to make geometry, flight-path choice, target motion, remaining speed, and explicit information or environmental conditions inspectable. It is not a verified performance model for a named system.

## Implemented

- Domain-specific profile catalogs for air-to-air, air-to-surface, surface-to-air, and surface-to-surface experiments.
- Powered acceleration followed by simplified post-burn speed loss.
- Direct and lofted flight-path options.
- Line-of-sight guidance demand against moving targets and fixed objectives.
- Profile range-envelope termination.
- Target manoeuvre for moving-target templates only.
- Guidance-interruption and environmental-loss condition injection with visible effects on the computed run.
- Explicit termination codes and evidence-based result explanations.
- Reproducible initial conditions and recorded telemetry.

## Not yet modelled

- Atmosphere tables, altitude-dependent drag, lift, mass depletion, or full six-degree-of-freedom motion.
- Seeker acquisition, radar propagation, electronic warfare, autopilot lag, control-surface limits, fuzing, warhead effects, terrain masking, or damage.
- Verified performance envelopes for named real-world systems.
- Operational routes, current force posture, or strike-quality coordinates.

## Research path

1. Publish equations, units, integrator tests, and conservation/error checks.
2. Add atmosphere, drag, propulsion, and changing mass as replaceable model modules.
3. Separate guidance law, autopilot response, and airframe limits.
4. Add sensor and seeker models with explicit evidence and uncertainty.
5. Add seeded Monte Carlo analysis and sensitivity attribution.
6. Validate against public reference problems and document calibration boundaries.

The scenario catalog, visual basemap, authored replay, and analytical simulation remain separate contracts. A scenario selects context and starting state; the engine computes only the behaviours its declared model supports.
