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

A runnable scenario declares a PostGIS-backed `study_area_id`, a weather preset
owned by that study area, and the one exact immutable regional EnvironmentPack
resolved from that pair. The pack contains:

- an EPSG:4326 boundary and anchor;
- sourced terrain and time-indexed atmosphere grids with field provenance;
- explicit horizontal, source-vertical and runtime-vertical datums;
- bounded installation/runway coverage and eligibility evidence; and
- pack, terrain, atmosphere and catalogue versions/digests plus validity,
  uncertainty, limitations and no-data policy.

Terrain class, a scalar reference elevation and preset labels remain display
metadata only. They cannot admit route altitude, collision, LOS, dynamics or a
ground/runway start.

An existing draft, import or saved run never falls back to the first study area
or the area's default weather. Unknown and cross-area identities block
validation and compilation with a stable field-addressed error. A default
weather preset is applied only as a visible authoring action when the operator
selects a valid study area.

Configured authoring positions carry WGS84 longitude/latitude and an explicit
MSL altitude. Compilation performs the declared geoid operation and records
scenario-origin ENU east/north with an explicit metres-MSL runtime vertical
axis. The record retains both engine-local and WGS84 positions through the
inverse hybrid transform. The presentation layer projects recorded state; the
map does not decide where a run occurred. The current deterministic
zero-undulation display operation is an educational versioned fixture, not a
regional geoid-accuracy claim; ETOPO source heights retain their explicit
EGM2008 boundary in the pack.

Both Construct and Observe use the same MapLibre navigation contract. The map starts flat; supports wheel zoom, drag pan, right-drag rotation, touch zoom/rotation, double-click zoom, and keyboard navigation; disables touch pitch and pitch-with-rotate; and exposes an explicit 0°/52° tilt preview. VECTOR-owned controls provide basemap selection, zoom, reset north/tilt, fit, cursor coordinates, zoom, bearing, and pitch. Standard, minimal, and low-light tactical basemaps are same-origin proxied and the selection persists in browser local storage. During waypoint placement the view is forced flat so a presentation gesture cannot obscure authored geometry. These camera and basemap choices are presentation state and never change simulation inputs.

Replay markers default to the catalog designation, such as `Su-30MKI`, `F-16C Block 52`, or `Astra Mk 1`. Generated engine identifiers such as `BLUE WEAPON 1` remain internal replay identity and are not presented as the operator label.

The six initial study areas cover North Punjab, Rajasthan, Ladakh, the north-east mountains, the Arabian Sea, and coastal Gujarat. Their boundaries are educational visualization contexts, not operational engagement boxes. These governed rows are delivered by checksum-tracked migration and verified against the TypeScript contract; production deployment does not run the development seed. Selecting a study area is a directly visible preset choice. The first complete builder does not ask the operator to draw a study-area polygon.

## Scenario artifact

Runway-start artifacts now bind the exact generic ground-dynamics projection
and its validity/evidence/limitation digest beside the already sourced runway,
environment, fuel, mass and installed-store identities. The compiler rejects
missing or mismatched authority before constructing runtime tick state.
An optional airborne-transfer artifact adds the exact authored request, full
compiled transfer, ordered compiler authority seal and compact entity binding.
Its operation, tick, station/store identity, model-pack mass and bounded
installed-drag assumption are immutable run inputs; missing or divergent copies
fail before ticks.

The artifact binds one exact regional environment-pack ID/version/digest and an
optional exact `vector.installation-origin.v2` runway identity. Compilation
fails before producing a runnable artifact when either binding is stale.
For a ground start the compiled engine artifact additionally binds the exact
mission digest, runway-evidence digest, posture, and readiness release time in
`vector.aircraft-ground-operation.v1`; unknown or conflicting fields fail
admission.

The persisted scenario-template table is declared by
`db/schema/scenarios.ts` and re-exported from the one aggregate Drizzle schema.
Air packages use canonical `vector.scenario.v4`; non-Air packages share that
package envelope without acquiring an Air mission object.

Before an Air package can become runnable, `vector.scenario-control-authority.v1`
classifies every legacy numeric projection and the Air-mission compiler repeats
structured type, finite, range and precision admission. Ordinary authored
scalars use at most three fractional digits. Whole-package relational checks
then bind route/start, task, fuel, loadout, runway, environment and timing
authority before the final engine scenario is constructed.

### Governed high-energy crossing challenge

Issue #190 adds `a2a-high-energy-crossing-challenge@1.0.0` as an immutable
non-default Su-30MKI/F-16C demonstration package. It starts at 44,000 m
horizontal range and 105 degrees crossing angle. Blue is authored airborne at
8,500 m MSL and 270 m/s TAS; Red is at 10,000 m MSL and 250 m/s TAS. Both sides
carry two installed stores and 70% authored fuel. The package binds seed 42, a
direct guided path, and the exact North Punjab clear-winter EnvironmentPack.

