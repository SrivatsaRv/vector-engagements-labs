# VECTOR Simulation Record

Status: architecture contract, schema name `vector.record.v1`.

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
| `compiled.json` | immutable engine input with resolved catalog and model revisions |
| `entities.json` | stable entity identities, affiliation, class, labels, lifecycle and presentation references |
| `frames.arrow` | columnar time-addressed state for every active entity |
| `events.jsonl` | launches, detections, track changes, guidance phases, terminations and annotations |
| `pictures.jsonl` | optional IAF, PAF or other observer-specific track states; Model Truth remains in frames |
| `sources.json` | cited public facts, model assumptions, user overrides and confidence state |
| `report.json` | frozen report content and analyst notes |
| `assets/` | optional portable GeoJSON, silhouettes or low-poly models identified by content hash |

Basemap tiles are referenced by provider and style revision, not silently embedded. A portable export may include explicitly licensed terrain or static assets. Missing optional assets must degrade to class silhouettes and a neutral terrain surface without changing telemetry.

## Frame contract

Each entity sample may carry position, orientation, velocity, TAS, IAS, Mach, ASL, AGL, vertical speed, angle of attack, load factor, roll rate, turn rate, turn radius, fuel, fuel flow, mass, propulsion phase, sensor state and lifecycle state. A value is marked `recorded`, `computed`, `assumed`, or `unknown`. The viewer always prefers recorded values; computed fallback values identify their formula version.

Weapons remain loadout inventory before launch. A launch event creates the weapon's first world sample with the launch platform position and inherited velocity. Static objects may omit unchanged samples. The viewer interpolates only properties explicitly declared interpolable.

## Integrity and replay

The manifest records SHA-256 hashes for the canonical scenario, compiled engine input, frames, events, sources and optional assets. Saving a run is complete only after all required hashes and a terminal run state exist. Editing a scenario creates a new draft revision; it cannot mutate a saved VSR.

## Browser and interoperability boundary

VSR is designed for browser production and playback. Frames use a transferable columnar buffer so a Web Worker, TypeScript engine or Rust/WASM engine can produce the same record contract. An ACMI 2.2 exporter can be added as an interoperability adapter; ACMI is not used as VECTOR's internal source of model truth because it does not carry VECTOR's full coefficient, provenance and scenario contracts.
