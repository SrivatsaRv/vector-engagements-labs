import type { Vec3 } from "../engine/primitives.ts";
import type { StudyArea, WeatherPreset } from "../study-areas.ts";
import type {
  AtmosphereField,
  DatasetIdentity,
  ScenarioOrigin,
  WeatherVectorField,
} from "./contracts.ts";
import { sha256Identity } from "./digest.ts";
import { SYNTHETIC_ZERO_GEOID } from "./vertical-datums.ts";
import { standardAtmosphere } from "../engine/atmosphere.ts";
import type { InstallationOriginReference } from "../mission-admission.ts";

export type SyntheticEnvironmentManifest = {
  schemaVersion: "vector.synthetic-environment.v1";
  coordinateTransform: DatasetIdentity & {
    ellipsoid: "WGS84";
    localFrame: "ENU" | "NED";
  };
  geoid: DatasetIdentity & {
    conversionOperationVersion: "vector.vertical-datum-operation.v1";
    noImplicitConversion: true;
  };
  terrain: DatasetIdentity & {
    resolutionM: number;
    noDataPolicy: "ERROR" | "RETURN_NO_DATA";
    remoteTickRequests: false;
  };
  weather: DatasetIdentity & {
    sampleTime: string;
    frame: "ENU";
  };
  atmosphere: DatasetIdentity & {
    verticalCoordinate: "SCENARIO_LOCAL_UP";
    originDatum: "ELLIPSOID";
  };
  studyArea: DatasetIdentity;
  routes: DatasetIdentity;
  /** Immutable selected-base identities; empty for manual airborne placement. */
  missionOrigins: DatasetIdentity;
  datasets: {
    installations: DatasetIdentity;
    airspace: DatasetIdentity;
  };
  presentation: {
    basemapStyleId: string;
    affectsSimulation: false;
  };
  units: {
    angle: "degree";
    length: "metre";
    velocity: "metre_per_second";
    modelTime: "second";
  };
};

const identity = (id: string, version: string, value: unknown): DatasetIdentity => ({
  id,
  version,
  digest: sha256Identity(value),
});

export function createUniformWeatherVectorField(
  preset: WeatherPreset,
  effective: {
    windEastMps: number;
    windNorthMps: number;
    temperatureOffsetC: number;
  } = preset,
): WeatherVectorField {
  const value = {
    id: preset.id,
    temperatureOffsetC: effective.temperatureOffsetC,
    windEastMps: effective.windEastMps,
    windNorthMps: effective.windNorthMps,
    visibilityKm: preset.visibilityKm,
    humidityPercent: preset.humidityPercent,
  };
  return {
    identity: identity(`weather:${preset.id}:effective`, "1.0.0", value),
    frame: "ENU",
    sample: () => ({
      windEnuMps: { x: effective.windEastMps, y: effective.windNorthMps, z: 0 },
      temperatureOffsetC: effective.temperatureOffsetC,
      humidityPercent: preset.humidityPercent,
      visibilityM: preset.visibilityKm * 1000,
    }),
  };
}

export function createEducationalAtmosphereField(
  temperatureOffsetC: number,
): AtmosphereField {
  return {
    identity: identity("atmosphere:nasa-educational-standard", "1.0.0", {
      model: "NASA_EDUCATIONAL_STANDARD",
      temperatureOffsetC,
    }),
    verticalCoordinate: {
      kind: "SCENARIO_LOCAL_UP",
      originDatum: "ELLIPSOID",
    },
    sample: (position) => standardAtmosphere(
      position.z,
      temperatureOffsetC,
    ),
  };
}

export function buildSyntheticEnvironmentManifest(input: {
  studyArea: StudyArea;
  weatherPreset: WeatherPreset;
  origin: ScenarioOrigin;
  routes: Array<{ entityId: string; points: Vec3[] }>;
  originReferences: Array<{
    entityId: string;
    reference: InstallationOriginReference;
  }>;
  effectiveWeather: {
    windEastMps: number;
    windNorthMps: number;
    temperatureOffsetC: number;
  };
}): SyntheticEnvironmentManifest {
  const { studyArea, weatherPreset, origin, routes, originReferences, effectiveWeather } = input;
  const weather = createUniformWeatherVectorField(
    weatherPreset,
    effectiveWeather,
  ).identity;
  const atmosphere = createEducationalAtmosphereField(
    effectiveWeather.temperatureOffsetC,
  ).identity;
  return {
    schemaVersion: "vector.synthetic-environment.v1",
    coordinateTransform: {
      ...identity("transform:wgs84-ecef-local", "1.0.0", {
        ellipsoid: "WGS84",
        origin,
      }),
      ellipsoid: "WGS84",
      localFrame: origin.frame,
    },
    geoid: {
      id: SYNTHETIC_ZERO_GEOID.id,
      version: SYNTHETIC_ZERO_GEOID.version,
      digest: SYNTHETIC_ZERO_GEOID.digest,
      conversionOperationVersion: SYNTHETIC_ZERO_GEOID.operationVersion,
      noImplicitConversion: true,
    },
    terrain: {
      ...identity(`terrain:${studyArea.id}:reference-plane`, "1.0.0", {
        bounds: studyArea.bounds,
        surfaceElevationM: studyArea.surfaceElevationM,
        surfaceElevationDatum: studyArea.surfaceElevationDatum,
        terrainClass: studyArea.terrainClass,
      }),
      resolutionM: 1000,
      noDataPolicy: "ERROR",
      remoteTickRequests: false,
    },
    weather: {
      ...weather,
      sampleTime: "SCENARIO_START",
      frame: "ENU",
    },
    atmosphere: {
      ...atmosphere,
      verticalCoordinate: "SCENARIO_LOCAL_UP",
      originDatum: "ELLIPSOID",
    },
    studyArea: identity(`study-area:${studyArea.id}`, "1.0.0", {
      bounds: studyArea.bounds,
      origin,
      terrainClass: studyArea.terrainClass,
    }),
    routes: identity("routes:compiled-scenario", "1.0.0", routes),
    missionOrigins: identity(
      "mission-origins:compiled-scenario",
      "1.0.0",
      originReferences,
    ),
    datasets: {
      installations: identity(
        "installations:public-reference",
        "shield-paf-orbat-2026-05-19+vector-iaf-v1",
        { studyAreaId: studyArea.id, sourceClass: studyArea.sourceClass },
      ),
      airspace: identity("airspace:none", "1.0.0", []),
    },
    presentation: {
      basemapStyleId: "vector.map-style.user-selected.v1",
      affectsSimulation: false,
    },
    units: {
      angle: "degree",
      length: "metre",
      velocity: "metre_per_second",
      modelTime: "second",
    },
  };
}