Those values are normal scenario inputs consumed through the existing compiler;
there is no actor-name, scenario-name, or presentation-label branch in the
runtime. Under the current generic point-mass and verification-only termination
assumptions, both TypeScript and Rust/WASM reach an engine-owned geometric
intercept at 131.9 model seconds with a 21.836104 m closest approach inside the
compiled 25 m radius. A 46,000 m control with the other inputs held constant
reaches the 140 s time limit with a 530.164926 m closest approach instead. That
contrast is a deterministic regression boundary, not named-aircraft or
named-weapon performance evidence.

The package and report remain `PUBLIC_EDUCATIONAL` and `MODEL_ASSUMPTION`.
Reaching the geometric radius does not establish detection, track, launch
authorization, fuze, hit, damage, kill, probability of kill, launch-zone,
tactics, or real-world effectiveness. The terminal event explicitly records
`targetEffect: NOT_MODELLED`, and the target remains active. Observer pictures
remain `UNSUPPORTED` with no inferred position because this deployment has no
admitted sensor model.

## Air mission contract

Every authored numeric value is admitted before mission compilation. Ordinary
decision and scalar inputs accept decimal notation only and no more than three
fractional digits; domains that require integers or fewer digits remain
stricter. Exact WGS84 route and placement coordinates retain up to fifteen
fractional digits so an existing content-addressed source geometry is not
silently rounded. The compiler repeats type, finiteness, range, integer and
precision checks and reports a stable code and field path rather than coercing,
rounding or defaulting a value.
Spatial altitude and its Air-mission route projection import the same shared
three-fractional-digit authority; a value accepted by the map editor cannot be
rejected later by a conflicting local precision rule.
Air-mission compilation binds each admitted store to the selected immutable
model pack, including its termination authority. Mission labels, loadout names
and task class cannot alter the termination criterion or infer a target effect.

The #190 package carries its 44 km/105-degree geometry, MSL altitudes, TAS
speeds, 70% fuel and two-store Blue assignment through the existing authored
and compiled Air-mission contracts. No schema field or mission-policy authority
is added; those SI values are package-owned `MODEL_ASSUMPTION` inputs.

The compiled ground envelope advances to v2 only for the bounded
`PUBLIC_EDUCATIONAL` roll/rotation/climbout mechanism. It declares closed SI
inputs and wind/mass/fuel/runway limits; no Air-mission label can promote a
named aircraft, TP-1538 value, landing, recovery or store-release capability.

#187 adds a separate optional `vector.airborne-store-transfer-plan.v1` after an
achieved airborne state. Compilation binds exact launcher/station/store,
operation, integer tick, model-pack mass, SI installed-drag area, evidence and
the `[0.001, 1] m²` validity into the full mission and an independent ordered
authority seal. It remains generic public-educational and does not change the
ground-operation nonclaim above.

Construct produces a `vector.scenario.v4` package with an intended-use identity,
immutable compiled model-pack identity/digest, and, for Air-domain work, exactly
one `vector.air-mission.v1` object. `lib/air-mission.ts` is the exported adapter
boundary for downstream capability work: it owns the mission taxonomy,
flight-plan points and typed legs, start/recovery posture, assignment, loadout,
fuel, class-specific task fields, policy references, provenance, assumptions,
and validity limits. A consumer such as the capability kernel extends or
references this interface; it must not create a parallel mission schema.

`compileAirMissionDefinition` resolves that authored object once against the
exact model-pack and environment-pack identities and returns
`vector.compiled-air-mission.v1`. SHA-256 covers canonical authored content and
the compiled binding separately. The compiler rejects unknown root fields,
schema versions, stale model/environment identities, duplicate/dangling/cyclic
route references, route/spatial disagreement, missing class fields, invalid
units/datums, incompatible loadout/fuel, and unsupported start/runway state with
a stable code, field path, and corrective guidance. It does not choose a study
area, weather preset, installation, runway, aircraft, store, fuel state, or
mission default to repair an import.

A non-airborne start must bind the exact eligible runway carried by the
selected regional EnvironmentPack. Compilation re-derives its threshold/end,
true heading, dimensions, surface, MSL elevations and source digest from
`vector.installation-catalogue.v2`; a user-authored or model-assumption runway
substitution fails even if its coordinates look plausible. The separate
aircraft ground-performance envelope remains a declared model assumption.
Scenario cards and Air-mission validity limits name the sourced pack's
coverage, time, resolution and uncertainty instead of claiming a standard
atmosphere or absent terrain.
When the exact generic ground-dynamics projection is admitted, the compiled
operation executes readiness hold, runway roll, rotation, liftoff and climbout.
It remains a visible `MODEL_ASSUMPTION`: taxi steering, rejected-takeoff
braking, landing, recovery and named-aircraft performance stay unavailable.

