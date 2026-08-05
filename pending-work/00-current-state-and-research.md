# Current state and research findings

Status: research and code audit completed on 2026-08-05.

## Executive finding

VECTOR has a useful architectural base, but the current named A2A results are still educational approximations. The engine can execute deterministic 3D point-mass motion, but the object catalog does not yet contain the aerodynamic, propulsion, flight-control, sensor, and validation data required to make a Su-30MKI or F-16C behave as that specific variant across a defensible envelope.

The path forward is not to add more maximum-range fields. It is to compile versioned model packs, verify one reference aircraft and one guided weapon, then add sensor-derived information state, geodesy, a worker boundary, and multi-entity scheduling.

## What VECTOR implements today

- A `vector.scenario.v2` scenario package compiled into one immutable `EngineScenario`.
- Rust/WASM and TypeScript backends behind the same `EngineScenario -> EngineRun` boundary.
- Deterministic fixed-step 3D point-mass integration at a declared 50 ms step.
- Local east, north, up coordinates anchored to a selected study area.
- An educational standard-atmosphere calculation, gravity, two-dimensional wind, simple thrust and mass depletion, drag, and fuel burn.
- Aircraft motion based on speed, heading, load-factor demand, a parabolic drag approximation, maximum thrust, fuel flow, and a maximum commanded g.
- Guided-weapon launch inheritance, direct or lofted guidance, proportional navigation, datalink-update cadence, seeker activation distance, closest approach, and termination.
- Stowed weapons that become observable entities only after launch.
- MapLibre and Three.js views driven from recorded engine frames.
- Declared routes, installations, and circular detection, tracking, engagement, and minimum-range envelopes.
- Separate Model, IAF RASP, and PAF RASP views.
- PostGIS scenario templates, installations, model records, saved-run snapshots, and report replay.
- Eight calibrated small scenario templates across A2A, A2G, G2A, and G2G.

## What remains approximate or incomplete

- Aircraft identity is connected to a small scalar assumption set, not a variant-specific aerodynamic or engine deck.
- The aircraft state has no attitude quaternion, angular rates, angle of attack, sideslip, control surfaces, inertia tensor, center-of-gravity movement, actuator dynamics, or flight-control law.
- Store mass and drag do not change aircraft behavior by hardpoint and loadout.
- Weapon drag is constant instead of varying with Mach, angle of attack, configuration, and altitude.
- Seeker, datalink, support, fuze, countermeasure, and terminal states are simplified.
- A2A behavior is a delayed steady, break, or sinusoidal turn command. It is not a tactical state machine.
- The RASP formulas create estimated display tracks. They are not yet produced by simulated radar, airborne early-warning, IADS, or datalink entities.
- Sensor rings are declared study volumes. They are not derived from propagation, target signature, scan geometry, terrain, clutter, electronic attack, or track processing.
- The versioned geospatial foundation now provides WGS84/ECEF/ENU/NED transforms,
  explicit ellipsoid/MSL/AGL datum operations, entity-keyed geographic recording,
  environment digests, bounded terrain sampling and geometric LOS fixtures.
  Production geoid/DEM ingestion, terrain collision, smooth-Earth horizon and
  terrain-driven sensor state remain incomplete.
- Rust/WASM currently runs synchronously through a JSON ABI on the calling browser thread. There is no dedicated simulation Worker or transferable frame buffer.
- Backend ownership is inconsistent across entry points. New scenario state defaults to Rust/WASM, while the landing preview, some lab/report samples, and server-side saved-run verification explicitly select TypeScript. The architecture document also still describes TypeScript as the golden implementation while the backend document calls Rust/WASM the default. This must become one declared execution and verification policy.
- The documented `vector.record.v1` archive is a design contract. Its columnar frame archive and ACMI adapter are not implemented.
- The configured-template builder works. The complete blank, arbitrary-entity builder is still an internal draft contract rather than a finished product path.
- Existing scale tests exercise small templates. They do not establish 100-entity performance.

## Measured baseline, with exact conditions

`npm run performance:verify` was run locally on 2026-08-05.

Conditions:

- Node.js benchmark harness, not a browser Worker or rendered UI.
- 8 existing scenario templates.
- 2 warm-up rounds per backend.
- 25 measured rounds of all 8 templates.
- 200 measured runs per backend.
- 75,875 sampled model frames per backend.
- Small scenarios with one primary launch relationship, not a 100-entity battle.

