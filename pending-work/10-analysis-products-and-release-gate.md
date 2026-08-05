# Work item 10: A2A analysis products and release gate

Priority: P2

Depends on: verified flight, weapon, sensing, geospatial, record, and scale work

Blocks: the first defensible public A2A analysis release

## Outcome

A user can construct a controlled A2A study, run it, observe what each side knew, explain the physical and information-state result, compare one changed variable, and export a report whose claims are backed by passing evidence.

## Required analysis products

### Initial conditions

- aircraft and exact model-pack versions;
- loadout, station, store mass, drag configuration, fuel, and gross mass;
- geographic context, terrain and weather datasets;
- position, altitude datum, heading, speed, formation, and support assets;
- sensor, datalink, emission, and doctrine state;
- symmetry and asymmetry summary.

### Information timeline

- first detection, track, identification, fire-control-quality state, and loss;
- source, age, error or covariance, conflict, and reacquisition;
- emissions, datalink messages, support state, and decision triggers;
- Model Truth compared with each side's observed picture.

### Maneuver and energy

- altitude, TAS, Mach, vertical speed, angle of attack, load factor, turn rate, and turn radius;
- specific energy and specific excess power where supported;
- thrust, drag, fuel flow, mass, and configuration;
- commanded versus achieved control state.

### Weapon timeline

- launch acceptance and launch conditions;
- launch-state inheritance;
- propulsion, midcourse support, seeker, terminal, and termination phases;
- commanded versus available acceleration;
- separation, closure, line-of-sight rate, closest approach, miss distance, terminal speed, and terminal energy;
- physical or information-state reason for termination.

### Mission outcome

- objective achieved or not achieved;
- aircraft and weapon survival state;
- weapons and fuel expended;
- decision and event chain;
- result sensitivity and uncertainty within the intended-use scope.

Do not show probability of kill until the model contains validated fuze, warhead, vulnerability, damage, and countermeasure behavior. Use `geometric intercept`, `miss distance`, `track lost`, `support interrupted`, or another actual termination state.

## Derived envelopes

Weapon engagement zones, no-escape regions, and sensor volumes are derived analysis products from a versioned batch definition. They must carry axes, success criterion, model digest, environment, target behavior, resolution, interpolation method, and uncertainty. A single maximum-range circle cannot represent a no-escape zone.

## Compare workflow

Variant A and Variant B share one base scenario digest. A controlled comparison records the explicit patch and shows:

- changed inputs;
- changed event timing;
- changed track and launch opportunity;
- changed energy, closest approach, and termination;
- variables intentionally held constant.

The report remains a report. It does not prescribe an operational action.

## Release evidence

Before the first public A2A analysis release:

1. Intended-use manifests exist for geometry, WVR, BVR timeline, fly-out, and debrief features that ship.
2. The reference aircraft and weapon pass analytic, external, convergence, and deterministic tests.
3. Sensor and track transition matrices pass.
4. Coordinate, altitude, terrain, and map/3D equivalence tests pass.
5. VSR save/load/replay and ACMI export conformance pass.
6. The supported entity scale passes on each declared device class.
7. Reports render only supported metrics and limitations.
8. Model packs, engine, scenario, synthetic environment, and record digests are visible.
9. No unsupported fallback coefficient set can enter a named run.
10. Security and resource-admission limits cover scenario size, model-pack size, duration, events, routes, recording, and Worker memory.

## Acceptance criteria

- One complete public A2A reference scenario can be reproduced from a frozen package and opened from its VSR without rerunning.
- Every plotted line names entity, affiliation, unit, sample source, and current value.
- Every conclusion links to the event and metrics that support it.
- The UI distinguishes authored input, simulated state, derived analysis, and observed track state.
- Print and PDF preserve legend, units, model time, altitude datum, scenario/model digests, and limitations.
- A report cannot exist before a valid completed run is saved.
- Release automation blocks a claim when its evidence case is absent or stale.

## Professional-simulator boundary

VECTOR should say plainly that it is a public-data browser analysis tool. Professional full-mission trainers add authoritative or restricted data, representative cockpit hardware, operational avionics or flight software, motion and perceptual cueing, hardware-in-the-loop, networked mission systems, instructors, recurrent qualification, and lifecycle configuration management.

The most important difference is not a larger screen. It is validated and configuration-controlled behavior for a specific training task.

## References

- [DoDI 5000.61](https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/500061p.pdf)
- [MIL-STD-3022](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=275961)
- [NASA-STD-7009](https://standards.nasa.gov/standard/NASA/NASA-STD-7009)
- [USAF F-16 Mission Training Center](https://www.af.mil/News/Article-Display/Article/113056/nellis-to-receive-air-forces-first-mtc-flight-simulator/)
- [USAF Distributed Mission Operations Center](https://www.kirtland.af.mil/Units/Distributed-Mission-Operations-Center/)
- [DARPA AlphaDogfight limited-environment result](https://www.darpa.mil/news/2020/alphadogfight-trial)
