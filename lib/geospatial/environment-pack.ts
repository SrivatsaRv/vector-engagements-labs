import { standardAtmosphere } from "../engine/atmosphere.ts";
import type { PublicInstallation } from "../installations.ts";
import { PUBLIC_INSTALLATIONS } from "../installations.ts";
import type { StudyArea, WeatherPreset } from "../study-areas.ts";
import { resolveEnvironmentSelection } from "../study-areas.ts";
import { sha256Identity } from "./digest.ts";
import type { DatasetIdentity } from "./contracts.ts";
import {
  createSyntheticTerrainSampler,
  type TerrainSample,
  type TerrainSampler,
} from "./terrain.ts";

/**
 * Phase A's executable, offline environment boundary.  It deliberately models
 * a declared synthetic reference surface and educational atmosphere; it is not
 * a regional DEM, a current air-base catalogue, or an operational weather feed.
 */
export type EnvironmentPack = {
  schemaVersion: "vector.environment-pack.v1";
  identity: DatasetIdentity;
  /** Canonical, hash-bound material. Never replace it during replay. */
  content: EnvironmentPackContent;
  intendedUse: "PUBLIC_EDUCATIONAL";
  provenance: "MODEL_ASSUMPTION";
  validity: { startsAt: "-infinity"; endsAt: "+infinity" };
  coverage: {
    geometry: {
      type: "Polygon";
      coordinates: Array<Array<[number, number]>>;
    };
    horizontalDatum: "WGS84";
    verticalDatum: "MSL";
    noDataPolicy: "FAIL_CLOSED";
  };
  terrain: DatasetIdentity & {
    kind: "SYNTHETIC_REFERENCE_PLANE";
    resolutionM: number;
    interpolation: "CONSTANT";
    elevationDatum: "MSL";
    referenceElevationMslM: number;
    maximumSamplesPerRequest: number;
  };
  atmosphere: DatasetIdentity & {
    kind: "NASA_EDUCATIONAL_STANDARD";
    verticalCoordinate: "SCENARIO_LOCAL_UP";
    originDatum: "ELLIPSOID";
    extrapolation: "CLAMP_0_TO_25000_M";
  };
  weather: DatasetIdentity & {
    frame: "ENU";
    sampleTime: "SCENARIO_START";
    temperatureOffsetC: number;
    windEastMps: number;
    windNorthMps: number;
    humidityPercent: number;
  };
  installationCoverage: DatasetIdentity & {
    includedRecordCount: number;
    declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE";
    knownGaps: readonly string[];
    runwayEvidence: "TEXT_ONLY_OR_ABSENT";
  };
};

/**
 * The compact identity copied into the executable engine contract. The full
 * pack remains with the compiled geographic artifact so replay can verify its
 * canonical material without a catalogue lookup.
 */
export type EnvironmentPackBinding = Pick<EnvironmentPack, "schemaVersion"> &
  EnvironmentPack["identity"];

export type AdmittedEnvironmentPack = {
  studyArea: StudyArea;
  weatherPreset: WeatherPreset;
  pack: Readonly<EnvironmentPack>;
};

export type EnvironmentPackContent = {
  studyAreaId: StudyArea["id"];
  bounds: StudyArea["bounds"];
  surfaceElevationM: number;
  weather: WeatherPreset;
  installations: Array<{ id: string; sourceId: string; runwayInfo: string | null }>;
  installationGaps: readonly string[];
};

export type EnvironmentSample = {
  terrain: TerrainSample;
  atmosphere: ReturnType<typeof standardAtmosphere>;
  windEnuMps: { x: number; y: number; z: 0 };
  sampledAtModelTimeSeconds: number;
  environmentPack: DatasetIdentity;
};

export type EnvironmentSampleQuery = {
  eastM: number;
  northM: number;
  upM: number;
  modelTimeSeconds: number;
};

export const PHASE_A_INSTALLATION_GAPS = [
  "This is not a complete IAF or PAF installation catalogue.",
  "Runway threshold, centreline, length, width, surface and uncertainty are not uniformly available.",
  "No record implies current occupancy, readiness, squadron assignment, or operational status.",
] as const;

function identity(id: string, version: string, value: unknown): DatasetIdentity {
  return { id, version, digest: sha256Identity(value) };
}

