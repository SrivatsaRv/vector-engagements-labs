# VECTOR Simulation Record

Status: browser implementation available, schema name `vector.record.v1`.

The VECTOR Simulation Record (VSR) is VECTOR's equivalent of an ACMI recording. It is a portable, immutable analysis artifact, not a second simulation engine. A viewer must be able to open one VSR and reproduce the same entity list, Situation Log inputs, map/3D playback, telemetry, RASP views, explanation, and report without rerunning physics.

Tacview's ACMI 2.x format establishes the useful separation: a producer records time-addressed object properties and a viewer renders and analyzes them. Tacview also prefers recorded advanced telemetry over calculated fallback values and recommends object-class-specific export rates to control size. VECTOR adopts those principles while retaining additional scenario, model, source, and integrity records required by the workbench.

Primary references:

- [Tacview ACMI and real-time telemetry protocol](https://raia-software-inc.gitbook.io/tacview/technical-documentation/real-time-telemetry-public-protocol)
- [Tacview formulas and recorded-telemetry precedence](https://raia-software-inc.gitbook.io/tacview/technical-documentation/formulas)
- [Tacview data-size optimization](https://raia-software-inc.gitbook.io/tacview/technical-documentation/data-size-optimization-2)

## Archive contents

| Path | Purpose |
| --- | --- |
| `manifest.json` | schema version, record ID, title, timestamps, producer, hashes and required viewer features |
| `scenario.json` | authored scenario package, study area, environment, forces, routes, loadouts and assumptions |
| `compiled.json` | immutable engine input with resolved catalog IDs, compiled model-pack digest, model indexes, scenario-local patches, and model revisions |
| `entities.json` | stable entity identities, affiliation, class, labels, lifecycle and presentation references |
| `frames.arrow` | columnar time-addressed state for every active entity |
| `events.jsonl` | authoritative typed simulation events; the current producer set records run/entity lifecycle and generic verification track transitions |
| `pictures.jsonl` | optional IAF, PAF or other observer-specific track states; Model Truth remains in frames |
| `sources.json` | cited public facts, model assumptions, user overrides and confidence state |
| `report.json` | frozen report content and analyst notes |
| `assets/` | optional portable GeoJSON, silhouettes or low-poly models identified by content hash |

The implemented archive is a deterministic binary envelope (`vector.archive.v1`)
with a bounded member table followed by member payloads. The outer table hashes
every member, including `manifest.json`; the manifest independently binds every
required replay member and carries a content digest. Opening verifies bounds,
duplicate paths, SHA-256, required members, schema versions, backend provenance,
and frozen report/frame agreement before returning replay data.

Entity definition order is not a semantic input. Both engine backends admit
compiled entities in unsigned UTF-8 ID order, and the record writer repeats
that canonicalization for `compiled.json`, `entities.json`, each frame's entity
and geographic-position arrays, and `sources.json`. Consequently, permuting
same-side entity definitions without changing their fields produces identical
engine frames, events, pictures, member hashes, manifest, record ID, and full
VSR bytes. Entity IDs and producer-local semantic IDs are preserved; they are
not renumbered by insertion position. Ordered authored controls such as route
points, model tables, and event causal sequences retain their declared order.
The reader still accepts prior valid records and does not rewrite their bytes.

`compiled.json` also contains the complete
`vector.deployment-capabilities.v1` manifest. `manifest.json` binds its schema
and SHA-256 digest beside the selected engine identity. Replay rejects a record
when the compiled capability identity and record manifest disagree.

For Phase A geographic runs, `compiled.json` also preserves the complete
immutable `vector.environment-pack.v1` plus the compact runtime
`{ schemaVersion, id, version, digest }` binding. Opening a VSR verifies the
pack content digest and binding equality. A replay does not substitute the
current study-area catalogue, its default weather, or a newer pack version.

Basemap tiles are referenced by provider and style revision, not silently embedded. A portable export may include explicitly licensed terrain or static assets. Missing optional assets must degrade to class silhouettes and a neutral terrain surface without changing telemetry.

Each new `pictures.jsonl` entry uses the required `vector.pictures.v4` schema and
its member hash is bound by `manifest.json`. It carries `modelTimeSeconds`, the model-clock identity
of that observer-picture sample. Consumers select it by that exact frame time,
not by array order, last-update time, or a rendered interpolation. A missing
picture is an explicit unavailable state; viewers may not synthesize track
position, confidence, freshness, or uncertainty. A replay validates one unique
side/frame sample per admitted A2A frame, finite telemetry, and the absence of
a hidden truth position before exposing the record.

An observer-state v3 picture is a side-owned collection, not a selected track.
It retains all observations and tracks for that side/frame with exact counts
and a scan-level reason. Per-track lifecycle and visibility remain on each
track; no scalar summary may discard or misrepresent mixed lifecycles.

Browser playback first resolves one `SelectedDisplayFrame` from a requested
scrub position. Map, 3D, timeline-linked telemetry, observer-picture selection,
and visible model-time labels consume that same recorded frame identity and its
`displayTimeSeconds`. The raw scrub request remains browser interaction state;
it is not displayed as if it were a separate model sample.

## Frame contract

Each entity sample may carry scenario-local f64 position and an entity-keyed WGS84
ellipsoid position, orientation, velocity, TAS, IAS, Mach, explicit-datum
altitudes, vertical speed, angle of attack, load factor, roll rate, turn rate,
turn radius, fuel, fuel flow, mass, propulsion phase, sensor state and lifecycle
state. A value is marked `recorded`, `computed`, `assumed`, or `unknown`. The
viewer always prefers recorded values; computed fallback values identify their
formula version. Map/3D projection is never persisted as model truth.

The current aircraft sample also records the active route-point index, requested
velocity and steering acceleration, controller-accepted steering acceleration,
achieved velocity, limiter state,
installed-store mass, and the sorted identities of installed stores.
Weapon samples additionally record the closed achieved `weaponFlightState`
(`BOOST`, `COAST`, `TERMINAL_GUIDANCE`, or `TARGET_UNAVAILABLE` after launch).
This is distinct from free-text presentation phase and does not imply seeker or
support availability.
The columnar frame codec preserves these values so replay and live playback use
the same control evidence without rerunning the engine.

The compiled environment freezes `vector.synthetic-environment.v1` identities
and SHA-256 digests for transform, geoid, terrain, weather, atmosphere, study
area, routes, installations and airspace. A viewer may degrade missing optional
presentation assets, but may not silently substitute a physics-affecting
environment dataset.

Weapons remain loadout inventory before launch. Aircraft frames preserve the installed inventory identities and total store mass while the weapon is stowed. A launch event removes that store and its declared launch mass from the aircraft once, then creates the weapon's first world sample with the launch platform position and inherited velocity. Static objects may omit unchanged samples. The viewer interpolates only properties explicitly declared interpolable.

## Integrity and replay

The manifest records SHA-256 hashes for the canonical scenario, compiled engine input, compiled model pack, frames, events, sources and optional assets. It also records intended-use and credibility-manifest identities. Saving a run is complete only after all required hashes and a terminal run state exist. Editing a scenario creates a new draft revision; it cannot mutate a saved VSR.

### Simulation event stream

`events.jsonl` is the direct serialization of the engine-owned
`vector.simulation-event.v2` stream. It is not rebuilt from sampled frames and
does not contain display-ready English. The current closed producer set is
`RUN_STARTED`, `ENTITY_ENTERED_WORLD`, `ENTITY_LIFECYCLE_CHANGED`,
`TRACK_STATE_CHANGED`, and `RUN_COMPLETED`. `TRACK_STATE_CHANGED` is available
only for the source-authored generic engine-verification model and records an
opaque side-owned track transition with exact source sequence/time and typed
cause. Payload v3 retains the exact opaque observation ID for
observation-driven transitions and `null` for coast/loss transitions.
Launch-decision, guidance, support, and weapon-termination events remain
unavailable until their owning contracts produce them; the record and browser
may not infer them.

The `vector.simulation-event.v2` envelope is immutable. Each payload variant
carries a separate `vector.simulation-event-payload.<family>.vN` identity.
Adding a producer under #26, #28, or #38 therefore requires a governed payload
schema and exhaustive TypeScript/Rust/read-boundary support. An older v2 reader
must reject an unknown kind, an unknown payload-family version, or an extra
field; it may not accept the known envelope and ignore unfamiliar semantics.
Changing envelope fields requires a new event-envelope version.

Every available event has a monotonically assigned ID and sequence, exact
fixed-step model time, the corresponding retained frame index, producer and
participant identities, typed payload, phase, producer-stable local key, and
causal references. A
per-tick journal orders drafts by canonical event semantics rather than call or
entity insertion order, retains an exact frame for every event-bearing tick,
sorts and deduplicates participants, and rejects duplicate semantic
transitions, duplicate causes, missing/forward/cyclic causal receipts, and
configured capacity overflow. `emit` returns a journal-issued receipt keyed by
tick and stable local key. Producers pass that receipt across phases or later
ticks; they never infer an `event-NNN` ID. The journal resolves the receipt only
after its event commits and rejects every unresolved receipt.
The admission bound includes both regular samples and event-forced frames, so a
future high-rate #26 producer cannot bypass the recorded-state budget. VSR opening repeats schema,
ordering, frame, ownership, lifecycle, and causal-integrity validation before
exposing the stream.

The read boundary replays each entity's lifecycle history from its compiled
initial state. Initial non-stowed entries must match that state, later world
entries must activate a previously `STOWED` entity, and every lifecycle
transition's `from` value must equal the prior canonical lifecycle. The replayed
history must reach the lifecycle in the final retained frame. A syntactically
valid enum cannot therefore falsify the recorded transition history.

World entry for a scheduled stowed weapon is bound to the first fixed-step
integration boundary at or after its declared launch time and the first retained
frame containing that entity. A later lifecycle event is
bound to the first retained frame that changes from its prior canonical state,
and `RUN_COMPLETED` is bound to the final retained frame. Referencing any other
frame fails even when that frame contains the same lifecycle value.

The integer tick owns model time: each boundary is derived as `tick × fixed
step`; neither engine accumulates a floating model clock. Scheduled activation
starts from the quotient estimate and then compares the adjacent tick-derived
boundaries directly, so grid, off-grid and near-grid values use the same rule in
the producer and validator. The terminal tick is the first fixed-step boundary
at or after the declared duration. The executable interval is half-open: a
scheduled activation tick must be strictly earlier than the terminal tick.
Exact-terminal and off-grid schedules that quantize to that boundary fail
admission rather than becoming inert controls. A finite schedule after the
declared duration fails before clock quantization. The terminal tick records run
completion and admits no new tactical action. Frames represent state committed
at that boundary. Frames, events and TypeScript `EngineBatch` expose the same
canonical six-decimal recorded representation of that tick-derived time; raw
IEEE multiplication does not leak through the Worker boundary. A completed
batch reports this boundary even when it is later than an off-grid declared
duration; only its dimensionless progress value is clamped to one. The current
Rust/WASM ABI returns the whole run rather than an incremental batch, so its
final frame, `RUN_COMPLETED` event and integrated-step diagnostic provide the
equivalent canonical time.
Initial and store-world-entry events are captured before the following
integration step; post-integration lifecycle and run-terminal transitions use
the next boundary time. An event frame therefore cannot show an entity already
moved beyond the transition it records.

Historical `vector.events.v1` members remain readable only as an explicit
`UNAVAILABLE / LEGACY_EVENT_SCHEMA` state. Their frames remain replayable, but
the viewer must not upgrade legacy free-text or frame-derived events into the
authoritative v2 stream.

## Browser and interoperability boundary

VSR is designed for browser production and playback. Frames use a transferable columnar buffer so a Web Worker, TypeScript engine or Rust/WASM engine can produce the same record contract. An ACMI 2.2 exporter can be added as an interoperability adapter; ACMI is not used as VECTOR's internal source of model truth because it does not carry VECTOR's full coefficient, provenance and scenario contracts.

## Implemented replay boundary

`createVectorSimulationRecord` freezes the authored scenario, compiled adapter,
entity manifest, engine frames, the direct authoritative simulation-event
stream, both observer
pictures for A2A runs, provenance, limitations, and report outcome. The
`openVectorSimulationRecord` path reconstructs the existing `SimulationResult`
from recorded frames and metadata without calling either physics backend. That
read model is sufficient for the existing map, Three.js, telemetry, RASP,
explanation, and report consumers.

`frames.arrow` currently contains the versioned VECTOR columnar codec
`vector.frames.columnar.v5`: string/lifecycle and installed-store identity
metadata is encoded once in a
canonical header and all numerical entity fields are stored as contiguous f64
columns, including total installed-store mass. The historical path is retained
for compatibility, but this
implementation is not Apache Arrow IPC. An Arrow IPC adapter and downloadable
ZIP container remain follow-up interoperability work; changing the frame codec
requires a new member schema version and fixture migration.

Version 5 records exhaustive observer state v2 and v3. Its
`pictures.jsonl` member is `vector.pictures.v4`, which can preserve the generic
verification observation, uncertainty, and side-owned track without a world
entity identity. The reader keeps the prior frames-v4/pictures-v3 pair as a
read-only v2-only format and rejects v3 state in those legacy members. The
reader admits only the v5/v4 and v4/v3 pairs; every cross-pair or missing/extra
version fails before replay. Both
formats reject any reconstructed observed-world identity or truth position.
The requested
steering-acceleration vector remains a recorded pre-limit route-controller
demand, not an aerodynamic capability claim. A prior record is rejected with
an explicit incomplete-observer-state error; it must be regenerated from its
immutable scenario with a v4-capable runtime. VECTOR
does not synthesize a missing requested command during replay.

Authoritative events are ordered within each tick by phase, typed payload,
producer identity, every canonical participant, knowledge scope, correlation,
producer-stable local key, and causal receipt. Text comparison uses unsigned
UTF-8 byte order in both TypeScript and Rust. Current run/lifecycle producers
have semantic TypeScript/Rust parity and carry no causal edges; serialized
the generic #26 track producer now proves exact TypeScript/Rust cause-byte
parity across ticks. Events then receive monotonically increasing IDs and sequences. Record identity is
derived from member content digests, so wall-clock creation metadata cannot
masquerade as simulation identity. Reusable transport capacity is not part of
the record bytes or content identity.
