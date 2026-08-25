import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraRelativeThreePosition,
  convertLocalFrame,
  createLocalFrameToGeographic,
  ecefToGeodetic,
  geographicToLocalFrame,
  geodeticToEcef,
  geodesicDistanceBearing,
  localFrameToGeographic,
} from "../lib/geospatial/geodesy.ts";
import {
  assertDatasetIdentityContent,
  sha256HexSync,
  sha256Identity,
} from "../lib/geospatial/digest.ts";
import {
  convertWithGeoid,
  convertWithGroundSurface,
  requireAltitudeDatum,
} from "../lib/geospatial/vertical-datums.ts";
import {
  createSyntheticTerrainSampler,
  geometricLineOfSight,
  terrainCollision,
  sampleTerrainBounded,
} from "../lib/geospatial/terrain.ts";
import {
  createEducationalAtmosphereField,
  createUniformWeatherVectorField,
} from "../lib/geospatial/synthetic-environment.ts";
import {
  PHASE_A_INSTALLATION_GAPS,
  admitEnvironmentPack,
  admitPhaseAEnvironmentPack,
  assertEnvironmentPack,
  assertPublishedEnvironmentPackRows,
  assertPhaseAEnvironmentPack,
  createEnvironmentSampler,
  createPhaseAEnvironmentPack,
  createPhaseAEnvironmentSampler,
  deriveAtmosphereProfile,
  environmentPackBinding,
  sampleRegularGridBilinear,
} from "../lib/geospatial/environment-pack.ts";
import { INSTALLATION_CATALOGUE_IDENTITY, PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import {
  geographicToEnginePosition,
  geographicToLocal,
  localToGeographic,
  scenarioOrigin,
} from "../lib/scenario-spatial.ts";
import { getStudyArea, getWeatherPreset, STUDY_AREAS } from "../lib/study-areas.ts";
import { DEFAULT_SCENARIO, getFrameAt, simulate } from "../lib/simulation.ts";
import { localToLngLat, recordedLngLat } from "../lib/map-layer-contracts.ts";
import { buildReportExport } from "../lib/report-export.ts";
import { getScenarioDefinition, SCENARIO_LIBRARY } from "../lib/scenarios.ts";

const angularDifference = (left, right) => {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
};

const origin = (longitudeDeg, latitudeDeg, altitudeM = 0, frame = "ENU") => ({
  schemaVersion: "vector.scenario-origin.v1",
  id: "test-origin",
  frame,
  geographic: {
    longitudeDeg,
    latitudeDeg,
    altitude: { valueM: altitudeM, datum: "ELLIPSOID" },
  },
  transformVersion: "vector.wgs84-ecef-local.v1",
});

test("canonical synchronous SHA-256 is stable and standards-compatible", () => {
  assert.equal(
    sha256HexSync("abc"),
    "6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
  assert.match(sha256Identity({ b: 2, a: 1 }), /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    sha256Identity({ b: 2, a: 1 }),
    sha256Identity({ a: 1, b: 2 }),
  );
});

test("WGS84 geodetic and ECEF round trips cover equator, poles, dateline and high altitude", () => {
  const fixtures = [
    { longitudeDeg: 0, latitudeDeg: 0, altitude: { valueM: 0, datum: "ELLIPSOID" } },
    { longitudeDeg: 180, latitudeDeg: 0, altitude: { valueM: 12_000, datum: "ELLIPSOID" } },
    { longitudeDeg: -179.9999, latitudeDeg: -45, altitude: { valueM: 80_000, datum: "ELLIPSOID" } },
    { longitudeDeg: 42, latitudeDeg: 90, altitude: { valueM: 500, datum: "ELLIPSOID" } },
    { longitudeDeg: -123, latitudeDeg: -90, altitude: { valueM: 500, datum: "ELLIPSOID" } },
  ];
  const equator = geodeticToEcef(fixtures[0]);
  assert.ok(Math.abs(equator.xM - 6_378_137) < 1e-6);
  assert.ok(Math.abs(equator.yM) < 1e-9);
  assert.ok(Math.abs(equator.zM) < 1e-9);
  for (const fixture of fixtures) {
    const roundTrip = ecefToGeodetic(geodeticToEcef(fixture));
    assert.ok(Math.abs(roundTrip.latitudeDeg - fixture.latitudeDeg) < 1e-8);
    assert.ok(Math.abs(roundTrip.altitude.valueM - fixture.altitude.valueM) < 1e-3);
    if (Math.abs(fixture.latitudeDeg) < 89.999) {
      assert.ok(angularDifference(roundTrip.longitudeDeg, fixture.longitudeDeg) < 1e-8);
    }
  }
});

test("prepared local-frame inversion preserves the exact WGS84 conversion", () => {
  for (const frame of ["ENU", "NED"]) {
    const fixtureOrigin = origin(73.9, 31.8, 260, frame);
    const prepared = createLocalFrameToGeographic(fixtureOrigin);
    for (const point of [
      { x: 0, y: 0, z: 0 },
      { x: 12_345.678, y: -9_876.543, z: 1_234.5 },
      { x: -250_000, y: 175_000, z: -50 },
    ]) {
      assert.deepEqual(prepared(point), localFrameToGeographic(point, fixtureOrigin));
    }
  }
});

test("geodesy rejects invalid and non-finite geographic, ECEF and local coordinates", () => {
  assert.throws(
    () => geodeticToEcef({
      longitudeDeg: Number.NaN,
      latitudeDeg: 0,
      altitude: { valueM: 0, datum: "ELLIPSOID" },
    }),
    /Longitude must be finite/,
  );
  assert.throws(
    () => geodeticToEcef({
      longitudeDeg: 0,
      latitudeDeg: 90.0001,
      altitude: { valueM: 0, datum: "ELLIPSOID" },
    }),
    /Latitude must be finite/,
  );
  assert.throws(
    () => geodeticToEcef({
      longitudeDeg: 0,
      latitudeDeg: 0,
      altitude: { valueM: Number.POSITIVE_INFINITY, datum: "ELLIPSOID" },
    }),
    /Altitude must be finite/,
  );
  assert.throws(
    () => ecefToGeodetic({ xM: 0, yM: Number.NaN, zM: 0 }),
    /ECEF coordinates must be finite/,
  );
  assert.throws(
    () => localFrameToGeographic(
      { x: 0, y: Number.NEGATIVE_INFINITY, z: 0 },
      origin(0, 0),
    ),
    /Local-frame coordinates must be finite/,
  );
});

test("scenario-local ENU and NED round trips retain WGS84 state", () => {
  const fixtures = [
    { origin: origin(0, 0), point: { longitudeDeg: 0.5, latitudeDeg: 0.4, altitude: { valueM: 15_000, datum: "ELLIPSOID" } } },
    { origin: origin(179.8, 5), point: { longitudeDeg: -179.9, latitudeDeg: 5.2, altitude: { valueM: 50, datum: "ELLIPSOID" } } },
    { origin: origin(20, 89.5), point: { longitudeDeg: 40, latitudeDeg: 89.7, altitude: { valueM: 1_000, datum: "ELLIPSOID" } } },
  ];
  for (const fixture of fixtures) {
    const enu = geographicToLocalFrame(fixture.point, fixture.origin);
    const roundTrip = localFrameToGeographic(enu, fixture.origin);
    assert.ok(angularDifference(roundTrip.longitudeDeg, fixture.point.longitudeDeg) < 1e-8);
    assert.ok(Math.abs(roundTrip.latitudeDeg - fixture.point.latitudeDeg) < 1e-8);
    assert.ok(Math.abs(roundTrip.altitude.valueM - fixture.point.altitude.valueM) < 1e-3);
    const ned = convertLocalFrame(enu, "ENU", "NED");
    assert.deepEqual(convertLocalFrame(ned, "NED", "ENU"), enu);
  }
});

test("WGS84 inverse geodesic returns known equatorial distance and bearing", () => {
  const result = geodesicDistanceBearing(
    { longitudeDeg: 0, latitudeDeg: 0 },
    { longitudeDeg: 1, latitudeDeg: 0 },
  );
  assert.ok(Math.abs(result.distanceM - 111_319.490793) < 1e-3);
  assert.ok(Math.abs(result.initialBearingDeg - 90) < 1e-10);
  const dateline = geodesicDistanceBearing(
    { longitudeDeg: 179.5, latitudeDeg: 10 },
    { longitudeDeg: -179.5, latitudeDeg: 10 },
  );
  assert.ok(dateline.distanceM > 100_000 && dateline.distanceM < 112_000);
});

test("study-area edge authoring uses explicit MSL conversion and stable origin", () => {
  const area = getStudyArea("north-punjab");
  const authored = {
    longitude: area.bounds[1][0],
    latitude: area.bounds[1][1],
    altitudeM: 8_500,
    verticalDatum: "MSL",
  };
  const local = geographicToLocal(authored, area);
  const roundTrip = localToGeographic(local, area);
  assert.equal(scenarioOrigin(area).id, "study-area:north-punjab:origin:v1");
  assert.equal(roundTrip.verticalDatum, "MSL");
  assert.ok(angularDifference(roundTrip.longitude, authored.longitude) < 1e-8);
  assert.ok(Math.abs(roundTrip.latitude - authored.latitude) < 1e-8);
  assert.ok(Math.abs(roundTrip.altitudeM - authored.altitudeM) < 1e-3);
  assert.throws(
    () => geographicToLocal({ ...authored, verticalDatum: "AGL" }, area),
    /explicit MSL/,
  );
});

test("vertical datums require explicit versioned geoid and ground operations", () => {
  const geoid = {
    id: "test-geoid",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
    operationVersion: "vector.vertical-datum-operation.v1",
    undulationM: () => 32.5,
  };
  const msl = {
    longitudeDeg: 75,
    latitudeDeg: 30,
    altitude: { valueM: 100, datum: "MSL" },
  };
  assert.throws(() => geodeticToEcef(msl), /ellipsoid altitude/);
  const ellipsoid = convertWithGeoid(msl, "ELLIPSOID", {
    schemaVersion: "vector.geoid-conversion.v1",
    model: geoid,
  });
  assert.equal(ellipsoid.altitude.valueM, 132.5);
  assert.deepEqual(
    convertWithGeoid(ellipsoid, "MSL", {
      schemaVersion: "vector.geoid-conversion.v1",
      model: geoid,
    }),
    msl,
  );
  const groundOperation = {
    schemaVersion: "vector.ground-datum-conversion.v1",
    groundElevation: { valueM: 260, datum: "MSL" },
    terrainDatasetId: "flat-fixture",
    terrainDatasetVersion: "1.0.0",
  };
  assert.deepEqual(
    convertWithGroundSurface({ valueM: 40, datum: "AGL" }, "MSL", groundOperation),
    { valueM: 300, datum: "MSL" },
  );
  assert.throws(
    () => requireAltitudeDatum({ valueM: 300, datum: "MSL" }, "AGL"),
    /datum mismatch/,
  );
});

test("weather-vector and atmosphere fields are versioned deterministic interfaces", () => {
  const area = getStudyArea("ladakh-high-altitude");
  const preset = getWeatherPreset(area, "ladakh-cold-clear");
  const weather = createUniformWeatherVectorField(preset);
  const atmosphere = createEducationalAtmosphereField(preset.temperatureOffsetC);
  const position = scenarioOrigin(area).geographic;
  assert.match(weather.identity.digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(weather.sample(position, 0).windEnuMps, {
    x: preset.windEastMps,
    y: preset.windNorthMps,
    z: 0,
  });
  assert.deepEqual(atmosphere.verticalCoordinate, {
    kind: "SCENARIO_LOCAL_UP",
    originDatum: "ELLIPSOID",
  });
  assert.ok(atmosphere.sample({ x: 0, y: 0, z: 0 }, 100).densityKgM3 > 0);
});

test("Phase A environment packs bind explicit synthetic terrain, datum, atmosphere and bounded installation coverage", () => {
  const area = getStudyArea("north-punjab");
  const preset = getWeatherPreset(area, "north-punjab-clear");
  const pack = createPhaseAEnvironmentPack({
    studyArea: area,
    weatherPreset: preset,
    installations: PUBLIC_INSTALLATIONS,
  });
  assertPhaseAEnvironmentPack(pack);
  assert.equal(pack.schemaVersion, "vector.environment-pack.v1");
  assert.equal(pack.provenance, "MODEL_ASSUMPTION");
  assert.equal(pack.coverage.verticalDatum, "MSL");
  assert.equal(pack.terrain.referenceElevationMslM, area.surfaceElevationM);
  assert.equal(pack.installationCoverage.includedRecordCount, PUBLIC_INSTALLATIONS.length);
  assert.equal(pack.installationCoverage.declaredServiceCoverage, "BOUNDED_PUBLIC_REFERENCE_FIXTURE");
  assert.deepEqual(pack.installationCoverage.catalogue, INSTALLATION_CATALOGUE_IDENTITY);
  assert.deepEqual(pack.content.installationCatalogue, INSTALLATION_CATALOGUE_IDENTITY);
  assert.ok(pack.content.installations.every((installation) => installation.coordinateDatum === "WGS84"));
  assert.deepEqual(pack.installationCoverage.knownGaps, PHASE_A_INSTALLATION_GAPS);
  assert.match(pack.identity.digest, /^sha256:[0-9a-f]{64}$/);
  assert.throws(
    () => assertPhaseAEnvironmentPack({
      ...pack,
      installationCoverage: { ...pack.installationCoverage, declaredServiceCoverage: "COMPLETE" },
    }),
    /must not claim complete service coverage/,
  );
  assert.throws(
    () => assertPhaseAEnvironmentPack({
      ...pack,
      identity: { ...pack.identity, digest: `sha256:${"f".repeat(64)}` },
    }),
    /does not match its canonical content/,
  );
  assert.throws(
    () => assertPhaseAEnvironmentPack({
      ...pack,
      installationCoverage: {
        ...pack.installationCoverage,
        catalogue: { ...pack.installationCoverage.catalogue, digest: `sha256:${"e".repeat(64)}` },
      },
    }),
    /does not match the governed catalogue/,
  );
});

test("environment admission resolves a frozen exact pack instead of retaining a lookupable area default", () => {
  const admitted = admitPhaseAEnvironmentPack({
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-hot",
    effectiveWeather: { windEastMps: 11, windNorthMps: -3, temperatureOffsetC: 9 },
  });
  const { pack } = admitted;
  assert.equal(pack.content.studyAreaId, "north-punjab");
  assert.equal(pack.content.weather.id, "north-punjab-hot");
  assert.equal(pack.weather.windEastMps, 11);
  assert.deepEqual(environmentPackBinding(pack), {
    schemaVersion: "vector.environment-pack.v1",
    id: "environment-pack:north-punjab:north-punjab-hot",
    version: "1.0.0",
    digest: pack.identity.digest,
  });
  assert.ok(Object.isFrozen(pack));
  assert.throws(() => {
    pack.content.weather.windEastMps = 0;
  }, TypeError);
  assert.throws(
    () => admitPhaseAEnvironmentPack({ studyAreaId: "deleted-area", weatherPresetId: "north-punjab-hot" }),
    { code: "ENVIRONMENT_STUDY_AREA_UNKNOWN", fieldPath: "studyAreaId" },
  );
  assert.throws(
    () => admitPhaseAEnvironmentPack({ studyAreaId: "north-punjab", weatherPresetId: "stale-weather" }),
    { code: "ENVIRONMENT_WEATHER_PRESET_UNKNOWN", fieldPath: "weatherPresetId" },
  );
});

test("Phase A Worker-ready sampler is deterministic, bounded, cancellable and does not hide datum or terrain assumptions", () => {
  const area = getStudyArea("ladakh-high-altitude");
  const preset = getWeatherPreset(area, "ladakh-cold-clear");
  const pack = createPhaseAEnvironmentPack({ studyArea: area, weatherPreset: preset, installations: PUBLIC_INSTALLATIONS });
  const sampler = createPhaseAEnvironmentSampler(pack);
  const query = { eastM: 0, northM: 0, upM: 3_300, modelTimeSeconds: 12 };
  const first = sampler.sample(query);
  const second = sampler.sample(query);
  assert.deepEqual(first, second);
  assert.equal(first.terrain.elevation?.datum, "MSL");
  assert.equal(first.terrain.elevation?.valueM, area.surfaceElevationM);
  assert.equal(first.windEnuMps.x, preset.windEastMps);
  assert.ok(first.atmosphere.densityKgM3 > 0);
  assert.throws(
    () => sampler.sampleBatch(Array.from({ length: 4097 }, () => query)),
    /maximum is 4096/,
  );
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => sampler.sampleBatch([query], controller.signal),
    (error) => error?.name === "AbortError",
  );
  assert.throws(
    () => sampler.sample({ ...query, upM: Number.NaN }),
    /finite local coordinates and model time/,
  );
});

test("different Phase A packs differ through declared pack values, not a region-name branch", () => {
  const northPunjab = getStudyArea("north-punjab");
  const ladakh = getStudyArea("ladakh-high-altitude");
  const punjabPack = createPhaseAEnvironmentPack({
    studyArea: northPunjab,
    weatherPreset: getWeatherPreset(northPunjab, "north-punjab-clear"),
    installations: PUBLIC_INSTALLATIONS,
  });
  const ladakhPack = createPhaseAEnvironmentPack({
    studyArea: ladakh,
    weatherPreset: getWeatherPreset(ladakh, "ladakh-cold-clear"),
    installations: PUBLIC_INSTALLATIONS,
  });
  const query = { eastM: 0, northM: 0, upM: 3_300, modelTimeSeconds: 0 };
  const punjab = createPhaseAEnvironmentSampler(punjabPack).sample(query);
  const ladakhSample = createPhaseAEnvironmentSampler(ladakhPack).sample(query);
  assert.notEqual(punjabPack.identity.digest, ladakhPack.identity.digest);
  assert.notEqual(punjab.terrain.elevation?.valueM, ladakhSample.terrain.elevation?.valueM);
  assert.notEqual(punjab.atmosphere.temperatureK, ladakhSample.atmosphere.temperatureK);
});

test("bounded terrain sampling handles flat, ridge, no-data and datum mismatch fixtures", () => {
  const flat = createSyntheticTerrainSampler({
    id: "flat",
    fixture: { kind: "FLAT", elevationMslM: 0 },
    maximumSamplesPerRequest: 64,
  });
  const request = {
    observer: { eastM: 0, northM: 0, altitude: { valueM: 100, datum: "MSL" } },
    target: { eastM: 1_000, northM: 0, altitude: { valueM: 100, datum: "MSL" } },
    sampleSpacingM: 100,
    maximumSamples: 64,
  };
  const clear = geometricLineOfSight(flat, request);
  assert.equal(clear.state, "CLEAR");
  assert.equal(clear.visible, true);
  assert.equal(clear.basis, "GEOMETRIC");
  assert.ok(clear.samplesEvaluated <= 64);

  const ridge = createSyntheticTerrainSampler({
    id: "ridge",
    fixture: {
      kind: "RIDGE",
      baseElevationMslM: 0,
      ridgeCenterEastM: 500,
      ridgeHalfWidthM: 150,
      ridgeHeightM: 200,
    },
  });
  const blocked = geometricLineOfSight(ridge, request);
  assert.equal(blocked.state, "BLOCKED");
  assert.equal(blocked.visible, false);
  assert.ok(blocked.minimumClearanceM <= 0);
  const tangent = geometricLineOfSight(createSyntheticTerrainSampler({
    id: "tangent-ridge",
    fixture: { kind: "RIDGE", baseElevationMslM: 0, ridgeCenterEastM: 500, ridgeHalfWidthM: 150, ridgeHeightM: 100 },
  }), request);
  assert.equal(tangent.state, "BLOCKED");
  assert.equal(tangent.minimumClearanceM, 0);

  const noData = createSyntheticTerrainSampler({
    id: "no-data",
    fixture: { kind: "NO_DATA" },
  });
  assert.equal(geometricLineOfSight(noData, request).state, "NO_DATA");
  assert.throws(
    () => sampleTerrainBounded(flat, Array.from({ length: 65 }, () => ({ eastM: 0, northM: 0 }))),
    /maximum is 64/,
  );
  assert.throws(
    () => geometricLineOfSight(flat, {
      ...request,
      observer: { ...request.observer, altitude: { valueM: 100, datum: "AGL" } },
    }),
    /requires MSL endpoints/,
  );
});

test("raising a synthetic ridge changes collision without changing detection math", () => {
  const flat = createSyntheticTerrainSampler({ id: "collision-flat", fixture: { kind: "FLAT", elevationMslM: 0 } });
  const ridge = createSyntheticTerrainSampler({
    id: "collision-ridge",
    fixture: { kind: "RIDGE", baseElevationMslM: 0, ridgeCenterEastM: 500, ridgeHalfWidthM: 100, ridgeHeightM: 150 },
  });
  const point = { eastM: 500, northM: 0, altitude: { valueM: 100, datum: "MSL" } };
  assert.deepEqual({ collided: terrainCollision(flat, point).collided, clearanceM: terrainCollision(flat, point).clearanceM }, { collided: false, clearanceM: 100 });
  assert.deepEqual({ collided: terrainCollision(ridge, point).collided, clearanceM: terrainCollision(ridge, point).clearanceM }, { collided: true, clearanceM: -50 });
});

test("compiled runs freeze environment identities and record equivalent map/Three positions", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const manifest = result.engineRun.scenario.geospatial.syntheticEnvironment;
  assert.equal(manifest.schemaVersion, "vector.synthetic-environment.v1");
  const environmentPack = result.engineRun.scenario.geospatial.environmentPack;
  assertEnvironmentPack(environmentPack);
  assert.deepEqual(environmentPack.content.installationCatalogue, INSTALLATION_CATALOGUE_IDENTITY);
  assert.deepEqual(environmentPack.installationCoverage.catalogue, INSTALLATION_CATALOGUE_IDENTITY);
  assert.deepEqual(
    result.engineRun.scenario.environment.environmentPack,
    environmentPackBinding(environmentPack),
  );
  assert.equal(result.engineRun.scenario.environment.windMps.x, environmentPack.weather.windEastMps);
  assert.equal(result.engineRun.scenario.environment.windMps.y, environmentPack.weather.windNorthMps);
  assert.equal(manifest.geoid.noImplicitConversion, true);
  assert.equal(manifest.terrain.remoteTickRequests, false);
  assert.match(manifest.routes.digest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(result.envelopes.every((envelope) => envelope.basis === "DECLARED"));
  const changedWeather = simulate({
    ...DEFAULT_SCENARIO,
    wind: DEFAULT_SCENARIO.wind + 1,
  });
  assert.notEqual(
    changedWeather.engineRun.scenario.geospatial.syntheticEnvironment.weather.digest,
    manifest.weather.digest,
  );
  assert.doesNotThrow(() => assertDatasetIdentityContent(
    manifest.coordinateTransform,
    {
      ellipsoid: "WGS84",
      origin: result.engineRun.scenario.geospatial.origin,
    },
  ));
  assert.throws(
    () => assertDatasetIdentityContent(
      manifest.coordinateTransform,
      {
        ellipsoid: "WGS84",
        origin: {
          ...result.engineRun.scenario.geospatial.origin,
          id: "tampered-origin",
        },
      },
    ),
    /Dataset digest mismatch/,
  );
  assert.throws(
    () => assertDatasetIdentityContent(
      { ...manifest.terrain, digest: "not-a-digest" },
      {},
    ),
    /invalid SHA-256 identity/,
  );

  const frame = getFrameAt(result, 5);
  const entity = frame.entities[0];
  const geographic = frame.geographicPositions.find(
    (item) => item.entityId === entity.id,
  ).position;
  const roundTrip = geographicToEnginePosition({
    longitude: geographic.longitudeDeg,
    latitude: geographic.latitudeDeg,
    altitudeM: geographic.altitude.valueM,
    verticalDatum: "MSL",
  }, getStudyArea(result.engineRun.scenario.environment.studyArea.id));
  assert.ok(Math.hypot(
    roundTrip.x - entity.position.x,
    roundTrip.y - entity.position.y,
    roundTrip.z - entity.position.z,
  ) < 1e-5);

  const mapPosition = recordedLngLat(
    frame.geographicPositions,
    entity.id,
    entity.position,
    result.engineRun.scenario.environment.studyArea.anchor,
  );
  assert.deepEqual(mapPosition, [geographic.longitudeDeg, geographic.latitudeDeg]);
  const approximateFallback = localToLngLat(
    entity.position,
    result.engineRun.scenario.environment.studyArea.anchor,
  );
  assert.ok(approximateFallback.every(Number.isFinite));
  const three = cameraRelativeThreePosition(entity.position);
  assert.ok(Math.abs(three[0] - entity.position.x) < 1e-3);
  assert.ok(Math.abs(three[1] - entity.position.z) < 1e-3);
  assert.ok(Math.abs(three[2] - entity.position.y) < 1e-3);
});

test("report export carries the exact synthetic environment and recorded geographic positions", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  const scenario = definition.scenario;
  const result = simulate(scenario);
  const report = buildReportExport(
    {
      scenario,
      result,
      events: [],
      createdAt: "2026-08-06T00:00:00.000Z",
      engine: "test",
      profileVersion: "test",
    },
    definition,
    "last-saved",
  );
  assert.equal(
    report.provenance.syntheticEnvironment.routes.digest,
    result.engineRun.scenario.geospatial.syntheticEnvironment.routes.digest,
  );
  assert.deepEqual(
    report.telemetry.samples[0].geographicPositions,
    result.frames[0].geographicPositions,
  );
});

test("regional packs derive Punjab and Ladakh terrain and atmosphere contrasts from frozen grids, not region-name branches", () => {
  const input = { effectiveWeather: { temperatureOffsetC: 0, windEastMps: 0, windNorthMps: 0 } };
  const punjab = admitEnvironmentPack({ ...input, studyAreaId: "north-punjab", weatherPresetId: "north-punjab-clear" }).pack;
  const ladakh = admitEnvironmentPack({ ...input, studyAreaId: "ladakh-high-altitude", weatherPresetId: "ladakh-cold-clear" }).pack;
  assertEnvironmentPack(punjab);
  assertEnvironmentPack(ladakh);
  assert.equal(punjab.terrain.kind, "SOURCED_REGULAR_GRID");
  assert.equal(ladakh.terrain.kind, "SOURCED_REGULAR_GRID");
  assert.equal(punjab.fieldProvenance.terrainElevation.state, "SOURCED_DATASET");
  assert.equal(punjab.fieldProvenance.airDensity.state, "DERIVED_FROM_DATASET");

  const punjabSample = createEnvironmentSampler(punjab).sample({ eastM: 0, northM: 0, upM: 5_000, modelTimeSeconds: 0 });
  const ladakhSample = createEnvironmentSampler(ladakh).sample({ eastM: 0, northM: 0, upM: 5_000, modelTimeSeconds: 0 });
  assert.notEqual(punjabSample.terrain.elevation.valueM, ladakhSample.terrain.elevation.valueM);
  assert.notEqual(punjabSample.atmosphere.densityKgM3, ladakhSample.atmosphere.densityKgM3);
  assert.notEqual(punjab.terrain.digest, ladakh.terrain.digest);
  assert.notEqual(punjab.atmosphere.digest, ladakh.atmosphere.digest);
});

test("regional admission reuses only exact deeply frozen pack identities", () => {
  const selection = {
    studyAreaId: "rajasthan-desert",
    weatherPresetId: "rajasthan-dust",
    effectiveWeather: { temperatureOffsetC: 2, windEastMps: 4, windNorthMps: -1 },
  };
  const first = admitEnvironmentPack(selection);
  const repeated = admitEnvironmentPack(structuredClone(selection));
  assert.strictEqual(repeated, first);
  assert.strictEqual(repeated.pack, first.pack);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.pack));
  assert.ok(Object.isFrozen(first.pack.content));
  assert.ok(Object.isFrozen(first.pack.content.terrainGrid.surfaceElevationMslM));
  assert.throws(
    () => { first.pack.content.terrainGrid.surfaceElevationMslM[0] += 1; },
    TypeError,
  );

  const changed = admitEnvironmentPack({
    ...selection,
    effectiveWeather: { ...selection.effectiveWeather, windEastMps: 5 },
  });
  assert.notStrictEqual(changed, first);
  assert.notStrictEqual(changed.pack, first.pack);
  assert.notEqual(changed.pack.identity.digest, first.pack.identity.digest);

  const sampler = createEnvironmentSampler(first.pack);
  assert.strictEqual(createEnvironmentSampler(first.pack), sampler);
  const query = { eastM: 12_345, northM: -7_654, upM: 8_000, modelTimeSeconds: 900 };
  const initialSample = sampler.sample(query);
  const repeatedSample = sampler.sample({ ...query });
  assert.notStrictEqual(repeatedSample, initialSample);
  assert.strictEqual(repeatedSample.atmosphere, initialSample.atmosphere);
  assert.strictEqual(repeatedSample.windEnuMps, initialSample.windEnuMps);
  assert.deepEqual(repeatedSample, initialSample);
  assert.throws(() => { repeatedSample.atmosphere.densityKgM3 = 0; }, TypeError);
  const distinctSample = sampler.sample({ ...query, upM: query.upM + 1 });
  assert.notStrictEqual(distinctSample.atmosphere, initialSample.atmosphere);

  const shallowFrozen = structuredClone(first.pack);
  Object.freeze(shallowFrozen);
  createEnvironmentSampler(shallowFrozen);
  shallowFrozen.content.terrainGrid.surfaceElevationMslM[0] += 1;
  assert.throws(() => createEnvironmentSampler(shallowFrozen), /digest|source/i);
});