Version 1 currently admits the BLUE launcher-side mission only; `RED` fails
with `MISSION_SIDE_UNSUPPORTED` until an explicit opposing-side runtime mapping
exists. Route-point task references are closed to `MISSION_START`, the selected
mission-class task identity, or explicit `null`; free text and deleted task IDs
never acquire authority. An environment identity change regenerates
study-area-owned task polygons, join-up/start geometry, and installation
bindings while preserving non-geographic policy such as CAP timing and emission
state.

The compiled engine scenario carries the complete immutable mission artifact
beside all spawned entities, initial states, events, environment, study-area
context, completion rules, and model IDs. The existing simulation Worker runs
only this compiler output and independently recompiles the authored mission at
its model-pack adapter boundary, rejecting any mismatch before caching or
execution. Server saved-run admission invokes the same compiler and stable
error taxonomy. VSR `scenario.json`, `compiled.json`, `manifest.json`,
and `report.json` preserve and cross-check the exact authored and compiled
digests, so replay and reporting never depend on mutable UI or current catalogs.
The forward-only `013_air_mission_contract.sql` migration replaces each exact
v3 template package and content hash with its canonical v4 value; production
preflight accepts only a wholly v3 or wholly v4 catalogue, the migration rejects
any residual non-v4 row, and postflight validates every v4 Air mission envelope.
Deployment does not depend on a seed mutation.

### Generic mission-policy Stage-0 dependency

Issue #151 does not change #38 mission authority. Its generic mission-policy
source manifest is an external-byte, civil-context Stage-0 verification freeze
only. NASA research architecture/challenge categories and FAA human-pilot
training categories cannot become a mission default, autonomous state machine,
action mapping, transition, cadence, threshold, timeout, priority, fuel/reserve
value, route geometry, command, doctrine, tactics, rules of engagement,
track/support state or release authority. The manifest's execution, runtime,
model-pack, production and catalog permissions are false; compilation and
saved-run admission must reject any attempted promotion. #38 remains
responsible for any future versioned executable policy, in-tick side-picture
interface, achieved-state/inventory guards and bounded-command consumer.

## Cross-domain scenario composition kernel

The kernel remains an identity/admission adapter: it verifies the expanded
ground-dynamics projection and digest but neither calculates takeoff physics nor
copies that authority into a kernel-owned schema.

For optional airborne store transfers, the adapter now also verifies the full
ordered compiled projection against the authored Air-mission requests. It
requires exact transfer and validity keys, launcher/store/station/operation
identity, integer requested tick, positive model-pack mass, the governed
`[0.001, 1] m²` installed-drag interval, each transfer content digest and the
aggregate `vector.airborne-store-transfer-authority.v1` seal. The seal binds the
aircraft source object, authored mission digest and ordered transfer digests;
missing, reordered, caller-resealed or divergent projections fail closed. The
kernel still does not decide whether a transfer is accepted or achieved: that
causal outcome remains owned by the simulation runtime.

The `SCENARIO_COMPOSITION_KERNEL` family owns one coordinated TypeScript
contract set: `vector.scenario-kernel.v1`, the governed capability
descriptor/registry/evidence records, typed command/history and
request/response records, intake/workspace projections, and the identity-only
Air mission map/binding. It is the single upstream authored identity
and reference authority for arbitrary affiliations, explicit directed
relationships, coalition/force/organization/group structure, multi-domain
entities, authored scenario-level tasks and information perspectives. `BLUE`,
`RED`, colour, array position, scenario name and platform name have no semantic
role. Hostility exists only in an explicit affiliation-relationship record.

Admission is exact-key and fail closed. Stable IDs, semantic versions, closed
enums, unique membership, finite task timing and typed affiliation,
organization, entity, task and capability references report stable code/path
issues. Organization parents and the combined task dependency/objective graph
are checked iteratively, including at the documented 10,000-node/edge bound;
oversize graphs reject as `KERNEL_GRAPH_LIMIT_EXCEEDED` rather than overflowing
the JavaScript stack. A task is only authored intent (`lifecycle: AUTHORED`): an
accepted controller request or achieved runtime state belongs to its domain
owner and cannot be inserted into this kernel.

Compilation sorts every unordered identity collection and reference set with
locale-independent code-unit comparison. It publishes the exact canonical JSON
bytes and their SHA-256 digest, and verification checks both. Object-key order
and reversed affiliation, relationship, organization, entity, task,
capability-reference, surface and perspective insertion order therefore return
identical bytes, digest and workspace identity. V1 is the first owned version:
`migrateScenarioKernelInput` records an identity admission with no migration
steps, while a legacy or unknown schema fails with
`KERNEL_INTAKE_MIGRATION_UNAVAILABLE`. No legacy Blue/Red draft is guessed into
the new contract.