function material(input: {
  studyArea: StudyArea;
  weatherPreset: WeatherPreset;
  installations: readonly PublicInstallation[];
}): EnvironmentPackContent {
  const { studyArea, weatherPreset, installations } = input;
  return {
    studyAreaId: studyArea.id,
    bounds: [[...studyArea.bounds[0]], [...studyArea.bounds[1]]],
    surfaceElevationM: studyArea.surfaceElevationM,
    weather: weatherPreset,
    installations: installations.map((installation) => ({
      id: installation.id,
      sourceId: installation.sourceId,
      runwayInfo: installation.runwayInfo ?? null,
    })),
    installationGaps: [...PHASE_A_INSTALLATION_GAPS],
  };
}

function immutable<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
  return Object.freeze(value);
}

/**
 * Resolve a governed selection exactly once at the admission boundary.
 *
 * Callers pass the returned immutable object through compilation and replay;
 * tick code must not resolve an area or weather string against a catalogue.
 */
export function admitPhaseAEnvironmentPack(input: {
  studyAreaId: string;
  weatherPresetId: string;
  effectiveWeather?: Pick<WeatherPreset, "temperatureOffsetC" | "windEastMps" | "windNorthMps">;
}): AdmittedEnvironmentPack {
  const { studyArea, weatherPreset } = resolveEnvironmentSelection(input);
  const pack = immutable(createPhaseAEnvironmentPack({
    studyArea,
    weatherPreset,
    installations: PUBLIC_INSTALLATIONS,
    effectiveWeather: input.effectiveWeather,
  }));
  assertPhaseAEnvironmentPack(pack);
  return { studyArea, weatherPreset, pack };
}

export function environmentPackBinding(pack: EnvironmentPack): EnvironmentPackBinding {
  assertPhaseAEnvironmentPack(pack);
  return {
    schemaVersion: pack.schemaVersion,
    id: pack.identity.id,
    version: pack.identity.version,
    digest: pack.identity.digest,
  };
}

/** Creates a deterministic pack from explicitly selected, governed draft data. */
export function createPhaseAEnvironmentPack(input: {
  studyArea: StudyArea;
  weatherPreset: WeatherPreset;
  installations: readonly PublicInstallation[];
  /** Explicit authoring adjustment frozen into this run's pack identity. */
  effectiveWeather?: Pick<WeatherPreset, "temperatureOffsetC" | "windEastMps" | "windNorthMps">;
}): EnvironmentPack {
  const { studyArea, weatherPreset, installations } = input;
  if (!studyArea.weatherPresets.some((preset) => preset.id === weatherPreset.id)) {
    throw new TypeError("Environment-pack weather preset does not belong to the selected study area.");
  }
  const effectiveWeather: WeatherPreset = {
    ...weatherPreset,
    ...input.effectiveWeather,
  };
  const packMaterial = material({ studyArea, weatherPreset: effectiveWeather, installations });
  const [minimum, maximum] = studyArea.bounds;
  const terrainMaterial = {
    elevationMslM: studyArea.surfaceElevationM,
    bounds: [[...studyArea.bounds[0]], [...studyArea.bounds[1]]],
    maximumSamplesPerRequest: 4096,
  };
  return {
    schemaVersion: "vector.environment-pack.v1",
    identity: identity(`environment-pack:${studyArea.id}:${weatherPreset.id}`, "1.0.0", packMaterial),
    content: packMaterial,
    intendedUse: "PUBLIC_EDUCATIONAL",
    provenance: "MODEL_ASSUMPTION",
    validity: { startsAt: "-infinity", endsAt: "+infinity" },
    coverage: {
      geometry: {
        type: "Polygon",
        coordinates: [[
          [minimum[0], minimum[1]], [maximum[0], minimum[1]],
          [maximum[0], maximum[1]], [minimum[0], maximum[1]],
          [minimum[0], minimum[1]],
        ]],
      },
      horizontalDatum: "WGS84",
      verticalDatum: "MSL",
      noDataPolicy: "FAIL_CLOSED",
    },
    terrain: {
      ...identity(`terrain:${studyArea.id}:synthetic-reference-plane`, "1.0.0", terrainMaterial),
      kind: "SYNTHETIC_REFERENCE_PLANE",
      resolutionM: 1000,
      interpolation: "CONSTANT",
      elevationDatum: "MSL",
      referenceElevationMslM: studyArea.surfaceElevationM,
      maximumSamplesPerRequest: 4096,
    },
    atmosphere: {
      ...identity("atmosphere:nasa-educational-standard", "1.0.0", { temperatureOffsetC: effectiveWeather.temperatureOffsetC }),
      kind: "NASA_EDUCATIONAL_STANDARD",
      verticalCoordinate: "SCENARIO_LOCAL_UP",
      originDatum: "ELLIPSOID",
      extrapolation: "CLAMP_0_TO_25000_M",
    },
    weather: {
      ...identity(`weather:${weatherPreset.id}:phase-a`, "1.0.0", effectiveWeather),
      frame: "ENU",
      sampleTime: "SCENARIO_START",
      temperatureOffsetC: effectiveWeather.temperatureOffsetC,
      windEastMps: effectiveWeather.windEastMps,
      windNorthMps: effectiveWeather.windNorthMps,
      humidityPercent: effectiveWeather.humidityPercent,
    },
    installationCoverage: {
      ...identity("installations:public-reference-fixture", "1.0.0", packMaterial.installations),
      includedRecordCount: installations.length,
      declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE",
      knownGaps: PHASE_A_INSTALLATION_GAPS,
      runwayEvidence: "TEXT_ONLY_OR_ABSENT",
    },
  };
}