test("scenario cards and Air mission limits describe the admitted sourced EnvironmentPack", () => {
  for (const template of SCENARIO_LIBRARY) {
    assert.match(template.environment, /Sourced regional terrain and atmosphere/);
    assert.doesNotMatch(template.environment, /no terrain model|Standard atmosphere/i);
    if (template.scenario.airMission) {
      assert.ok(
        template.scenario.airMission.validityLimits.some((limit) =>
          /exact admitted EnvironmentPack sources, coverage, validity interval, resolution, and uncertainty/.test(limit)
        ),
      );
      assert.ok(
        template.scenario.airMission.validityLimits.every((limit) => !/synthetic or unavailable/i.test(limit)),
      );
    }
  }
});

test("published PostGIS environment rows preserve exact identity, coverage, datum, time, and provenance", () => {
  const rows = STUDY_AREAS.flatMap((area) => area.weatherPresets.map((weather) => {
    const pack = admitEnvironmentPack({ studyAreaId: area.id, weatherPresetId: weather.id }).pack;
    return {
      id: pack.identity.id,
      version: pack.identity.version,
      digest: pack.identity.digest,
      schema_version: pack.schemaVersion,
      study_area_id: pack.content.studyAreaId,
      weather_preset_id: pack.content.weather.id,
      intended_use: pack.intendedUse,
      provenance: pack.provenance,
      coverage: pack.coverage.geometry,
      horizontal_datum: pack.coverage.horizontalDatum,
      vertical_datum: pack.coverage.verticalDatum,
      source_vertical_datum: pack.coverage.sourceVerticalDatum,
      valid_from: new Date(pack.validity.startsAt),
      valid_until: new Date(pack.validity.endsAt),
      terrain_digest: pack.terrain.digest,
      atmosphere_digest: pack.atmosphere.digest,
      installation_catalogue_digest: pack.installationCoverage.catalogue.digest,
      superseded_at: null,
    };
  }));
  assert.doesNotThrow(() => assertPublishedEnvironmentPackRows(rows));
  const changedCoverage = structuredClone(rows);
  changedCoverage[0].coverage.coordinates[0][0][0] += 0.001;
  assert.throws(
    () => assertPublishedEnvironmentPackRows(changedCoverage),
    /does not match the governed artifact/,
  );
});

