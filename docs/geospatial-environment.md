# Geospatial and executable-environment contract

Status: regional EnvironmentPack v2 implemented for public-educational use.
It is sourced and executable, but is not operational weather, a navigation
dataset, or a claim about current installation status.

The six public-educational study-area records are governed catalog data. A
forward-only migration upserts their EPSG:4326 anchors/bounds and versioned
weather assumptions, and `db:governed-data:verify` proves the database matches
the maintained TypeScript contract before fixture seeding. Runtime requests do
not create or repair these rows.

Environment selection is fail closed. `studyAreaId` and `weatherPresetId` are
resolved together before compilation. An unknown area returns
`ENVIRONMENT_STUDY_AREA_UNKNOWN`; an unknown or cross-area weather preset
returns `ENVIRONMENT_WEATHER_PRESET_UNKNOWN`. Both errors identify the authored
field. Compilation and saved-run admission use the same resolver. Defaults are
allowed only when an operator explicitly creates or changes a draft; they are
not error recovery for stale or imported identities.

## Coordinate authority

Regional sampling resolves WGS84 longitude/latitude from the declared local ENU
anchor and retains EGM2008 source heights as an explicit MSL runtime boundary;
datum disagreement is never silently coerced.

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

Configured `vector.scenario.v4` authoring is explicitly MSL. Regional terrain
admits ETOPO's EGM2008 orthometric elevations as the pack's declared MSL
reference, with that conversion policy and limitation frozen in the source
manifest. Runtime coordinates use scenario-origin ENU east/north with an
explicit metres-MSL vertical component; recording performs the inverse
horizontal solve and retains that MSL value. The separately versioned
`vector.synthetic-zero-geoid@1.0.0` operation remains only for the current
ellipsoid/MSL display conversion and is not a claim that real geoid undulation
is zero. A non-zero production geoid grid requires a new content-addressed
dataset and operation version; undeclared datum changes fail closed.

## Synthetic-environment manifest

The manifest now includes the complete regional EnvironmentPack and exact
terrain, atmosphere and installation/runway catalogue digests. The historical
synthetic identities remain only for replay compatibility.

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

The presentation-only basemap relay has a separate cache identity contract,
`vector-basemap-tile.v1`. Exactly one canonical mode/zoom/x/y tuple selects a
fixed provider tile. It cannot modify a scenario, environment manifest, map
geometry, or replay frame. Refer to `security-boundaries.md` for its request,
cache, expiry, size, and failure bounds.

Weather uses a versioned ENU vector-field interface sampled by geographic
position and model time. Atmosphere uses a separate versioned field interface.
The current regional point-mass adapter samples the frozen horizontal grids and
an explicit metres-MSL vertical coordinate; it derives AGL only from the same
admitted DEM. Spatially uniform presets and the educational standard atmosphere
remain Phase A replay compatibility paths and cannot silently replace a missing
regional grid.

## Regional executable EnvironmentPack v2

Every governed study-area/weather selection now admits one immutable
`vector.environment-pack.v1` artifact at content version `2.0.0`. The offline
source boundary is `governance/environment-sources/regional-environment-v1`:

- NOAA ETOPO 2022 v1 15 arc-second relief, public-domain US-government data,
  WGS84 horizontal coordinates and EGM2008 orthometric heights, preprocessed
  into bounded 0.1-degree regular grids. Runtime declares those heights as the
  pack MSL reference; use for navigation is prohibited.
- NASA POWER hourly surface analysis, NASA CC0, WGS84/UTC, frozen as 3x3 grids
  with 24 samples for every governed weather identity. Temperature, pressure,
  relative humidity and 10 m ENU wind are sourced; the vertical atmosphere is
  explicitly derived with a bounded hypsometric standard-lapse method from
  -500 through 20,000 m MSL.
- OurAirports at exact Git revision
  `7d6886315f6c249b3818930030871d9329cc3445`, Unlicense/public domain, supplies
  available runway endpoints, dimensions, headings, surface and reported
  elevations. It does not establish present operation, fitness or occupancy.

The manifest binds all 114 exact raw artifacts, provider URLs, retrieval date,
licence decisions, datums, source resolution, preprocessing, no-data policy,
uncertainty/limitations, and the normalized bundle digest. Normal CI is
offline; `--refresh-regional` is the explicit maintainer action and requires
the exact admitted OurAirports checkout.

