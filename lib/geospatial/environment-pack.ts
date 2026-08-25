import { standardAtmosphere } from "../engine/atmosphere.ts";
import type { AtmosphereState } from "../engine/atmosphere.ts";
import rawRegionalSource from "../../governance/environment-sources/regional-environment-v1/compiled.v1.json" with { type: "json" };
import type { PublicInstallation } from "../installations.ts";
import {
  findInstallationCatalogueRecord,
  INSTALLATION_CATALOGUE,
  INSTALLATION_CATALOGUE_IDENTITY,
  PUBLIC_INSTALLATIONS,
} from "../installations.ts";
import type { StudyArea, WeatherPreset } from "../study-areas.ts";
import { resolveEnvironmentSelection } from "../study-areas.ts";
import { sha256Identity } from "./digest.ts";
import type { DatasetIdentity } from "./contracts.ts";
import { createLocalFrameToGeographic } from "./geodesy.ts";
import {
  assertRegionalEnvironmentBundleContent,
  type RegionalAtmosphereGrid,
  type RegionalEnvironmentSourceBundle,
  type RegionalTerrainGrid,
} from "./environment-source-admission.ts";
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
export type PhaseAEnvironmentPack = {
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
    catalogue: DatasetIdentity;
    sources: readonly string[];
  };
};

export type EnvironmentFieldProvenance = {
  state: "SOURCED_DATASET" | "DERIVED_FROM_DATASET" | "USER_AUTHORED" | "MODEL_ASSUMPTION";
  sourceId: string;
  sourceVersion: string;
  unit: string;
  method?: string;
  limitation?: string;
};

export type RegionalEnvironmentPack = {
  schemaVersion: "vector.environment-pack.v1";
  identity: DatasetIdentity;
  content: EnvironmentPackContent & {
    anchor: StudyArea["anchor"];
    regionalSource: DatasetIdentity;
    terrainGrid: RegionalTerrainGrid;
    atmosphereGrid: RegionalAtmosphereGrid;
    authoredModifiers: {
      temperatureOffsetC: number;
      windEastMps: number;
      windNorthMps: number;
    };
  };
  intendedUse: "PUBLIC_EDUCATIONAL";
  provenance: "MIXED_SOURCE";
  validity: { startsAt: string; endsAt: string };
  coverage: {
    geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
    horizontalDatum: "WGS84";
    verticalDatum: "MSL";
    sourceVerticalDatum: "EGM2008";
    noDataPolicy: "FAIL_CLOSED";
  };
  terrain: DatasetIdentity & {
    kind: "SOURCED_REGULAR_GRID";
    sourceDatasetId: string;
    sourceResolutionDegrees: number;
    preprocessedResolutionDegrees: number;
    interpolation: "BILINEAR";
    elevationDatum: "MSL";
    sourceElevationDatum: "EGM2008";
    maximumSamplesPerRequest: number;
  };
  atmosphere: DatasetIdentity & {
    kind: "NASA_POWER_SURFACE_DERIVED_PROFILE";
    sourceDatasetId: string;
    horizontalInterpolation: "BILINEAR";
    temporalInterpolation: "LINEAR";
    verticalProfile: "HYPSOMETRIC_STANDARD_LAPSE";
    altitudeValidityMslM: [-500, 20000];
    extrapolation: "FAIL_CLOSED";
  };
  weather: DatasetIdentity & {
    frame: "ENU";
    sampleTime: string;
    sourceIntervalSeconds: number;
    temperatureOffsetC: number;
    windEastMps: number;
    windNorthMps: number;
    humidityPercent: number;
  };
  fieldProvenance: {
    terrainElevation: EnvironmentFieldProvenance;
    landSeaMask: EnvironmentFieldProvenance;
    surfaceTemperature: EnvironmentFieldProvenance;
    surfacePressure: EnvironmentFieldProvenance;
    relativeHumidity: EnvironmentFieldProvenance;
    windEast: EnvironmentFieldProvenance;
    windNorth: EnvironmentFieldProvenance;
    airDensity: EnvironmentFieldProvenance;
    speedOfSound: EnvironmentFieldProvenance;
  };
  installationCoverage: DatasetIdentity & {
    includedRecordCount: number;
    declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE";
    knownGaps: readonly string[];
    runwayEvidence: "GEOMETRY_AND_ELEVATION_PARTIAL";
    eligibleRunwayRecordCount: number;
    catalogue: DatasetIdentity;
    sources: readonly string[];
  };
  limitations: readonly string[];
};