test("regional terrain and atmosphere numerics match independently hand-calculated fixtures", () => {
  const planar = sampleRegularGridBilinear(
    [0, 10, 20, 30],
    { westDeg: 70, southDeg: 20, longitudeStepDeg: 1, latitudeStepDeg: 1, columns: 2, rows: 2 },
    70.25,
    20.5,
  );
  assert.equal(planar, 12.5);
  const seaLevel = deriveAtmosphereProfile({
    surfaceTemperatureC: 15,
    surfacePressureKpa: 101.325,
    relativeHumidityPercent: 0,
    altitudeMslM: 0,
    terrainMslM: 0,
    temperatureOffsetC: 0,
  });
  assert.ok(Math.abs(seaLevel.temperatureK - 288.15) < 1e-12);
  assert.ok(Math.abs(seaLevel.pressureKpa - 101.325) < 1e-12);
  assert.ok(Math.abs(seaLevel.densityKgM3 - 1.225012) < 1e-5);
  assert.ok(Math.abs(seaLevel.speedOfSoundMps - 340.2923) < 1e-3);
});

test("the admitted pack uses one DEM for AGL, collision and geometric LOS and fails closed outside coverage/time", () => {
  const pack = admitEnvironmentPack({
    studyAreaId: "ladakh-high-altitude",
    weatherPresetId: "ladakh-cold-clear",
    effectiveWeather: { temperatureOffsetC: 0, windEastMps: 0, windNorthMps: 0 },
  }).pack;
  const sampler = createEnvironmentSampler(pack);
  const centre = sampler.sample({ eastM: 0, northM: 0, upM: 8_000, modelTimeSeconds: 0 });
  assert.equal(centre.terrainDataset.digest, pack.terrain.digest);
  assert.equal(centre.aglM, 8_000 - centre.terrain.elevation.valueM);

  const clear = geometricLineOfSight(sampler.terrain, {
    observer: { eastM: -20_000, northM: 0, altitude: { valueM: 9_000, datum: "MSL" } },
    target: { eastM: 20_000, northM: 0, altitude: { valueM: 9_000, datum: "MSL" } },
    sampleSpacingM: 1_000,
    maximumSamples: 128,
  });
  assert.equal(clear.terrainDataset.digest, pack.terrain.digest);
  assert.equal(clear.state, "CLEAR");

  assert.throws(
    () => sampler.sample({ eastM: 10_000_000, northM: 0, upM: 8_000, modelTimeSeconds: 0 }),
    /coverage|no-data/i,
  );
  assert.throws(
    () => sampler.sample({ eastM: 0, northM: 0, upM: 8_000, modelTimeSeconds: 86_400 }),
    /validity|time/i,
  );
});