Worker, TypeScript and Rust/WASM consumers implement the same WGS84 ENU-to-grid
horizontal transform and explicit metres-MSL runtime vertical axis. Recorded
positions invert that hybrid coordinate contract against the exact scenario
origin, preserving WGS84 longitude/latitude and the runtime MSL altitude.
They also share bilinear spatial interpolation, linear hourly interpolation,
and moist-air density and speed-of-sound derivation. The compiler copies a bounded
runtime projection into the engine input, so ticks read no database, network or
provider response. Source wind and atmosphere affect aircraft and weapon
dynamics. The same terrain grid supplies MSL ground, AGL, initial/route
below-terrain rejection, guided-vehicle collision and geometric LOS. Missing,
outside-coverage/time/altitude, corrupt or stale identities fail closed.

The regional TypeScript and Rust/WASM hot paths reject at the first sampling
boundary that cannot produce terrain, atmosphere or wind. A moving aircraft or
guided vehicle that crosses a grid edge, a fixed-step frame beyond atmospheric
validity, a missing grid cell, or a non-finite/physically invalid derived sample
returns a stable engine error; the run is not emitted with `NaN`, clamped to a
zero-MSL surface, or allowed to continue until a later subsystem happens to
fail. Rust terrain and atmosphere helpers therefore return `Result` through
integration, collision and frame construction. The `0 m` reference plane and
educational standard atmosphere are retained only when the admitted historical
synthetic/legacy scenario has no regional runtime projection; they are not an
error-recovery path for a present regional projection.

`vector.installation-catalogue.v2` retains the bounded 6 IAF / 15 PAF public
fixture and adds 24 sourced runway records. Twelve contain the minimum
public-educational geometry/elevation evidence. That count is evidence
completeness, never an operational-status claim. `vector.installation-origin.v2`
requires a specific eligible runway; unsupported installation points are
labelled airborne-placement-only and cannot become a base spawn. Manual
airborne placement has no installation identity. At compilation the sourced
runway threshold is compared with the sampled DEM. The higher elevation plus
0.01 m is used only when disagreement is at most 30 m; this reconciliation is
declared as `MODEL_ASSUMPTION`, and a larger conflict fails admission.

Forward migration `014_environment_pack_runways.sql` adds immutable PostGIS
environment-pack rows and sourced runway geometry. Seed and catalog admission
verify pack, terrain, atmosphere, installation-catalogue and per-runway content
digests. It also replaces the v4 scenario cards and Air-mission validity limits
with exact sourced EnvironmentPack wording and canonical content hashes;
`environment:migration:verify` rejects generated SQL drift. A content change is
a new version; a trigger prohibits mutating archived pack content. VSR embeds
the full admitted pack, so a deleted or superseded current catalogue cannot
alter replay. API, map, 3D and report show the same pack digest, time and datum.

## Phase A executable EnvironmentPack

This section documents the retained historical v1 compatibility contract; the
regional v2 path above is the current executable authority.

The installation and study-area persistence declarations live in
`db/schema/geospatial.ts` behind the unchanged aggregate Drizzle facade.

`vector.environment-pack.v1` is the executable, Worker-loadable Phase A
boundary for future ground and route work. It is constructed from explicitly
selected governed draft inputs and has an immutable ID, version, and SHA-256
digest. It carries explicit WGS84
coverage geometry, MSL terrain datum, no-data policy, synthetic reference
surface, educational standard-atmosphere policy, ENU weather vector, and an
installation/runway-coverage identity.

At admission, `(studyAreaId, weatherPresetId)` resolves once into this complete
pack. The compiler freezes that exact content in `EngineScenario.geospatial`
and copies only its `{ schemaVersion, id, version, digest }` binding into the
TypeScript and Rust/WASM runtime contract. The runtime checks that the binding,
pack digest, selected area, weather identity, and effective wind/temperature
agree. VSR replay rechecks the archived pack and binding before exposing a run.
It never re-resolves an environment ID against a current catalogue. Unknown,
deleted, stale, cross-area, malformed, or digest-mismatched environment input
therefore fails closed. This is an authority boundary, not a claim that the
current static Phase A fixture is the final PostGIS/ingestion authority.