export type EnvironmentPack = PhaseAEnvironmentPack | RegionalEnvironmentPack;

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
  installationCatalogue: DatasetIdentity;
  installations: Array<{
    id: string;
    sourceId: string;
    runwayInfo: string | null;
    coordinateDatum: "WGS84";
    positionalUncertaintyM: number | null;
    provenance: "PUBLIC_REFERENCE";
    reviewState: "UNVERIFIED";
  }>;
  installationGaps: readonly string[];
};

export type EnvironmentSample = {
  terrain: TerrainSample;
  atmosphere: ReturnType<typeof standardAtmosphere>;
  windEnuMps: { x: number; y: number; z: 0 };
  aglM: number;
  terrainDataset: DatasetIdentity;
  atmosphereDataset: DatasetIdentity;
  sampledAtModelTimeSeconds: number;
  environmentPack: DatasetIdentity;
};

export type EnvironmentSampleQuery = {
  eastM: number;
  northM: number;
  upM: number;
  modelTimeSeconds: number;
};

export type RuntimeEnvironmentProjection = {
  schemaVersion: "vector.environment-runtime-grid.v1";
  environmentPack: DatasetIdentity;
  anchor: StudyArea["anchor"];
  terrain: DatasetIdentity & { grid: RegionalTerrainGrid };
  atmosphere: DatasetIdentity & { grid: RegionalAtmosphereGrid };
  authoredModifiers: RegionalEnvironmentPack["content"]["authoredModifiers"];
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
  if (installations.length !== INSTALLATION_CATALOGUE.records.length
    || installations.some((installation) => !findInstallationCatalogueRecord(installation.id))) {
    throw new TypeError("Phase A environment packs require the complete declared installation catalogue.");
  }
  return {
    studyAreaId: studyArea.id,
    bounds: [[...studyArea.bounds[0]], [...studyArea.bounds[1]]],
    surfaceElevationM: studyArea.surfaceElevationM,
    weather: weatherPreset,
    installationCatalogue: INSTALLATION_CATALOGUE_IDENTITY,
    installations: installations.map((installation) => {
      const record = findInstallationCatalogueRecord(installation.id);
      if (!record || record.sourceId !== installation.sourceId) {
        throw new TypeError(`Installation ${installation.id} does not match the governed catalogue.`);
      }
      return {
        id: installation.id,
        sourceId: installation.sourceId,
        runwayInfo: installation.runwayInfo ?? null,
        coordinateDatum: record.coordinateDatum,
        positionalUncertaintyM: record.positionalUncertaintyM,
        provenance: record.provenance,
        reviewState: record.reviewState,
      };
    }),
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
  assertEnvironmentPack(pack);
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
}): PhaseAEnvironmentPack {
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
      catalogue: INSTALLATION_CATALOGUE_IDENTITY,
      sources: INSTALLATION_CATALOGUE.sources.map((source) => source.id),
    },
  };
}