Capability authority is owner-controlled in
`lib/scenario-capabilities.ts`. A scenario may carry only an exact reference to
a registered descriptor: capability ID/version, owner-contract ID/version,
descriptor digest and intended-use ID/version must all match. Descriptors use
closed selector, unit, datum, value-domain, admission and evidence domains;
publish dependency/reset policy; and are themselves canonical and immutable.
They cannot be authored inside a scenario. Every V1 descriptor has
`runtimeAuthority: NONE`, and every derived/model/runtime output remains
`UNAVAILABLE`. Unknown selectors, open fields, renderer formulas, source
coefficients, unsupported output claims and foreign owner/intended-use bindings
reject. Changing a capability reference invalidates only projections that may
consume it; a public projection that exposes no capability references retains
the same digest.

Perspective is explicit for `CONSTRUCT`, `OBSERVE`, `EXPLAIN`, `COMPARE`,
`REPLAY`, and `EXPORT`. Projection first re-verifies the compiled bytes/digest,
then removes hidden affiliations and relationships, incomplete organization
parent chains, entities with hidden placement, and tasks whose owner,
participants, objective or task-dependency closure is hidden. Scenario identity,
purpose, capability references and descriptors are omitted according to policy,
not replaced with counts or disabled-state hints. Capability dependency closure
is resolved iteratively from only visible references. Each output includes its
surface and an opaque perspective-policy digest. An unauthorized surface fails
closed before a selector or workspace adapter runs.

The full kernel is sensitive adjudication input. It stays in a trusted process;
untrusted browser/rendering consumers receive only a serialized projection.
Callers must not expose projection computation timing as a cross-trust response
oracle. This contract removes hidden values, labels, counts, filters, inspector
metadata, explanation inputs, compare inputs and export inputs, but JavaScript
execution timing is not an authorization mechanism.

Authoring history lives in `lib/scenario-kernel-history.ts`. `ADD`, `REMOVE`,
`MOVE`, `REORDER`, `GROUP`, `ASSIGN`, `BULK_EDIT`, `IMPORT`, and
`TEMPLATE_APPLY` have a closed patch grammar and are bound to the current draft
digest. A command is applied to a clone and compiled once; a dangling or cyclic
result rejects without changing history. Remove commands identify exactly one
record and carry any explicit reference-resolution assignments in the same
atomic command. Undo and redo store canonical authored before/after bytes,
restore the identical digest, cover bulk edits/imports/capability resets, clear
redo on a new branch and stop at the 1,000-command/patch bounds.

Async work uses `lib/scenario-kernel-requests.ts`. Its immutable token binds a
stable request ID, draft digest, perspective ID and policy digest, surface and
projection digest under a token digest. Response admission validates the exact
token before payload consumption. Draft edits, rapid perspective changes,
Observe/Replay switches, token tampering and mismatched response IDs reject
with distinct stable errors, so cached selectors and in-flight playback or
validation cannot be accepted into a different context.

The adapter ownership is explicit and does not duplicate domain records:

- `admitScenarioKernelIntake` is the #154 boundary. Blank, template and import
  carry exact source bytes/digest and matching provenance through the same
  compiler with no default recovery. The adapter returns the canonical typed
  history; it defines no second draft.
- `projectScenarioKernelWorkspace` is the #155 boundary. It returns the
  redacted canonical projection plus stable navigator references, selection
  state and inspectors discovered only from visible governed descriptors. It
  cannot create entities, truth, movement, events, decisions or comparison
  results, and a hidden selection becomes `REDACTED` without retaining its ID.
- `bindAirMissionToScenarioKernel` is the #60 consumer boundary. It accepts the
  published `AirMissionDefinition` and `CompiledAirMission`, verifies their
  exact authored/compiled and ground-envelope lineage, then closes kernel task,
  assignment-entity, target-entity and `capability.air-mission@1.0.0`
  references. Its output contains identity and digest fields only. #60 remains
  the sole owner of Air mission fields, compilation, route/loadout/policy
  consequence, run/VSR identity and executable admission; the kernel does not
  translate through legacy `Scenario`, infer missing Air values or create a
  parallel mission schema.

The kernel does not add domain physics, operational C2 semantics, doctrine,
ROE, force generation, sensor/track/weapon/support admission, land or maritime
runtime execution, renderer truth, database storage or UI completion. Because
the kernel and discovery projections are TypeScript-only and no Rust runtime
consumes them, TypeScript/Rust parity is not applicable. Domain-owned compiled
artifacts retain their own parity gates.

### Verification

The five `tests/scenario-kernel*.test.mjs` and
`tests/scenario-capabilities.test.mjs` suites cover the schema, registry,
history, request guards and the exact #60 Air mission, #154 intake and #155
workspace boundaries. Required falsifiers include
third-force/neutral/civil and Air/Land/Maritime composition, insertion and key
permutation, duplicate/self/dangling/cyclic references, task-objective cycles,
10,000-node iterative traversal, descriptor poisoning, deletion with atomic
reassignment, undo/redo across bulk/reset/import, all six surfaces, hidden
selection, stale draft/perspective/playback responses and legacy migration
rejection.

