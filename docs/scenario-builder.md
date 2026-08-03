# Scenario construction contract

VECTOR uses one product journey everywhere:

1. **Enter** chooses a validated template, a blank scenario, an imported scenario package, or a Red-versus-Blue study.
2. **Construct** defines the question, selects forces and loadouts, places them in a study area, declares flight state, sensors, decisions, environment, and model assumptions, then validates the package.
3. **Simulate** compiles the scenario package into engine entities and runs a deterministic fixed-step model.
4. **Observe** replays the engine frames on the synchronized map, 3D surface, timeline, RASP, and telemetry views.
5. **Explain** presents the termination cause, geometry, information state, and contributing variables.
6. **Compare** holds the scenario package constant while changing declared variables in a variant.
7. **Report** freezes scenario identity, package hash, engine version, study area, compiled scenario, frame hash, sources, and output.

`Define`, `Forces & loadouts`, `Place & flight`, `Sensors & decisions`, and `Validate` are sections inside **Construct**. They are not competing product stages.

## Spatial contract

A runnable scenario declares a PostGIS-backed `study_area_id` and a weather preset owned by that study area. A study area contains:

- an EPSG:4326 boundary and anchor;
- a terrain class and reference surface elevation;
- public-educational environment presets;
- an explicit data-state label.

The engine uses local east-north-up coordinates for numerical stability. The presentation layer projects those coordinates from the selected study-area anchor. This makes the simulation portable without letting the map decide where a run occurred.

The six initial study areas cover North Punjab, Rajasthan, Ladakh, the north-east mountains, the Arabian Sea, and coastal Gujarat. Their boundaries are educational visualization contexts, not operational engagement boxes. Selecting a study area is a preset choice. The first complete builder does not ask the operator to draw a study-area polygon.

## Scenario artifact

Construct produces a versioned scenario package. Compilation produces an immutable engine scenario containing all spawned entities, initial states, events, environment, study-area context, completion rules, and model provenance. Simulation produces ordered engine frames. Saving a report records both artifacts and their hashes so replay never depends on mutable UI state.

## Builder expansion boundary

The current builder edits every input used by the eight validated templates. The next builder expansion adds arbitrary entity collections, direct map placement, route authoring, supporting sensor nodes, and imported package editing. Those capabilities must extend the same scenario contract; they must not introduce a second simulation-state format.

The internal `vector.scenario-draft.v1` state contract now provides the safe authoring foundation: an actually empty draft, stable entity and waypoint IDs, draft revisions, geographic position, heading, speed, routes, loadouts, target/launch references, dependency-safe deletion, duplication, and blocking validation. It remains unexposed until the blank-scenario surface can compile and run the authored package end to end; VECTOR does not ship a builder button that terminates in an incomplete workflow.

## Full builder UX specification

The builder is one persistent desktop workspace, not a page-per-field wizard. The left rail owns the five Construct sections, the center owns the geographic placement surface and form for the selected object, and the right rail owns the selected entity, validation state, and compiled-summary preview. At 1366×768 all three remain visible; drawers may extend a rail but may not replace the map.

### Enter

The user starts from exactly one of four states:

- **Validated template** loads a complete, runnable package and labels it “Preconfigured”. Editing creates a draft revision; it does not mutate the template.
- **Blank scenario** asks only for engagement family and study area, then creates an empty draft with an explicit “Add the first entity” state.
- **Imported package** validates schema version, package hash, referenced catalog objects, and unsupported fields before opening.
- **Red-versus-Blue study** creates two empty force groups with affiliation already scoped. It is still a single-user experiment, not a multiplayer role system.

No mode may show results until the compiled package has passed validation and a run has completed.

### Construct sections

1. **Define** records run name, question, engagement family, completion condition, and public/assumed data policy.
2. **Forces & loadouts** manages an unlimited declared entity collection. “Add entity” first chooses affiliation, then object class, then a compatible catalog object. Aircraft expose systems, fuel and stations; weapons remain inventory under a launch platform until an event launches them; sensors, launchers, bases and objectives have class-specific inspectors.
3. **Place & flight** selects the PostGIS study area and weather preset. The map places each world entity, rotates heading, authors routes and waypoints, and edits altitude/speed. Numeric fields and map handles edit the same state. A local east/north/up preview is compiled from the geographic authoring state.
4. **Sensors & decisions** assigns detection/track/engagement volumes, emission state, data links, target assignment, doctrine, maneuvers, prepared faults and launch conditions. Every control names its owner and affected view.
5. **Validate** separates blocking errors, model warnings and source gaps. It shows the exact entity count, stowed inventory, launch events, area/weather identity, coefficient sets, engine version, duration limit, and package hash before enabling Simulate.

### Artifact and state boundaries

- Builder state is an editable draft scenario package.
- Validate canonicalizes the package and records a content hash.
- Simulate compiles catalog references into an immutable engine scenario.
- The engine owns lifecycle changes and produces ordered frames and events.
- Observe reads frames; it never writes entity positions.
- Save records the authored package identity, compiled scenario, frame hash and report together.

A field change after a run increments the draft revision, invalidates Save and Report, preserves the prior saved run, and requires a new simulation. A failed compile never leaves a partially runnable result in the workspace.

### Acceptance criteria for arbitrary entity authoring

- Add, duplicate, reorder and remove declared entities without a fixed-count branch in the engine.
- Prevent deletion of an entity referenced by a route, launch or target assignment until the user resolves the references.
- Show a guided weapon under loadout inventory before launch and as a separate world entity only after launch.
- Reject incompatible loadouts and missing coefficient sets before simulation.
- Preserve stable entity IDs across draft edits, save/reload and report replay.
- Keep map placement, numeric inspectors, compiled preview and saved package round-trip equivalent.
- Permit keyboard operation and provide closed, hover, active, loading, disabled and error states for every control.

## Operator input versus governed behavior

The operator chooses a preset study area and weather preset, selects catalog
objects for Blue, Red, or neutral forces, places world entities, sets altitude,
heading, and speed, authors routes and waypoints, assigns targets, and declares
launch relationships.

The system governs:

- stable entity, route, and waypoint identities;
- study-area bounds and coordinate conversion;
- object-class and engagement-family compatibility;
- allowed loadouts and model availability;
- affiliation ownership and target-reference integrity;
- stowed-to-launched weapon lifecycle;
- dependency-safe removal and duplication;
- canonical package compilation, version, and content hash;
- blocking validation before simulation.

An authored area of interest is not a substitute for the study-area preset. If
a later workflow needs a smaller AOI, it is a separate optional geometry inside
the selected study area and must not silently change the weather, terrain
reference, or map anchor.
