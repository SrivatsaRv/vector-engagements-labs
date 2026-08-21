# VECTOR Simulation Record

Status: browser implementation available, schema name `vector.record.v1`.

The VECTOR Simulation Record (VSR) is VECTOR's equivalent of an ACMI recording. It is a portable, immutable analysis artifact, not a second simulation engine. A viewer must be able to open one VSR and reproduce the same entity list, event timeline, map/3D playback, telemetry, RASP views, explanation, and report without rerunning physics.

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
| `events.jsonl` | launches, detections, track changes, guidance phases, terminations and annotations |
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

Each `pictures.jsonl` entry uses the required `vector.pictures.v3` schema and
its member hash is bound by `manifest.json`. It carries `modelTimeSeconds`, the model-clock identity
of that observer-picture sample. Consumers select it by that exact frame time,
not by array order, last-update time, or a rendered interpolation. A missing
picture is an explicit unavailable state; viewers may not synthesize track
position, confidence, freshness, or uncertainty. A replay validates one unique
side/frame sample per admitted A2A frame, finite telemetry, and the absence of
a hidden truth position before exposing the record.

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

## Browser and interoperability boundary

VSR is designed for browser production and playback. Frames use a transferable columnar buffer so a Web Worker, TypeScript engine or Rust/WASM engine can produce the same record contract. An ACMI 2.2 exporter can be added as an interoperability adapter; ACMI is not used as VECTOR's internal source of model truth because it does not carry VECTOR's full coefficient, provenance and scenario contracts.

## Implemented replay boundary

`createVectorSimulationRecord` freezes the authored scenario, compiled adapter,
entity manifest, engine frames, stable lifecycle/input events, both observer
pictures for A2A runs, provenance, limitations, and report outcome. The
`openVectorSimulationRecord` path reconstructs the existing `SimulationResult`
from recorded frames and metadata without calling either physics backend. That
read model is sufficient for the existing map, Three.js, telemetry, RASP,
explanation, and report consumers.

`frames.arrow` currently contains the versioned VECTOR columnar codec
`vector.frames.columnar.v4`: string/lifecycle and installed-store identity
metadata is encoded once in a
canonical header and all numerical entity fields are stored as contiguous f64
columns, including total installed-store mass. The historical path is retained
for compatibility, but this
implementation is not Apache Arrow IPC. An Arrow IPC adapter and downloadable
ZIP container remain follow-up interoperability work; changing the frame codec
requires a new member schema version and fixture migration.

Version 4 also records the canonical tick-owned observer state. Its
`pictures.jsonl` member is currently `vector.pictures.v3`, which can preserve
an admitted non-positional sensor PLOT but rejects any reconstructed position,
observed world identity, or truth position during replay. The requested
steering-acceleration vector remains a recorded pre-limit route-controller
demand, not an aerodynamic capability claim. A prior record is rejected with
an explicit incomplete-observer-state error; it must be regenerated from its
immutable scenario with a v4-capable runtime. VECTOR
does not synthesize a missing requested command during replay.

Stable events are ordered by model timestamp, event-class rank, entity ID, and
detail, then assigned monotonically increasing sequence numbers. Record identity
is derived from member content digests, so wall-clock creation metadata cannot
masquerade as simulation identity. Reusable transport capacity is not part of the
record bytes or content identity.
