# Work item 06: Geospatial and synthetic-environment contract

Priority: P1

Depends on: stable entity and sensor state contracts

Blocks: terrain-aware flight, line of sight, computed coverage, and long-range geographic playback

## Outcome

Every entity has an authoritative geographic position, an explicit altitude reference, a stable local physics transform, and presentation coordinates derived from the same recorded state. Terrain and weather affect physics only when their versioned datasets and sampling rules are frozen with the run.

## Current gap

VECTOR uses a study-area anchor and local east, north, up coordinates, then converts to longitude and latitude using a meters-per-degree approximation. This is adequate for a short local visualization. It does not provide ECEF, an explicit ellipsoid/geoid contract, terrain elevation, AGL, terrain collision, terrain line of sight, Earth curvature, or reproducible synthetic-environment data.

## Coordinate contract

```text
Canonical authoring position
  WGS84 longitude and latitude
  altitude value
  vertical datum: ellipsoid, mean sea level, or above ground level

Calculation position
  Earth-centered Earth-fixed f64
  scenario-origin local NED or ENU f64

Rendering position
  MapLibre Mercator or globe projection
  camera-relative Three.js f32
```

The engine and record own position. MapLibre, Three.js, and Cesium are adapters. Screen pixels and rendered marker positions never feed physics.

[JSBSim's frame reference](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/frames-of-reference/) describes body, aerodynamic, ECEF, and local NED frames. [NGA's WGS84 resources](https://earth-info.nga.mil/index.php?action=wgs84&dir=wgs84) provide the authoritative ellipsoid and geoid context.

## Synthetic-environment manifest

Each run freezes:

- WGS84 and geoid revision;
- terrain dataset and tile digests;
- terrain resolution and no-data policy;
- study-area boundary and scenario origin;
- airspace, installation, and route dataset versions;
- weather source or preset and sample time;
- basemap style reference for presentation only;
- units and coordinate transform version.

[OGC CDB](https://www.ogc.org/standards/cdb/) is a useful precedent for separating terrain, imagery, vectors, buildings, models, routes, airports, materials, and navigation data from vehicle behavior. VECTOR does not need to implement CDB to adopt that clean boundary.

## Terrain and coverage progression

1. Ingest an AOI terrain package from a public DEM such as Copernicus GLO-30 or NASA SRTM.
2. Compute terrain elevation and AGL for all world entities.
3. Add terrain collision and ground termination.
4. Add straight geometric terrain obstruction.
5. Add Earth curvature and geometric radio horizon.
6. Add diffraction or path-attenuation models only with their own validation work.
7. Feed line of sight and path state into sensors and track processing.

Terrain line of sight is not radar detection. Detection still requires a sensor, target, scan, signature, threshold, environment, and track-state model.

## Map technology decision

### Keep MapLibre for the default product

- scenario placement and waypoint authoring;
- installations, airspace, routes, labels, and tactical overlays;
- lightweight desktop and mobile interaction;
- 2D playback and selected tilt preview.

Replace per-entity DOM markers with GPU symbols or a custom WebGL layer as scale grows. Follow [MapLibre's large-data guidance](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).

### Keep Three.js for local tactical replay

- camera-relative engagement geometry;
- instanced silhouettes and missiles;
- altitude stems, curtains, trails, and sensor volumes;
- synchronized playback from the same record.

### Evaluate Cesium later

Use a measured spike when the product requires global curvature, globe-scale routes, ECEF-native display, real terrain, or long-range line of sight. [CesiumJS](https://cesium.com/platform/cesiumjs) is designed for high-precision WGS84 and time-dynamic geospatial visualization, but it is heavier than needed for a local engagement.

## Acceptance criteria

- WGS84, ECEF, and local-frame round trips meet declared position tolerances.
- Altitude always carries an explicit datum.
- MSL and ellipsoid values cannot be combined without an explicit geoid transform.
- Map and Three.js show projections of the same recorded state at the same model time.
- The run records terrain, geoid, weather, and transform digests.
- Terrain sampling is local, cached, bounded, and performed away from the main UI thread.
- Coverage labels state whether they are declared, geometric, or sensor-computed.
- A sensor path blocked by a synthetic ridge follows the expected state transition.

## Tests

- Equator, poles, dateline, high-altitude, and study-area-edge round trips.
- Known geodesic distances and bearings.
- Ellipsoid, MSL, and AGL conversion fixtures.
- Flat terrain, synthetic ridge, valley, and smooth-Earth horizon cases.
- Terrain no-data and tile-boundary continuity.
- Map, 3D, record, and report coordinate equivalence.
- Dataset digest mismatch and offline-cache behavior.

## Non-goals

- Operationally precise current installations or routes.
- Remote terrain requests on every simulation tick.
- Calling a basemap a synthetic environment.