`npx tsx scripts/benchmark-scenario-kernel.ts` runs 30 measured samples after
three warm-ups at 12 entities/3 organizations and 75, 100 and 250 entities/12
organizations. Each sample compiles the canonical kernel, bulk-edits every
entity, verifies exact-byte undo/redo and projects all six workspace surfaces;
digest drift fails immediately and each tier has a 100 ms p95 ceiling. This is
pure contract/projection capacity evidence, not DOM,
MapLibre, Three.js, browser-frame, Worker or engine-runtime performance. Those
layers remain with #155, #87, #60 and the runtime owners.

## Builder expansion boundary

A new editable control is not complete when it merely renders. Its owning
contract must declare raw lexical admission, the structured field type and
precision, cross-field constraints, the compiled/runtime consumer or explicit
non-causal disposition, and server/final-engine revalidation. Regression
evidence must include malformed text, boundary and adjacent values, applicable
cross-field combinations, and a proof that invalid raw state cannot enter the
Worker. This is the required expansion rule for nested mission inputs as well
as the legacy flat scenario controls.
Future terminal-effect authoring must extend the governed model-pack and engine
contracts; it cannot be added as a presentation-only dropdown. This slice adds
no editable fuze, warhead, lethality, damage or kill control.

The high-energy crossing challenge is a governed configured template, not a
scenario-name branch. Its fields remain the same visible range, aspect,
altitude, speed, fuel, loadout, route, environment and seed inputs that the
general builder/import path consumes and may later edit into a new package.

Ground-start authoring exposes the governed inputs and recorded result states;
the UI does not derive rotation, liftoff, climb path, speed or controller
acceptance. Those values arrive only from the Worker/VSR canonical frame.
Airborne-transfer authoring likewise exposes only exact operation, requested
time and installed-drag area within `[0.001, 1] m²`. It cannot edit model-pack
mass/station/rule identity or mark a request accepted/achieved; those outcomes
come only from the engine-owned event.

The configured-template builder edits every input used by the nine validated templates. Its **Place & flight** surface now performs direct geographic start placement, heading, altitude and speed editing, and Blue/Red route and waypoint authoring inside a selected preset study area. Map gestures and numeric fields update one spatial plan; compilation converts it to local east-north-up engine state. The admitted point-mass aircraft controller executes compiled three-dimensional route points and records requested, accepted, and achieved movement. The authored route remains visible beside the computed track so the two cannot be confused.

Each configured route now compiles a `vector.route-plan.v2` constraint with one
acceptance radius and one transition mode per route point. The initial point has
the fixed `START` sentinel and radius `1 m`; every following point is explicitly
`FLY_BY` or `FLY_OVER`. A fly-by starts the next leg when the aircraft reaches
the greater of the declared capture radius (`1..25,000 m`) and fixed-step travel
guard. A fly-over stores the fixed `1 m` radius sentinel and starts the next leg
only at that travel guard. Changing either applicable value therefore changes an executed
transition and recorded trajectory; neither is a display-only waypoint
property. Missing, non-finite, out-of-range, length-mismatched, or invalid
transition arrays block validation and compiled-engine admission. Existing
`vector.route-plan.v1` records remain replayable under their documented
all-fly-by semantics: an omitted transition array is compiled as `START` then
`FLY_BY` for every remaining route point. New authoring always emits v2; a
present but malformed v2 transition array is rejected rather than downgraded.

Ground-authored routes do not activate the airborne controller while ground
dynamics are unavailable. The canonical record exposes the held operational
state and cause; the builder must not render the authored route as achieved
movement or synthesize a takeoff path.

Air mission authoring uses one route-edit adapter. `AirMissionDefinition` is the
authority; the existing `spatialPlan.blue` route is an atomic compatibility
projection for legacy validators and non-Air/red-route consumers. The compiler
first rejects any stale disagreement, then derives the BLUE runtime start,
heading, route, route-plan v2 transitions/radii, initial fuel, store quantity,
and station/rule identity from `CompiledAirMission`, not from the projection.
Every
route point also has a stable flight-plan ID, WGS84 longitude/latitude, explicit
MSL altitude in metres, typed `START`/`FLY_BY`/`FLY_OVER` method, TAS in metres
per second, a bounded acceptance radius in metres, optional ETA/TOT, lock state,
closed task reference, and an ordered typed leg. AGL admission requires the
exact terrain dataset and datum conversion carried by the selected regional
pack; missing/no-data terrain still fails closed. Impossible ETA, zero legs,
invalid turn state, and out-of-coverage points produce no runnable artifact.

The same UI exposes Tactical Intercept, Combat Air Patrol, Fighter Sweep, and
Escort with BVR, WVR/BFM, and unrestricted/transition overlays. CAP visibly
loads editable patrol/prosecution geometry, on-station/flight counts, station
time, emission policy, fuel reserve, weapon threshold, completion, recovery,
and divert fields. Class-specific required fields are a discriminated union;
changing the class creates the matching visible draft rather than relabeling a
different task object.

