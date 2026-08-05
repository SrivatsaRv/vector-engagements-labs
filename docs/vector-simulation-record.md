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

Basemap tiles are referenced by provider and style revision, not silently embedded. A portable export may include explicitly licensed terrain or static assets. Missing optional assets must degrade to class silhouettes and a neutral terrain surface without changing telemetry.

## Frame contract

Each entity sample may carry scenario-local f64 position and an entity-keyed WGS84
ellipsoid position, orientation, velocity, TAS, IAS, Mach, explicit-datum
altitudes, vertical speed, angle of attack, load factor, roll rate, turn rate,
turn radius, fuel, fuel flow, mass, propulsion phase, sensor state and lifecycle
state. A value is marked `recorded`, `computed`, `assumed`, or `unknown`. The
viewer always prefers recorded values; computed fallback values identify their
formula version. Map/3D projection is never persisted as model truth.

The compiled environment freezes `vector.synthetic-environment.v1` identities
and SHA-256 digests for transform, geoid, terrain, weather, atmosphere, study
area, routes, installations and airspace. A viewer may degrade missing optional
presentation assets, but may not silently substitute a physics-affecting
environment dataset.

Weapons remain loadout inventory before launch. A launch event creates the weapon's first world sample with the launch platform position and inherited velocity. Static objects may omit unchanged samples. The viewer interpolates only properties explicitly declared interpolable.

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
`vector.frames.columnar.v1`: string/lifecycle metadata is encoded once in a
canonical header and all numerical entity fields are stored as contiguous f64
columns. The historical path is retained for compatibility, but this first
implementation is not Apache Arrow IPC. An Arrow IPC adapter and downloadable
ZIP container remain follow-up interoperability work; changing the frame codec
requires a new member schema version and fixture migration.

Stable events are ordered by model timestamp, event-class rank, entity ID, and
detail, then assigned monotonically increasing sequence numbers. Record identity
is derived from member content digests, so wall-clock creation metadata cannot
masquerade as simulation identity. Reusable transport capacity is not part of the
record bytes or content identity.
