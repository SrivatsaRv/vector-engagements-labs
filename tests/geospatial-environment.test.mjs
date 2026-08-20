import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraRelativeThreePosition,
  convertLocalFrame,
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
  sampleTerrainBounded,
} from "../lib/geospatial/terrain.ts";
import {
  createEducationalAtmosphereField,
  createUniformWeatherVectorField,
} from "../lib/geospatial/synthetic-environment.ts";
import {
  PHASE_A_INSTALLATION_GAPS,
  assertPhaseAEnvironmentPack,
  createPhaseAEnvironmentPack,
  createPhaseAEnvironmentSampler,
} from "../lib/geospatial/environment-pack.ts";
import { PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import {
  geographicToLocal,
  localToGeographic,
  scenarioOrigin,
} from "../lib/scenario-spatial.ts";
import { getStudyArea, getWeatherPreset } from "../lib/study-areas.ts";
import { DEFAULT_SCENARIO, getFrameAt, simulate } from "../lib/simulation.ts";
import { localToLngLat, recordedLngLat } from "../lib/map-layer-contracts.ts";
import { buildReportExport } from "../lib/report-export.ts";
import { getScenarioDefinition } from "../lib/scenarios.ts";

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

test("compiled runs freeze environment identities and record equivalent map/Three positions", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const manifest = result.engineRun.scenario.geospatial.syntheticEnvironment;
  assert.equal(manifest.schemaVersion, "vector.synthetic-environment.v1");
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
  const roundTrip = geographicToLocalFrame(
    geographic,
    result.engineRun.scenario.geospatial.origin,
  );
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