The Phase A pack is deliberately `MODEL_ASSUMPTION` and
`PUBLIC_EDUCATIONAL`. Its terrain is a deterministic constant MSL reference
plane and its atmosphere is the documented NASA educational approximation. It
makes no claim of Punjab, Ladakh, or other regional DEM/weather fidelity. Phase
B must publish separately versioned, licensed, source-cited terrain, geoid, and
atmospheric datasets before regional terrain masking, collision, or operational
weather can be admitted.

The bounded EnvironmentSampler materializes a pack wholly in the browser
Worker. It accepts only finite local coordinates and model time, rejects a
request over the pack maximum, supports cancellation between bounded scheduling chunks, and
does not access a network, database, or map tile during sampling. The dedicated
`environment-sampler.worker.ts` caches at most four packs and rejects a missing
or malformed pack. The regional v2 engine path supersedes this historical
synthetic runtime authority while retaining Phase A replay compatibility.

Installation coverage is separately declared as
`BOUNDED_PUBLIC_REFERENCE_FIXTURE` and binds
historical `vector.installation-catalogue.v1` by ID/version/SHA-256 digest. The manifest
contains record count, sources/license state, known gaps, validity/review state,
and per-installation WGS84 datum, positional-uncertainty state, and provenance.
The current 21 public-reference points are not all IAF or PAF bases. The API
fails closed when published PostGIS geometry/source rows diverge from that
manifest; the browser fails closed on a stale coverage identity. Runway evidence
is text-only or absent; therefore no Phase A installation is eligible to prove a
ground/runway start. A future
runway record must include the required geometry, MSL elevation, datum,
provenance, uncertainty, and mission-start evidence before it can be offered.
The historical `vector.installation-origin.v1` airborne reference could identify a selected
public installation, its source and the selected environment, but it cannot
assert runway use. Compilation resolves it against the governed catalog and
rejects missing, stale, out-of-area, cross-environment and runway identities;
the point coordinate is not an admission fallback. Admitted selected-origin
references are stored in the compiled engine scenario and contribute to the
`missionOrigins` dataset digest in the frozen synthetic-environment manifest,
which is retained in the VSR and report provenance.

## Phase B source-ingestion admission boundary

Before the regional v2 bundle, the first source-admission slice committed a
small, lawful offline source artifact under
[`governance/environment-sources/nasa-power-hourly-20200115`](../governance/environment-sources/nasa-power-hourly-20200115).
It contains two exact NASA POWER Hourly Point API responses for the governed
North Punjab and Ladakh anchors, for 2020-01-15 UTC. NASA Earthdata's data-use
policy says NASA-led mission data are CC0 unless the individual data carry a
restrictive notice or licence; these responses carry no such notice. The
manifest records that licence decision, source/citation URLs, retrieval date,
provider/API version, exact request, WGS84 horizontal datum, explicitly
undeclared vertical datum, raw-byte SHA-256 for each response, field units,
time coverage, and limitations.

`ingestSourcedPointAtmosphere` calculates the raw UTF-8 SHA-256 before it
parses the response. It rejects a changed byte, source/API/time/coordinate/unit
mismatch, no-data fill value, invalid datum declaration, and incomplete hourly
parameter series. The committed verifier runs in `make ci-local`; sampling
and verification use no network, database, map tile, or simulation tick path.

That precursor remains an ingestion and integrity proof only. The source is explicitly
`POINT_ONLY` and `INELIGIBLE` for area-environment admission. It is not
connected to the executable regional pack or its runtime sampler. It supplies no
terrain, geoid, runway, atmospheric profile, area weather field, ground start,
terrain collision, or terrain masking. An attempted area-pack use throws
rather than interpolating or promoting two anchor observations to regional
truth. A later immutable source version must add licensed, bounded
area-covering datasets and the required datum/uncertainty evidence before it
can replace any regional source identity.

## Terrain and geometric line of sight

Regional AGL, below-terrain admission, impact and geometric LOS all call the
same admitted ETOPO grid sampler. Raising a synthetic ridge changes collision
and LOS, while detection probability remains outside this contract.

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

Regional gates cover 114 raw artifacts, independent planar/atmosphere fixtures,
six-area contrast, no-data/datum/time failures, TS/Rust parity, PostGIS/API
readback, Worker cancellation/recovery and bounded throughput/memory.

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
