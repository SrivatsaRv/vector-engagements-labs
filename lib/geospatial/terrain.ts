import type { Altitude, DatasetIdentity, VerticalDatum } from "./contracts.ts";
import { sha256Identity } from "./digest.ts";

export type TerrainQuery = {
  eastM: number;
  northM: number;
};

export type TerrainSample = {
  query: TerrainQuery;
  elevation: Altitude<"MSL"> | null;
  state: "AVAILABLE" | "NO_DATA" | "OUTSIDE_COVERAGE";
};

export interface TerrainSampler {
  identity: DatasetIdentity;
  declaredCoverage: {
    minimumEastM: number;
    maximumEastM: number;
    minimumNorthM: number;
    maximumNorthM: number;
  };
  maximumSamplesPerRequest: number;
  sample(query: TerrainQuery): TerrainSample;
}

export type SyntheticTerrainFixture =
  | { kind: "FLAT"; elevationMslM: number }
  | {
      kind: "RIDGE";
      baseElevationMslM: number;
      ridgeCenterEastM: number;
      ridgeHalfWidthM: number;
      ridgeHeightM: number;
    }
  | { kind: "NO_DATA" };

export function createSyntheticTerrainSampler(input: {
  id: string;
  fixture: SyntheticTerrainFixture;
  coverage?: TerrainSampler["declaredCoverage"];
  maximumSamplesPerRequest?: number;
}): TerrainSampler {
  const declaredCoverage = input.coverage ?? {
    minimumEastM: -100_000,
    maximumEastM: 100_000,
    minimumNorthM: -100_000,
    maximumNorthM: 100_000,
  };
  const maximumSamplesPerRequest = input.maximumSamplesPerRequest ?? 4096;
  const identity = {
    id: input.id,
    version: "1.0.0",
    digest: sha256Identity({
      fixture: input.fixture,
      declaredCoverage,
      maximumSamplesPerRequest,
    }),
  };
  return {
    identity,
    declaredCoverage,
    maximumSamplesPerRequest,
    sample(query) {
      if (![query.eastM, query.northM].every(Number.isFinite)) {
        throw new RangeError("Terrain queries must contain finite coordinates.");
      }
      if (
        query.eastM < declaredCoverage.minimumEastM
        || query.eastM > declaredCoverage.maximumEastM
        || query.northM < declaredCoverage.minimumNorthM
        || query.northM > declaredCoverage.maximumNorthM
      ) {
        return { query, elevation: null, state: "OUTSIDE_COVERAGE" };
      }
      if (input.fixture.kind === "NO_DATA") {
        return { query, elevation: null, state: "NO_DATA" };
      }
      const elevationMslM = input.fixture.kind === "FLAT"
        ? input.fixture.elevationMslM
        : input.fixture.baseElevationMslM + Math.max(
            0,
            1 - Math.abs(query.eastM - input.fixture.ridgeCenterEastM)
              / Math.max(1, input.fixture.ridgeHalfWidthM),
          ) * input.fixture.ridgeHeightM;
      return {
        query,
        elevation: { valueM: elevationMslM, datum: "MSL" },
        state: "AVAILABLE",
      };
    },
  };
}

export function sampleTerrainBounded(
  sampler: TerrainSampler,
  queries: TerrainQuery[],
) {
  if (queries.length > sampler.maximumSamplesPerRequest) {
    throw new RangeError(
      `Terrain request contains ${queries.length} samples; maximum is ${sampler.maximumSamplesPerRequest}.`,
    );
  }
  return queries.map((query) => sampler.sample(query));
}

export function terrainCollision(
  sampler: TerrainSampler,
  point: TerrainQuery & { altitude: Altitude },
) {
  requireMsl(point.altitude.datum);
  const terrain = sampler.sample(point);
  if (!terrain.elevation) {
    return Object.freeze({ collided: false, state: "NO_DATA" as const, clearanceM: null, terrain });
  }
  const clearanceM = point.altitude.valueM - terrain.elevation.valueM;
  return Object.freeze({
    collided: clearanceM <= 0,
    state: clearanceM <= 0 ? "COLLIDED" as const : "CLEAR" as const,
    clearanceM,
    terrain,
  });
}

export type GeometricLineOfSightRequest = {
  observer: TerrainQuery & { altitude: Altitude };
  target: TerrainQuery & { altitude: Altitude };
  sampleSpacingM: number;
  maximumSamples: number;
};

export type GeometricLineOfSightResult = {
  basis: "GEOMETRIC";
  visible: boolean;
  state: "CLEAR" | "BLOCKED" | "NO_DATA";
  samplesEvaluated: number;
  minimumClearanceM: number | null;
  blockingSample?: TerrainSample;
  terrainDataset: DatasetIdentity;
};

function requireMsl(datum: VerticalDatum) {
  if (datum !== "MSL") {
    throw new TypeError(
      `Geometric line of sight requires MSL endpoints; received ${datum}. Use an explicit versioned datum conversion first.`,
    );
  }
}

export function geometricLineOfSight(
  sampler: TerrainSampler,
  request: GeometricLineOfSightRequest,
): GeometricLineOfSightResult {
  requireMsl(request.observer.altitude.datum);
  requireMsl(request.target.altitude.datum);
  if (!Number.isFinite(request.sampleSpacingM) || request.sampleSpacingM <= 0) {
    throw new RangeError("Line-of-sight sample spacing must be positive and finite.");
  }
  const distanceM = Math.hypot(
    request.target.eastM - request.observer.eastM,
    request.target.northM - request.observer.northM,
  );
  const intervals = Math.max(1, Math.ceil(distanceM / request.sampleSpacingM));
  const count = intervals + 1;
  const limit = Math.min(request.maximumSamples, sampler.maximumSamplesPerRequest);
  if (!Number.isInteger(request.maximumSamples) || request.maximumSamples < 2 || count > limit) {
    throw new RangeError(
      `Line-of-sight request requires ${count} samples; bounded maximum is ${limit}.`,
    );
  }
  const queries = Array.from({ length: count }, (_, index) => {
    const fraction = index / intervals;
    return {
      eastM: request.observer.eastM
        + (request.target.eastM - request.observer.eastM) * fraction,
      northM: request.observer.northM
        + (request.target.northM - request.observer.northM) * fraction,
    };
  });
  const samples = sampleTerrainBounded(sampler, queries);
  let minimumClearanceM = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample.elevation) {
      return {
        basis: "GEOMETRIC",
        visible: false,
        state: "NO_DATA",
        samplesEvaluated: index + 1,
        minimumClearanceM: Number.isFinite(minimumClearanceM)
          ? minimumClearanceM
          : null,
        blockingSample: sample,
        terrainDataset: sampler.identity,
      };
    }
    const fraction = index / intervals;
    const pathAltitudeM = request.observer.altitude.valueM
      + (request.target.altitude.valueM - request.observer.altitude.valueM) * fraction;
    const clearanceM = pathAltitudeM - sample.elevation.valueM;
    minimumClearanceM = Math.min(minimumClearanceM, clearanceM);
    if (clearanceM <= 0) {
      return {
        basis: "GEOMETRIC",
        visible: false,
        state: "BLOCKED",
        samplesEvaluated: index + 1,
        minimumClearanceM,
        blockingSample: sample,
        terrainDataset: sampler.identity,
      };
    }
  }
  return {
    basis: "GEOMETRIC",
    visible: true,
    state: "CLEAR",
    samplesEvaluated: samples.length,
    minimumClearanceM,
    terrainDataset: sampler.identity,
  };
}