Results:

| Backend | Cold start | p50 per run | p95 per run | Maximum | Sampled frames per wall second |
| --- | ---: | ---: | ---: | ---: | ---: |
| TypeScript | 8.030 ms | 1.617 ms | 3.249 ms | 4.276 ms | 216,892 |
| Rust/WASM | 14.246 ms | 5.495 ms | 8.347 ms | 9.430 ms | 66,038 |

This is a regression baseline, not proof that one backend is universally faster. It includes the current Rust/WASM JSON boundary and does not measure browser startup, main-thread blocking, snapshot transfer, rendering, memory, sensor pair growth, or large entity counts. The Rust backend is slower in this exact harness. Profiling must identify whether serialization, allocation, model implementation, or runtime startup dominates before optimization claims are made.

## What digital A2A simulation needs

A useful A2A simulator is a composition of subsystems, not a projectile animation:

1. Aircraft motion and energy state.
2. Propulsion, mass, fuel, stores, and configuration.
3. Sensors, emissions, detection, identification, track quality, and uncertainty.
4. Datalinks and off-board observations.
5. Weapon inventory, launch conditions, support, seeker phases, guidance, fly-out, and termination.
6. Tactical decisions and doctrine operating on what each side knows.
7. A geographic and atmospheric environment.
8. Deterministic recording, replay, comparison, and explanation.
9. Verification, validation, uncertainty, and stated limits for the intended use.

