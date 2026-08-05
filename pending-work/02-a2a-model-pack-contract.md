# Work item 02: Compiled A2A model-pack contract

Status: executable data-contract foundation implemented on 2026-08-06; detailed coefficient tables and flight/weapon dynamics remain later work items.

Priority: P0

Depends on: intended-use and credibility contract

Blocks: reference aircraft, guided weapon, sensing, and arbitrary-entity builder

## Outcome

The object library becomes executable data. Catalog identity, model definition, scenario instance, and runtime state are separate contracts.

Implementation note: `vector.model-pack-source.v1` now compiles to immutable,
content-addressed `vector.compiled-model-pack.v1` SI arrays shared with Rust.
Reference resolution, cycles, table shape, units, validity, evidence,
compatibility, patches, stable scenario identity, and 1/10/100/500-instance
construction are tested. The current pack only preserves existing v0.5 scalar
assumptions; it is not an aircraft flight model or guided-weapon fly-out model.

## Current gap

`CatalogObject` identifies a platform or weapon, while `aircraftAssumptions()` and the weapon profile provide a small scalar model. Renaming those values after a real aircraft does not make them variant-specific. The runtime also traverses general objects and serializes a complete scenario through JSON for every Rust/WASM run.

## Target pipeline

```text
Human-readable object source
  aircraft, engines, stores, sensors, weapons, validation fixtures
        -> schema validation and unit conversion
        -> reference and compatibility resolution
        -> precomputed interpolation tables
        -> immutable SI-normalized compiled model pack
        -> scenario instance with stable IDs and configuration
        -> data-oriented mutable runtime state
```

## Model-pack sections

### Identity and configuration

- object and variant ID;
- service configuration and effective date;
- semantic schema version and content digest;
- supported intended uses and validity domain;
- compatible engines, sensors, stations, stores, and weapons.

### Geometry and frames

- reference area, span, chord, aerodynamic reference point;
- structural, body, wind, stability, ECEF, and local-frame conventions;
- hardpoint, sensor, thruster, center-of-gravity, and mass-station locations.

### Mass properties

- empty mass and inertia tensor;
- fuel tanks and burn ordering;
- stores and station mass;
- center-of-gravity and inertia change by configuration.

### Aerodynamics

- force and moment coefficient functions;
- Mach, angle-of-attack, sideslip, angular-rate, and control-deflection dimensions;
- high-angle-of-attack and configuration limits;
- store drag and interference corrections.

### Propulsion

- thrust by altitude, Mach, throttle, and mode;
- fuel flow, spool dynamics, afterburner, and operating limits;
- engine count and placement.

### Controls

- actuator position and rate limits;
- command laws for g, angle of attack, roll rate, and flight path;
- envelope protection and departure behavior where modeled.

### Mission systems

- sensor definitions and scan behavior;
- track store and update rules;
- datalink and off-board source compatibility;
- jammer and countermeasure interfaces;
- weapon stations, inventory, and launch compatibility.

### Presentation

- tactical class, silhouette/model reference, label defaults, and display scale;
- presentation assets cannot alter physical dimensions or state.

### Evidence

- per-table or per-field references;
- verification fixtures and tolerances;
- known gaps and configuration limits.

[JSBSim](https://jsbsim-team.github.io/jsbsim-reference-manual/) is the strongest open architectural reference for data-driven mass, aerodynamics, propulsion, control, Earth, and propagation components. Its [forces and moments documentation](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/forces-and-moments/) shows why coefficient functions and lookup tables are required beyond maximum speed and maximum g.

## Runtime component groups

```text
Identity          Transform          Kinematics
Attitude          MassProperties     Aerodynamics
Propulsion        FlightControls     Inventory
Launcher          Guidance           Seeker
Sensor            Emitter            TrackStore
Datalink          ElectronicAttack   Affiliation
Doctrine          Intent             Route
Lifecycle         TargetAssignment   TelemetrySelection
```

Not every entity has every component. A base has identity and transform; an aircraft adds flight and system components; a stowed weapon is inventory until a launch event creates its world state.

## Builder behavior

- The database supplies compatible catalog definitions and compiled packs.
- The operator selects objects and configuration, not raw runtime types.
- Changing a value creates a scenario-local patch that is visible in validation and the report.
- The compiler resolves all references and units before the engine starts.
- The engine receives compact indexes and typed tables. It does not query PostGIS or parse unit strings during a tick.

## Acceptance criteria

- One schema supports one or many entities without a fixed Blue/Red count.
- Stable entity IDs survive draft edits, compilation, recording, and report replay.
- Unsupported loadouts, model-pack combinations, and missing coefficient sets block simulation.
- Catalog objects cannot silently fall back to generic coefficients.
- Compiled model packs are immutable and content-addressed.
- TypeScript and Rust consume the same compiled binary or canonical array contract.
- A model pack can be loaded once and instantiated many times without reparsing source JSON.

## Tests

- Unit and dimensional analysis for every field and table axis.
- Reference-resolution and cycle tests.
- Compatible and incompatible loadout matrices.
- Canonical digest and deterministic compiler tests.
- Scenario-local patch round trip and report visibility.
- Fuzz tests for malformed lengths, table ordering, non-finite values, and out-of-domain interpolation.
- Performance test for loading one pack and instantiating 1, 10, 100, and 500 objects.

## Non-goals

- Storing classified data.
- Editing coefficient tables in the normal scenario builder.
- Treating presentation models as aerodynamic geometry.