export function assertPhaseAEnvironmentPack(pack: EnvironmentPack): asserts pack is PhaseAEnvironmentPack {
  if (pack.schemaVersion !== "vector.environment-pack.v1") throw new TypeError("Unsupported environment-pack schema.");
  if (!/^sha256:[0-9a-f]{64}$/.test(pack.identity.digest)) throw new TypeError("Environment-pack digest is invalid.");
  if (pack.identity.digest !== sha256Identity(pack.content)) {
    throw new TypeError("Environment-pack digest does not match its canonical content.");
  }
  if (pack.terrain.kind !== "SYNTHETIC_REFERENCE_PLANE" || pack.provenance !== "MODEL_ASSUMPTION") {
    throw new TypeError("Phase A admission only accepts the declared synthetic reference-plane pack.");
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
  if (pack.installationCoverage.catalogue.id !== INSTALLATION_CATALOGUE_IDENTITY.id
    || pack.installationCoverage.catalogue.version !== INSTALLATION_CATALOGUE_IDENTITY.version
    || pack.installationCoverage.catalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest
    || pack.content.installationCatalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest
    || pack.installationCoverage.includedRecordCount !== INSTALLATION_CATALOGUE.records.length
    || pack.content.installations.length !== INSTALLATION_CATALOGUE.records.length) {
    throw new TypeError("Environment-pack installation coverage does not match the governed catalogue.");
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
      aglM: query.upM - (terrainSample.elevation?.valueM ?? Number.NaN),
      terrainDataset: pack.terrain,
      atmosphereDataset: pack.atmosphere,
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

const REGIONAL_SOURCE = assertRegionalEnvironmentBundleContent(
  rawRegionalSource as unknown as RegionalEnvironmentSourceBundle,
);
const admittedRegionalPackCache = new Map<string, AdmittedEnvironmentPack>();
const validatedImmutablePacks = new WeakSet<object>();

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>)
    .every((child) => isDeeplyFrozen(child, seen));
}

function regionalSourceIdentity(): DatasetIdentity {
  return {
    id: REGIONAL_SOURCE.id,
    version: REGIONAL_SOURCE.version,
    digest: REGIONAL_SOURCE.digest as DatasetIdentity["digest"],
  };
}

function regionalOrigin(pack: RegionalEnvironmentPack) {
  return {
    schemaVersion: "vector.scenario-origin.v1" as const,
    id: `study-area:${pack.content.studyAreaId}:origin:v1`,
    frame: "ENU" as const,
    geographic: {
      longitudeDeg: pack.content.anchor.longitude,
      latitudeDeg: pack.content.anchor.latitude,
      altitude: { valueM: 0, datum: "ELLIPSOID" as const },
    },
    transformVersion: "vector.wgs84-ecef-local.v1" as const,
  };
}

function interpolationAxis(value: number, start: number, step: number, count: number, label: string) {
  const coordinate = (value - start) / step;
  const tolerance = 1e-9;
  if (coordinate < -tolerance || coordinate > count - 1 + tolerance) {
    throw new RangeError(`Environment sample is outside ${label} coverage.`);
  }
  const bounded = Math.max(0, Math.min(count - 1, coordinate));
  const lower = Math.min(count - 2, Math.floor(bounded));
  return { lower, fraction: bounded - lower };
}

function sampleGridAtAxes(
  values: readonly number[],
  columns: number,
  rows: number,
  x: { lower: number; fraction: number },
  y: { lower: number; fraction: number },
  timeIndex: number,
) {
  const stride = columns * rows;
  const index = (row: number, column: number) => timeIndex * stride + row * columns + column;
  const south = values[index(y.lower, x.lower)] * (1 - x.fraction)
    + values[index(y.lower, x.lower + 1)] * x.fraction;
  const north = values[index(y.lower + 1, x.lower)] * (1 - x.fraction)
    + values[index(y.lower + 1, x.lower + 1)] * x.fraction;
  const result = south * (1 - y.fraction) + north * y.fraction;
  if (!Number.isFinite(result)) throw new RangeError("Environment grid contains no-data at the requested position.");
  return result;
}

export function sampleRegularGridBilinear(
  values: readonly number[],
  grid: Pick<RegionalTerrainGrid, "westDeg" | "southDeg" | "longitudeStepDeg" | "latitudeStepDeg" | "columns" | "rows">,
  longitudeDeg: number,
  latitudeDeg: number,
  timeIndex = 0,
) {
  const x = interpolationAxis(longitudeDeg, grid.westDeg, grid.longitudeStepDeg, grid.columns, "longitude");
  const y = interpolationAxis(latitudeDeg, grid.southDeg, grid.latitudeStepDeg, grid.rows, "latitude");
  return sampleGridAtAxes(values, grid.columns, grid.rows, x, y, timeIndex);
}

function temporalGridAtAxes(
  values: readonly number[],
  grid: RegionalAtmosphereGrid,
  x: { lower: number; fraction: number },
  y: { lower: number; fraction: number },
  time: { lower: number; fraction: number },
) {
  return sampleGridAtAxes(values, grid.columns, grid.rows, x, y, time.lower) * (1 - time.fraction)
    + sampleGridAtAxes(values, grid.columns, grid.rows, x, y, time.lower + 1) * time.fraction;
}

export function deriveAtmosphereProfile(input: {
  surfaceTemperatureC: number;
  surfacePressureKpa: number;
  relativeHumidityPercent: number;
  altitudeMslM: number;
  terrainMslM: number;
  temperatureOffsetC: number;
}): AtmosphereState {
  if (input.altitudeMslM < -500 || input.altitudeMslM > 20_000) {
    throw new RangeError(`Environment altitude ${input.altitudeMslM} m MSL is outside atmosphere validity [-500, 20000] m.`);
  }
  const lapseKPerM = 0.0065;
  const surfaceTemperatureK = input.surfaceTemperatureC + input.temperatureOffsetC + 273.15;
  const deltaM = input.altitudeMslM - input.terrainMslM;
  const temperatureK = surfaceTemperatureK - lapseKPerM * deltaM;
  if (!(temperatureK > 0)) throw new RangeError("Derived atmosphere temperature is outside physical validity.");
  const pressureKpa = input.surfacePressureKpa
    * Math.pow(temperatureK / surfaceTemperatureK, 9.80665 / (287.05 * lapseKPerM));
  const temperatureC = temperatureK - 273.15;
  const saturationVapourPressureKpa = 0.61094 * Math.exp(17.625 * temperatureC / (temperatureC + 243.04));
  const vapourPressureKpa = Math.min(pressureKpa, saturationVapourPressureKpa * input.relativeHumidityPercent / 100);
  const densityKgM3 = ((pressureKpa - vapourPressureKpa) * 1000) / (287.05 * temperatureK)
    + (vapourPressureKpa * 1000) / (461.495 * temperatureK);
  return {
    temperatureK,
    pressureKpa,
    densityKgM3,
    speedOfSoundMps: Math.sqrt(1.4 * 287.05 * temperatureK),
  };
}

export function createRegionalEnvironmentPack(input: {
  studyArea: StudyArea;
  weatherPreset: WeatherPreset;
  installations: readonly PublicInstallation[];
  effectiveWeather?: Pick<WeatherPreset, "temperatureOffsetC" | "windEastMps" | "windNorthMps">;
}): RegionalEnvironmentPack {
  const { studyArea, weatherPreset, installations } = input;
  if (!studyArea.weatherPresets.some((candidate) => candidate.id === weatherPreset.id)) {
    throw new TypeError("Regional environment-pack weather preset does not belong to the study area.");
  }
  const region = REGIONAL_SOURCE.regions.find((candidate) => candidate.studyAreaId === studyArea.id);
  const atmosphereGrid = region?.weatherPresets.find((candidate) => candidate.id === weatherPreset.id);
  if (!region || !atmosphereGrid) throw new TypeError("Regional source does not cover the selected area and weather identity.");
  const effective = { ...weatherPreset, ...input.effectiveWeather };
  const packMaterial = material({ studyArea, weatherPreset: effective, installations });
  const authoredModifiers = {
    temperatureOffsetC: effective.temperatureOffsetC,
    windEastMps: effective.windEastMps,
    windNorthMps: effective.windNorthMps,
  };
  const content: RegionalEnvironmentPack["content"] = {
    ...packMaterial,
    anchor: { ...studyArea.anchor },
    regionalSource: regionalSourceIdentity(),
    terrainGrid: region.terrain,
    atmosphereGrid,
    authoredModifiers,
  };
  const terrainMaterial = { source: REGIONAL_SOURCE.terrain, studyAreaId: studyArea.id, grid: region.terrain };
  const atmosphereMaterial = { source: REGIONAL_SOURCE.atmosphere, studyAreaId: studyArea.id, grid: atmosphereGrid };
  const startMs = Date.parse(atmosphereGrid.startTimeUtc);
  const endMs = startMs + (atmosphereGrid.sampleCount - 1) * atmosphereGrid.intervalSeconds * 1000;
  return {
    schemaVersion: "vector.environment-pack.v1",
    identity: identity(`environment-pack:${studyArea.id}:${weatherPreset.id}`, "2.0.0", content),
    content,
    intendedUse: "PUBLIC_EDUCATIONAL",
    provenance: "MIXED_SOURCE",
    validity: { startsAt: atmosphereGrid.startTimeUtc, endsAt: new Date(endMs).toISOString() },
    coverage: {
      geometry: region.coverage,
      horizontalDatum: "WGS84",
      verticalDatum: "MSL",
      sourceVerticalDatum: "EGM2008",
      noDataPolicy: "FAIL_CLOSED",
    },
    terrain: {
      ...identity(`terrain:${REGIONAL_SOURCE.terrain.id}:${studyArea.id}`, REGIONAL_SOURCE.terrain.version, terrainMaterial),
      kind: "SOURCED_REGULAR_GRID",
      sourceDatasetId: REGIONAL_SOURCE.terrain.id,
      sourceResolutionDegrees: REGIONAL_SOURCE.terrain.sourceResolutionDegrees,
      preprocessedResolutionDegrees: REGIONAL_SOURCE.terrain.preprocessedResolutionDegrees,
      interpolation: "BILINEAR",
      elevationDatum: "MSL",
      sourceElevationDatum: "EGM2008",
      maximumSamplesPerRequest: 4096,
    },
    atmosphere: {
      ...identity(`atmosphere:${REGIONAL_SOURCE.atmosphere.id}:${studyArea.id}:${weatherPreset.id}`, REGIONAL_SOURCE.atmosphere.version, atmosphereMaterial),
      kind: "NASA_POWER_SURFACE_DERIVED_PROFILE",
      sourceDatasetId: REGIONAL_SOURCE.atmosphere.id,
      horizontalInterpolation: "BILINEAR",
      temporalInterpolation: "LINEAR",
      verticalProfile: "HYPSOMETRIC_STANDARD_LAPSE",
      altitudeValidityMslM: [-500, 20_000],
      extrapolation: "FAIL_CLOSED",
    },
    weather: {
      ...identity(`weather:${weatherPreset.id}:regional`, REGIONAL_SOURCE.atmosphere.version, { atmosphereMaterial, authoredModifiers }),
      frame: "ENU",
      sampleTime: atmosphereGrid.startTimeUtc,
      sourceIntervalSeconds: atmosphereGrid.intervalSeconds,
      temperatureOffsetC: authoredModifiers.temperatureOffsetC,
      windEastMps: authoredModifiers.windEastMps,
      windNorthMps: authoredModifiers.windNorthMps,
      humidityPercent: weatherPreset.humidityPercent,
    },
    fieldProvenance: {
      terrainElevation: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.terrain.id, sourceVersion: REGIONAL_SOURCE.terrain.version, unit: "m EGM2008/MSL", limitation: REGIONAL_SOURCE.terrain.uncertainty },
      landSeaMask: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.terrain.id, sourceVersion: REGIONAL_SOURCE.terrain.version, unit: "0 sea / 1 land" },
      surfaceTemperature: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "degC at 2 m" },
      surfacePressure: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "kPa at surface" },
      relativeHumidity: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "% at 2 m" },
      windEast: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "m/s at 10 m" },
      windNorth: { state: "SOURCED_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "m/s at 10 m" },
      airDensity: { state: "DERIVED_FROM_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "kg/m3", method: "moist ideal gas from bilinear/linear POWER surface fields and bounded hypsometric lapse" },
      speedOfSound: { state: "DERIVED_FROM_DATASET", sourceId: REGIONAL_SOURCE.atmosphere.id, sourceVersion: REGIONAL_SOURCE.atmosphere.version, unit: "m/s", method: "sqrt(gamma*R*T) from derived temperature profile" },
    },
    installationCoverage: {
      ...identity("installations:public-reference-runways", INSTALLATION_CATALOGUE.version, { catalogue: INSTALLATION_CATALOGUE_IDENTITY, runways: INSTALLATION_CATALOGUE.runways }),
      includedRecordCount: installations.length,
      declaredServiceCoverage: "BOUNDED_PUBLIC_REFERENCE_FIXTURE",
      knownGaps: INSTALLATION_CATALOGUE.coverage.knownGaps,
      runwayEvidence: "GEOMETRY_AND_ELEVATION_PARTIAL",
      eligibleRunwayRecordCount: INSTALLATION_CATALOGUE.coverage.eligibleRunwayRecordCount,
      catalogue: INSTALLATION_CATALOGUE_IDENTITY,
      sources: INSTALLATION_CATALOGUE.sources.map((source) => source.id),
    },
    limitations: [
      "Public educational use only; terrain is not for navigation and weather is not an operational forecast.",
      REGIONAL_SOURCE.terrain.uncertainty,
      REGIONAL_SOURCE.atmosphere.uncertainty,
      ...INSTALLATION_CATALOGUE.coverage.knownGaps,
      "Runway/DEM elevation reconciliation is a visible MODEL_ASSUMPTION: use the higher surface plus 0.01 m only within a 30 m disagreement envelope; larger conflicts fail closed.",
    ],
  };
}