`AIRBORNE`, `PARKING`, `RUNWAY`, and `GROUND_ALERT_QRA` are first-class starts.
An airborne start references the first flight-plan point and must be above the
admitted MSL reference surface. Ground starts own installation and source IDs,
runway threshold/end WGS84 geometry, MSL elevation, heading, length, width,
surface, open/closed state, takeoff direction, readiness delay, and explicit
taxi fidelity. Runway evidence is classified and content-addressed as
`vector.runway-evidence.v1`; the digest binds geometry, source, and value state.
The compiler resolves the installation inside the frozen environment pack,
re-derives the exact `SOURCED_DATASET` runway from catalogue v2, checks
geometry/elevation/source/datum/heading/length, aircraft
surface/length/tailwind compatibility, and starts the aircraft at zero speed on
the threshold. Missing evidence, authored or model-assumption runway
substitution, closed/short/incompatible/adverse-wind runways, cross-pack
installations, or a route whose first point differs from the threshold fail
closed. The bounded aircraft ground-performance envelope and DEM/runway
reconciliation policy remain separately visible model assumptions; they never
change the sourced runway identity. The start editor can reverse takeoff
direction only by swapping the admitted runway's exact sourced threshold/end
coordinates and MSL elevations, selecting its sourced reciprocal true heading,
and recomputing the runway-evidence digest and first route point atomically.

The next expansion adds database-backed arbitrary entity collections, supporting sensor nodes, target/launch relationship authoring, and the complete blank-scenario path. Those capabilities must extend the same scenario contract; they must not introduce a second simulation-state format.

The internal `vector.scenario-draft.v1` state contract now provides the safe authoring foundation: an actually empty draft, stable entity and waypoint IDs, draft revisions, geographic position, heading, speed, routes, loadouts, target/launch references, dependency-safe deletion, duplication, and blocking validation. It remains unexposed until the blank-scenario surface can compile and run the authored package end to end; VECTOR does not ship a builder button that terminates in an incomplete workflow.

## Full builder UX specification

For an admitted runway start, the run journey preserves the exact start/runway
authority through the Worker and presents recorded hold, roll, rotate, climbout
and enroute states. Cancellation or recovery restarts admission; it cannot reuse
an unsealed partial ground-operation result.

The configured Air workflow now exposes one mission object across Define and
Place & flight: class/regime and CAP policy/geometry controls, exact start and
runway evidence, flight-plan constraints, loadout/fuel, validation digest, and
the existing Run gate all edit or consume the same authored artifact.
Construct shows the admitted pack version/digest and only offers runway-backed
bases available inside that pack; unsupported installations remain visibly
airborne-placement-only.
After a run, Current Geometry is a read-only Observe projection. The runway
aircraft presents recorded `HOLD_SHORT`/`TAKEOFF_ROLL`/`ROTATE`/`CLIMBOUT`/
`ENROUTE` and movement state from the selected frame; the component cannot
synthesize movement or promote its installed store into a launched entity.

The builder is one persistent desktop workspace, not a page-per-field wizard. The left rail owns the five Construct sections, the center owns the geographic placement surface and form for the selected object, and the right rail owns the selected entity, validation state, and compiled-summary preview. From 1280×720 upward all three remain visible; QHD and 4K expand the task surface, controls, map and typography rather than adding empty margins. On phones the same five-step state is presented as a single column with persistent actions; desktop rails are removed and no scenario state is discarded. Drawers may extend a rail but may not replace the map.

All custom choice surfaces in this workspace use the root-owned Select, Menu,
or Popover family and obey one transient-open invariant. Explanatory evidence
uses the persistent Disclosure primitive, so help can remain expanded while an
aircraft, weapon, origin, or basemap choice is completed.

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

Validate also shows the database-admitted intended-use, compiled model-pack
version/digest, credibility approval state, and every blocking limitation. If
that evidence chain is absent or internally inconsistent, catalog admission
fails and Simulate remains unavailable; the UI never reconstructs credibility
from static labels.

### Artifact and state boundaries

Operational phase, movement value state, mass, fuel, stores and controller
request/accept/achievement are computed result fields. Authoring may configure
their governed inputs but never writes or repairs these recorded values.

`Scenario.airMission` is durable authored state; `CompiledAirMission` is the
immutable run boundary; Worker/VSR/report views are read-only projections.
React controls hold no second mission object and cannot override either digest.
Changing coordinates clears a runway origin. Changing area/weather resolves a
new exact pack and invalidates an origin that does not survive its coverage and
runway admission checks.

Editable numeric controls retain their raw text separately from committed
mission state. Only an admitted finite decimal value may update that state;
invalid raw text remains visible and disables Run. Every authoring control uses
one stable semantic ID so component, browser and matrix tests address the same
control without treating a label or DOM position as authority.