[BVR Gym](https://arxiv.org/abs/2403.17533) is a useful research reference because it combines JSBSim flight dynamics, BVR state, missiles, behavior, and a training interface. [Harfang3D Dog-Fight Sandbox](https://arxiv.org/abs/2210.07282) is useful for customizable multi-agent research and 3D interaction, but its public claims call it semi-realistic and do not make it a validation baseline. The lesson is to borrow subsystem boundaries and experimental controls, not adopt a paper's fidelity label without reproducing its evidence.

## Toy versus credible

VECTOR remains a toy for a question when any of these are the deciding mechanism:

- a named weapon is represented by a maximum-range cutoff;
- a named aircraft is represented only by top speed, fuel percentage, and maximum g;
- heading or g changes instantaneously without control or energy consequences;
- physics advances from `requestAnimationFrame` or React state;
- a single energy index replaces mass, altitude, velocity, and propulsion state;
- sensors are circles without detection and track logic;
- a hit is inferred from elapsed time instead of closest approach and a declared termination model;
- results have no convergence, invariant, reference-case, or regression evidence;
- the map and 3D view use coordinates that are not transformations of the engine state.

A credible public-data simulator does not need classified coefficients. It does need coherent equations, traceable model packs, declared limits, reproducible results, and evidence that the implementation matches its equations.

## One object versus one hundred

For one detailed aircraft, computation is inexpensive compared with authoring and validating the model. A serious object needs mass and inertia, coefficient tables, propulsion maps, flight controls, stores, systems, and reference time histories.

For 100 world entities, the risks move to architecture:

- 100 entities create 9,900 possible directed pairs before filtering;
- sensor and targeting checks can become quadratic;
- recording every field at every physics tick can dominate memory;
- one DOM marker or Three.js object per sample can cost more than physics;
- JSON parsing, allocation, React updates, and garbage collection can cause visible stalls.

The scale solution is mixed fidelity, data-oriented storage, multi-rate systems, spatial candidate filtering, a dedicated Worker, batched snapshots, bounded trails, instanced rendering, and independent Monte Carlo workers. It is not lower numerical precision everywhere.

## GIS role

GIS is the authoritative context for origin, terrain, installations, airspace, weather fields, and spatial relationships. It is not the physics engine.

The target coordinate chain is:

```text
WGS84 longitude, latitude, altitude, and vertical datum
    -> Earth-centered Earth-fixed position
    -> scenario-origin local NED or ENU physics frame
    -> recorded canonical and local position
    -> MapLibre, Three.js, or optional Cesium presentation transform
```

[JSBSim's frame documentation](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/frames-of-reference/) establishes the separation between body, aerodynamic, Earth-fixed, and local frames. [Cesium's flight-tracker guidance](https://cesium.com/learn/cesiumjs-learn/cesiumjs-flight-tracker/) shows accurate time-varying geospatial visualization and also exposes why altitude datum cannot be implicit. [OGC CDB](https://www.ogc.org/standards/cdb/) provides a useful precedent for separating a versioned synthetic environment from vehicle behavior.

MapLibre remains the right lightweight 2D authoring and tactical-replay surface. Cesium should be evaluated only when globe curvature, ECEF-native playback, real terrain, long lines of sight, or globe-scale routes justify its additional weight.

## Professional simulator differentiator

The single biggest difference is validated intended use backed by authoritative data and representative system behavior, not graphical realism.

Professional training systems may also provide representative cockpit hardware, motion and visual cueing, real or emulated operational avionics software, hardware-in-the-loop interfaces, distributed simulation, instructor controls, cybersecurity, configuration management, and lifecycle support. These are expensive because they must remain faithful to a particular aircraft, training task, and release state.

[DoDI 5000.61](https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/500061p.pdf) requires verification and validation through the model lifecycle and accreditation for a specific intended use. [NASA's published 6DOF check cases](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20150001263.pdf) demonstrate the kind of independent equation, atmosphere, gravitation, geodesy, and trajectory comparison VECTOR can adopt without claiming pilot-training qualification.

VECTOR's defensible position is browser-native engagement analysis and debrief for enthusiasts and research, not replacement of an accredited full-mission trainer.

## ACMI role

ACMI is a telemetry and debrief interchange. It is not an aircraft model, scenario-authoring format, or physics engine.

VECTOR should:

- keep a richer native VECTOR Simulation Record as the lossless source for replay and reports;
- export ACMI 2.2 for Tacview interoperability;
- later import ACMI as recorded playback, never as a request to rerun physics;
- synchronize debrief time, camera, selection, and annotations only after all participants have the same record;
- record changed properties at class-appropriate rates and let the viewer interpolate declared fields.

Tacview's [data-size guidance](https://raia-software-inc.gitbook.io/tacview/technical-documentation/data-size-optimization-2), [formula behavior](https://raia-software-inc.gitbook.io/tacview/technical-documentation/formulas), and [real-time protocol](https://raia-software-inc.gitbook.io/tacview/technical-documentation/real-time-telemetry-public-protocol) support this producer/viewer separation.

## Free browser benchmark

No free browser application found in this research combines validated BVR flight dynamics, sensor and weapon modeling, deterministic experimental runs, and Tacview-class debrief.

- [GeoFS](https://www.geo-fs.com/pages/about.php) is the strongest verified free general browser flight-world benchmark found. It uses CesiumJS and provides accessible global flight, but it is not documented as an analytical A2A simulator.
- [Tarmizi Web Flight Simulator](https://github.com/dimartarmizi/web-flight-simulator) is the strongest open browser combat-visual benchmark found. It combines CesiumJS and Three.js with aircraft, missiles, gun, flares, HUD, and NPCs. Its own repository calls it an arcade simulator, and no public validation evidence establishes analytical flight, sensor, or weapon fidelity.
- [GNU ACM](https://www.gnu.org/software/acm/) is a free legacy aerial-combat simulator, but it is an X Window application rather than a browser product.

This leaves a real product gap. VECTOR should not try to out-game these systems. It should make a controlled A2A experiment inspectable, reproducible, explainable, and portable.

## Primary technical references

- [JSBSim reference manual](https://jsbsim-team.github.io/jsbsim-reference-manual/)
- [JSBSim forces and moments](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/forces-and-moments/)
- [WebAssembly PLDI paper](https://pldi17.sigplan.org/details/pldi-2017-papers/48/Bringing-the-Web-up-to-Speed-with-WebAssembly)
- [Web Workers specification](https://www.w3.org/TR/2021/NOTE-workers-20210128/)
- [NASA 6DOF check cases](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20150001263.pdf)
- [NASA Standard for Models and Simulations](https://standards.nasa.gov/standard/NASA/NASA-STD-7009)
- [BVR Gym](https://arxiv.org/abs/2403.17533)
- [Harfang3D Dog-Fight Sandbox](https://arxiv.org/abs/2210.07282)
- [MapLibre large-data guidance](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)
- [CesiumJS flight tracker](https://cesium.com/learn/cesiumjs-learn/cesiumjs-flight-tracker/)
- [OGC CDB](https://www.ogc.org/standards/cdb/)
- [Tacview 2 architecture and performance notes](https://www.tacview.net/product/tacview2/en/)