export function admitEnvironmentPack(input: {
  studyAreaId: string;
  weatherPresetId: string;
  effectiveWeather?: Pick<WeatherPreset, "temperatureOffsetC" | "windEastMps" | "windNorthMps">;
}): AdmittedEnvironmentPack {
  const cacheKey = JSON.stringify([
    input.studyAreaId,
    input.weatherPresetId,
    input.effectiveWeather?.temperatureOffsetC ?? null,
    input.effectiveWeather?.windEastMps ?? null,
    input.effectiveWeather?.windNorthMps ?? null,
  ]);
  const cached = admittedRegionalPackCache.get(cacheKey);
  if (cached) return cached;
  const { studyArea, weatherPreset } = resolveEnvironmentSelection(input);
  const pack = immutable(createRegionalEnvironmentPack({
    studyArea,
    weatherPreset,
    installations: PUBLIC_INSTALLATIONS,
    effectiveWeather: input.effectiveWeather,
  }));
  assertEnvironmentPack(pack);
  const admitted = Object.freeze({ studyArea, weatherPreset, pack });
  admittedRegionalPackCache.set(cacheKey, admitted);
  return admitted;
}

export function assertEnvironmentPack(pack: EnvironmentPack): asserts pack is EnvironmentPack {
  if (validatedImmutablePacks.has(pack)) return;
  if (pack.terrain.kind === "SYNTHETIC_REFERENCE_PLANE") {
    assertPhaseAEnvironmentPack(pack);
    if (isDeeplyFrozen(pack)) validatedImmutablePacks.add(pack);
    return;
  }
  if (pack.schemaVersion !== "vector.environment-pack.v1" || pack.provenance !== "MIXED_SOURCE") {
    throw new TypeError("Unsupported regional environment pack.");
  }
  if (pack.identity.digest !== sha256Identity(pack.content)) {
    throw new TypeError("Environment-pack digest does not match its canonical content.");
  }
  if (pack.coverage.horizontalDatum !== "WGS84" || pack.coverage.verticalDatum !== "MSL"
    || pack.coverage.sourceVerticalDatum !== "EGM2008" || pack.coverage.noDataPolicy !== "FAIL_CLOSED") {
    throw new TypeError("Regional environment coverage requires WGS84, explicit EGM2008/MSL and fail-closed no-data.");
  }
  if (pack.content.regionalSource.digest !== REGIONAL_SOURCE.digest
    || pack.content.regionalSource.id !== REGIONAL_SOURCE.id
    || pack.content.regionalSource.version !== REGIONAL_SOURCE.version) {
    throw new TypeError("Regional environment pack does not bind the admitted source bundle.");
  }
  const region = REGIONAL_SOURCE.regions.find((candidate) => candidate.studyAreaId === pack.content.studyAreaId);
  const weather = region?.weatherPresets.find((candidate) => candidate.id === pack.content.atmosphereGrid.id);
  if (!region || !weather
    || sha256Identity(pack.content.terrainGrid) !== sha256Identity(region.terrain)
    || sha256Identity(pack.content.atmosphereGrid) !== sha256Identity(weather)) {
    throw new TypeError("Regional environment pack grid content does not match its admitted source.");
  }
  if (pack.installationCoverage.catalogue.id !== INSTALLATION_CATALOGUE_IDENTITY.id
    || pack.installationCoverage.catalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest
    || pack.installationCoverage.catalogue.version !== INSTALLATION_CATALOGUE_IDENTITY.version
    || pack.content.installationCatalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest) {
    throw new TypeError("Regional environment pack installation/runway catalogue is stale.");
  }
  if (isDeeplyFrozen(pack)) validatedImmutablePacks.add(pack);
}

