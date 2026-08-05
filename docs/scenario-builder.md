# Scenario construction contract

VECTOR uses one product journey everywhere:

1. **Enter** chooses a validated template, a blank scenario, an imported scenario package, or a Red-versus-Blue study.
2. **Construct** defines the question, selects forces and loadouts, places them in a study area, declares flight state, sensors, decisions, environment, and model assumptions, then validates the package.
3. **Simulate** compiles the scenario package into engine entities and runs a deterministic fixed-step model through the selected Rust/WASM or TypeScript-reference backend.
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

Configured authoring positions carry WGS84 longitude/latitude and an explicit
MSL altitude. Compilation performs the declared geoid operation, converts to
ECEF, then to the study area's stable local ENU frame. The record retains both
local and WGS84 ellipsoid positions. The presentation layer projects recorded
state; the map does not decide where a run occurred. The current deterministic
zero-undulation geoid is an educational versioned fixture, not a regional geoid
accuracy claim.

Both Construct and Observe use the same MapLibre navigation contract. The map starts flat; supports wheel zoom, drag pan, right-drag rotation, touch zoom/rotation, double-click zoom, and keyboard navigation; disables touch pitch and pitch-with-rotate; and exposes an explicit 0°/52° tilt preview. VECTOR-owned controls provide basemap selection, zoom, reset north/tilt, fit, cursor coordinates, zoom, bearing, and pitch. Standard, minimal, and low-light tactical basemaps are same-origin proxied and the selection persists in browser local storage. During waypoint placement the view is forced flat so a presentation gesture cannot obscure authored geometry. These camera and basemap choices are presentation state and never change simulation inputs.

Replay markers default to the catalog designation, such as `Su-30MKI`, `F-16C Block 52`, or `Astra Mk 1`. Generated engine identifiers such as `BLUE WEAPON 1` remain internal replay identity and are not presented as the operator label.

The six initial study areas cover North Punjab, Rajasthan, Ladakh, the north-east mountains, the Arabian Sea, and coastal Gujarat. Their boundaries are educational visualization contexts, not operational engagement boxes. Selecting a study area is a preset choice. The first complete builder does not ask the operator to draw a study-area polygon.

## Scenario artifact

Construct produces a `vector.scenario.v3` package with an intended-use identity
and immutable compiled model-pack identity/digest. Compilation produces an
immutable engine scenario containing all spawned entities, initial states,
events, environment, study-area context, completion rules, model IDs, and the
same digest. Simulation produces ordered engine frames. Saving a report records
both artifacts, credibility limitations, and their hashes so replay never
depends on mutable UI state.

## Builder expansion boundary

The configured-template builder edits every input used by the eight validated templates. Its **Place & flight** surface now performs direct geographic start placement, heading, altitude and speed editing, and Blue/Red route and waypoint authoring inside a selected preset study area. Map gestures and numeric fields update one spatial plan; compilation converts it to local east-north-up engine state. Authored routes remain declared intent beside the computed engine track; the current engine does not silently force an aircraft to follow a drawn route.

The next expansion adds database-backed arbitrary entity collections, supporting sensor nodes, target/launch relationship authoring, and the complete blank-scenario path. Those capabilities must extend the same scenario contract; they must not introduce a second simulation-state format.

The internal `vector.scenario-draft.v1` state contract now provides the safe authoring foundation: an actually empty draft, stable entity and waypoint IDs, draft revisions, geographic position, heading, speed, routes, loadouts, target/launch references, dependency-safe deletion, duplication, and blocking validation. It remains unexposed until the blank-scenario surface can compile and run the authored package end to end; VECTOR does not ship a builder button that terminates in an incomplete workflow.

## Full builder UX specification

The builder is one persistent desktop workspace, not a page-per-field wizard. The left rail owns the five Construct sections, the center owns the geographic placement surface and form for the selected object, and the right rail owns the selected entity, validation state, and compiled-summary preview. From 1280×720 upward all three remain visible; QHD and 4K expand the task surface, controls, map and typography rather than adding empty margins. On phones the same five-step state is presented as a single column with persistent actions; desktop rails are removed and no scenario state is discarded. Drawers may extend a rail but may not replace the map.

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
- A parameter change against governed model data is a scenario-local patch with
  old value, new value, SI unit, reason, timestamp, author, evidence, model ID,
  and pack digest; it never mutates the catalog or pack.
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
- explicit engine-backend selection and fail-closed dispatch;
- blocking validation before simulation.

An authored area of interest is not a substitute for the study-area preset. If
a later workflow needs a smaller AOI, it is a separate optional geometry inside
the selected study area and must not silently change the weather, terrain
reference, or map anchor.

### Current configured-template behavior

- The selected study area and weather are explicitly labelled preconfigured.
- `Change context` exposes the six governed regional presets and their available weather states; the operator does not draw the regional boundary.
- Blue and Red each have an affiliation-scoped origin picker populated from public-reference installations inside the selected study area. Choosing an origin moves that team's aircraft to the installation; manual drag remains available when no catalog origin is appropriate.
- Blue and Red start markers and waypoints are draggable.
- Waypoint creation is scoped to the currently selected team and lives in that team's route inspector. The map never offers an unowned generic waypoint action.
- The selected entity inspector edits explicit MSL altitude, true heading, speed, and route state.
- Drag and numeric edits synchronize starting distance, altitude difference, aspect, and platform speeds before compilation.
- Validation blocks non-finite state, negative speed or altitude, invalid headings, mismatched route origins, and any start or waypoint outside the preset boundary.