An optional `vector.airborne-store-transfer-plan.v1` is likewise authored
mission intent, never compiler invention. Each request names the exact launcher,
installed ordinal, station, store source object, RELEASE or JETTISON operation,
requested SI time, installed drag area, value state, evidence and limitations.
The versioned validity projection admits installed drag area only in the
inclusive `[0.001, 1] m²` interval. That bound is a compiler-owned
public-educational validity rule, not named carriage data; the model pack still
owns store mass and the request retains its `MODEL_ASSUMPTION` or
`USER_AUTHORED` state. The UI and both runtime backends enforce the same exact
limits.
Compilation requires the executable fixed step and terminal duration, derives
the first integer tick at or after the request, and binds ordered transfer
digests plus the authored mission digest into one independent
`vector.airborne-store-transfer-authority.v1` seal. A compact entity copy cannot
promote itself; Rust reads and validates the full compiled AirMission before it
admits that copy. A fully recompiled, internally consistent mission is new
authoring, while caller-side resealing beside an unchanged authority seal fails.

- Builder state is an editable draft scenario package.
- A parameter change against governed model data is a scenario-local patch with
  old value, new value, SI unit, reason, timestamp, author, evidence, model ID,
  and pack digest; it never mutates the catalog or pack.
- Validate canonicalizes the package and records a content hash.
- Simulate compiles catalog references into an immutable engine scenario.
- The engine owns lifecycle changes and produces ordered frames and events.
- Observe reads frames; it never writes entity positions, invents ground
  movement, or turns stowed inventory into a world entity.
- Save records the authored package identity, compiled scenario, frame hash and report together.
- Overlay open state, focus ownership, placement, and Disclosure expansion are
  presentation-only and are absent from the draft, compiled scenario, Worker
  request, VSR, saved run, and report.

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

The 25 m intercept radius and 180 s maximum flight time are model-pack
assumptions, not editable operator decisions. The operator-authored legacy
completion distance remains recorded for compatibility but has no released-
weapon terminal authority.

Mission fields are operator inputs only where a visible control or imported v1
artifact supplies them. Compiler admission—not a label—decides whether class,
route, start, runway, model, fuel, loadout and policy references are supported;
autonomous pilot behavior remains unavailable.
Study-area/weather selection chooses governed sourced grids. Wind and
temperature edits remain `USER_AUTHORED` modifiers inside a new immutable pack;
they never rewrite source fields or select a fallback environment.

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
- deployment-owned engine-backend selection and fail-closed dispatch;
- blocking validation before simulation.

### Pre-engine raw control admission

Every live authoring control exposes a stable semantic `data-control-id`. Numeric
text is retained as raw authoring state until it passes the declared finite
decimal syntax, range, integer and precision rules. Empty text, whitespace,
partial exponents, non-finite tokens, unit suffixes, comma decimals and Unicode
digits do not become `0`, `NaN`, `Infinity` or a replacement default. Invalid
raw state remains visible, marks the control invalid and blocks Run before the
Worker or engine is called.

Admission is repeated at four boundaries:

1. the control-local raw gate validates syntax and preserves invalid text;
2. the shared structured gate validates JSON number type, finiteness, range,
   integer/nullability and representable fractional precision;
3. the scenario and Air-mission compilers validate whole-block relationships,
   including route/start identity, fuel/reserve, loadout capacity, ETA/TOT,
   task-class fields, runway/weather compatibility and mission references;
4. server recomputation and final engine preparation repeat the structured and
   compiler gates, so bypassing React cannot admit a different value.

Ordinary operator-authored scalar values permit no more than three fractional
digits, and individual domains may be stricter. Count fields and the current
readiness delay are integers; spatial and Air-mission altitude use the same
shared three-digit ceiling. WGS84 positions are an explicit exception:
the existing content-addressed regional/source geometry can retain up to 15
fractional digits so validation does not rewrite its identity. That coordinate
precision is not a general exemption for fuel, time, speed, mass, drag, wind or
decision values.

`vector.scenario-control-authority.v1` is the content-addressed transition
inventory for all 40 fields in the legacy `Scenario` intake. Each row declares
the field category, edit authority, causal state, draft and compiled paths,
runtime consumer, record projection, validator and retirement disposition.
Hidden radar, track-source, datalink, jammer, profile, preset-weather,
verification-event and seed fields are explicitly prohibited from becoming
unreviewed authoring controls. This is a migration authority, not a second
scenario schema: `vector.air-mission.v1` and the cross-domain scenario kernel
remain the canonical target contracts.

The current #193 slice applies strict raw admission to the editable Air-mission
number fields and to start/route coordinate editors. Range sliders retain their
browser min/max interaction boundary but still require compiler admission.
Exact draft-digest freshness, complete nested control-matrix registration,
constrained cross-control coverage, complete control-to-runtime contrasts and
retirement of the parallel legacy intake remain required before #193 can close.