export function createRegionalEnvironmentSampler(pack: RegionalEnvironmentPack): {
  sample(query: EnvironmentSampleQuery): EnvironmentSample;
  sampleBatch(queries: readonly EnvironmentSampleQuery[], signal?: AbortSignal): EnvironmentSample[];
  terrain: TerrainSampler;
} {
  assertEnvironmentPack(pack);
  const localToGeographic = createLocalFrameToGeographic(regionalOrigin(pack));
  const cacheLimit = 8_192;
  type SpatialKernel = {
    longitudeDeg: number;
    latitudeDeg: number;
    terrainElevationMslM: number;
  };
  type EnvironmentKernel = {
    spatial: SpatialKernel;
    atmosphere: Readonly<AtmosphereState>;
    windEnuMps: Readonly<{ x: number; y: number; z: 0 }>;
  };
  const spatialCache = new Map<string, SpatialKernel>();
  const environmentCache = new Map<string, EnvironmentKernel>();
  const numberKey = (value: number) => Object.is(value, -0) ? "-0" : String(value);
  const boundedSet = <T>(cache: Map<string, T>, key: string, value: T) => {
    // Saturate instead of evicting. A deterministic trajectory just above the
    // bound must retain its admitted prefix rather than churn the entire cache
    // on every replay; uncached samples are recomputed exactly.
    if (cache.size >= cacheLimit) return value;
    cache.set(key, value);
    return value;
  };
  const sampleSpatial = (eastM: number, northM: number): SpatialKernel => {
    const key = `${numberKey(eastM)}|${numberKey(northM)}`;
    const cached = spatialCache.get(key);
    if (cached) return cached;
    const geographic = localToGeographic({ x: eastM, y: northM, z: 0 });
    const terrainGrid = pack.content.terrainGrid;
    const terrainX = interpolationAxis(
      geographic.longitudeDeg,
      terrainGrid.westDeg,
      terrainGrid.longitudeStepDeg,
      terrainGrid.columns,
      "longitude",
    );
    const terrainY = interpolationAxis(
      geographic.latitudeDeg,
      terrainGrid.southDeg,
      terrainGrid.latitudeStepDeg,
      terrainGrid.rows,
      "latitude",
    );
    return boundedSet(spatialCache, key, Object.freeze({
      longitudeDeg: geographic.longitudeDeg,
      latitudeDeg: geographic.latitudeDeg,
      terrainElevationMslM: sampleGridAtAxes(
        terrainGrid.surfaceElevationMslM,
        terrainGrid.columns,
        terrainGrid.rows,
        terrainX,
        terrainY,
        0,
      ),
    }));
  };
  const terrain: TerrainSampler = {
    identity: pack.terrain,
    declaredCoverage: {
      minimumEastM: -2_000_000,
      maximumEastM: 2_000_000,
      minimumNorthM: -2_000_000,
      maximumNorthM: 2_000_000,
    },
    maximumSamplesPerRequest: pack.terrain.maximumSamplesPerRequest,
    sample(query) {
      if (![query.eastM, query.northM].every(Number.isFinite)) {
        throw new RangeError("Terrain queries must contain finite coordinates.");
      }
      try {
        const spatial = sampleSpatial(query.eastM, query.northM);
        return { query, elevation: { valueM: spatial.terrainElevationMslM, datum: "MSL" }, state: "AVAILABLE" };
      } catch (error) {
        if (error instanceof RangeError && /coverage/u.test(error.message)) {
          return { query, elevation: null, state: "OUTSIDE_COVERAGE" };
        }
        throw error;
      }
    },
  };
  const sample = (query: EnvironmentSampleQuery): EnvironmentSample => {
    if (![query.eastM, query.northM, query.upM, query.modelTimeSeconds].every(Number.isFinite)) {
      throw new RangeError("Environment samples require finite local coordinates and model time.");
    }
    const environmentKey = [query.eastM, query.northM, query.upM, query.modelTimeSeconds]
      .map(numberKey)
      .join("|");
    let kernel = environmentCache.get(environmentKey);
    if (!kernel) {
      const spatial = sampleSpatial(query.eastM, query.northM);
      const grid = pack.content.atmosphereGrid;
      const x = interpolationAxis(
        spatial.longitudeDeg,
        grid.westDeg,
        grid.longitudeStepDeg,
        grid.columns,
        "longitude",
      );
      const y = interpolationAxis(
        spatial.latitudeDeg,
        grid.southDeg,
        grid.latitudeStepDeg,
        grid.rows,
        "latitude",
      );
      if (query.modelTimeSeconds < 0) {
        throw new RangeError("Environment sample time is outside source validity.");
      }
      const timeCoordinate = query.modelTimeSeconds / grid.intervalSeconds;
      if (timeCoordinate > grid.sampleCount - 1) {
        throw new RangeError("Environment sample time is outside source validity.");
      }
      const timeLower = Math.min(grid.sampleCount - 2, Math.floor(timeCoordinate));
      const time = { lower: timeLower, fraction: timeCoordinate - timeLower };
      const surfaceTemperatureC = temporalGridAtAxes(grid.temperatureC, grid, x, y, time);
      const surfacePressureKpa = temporalGridAtAxes(grid.surfacePressureKpa, grid, x, y, time);
      const relativeHumidityPercent = temporalGridAtAxes(grid.relativeHumidityPercent, grid, x, y, time);
      kernel = boundedSet(environmentCache, environmentKey, Object.freeze({
        spatial,
        atmosphere: Object.freeze(deriveAtmosphereProfile({
          surfaceTemperatureC,
          surfacePressureKpa,
          relativeHumidityPercent,
          altitudeMslM: query.upM,
          terrainMslM: spatial.terrainElevationMslM,
          temperatureOffsetC: pack.content.authoredModifiers.temperatureOffsetC,
        })),
        windEnuMps: Object.freeze({
          x: temporalGridAtAxes(grid.windEastMps, grid, x, y, time) + pack.content.authoredModifiers.windEastMps,
          y: temporalGridAtAxes(grid.windNorthMps, grid, x, y, time) + pack.content.authoredModifiers.windNorthMps,
          z: 0,
        }),
      }));
    }
    const terrainElevationMslM = kernel.spatial.terrainElevationMslM;
    const terrainSample: TerrainSample = {
      query,
      elevation: { valueM: terrainElevationMslM, datum: "MSL" },
      state: "AVAILABLE",
    };
    return {
      terrain: terrainSample,
      atmosphere: kernel.atmosphere,
      windEnuMps: kernel.windEnuMps,
      aglM: query.upM - terrainElevationMslM,
      terrainDataset: pack.terrain,
      atmosphereDataset: pack.atmosphere,
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
      return queries.map((query) => {
        if (signal?.aborted) throw new DOMException("Environment sampling was cancelled.", "AbortError");
        return sample(query);
      });
    },
  };
}

