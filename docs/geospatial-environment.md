# Geospatial and synthetic-environment contract

Status: versioned foundation implemented. This is an educational synthetic
environment, not an operational-precision terrain installation.

The six public-educational study-area records are governed catalog data. A
forward-only migration upserts their EPSG:4326 anchors/bounds and versioned
weather assumptions, and `db:governed-data:verify` proves the database matches
the maintained TypeScript contract before fixture seeding. Runtime requests do
not create or repair these rows.

## Coordinate authority

VECTOR uses the WGS84 ellipsoid (`EPSG:7030`) and the transform contract
`vector.wgs84-ecef-local.v1`:

```text
explicit-datum geographic position
  -> explicit geoid or ground-surface operation when required
  -> WGS84 ellipsoid longitude, latitude and height (f64)
  -> Earth-centered Earth-fixed XYZ (f64)
  -> stable scenario-origin ENU or NED (f64)
  -> immutable recorded local and geographic samples
  -> MapLibre longitude/latitude and camera-relative Three.js f32 adapters
```

The scenario origin is `vector.scenario-origin.v1`. Configured study areas use
their governed anchor at zero ellipsoid height and ENU orientation. Origin ID,
frame, WGS84 position and transform version are frozen into the compiled
scenario. JavaScript `number` and Rust engine state are IEEE-754 f64; only the
final camera-relative Three.js adapter intentionally narrows to f32.

MapLibre reads each frame's recorded WGS84 position. Three.js reads the same
frame's recorded ENU position and model time. Camera state, basemap projection,
screen coordinates and Three.js objects never feed back into engine state.

## Vertical datums

Every new geographic altitude is `{ valueM, datum }`, where datum is
`ELLIPSOID`, `MSL` or `AGL`.

- ECEF conversion accepts only ellipsoid height.
- Ellipsoid ↔ MSL conversion requires a named, versioned geoid operation.
- MSL ↔ AGL conversion requires a named terrain dataset/version and an explicit
  MSL ground sample.
- A datum mismatch throws; there is no unit- or label-based inference.

Configured `vector.scenario.v2` authoring is explicitly MSL. The current
foundation uses `vector.synthetic-zero-geoid@1.0.0` as a deterministic
educational operation, not as a claim that geoid undulation is zero in the real
study areas. Legacy v2 saved inputs documented as ASL are admitted only by a
boundary compatibility adapter that writes `MSL`; any declared non-MSL value is
rejected. A production geoid grid must be introduced as a new content-addressed
dataset and operation version.

## Synthetic-environment manifest

Every compiled run carries `vector.synthetic-environment.v1`, including:

- coordinate-transform and WGS84 identity;
- geoid identity and the no-implicit-conversion rule;
- terrain identity, resolution, coverage/no-data policy and prohibition on
  remote tick requests;
- weather-vector and atmosphere-field identities;
- study-area and route identities;
- installation and airspace dataset identities;
- presentation-only basemap style identity; and
- explicit angle, length, velocity and model-time units.

Manifest digests are SHA-256 over canonical JSON. The synchronous implementation
exists so browser scenario compilation remains pure; it has a standards-vector
test. Dataset consumers can assert content against its identity; malformed
digests and content mismatches fail closed with dataset/version context. Basemap
selection is recorded only as presentation provenance and cannot alter
simulation.

Weather uses a versioned ENU vector-field interface sampled by geographic
position and model time. Atmosphere uses a separate versioned field interface.
The current point-mass adapter samples scenario-local up relative to the
ellipsoid-datum origin, matching the implemented engine; it does not mislabel
that tangent-plane coordinate as MSL or AGL. The current adapters are spatially
uniform presets and the educational standard atmosphere. The interfaces permit
later explicit-datum geographic fields and bounded grids without changing
entity contracts.

## Terrain and geometric line of sight

`TerrainSampler` is a local interface with content identity, declared rectangular
coverage and a hard maximum sample count. `geometricLineOfSight`:

- accepts only explicit MSL endpoints;
- samples a deterministic straight path at declared spacing;
- fails closed as `NO_DATA` outside coverage or over a no-data cell;
- reports sample count, minimum clearance, blocking sample and terrain identity;
- rejects work exceeding the caller or sampler bound; and
- performs no network or database request.

Deterministic flat, ridge and no-data fixtures prove the interface. There is no
production DEM ingestion, terrain collision, diffraction, propagation loss or
sensor-detection model in this change. Geometric visibility is not detection.

Coverage records use one of three bases:

- `DECLARED`: authored study volume or limitation;
- `GEOMETRIC`: calculated spatial visibility/obstruction result; or
- `SENSOR_COMPUTED`: result of a future versioned sensor model.

The current map envelopes are `DECLARED`. The LOS fixture results are
`GEOMETRIC`. No current result is labeled `SENSOR_COMPUTED`.

## Verification and tolerances

Automated tests cover equator, both poles, the dateline, high altitude,
study-area edges, invalid/non-finite input rejection, known WGS84
distance/bearing, ENU/NED conversion, explicit
geoid and AGL operations, flat terrain, synthetic ridge, no-data, bounded work,
datum mismatch, dataset/transform digest mismatch, map/Three/record/report
equivalence and TypeScript/Rust-WASM record parity.

| Check | Tolerance |
| --- | ---: |
| Geodetic ↔ ECEF longitude/latitude away from pole singularity | `1e-8` degree |
| Geodetic ↔ ECEF ellipsoid height | `1e-3` m |
| Geographic ↔ local frame position | `1e-3` m equivalent |
| Recorded geographic → recorded ENU | `1e-5` m |
| Known 1° equatorial WGS84 geodesic | `1e-3` m |
| Map adapter using a recorded sample | exact stored longitude/latitude |
| Camera-relative Three.js f32 narrowing | `1e-3` m for the fixture |

These are implementation regression tolerances, not a terrain or installation
accuracy claim. Long-range tangent-plane physics, real geoid accuracy, terrain
tile continuity and smooth-Earth/radio-horizon models remain future versioned
work.