An authored area of interest is not a substitute for the study-area preset. If
a later workflow needs a smaller AOI, it is a separate optional geometry inside
the selected study area and must not silently change the weather, terrain
reference, or map anchor.

### Current configured-template behavior

- The selected study area and weather are explicitly labelled preconfigured.
- Place & flight exposes the six governed regional presets immediately and may collapse them only after they have been shown. A missing/incomplete PostGIS catalog produces an actionable blocked state rather than a runnable static fallback.
- Blue and Red each have an affiliation-scoped origin picker populated from bases available in the selected public-reference environment pack. It explicitly says this bounded fixture is not a complete IAF/PAF catalogue. Choosing an origin moves that team's aircraft to the installation; manual drag remains available when no catalog origin is appropriate.
- Aircraft, weapon, origin, and basemap choices consume the shared Select and
  application overlay coordinator defined by [`responsive-ui.md`](responsive-ui.md).
  Only one transient choice surface may be open, while evidence/help
  Disclosures retain independent state. Missing or permission-filtered catalog
  identities remain visibly unavailable for correction; a picker never displays
  its first option in place of the authored identity.
- Selecting an origin retains `vector.installation-origin.v2` with installation,
  exact eligible runway, source, study-area and weather identities. The compiler
  re-resolves that runway against the immutable regional pack before producing
  an engine scenario. Missing/deleted installation, stale source,
  cross-environment, incomplete or out-of-coverage runway evidence blocks
  compilation at a stable field path. Manual drag clears the base/runway
  identity and remains an explicitly airborne placement.
- Ground-start wind admission samples the exact regional atmosphere grid at the
  selected runway threshold and readiness/start model time. The sampler's
  sourced east/north wind plus the authored weather modifiers is projected onto
  the runway true heading and compared with the immutable aircraft ground
  envelope. Modifier-only wind is never used as a substitute; missing coverage,
  no-data or invalid time rejects the start at the same admission boundary.
- The browser labels the bounded set as “bases available in this environment
  pack.” Only installations with complete public-educational runway
  geometry/elevation evidence enter origin pickers. Other catalog points remain
  visible and are labelled airborne-placement-only; neither state claims current
  operation, readiness or complete IAF/PAF coverage.
- The five-viewport browser journey edits the authoritative Air mission and
  route, switches to Rajasthan, selects the sourced Jodhpur runway, proves
  keyboard route constraints and ground-start admission/readback, and completes
  a production Worker run. Focused mission regressions independently prove all
  classes/overlays/start postures, exact first-frame ground state,
  model-pack station/rule/capacity rejection, environment geometry
  regeneration, stable negative codes, server admission, and VSR/report
  lineage.
- Blue and Red start markers and waypoints are draggable. A numeric longitude or
  latitude edit has the same meaning as dragging a start: it explicitly changes
  the aircraft to a manual airborne placement and clears any installation-origin
  identity before compilation. Altitude-only edits retain the selected
  installation identity because they do not move its geographic origin.
- Waypoint creation is scoped to the currently selected team and lives in that team's route inspector. The map never offers an unowned generic waypoint action.
- The selected entity inspector edits WGS84 start coordinates, explicit MSL altitude, true heading, true airspeed, and each waypoint's WGS84 coordinates, MSL altitude, acceptance radius, and `FLY_BY`/`FLY_OVER` transition. This provides a keyboard-accessible alternative to map placement.
- Waypoint transition remains a browser-native `select` and is explicitly
  marked as UA-owned. Its option window is not a VECTOR portal and is exempt
  from custom overlay exclusivity; the browser owns its keyboard, focus, touch,
  placement, and close behavior.
- Numeric editors retain intermediate text. Empty, non-finite, out-of-area, negative, over-limit, and uncommitted values keep the operator in Place & flight and block validation instead of being discarded, normalized, or clamped into a different scenario.
- Drag and numeric edits synchronize starting distance, altitude difference, aspect, and platform speeds before compilation.
- Validation blocks non-finite state, negative speed or altitude, invalid headings, mismatched route origins, zero-length route legs, missing or invalid `vector.route-plan.v2` radii or transitions, and any start or waypoint outside the preset boundary.
- The current Air deployment admits all four mission classes, all three
  engagement overlays, and all four start postures through one mission schema.
  Route, start, loadout quantity, fuel, and frozen-environment inputs have the
  compiled/runtime consequences described above. Mission policy is authored,
  validated, content-addressed and recorded, but autonomous virtual-pilot
  behavior remains owned by #38; this contract does not invent defensive turns,
  launch decisions, sensor effects, or weapon support from policy labels.
- Saved-run admission rejects retired `maneuver`, `targetG`, `blueDecision`, and
  `redDecision` fields and missing/unknown Air mission objects. It preserves v4
  mission intent unchanged or rejects it; it never reconstructs mission class,
  start, support, model, engine, loadout, fuel, or policy from a historic no-op.