const regionalSamplerCache = new WeakMap<RegionalEnvironmentPack, ReturnType<typeof createRegionalEnvironmentSampler>>();

export function createEnvironmentSampler(pack: EnvironmentPack) {
  if (pack.terrain.kind !== "SOURCED_REGULAR_GRID") return createPhaseAEnvironmentSampler(pack);
  const regional = pack as RegionalEnvironmentPack;
  const immutable = validatedImmutablePacks.has(regional);
  const cached = immutable ? regionalSamplerCache.get(regional) : undefined;
  if (cached) return cached;
  const sampler = createRegionalEnvironmentSampler(regional);
  if (immutable) regionalSamplerCache.set(regional, sampler);
  return sampler;
}

export function environmentRuntimeProjection(pack: EnvironmentPack): RuntimeEnvironmentProjection | undefined {
  assertEnvironmentPack(pack);
  if (pack.terrain.kind !== "SOURCED_REGULAR_GRID") return undefined;
  const regional = pack as RegionalEnvironmentPack;
  return {
    schemaVersion: "vector.environment-runtime-grid.v1",
    environmentPack: regional.identity,
    anchor: regional.content.anchor,
    terrain: {
      id: pack.terrain.id,
      version: pack.terrain.version,
      digest: pack.terrain.digest,
      grid: regional.content.terrainGrid,
    },
    atmosphere: {
      id: pack.atmosphere.id,
      version: pack.atmosphere.version,
      digest: pack.atmosphere.digest,
      grid: regional.content.atmosphereGrid,
    },
    authoredModifiers: regional.content.authoredModifiers,
  };
}