export function assertPhaseAEnvironmentPack(pack: EnvironmentPack) {
  if (pack.schemaVersion !== "vector.environment-pack.v1") throw new TypeError("Unsupported environment-pack schema.");
  if (!/^sha256:[0-9a-f]{64}$/.test(pack.identity.digest)) throw new TypeError("Environment-pack digest is invalid.");
  if (pack.identity.digest !== sha256Identity(pack.content)) {
    throw new TypeError("Environment-pack digest does not match its canonical content.");
  }
  if (pack.coverage.verticalDatum !== "MSL" || pack.terrain.elevationDatum !== "MSL") {
    throw new TypeError("Phase A terrain and coverage must declare explicit MSL elevations.");
  }
  if (pack.terrain.maximumSamplesPerRequest < 1 || !Number.isInteger(pack.terrain.maximumSamplesPerRequest)) {
    throw new RangeError("Environment-pack terrain sample limit must be a positive integer.");
  }
  if (pack.installationCoverage.declaredServiceCoverage !== "BOUNDED_PUBLIC_REFERENCE_FIXTURE") {
    throw new TypeError("Phase A installation coverage must not claim complete service coverage.");
  }
}

export function createPhaseAEnvironmentSampler(pack: EnvironmentPack): {
  sample(query: EnvironmentSampleQuery): EnvironmentSample;
  sampleBatch(queries: readonly EnvironmentSampleQuery[], signal?: AbortSignal): EnvironmentSample[];
  terrain: TerrainSampler;
} {
  assertPhaseAEnvironmentPack(pack);
  const terrain = createSyntheticTerrainSampler({
    id: pack.terrain.id,
    fixture: { kind: "FLAT", elevationMslM: pack.terrain.referenceElevationMslM },
    maximumSamplesPerRequest: pack.terrain.maximumSamplesPerRequest,
  });
  terrain.identity = pack.terrain;
  // A sampler only accepts an already materialized pack and never asks a
  // database or network for data. Phase A's surface is intentionally flat.
  const sample = (query: EnvironmentSampleQuery): EnvironmentSample => {
    if (![query.eastM, query.northM, query.upM, query.modelTimeSeconds].every(Number.isFinite)) {
      throw new RangeError("Environment samples require finite local coordinates and model time.");
    }
    const terrainSample = terrain.sample({ eastM: query.eastM, northM: query.northM });
    return {
      terrain: terrainSample,
      atmosphere: standardAtmosphere(query.upM, pack.weather.temperatureOffsetC),
      windEnuMps: { x: pack.weather.windEastMps, y: pack.weather.windNorthMps, z: 0 },
      sampledAtModelTimeSeconds: query.modelTimeSeconds,
      environmentPack: pack.identity,
    };
  };
  return {
    terrain,
    sample,
    sampleBatch(queries, signal) {
      if (queries.length > pack.terrain.maximumSamplesPerRequest) {
        throw new RangeError(`Environment request contains ${queries.length} samples; maximum is ${pack.terrain.maximumSamplesPerRequest}.`);
      }
      const results: EnvironmentSample[] = [];
      for (const query of queries) {
        if (signal?.aborted) throw new DOMException("Environment sampling was cancelled.", "AbortError");
        results.push(sample(query));
      }
      return results;
    },
  };
}