export function assertPublishedEnvironmentPackRows(rows: readonly Record<string, unknown>[]): void {
  const expected = REGIONAL_SOURCE.regions.flatMap((region) =>
    region.weatherPresets.map((weather) => createRegionalEnvironmentPack({
      studyArea: resolveEnvironmentSelection({ studyAreaId: region.studyAreaId, weatherPresetId: weather.id }).studyArea,
      weatherPreset: resolveEnvironmentSelection({ studyAreaId: region.studyAreaId, weatherPresetId: weather.id }).weatherPreset,
      installations: PUBLIC_INSTALLATIONS,
    })),
  );
  if (rows.length !== expected.length) throw new TypeError("Published environment-pack count does not match all governed selections.");
  for (const pack of expected) {
    const row = rows.find((candidate) => candidate.id === pack.identity.id && candidate.version === pack.identity.version);
    const timestamp = (value: unknown) => value instanceof Date
      ? value.toISOString()
      : new Date(String(value)).toISOString();
    if (!row || row.digest !== pack.identity.digest
      || row.schema_version !== pack.schemaVersion
      || row.study_area_id !== pack.content.studyAreaId
      || row.weather_preset_id !== pack.content.weather.id
      || row.intended_use !== pack.intendedUse
      || row.provenance !== pack.provenance
      || sha256Identity(row.coverage) !== sha256Identity(pack.coverage.geometry)
      || row.horizontal_datum !== pack.coverage.horizontalDatum
      || row.vertical_datum !== pack.coverage.verticalDatum
      || row.source_vertical_datum !== pack.coverage.sourceVerticalDatum
      || timestamp(row.valid_from) !== timestamp(pack.validity.startsAt)
      || timestamp(row.valid_until) !== timestamp(pack.validity.endsAt)
      || row.terrain_digest !== pack.terrain.digest
      || row.atmosphere_digest !== pack.atmosphere.digest
      || row.installation_catalogue_digest !== pack.installationCoverage.catalogue.digest
      || row.superseded_at !== null) {
      throw new TypeError(`Published environment pack ${pack.identity.id} does not match the governed artifact.`);
    }
  }
}
