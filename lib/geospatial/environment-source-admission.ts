import { sha256Identity, sha256Utf8HexSync } from "./digest.ts";
import type { DatasetIdentity } from "./contracts.ts";

export type EnvironmentSourceManifest = {
  schemaVersion: "vector.environment-source-manifest.v1";
  id: string;
  version: string;
  publisher: string;
  provider: string;
  sourceDataState: "SOURCED_DATASET";
  license: {
    spdx: "CC0-1.0";
    decisionUrl: string;
    sourceReferenceUrl: string;
    decision: string;
  };
  retrievedAt: string;
  request: {
    service: "NASA POWER Hourly Point API";
    apiVersion: string;
    timeStandard: "UTC";
    start: string;
    end: string;
    parameters: readonly ("T2M" | "PS" | "RH2M" | "WS10M" | "WD10M")[];
  };
  horizontalDatum: "WGS84";
  verticalDatum: "UNDECLARED";
  coverage: {
    kind: "POINT_ONLY";
    areaAdmission: "INELIGIBLE";
    reason: string;
  };
  artifacts: readonly EnvironmentSourceArtifact[];
  fieldProvenance: Record<"T2M" | "PS" | "RH2M" | "WS10M" | "WD10M", {
    unit: string;
    height: string;
    state: "SOURCED_DATASET";
  }>;
  limitations: readonly string[];
};

export type EnvironmentSourceArtifact = {
  id: string;
  path: string;
  sha256: string;
  url: string;
  longitudeDeg: number;
  latitudeDeg: number;
};

type PowerResponse = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number, number] };
  properties: {
    parameter: Record<"T2M" | "PS" | "RH2M" | "WS10M" | "WD10M", Record<string, number>>;
  };
  header: {
    title: string;
    api: { version: string; name: string };
    sources: string[];
    fill_value: number;
    time_standard: string;
    start: string;
    end: string;
  };
  parameters: Record<"T2M" | "PS" | "RH2M" | "WS10M" | "WD10M", { units: string; longname: string }>;
};

export type SourcedPointAtmosphereSample = {
  timestampUtc: string;
  temperatureC: number;
  surfacePressureKpa: number;
  relativeHumidityPercent: number;
  windSpeedAt10mMps: number;
  windDirectionAt10mDeg: number;
};

export type SourcedPointAtmosphere = {
  schemaVersion: "vector.sourced-point-atmosphere.v1";
  identity: DatasetIdentity;
  provenance: "SOURCED_DATASET";
  source: Pick<EnvironmentSourceManifest, "id" | "version" | "publisher" | "license" | "horizontalDatum" | "verticalDatum" | "coverage">;
  artifact: Pick<EnvironmentSourceArtifact, "id" | "sha256" | "longitudeDeg" | "latitudeDeg">;
  samples: readonly SourcedPointAtmosphereSample[];
  limitations: readonly string[];
};

const SHA_256 = /^[a-f0-9]{64}$/u;
const REQUIRED_PARAMETERS = ["T2M", "PS", "RH2M", "WS10M", "WD10M"] as const;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new TypeError(message);
}

function finite(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(message);
}

function asPowerResponse(value: unknown): PowerResponse {
  invariant(value && typeof value === "object", "Environment source response must be an object.");
  const response = value as Partial<PowerResponse>;
  invariant(response.type === "Feature", "Environment source response must be a GeoJSON Feature.");
  invariant(response.geometry?.type === "Point" && Array.isArray(response.geometry.coordinates), "Environment source response must contain a point geometry.");
  invariant(response.properties?.parameter && response.header && response.parameters, "Environment source response is missing required POWER fields.");
  return response as PowerResponse;
}

function timestampUtc(hourKey: string): string {
  invariant(/^\d{10}$/u.test(hourKey), `Source hour ${hourKey} must use YYYYMMDDHH UTC.`);
  return `${hourKey.slice(0, 4)}-${hourKey.slice(4, 6)}-${hourKey.slice(6, 8)}T${hourKey.slice(8, 10)}:00:00Z`;
}

function assertManifest(manifest: EnvironmentSourceManifest) {
  invariant(manifest.schemaVersion === "vector.environment-source-manifest.v1", "Unsupported environment source manifest schema.");
  invariant(manifest.sourceDataState === "SOURCED_DATASET", "Environment source manifest must declare SOURCED_DATASET.");
  invariant(manifest.license.spdx === "CC0-1.0", "Environment source manifest must carry its reviewed licence decision.");
  invariant(manifest.horizontalDatum === "WGS84" && manifest.verticalDatum === "UNDECLARED", "Environment source manifest must retain explicit datum status.");
  invariant(manifest.coverage.kind === "POINT_ONLY" && manifest.coverage.areaAdmission === "INELIGIBLE", "Point sources must be ineligible for area environment admission.");
  invariant(manifest.artifacts.length > 0, "Environment source manifest requires artifacts.");
  for (const artifact of manifest.artifacts) {
    invariant(SHA_256.test(artifact.sha256), `Environment source artifact ${artifact.id} requires a SHA-256 checksum.`);
    finite(artifact.longitudeDeg, `Environment source artifact ${artifact.id} has invalid longitude.`);
    finite(artifact.latitudeDeg, `Environment source artifact ${artifact.id} has invalid latitude.`);
  }
}

/**
 * Compiles a committed, checksum-verified NASA POWER response into a point
 * artifact. It cannot be used as a study-area environment pack: the source
 * has point-only coverage and no declared vertical datum.
 */
export function ingestSourcedPointAtmosphere(input: {
  manifest: EnvironmentSourceManifest;
  artifactId: string;
  rawText: string;
}): SourcedPointAtmosphere {
  assertManifest(input.manifest);
  const artifact = input.manifest.artifacts.find((candidate) => candidate.id === input.artifactId);
  invariant(artifact, `Environment source artifact ${input.artifactId} is not declared.`);
  const rawSha256 = sha256Utf8HexSync(input.rawText);
  invariant(rawSha256 === artifact.sha256, `Environment source artifact ${artifact.id} checksum does not match its manifest.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawText);
  } catch {
    throw new TypeError(`Environment source artifact ${artifact.id} is not valid JSON.`);
  }
  const response = asPowerResponse(parsed);
  invariant(response.header.api.name === "POWER Hourly API", "Environment source response is not a NASA POWER hourly response.");
  invariant(response.header.api.version === input.manifest.request.apiVersion, "Environment source response API version does not match its manifest.");
  invariant(response.header.time_standard === "UTC", "Environment source response must use UTC.");
  invariant(response.header.start === input.manifest.request.start && response.header.end === input.manifest.request.end, "Environment source response time interval does not match its manifest.");
  invariant(Math.abs(response.geometry.coordinates[0] - artifact.longitudeDeg) < 1e-9 && Math.abs(response.geometry.coordinates[1] - artifact.latitudeDeg) < 1e-9, "Environment source response coordinates do not match the declared artifact.");
  const keys = Object.keys(response.properties.parameter.T2M).sort();
  invariant(keys.length > 0, "Environment source response has no hourly samples.");
  for (const parameter of REQUIRED_PARAMETERS) {
    invariant(response.parameters[parameter]?.units === input.manifest.fieldProvenance[parameter].unit, `Environment source ${parameter} unit does not match the manifest.`);
    const values = response.properties.parameter[parameter];
    invariant(values && typeof values === "object", `Environment source response is missing ${parameter}.`);
    invariant(Object.keys(values).length === keys.length && keys.every((key) => key in values), `Environment source ${parameter} does not cover every timestamp.`);
  }
  const samples = keys.map((key) => {
    const values = REQUIRED_PARAMETERS.map((parameter) => response.properties.parameter[parameter][key]);
    values.forEach((value, index) => finite(value, `Environment source ${REQUIRED_PARAMETERS[index]} at ${key} is not finite.`));
    invariant(!values.includes(response.header.fill_value), `Environment source at ${key} contains its no-data fill value.`);
    return {
      timestampUtc: timestampUtc(key),
      temperatureC: values[0],
      surfacePressureKpa: values[1],
      relativeHumidityPercent: values[2],
      windSpeedAt10mMps: values[3],
      windDirectionAt10mDeg: values[4],
    };
  });
  const content = {
    sourceId: input.manifest.id,
    sourceVersion: input.manifest.version,
    artifactId: artifact.id,
    rawSha256: artifact.sha256,
    longitudeDeg: artifact.longitudeDeg,
    latitudeDeg: artifact.latitudeDeg,
    samples,
  };
  return {
    schemaVersion: "vector.sourced-point-atmosphere.v1",
    identity: {
      id: `sourced-point-atmosphere:${input.manifest.id}:${artifact.id}`,
      version: input.manifest.version,
      digest: sha256Identity(content),
    },
    provenance: "SOURCED_DATASET",
    source: {
      id: input.manifest.id,
      version: input.manifest.version,
      publisher: input.manifest.publisher,
      license: input.manifest.license,
      horizontalDatum: input.manifest.horizontalDatum,
      verticalDatum: input.manifest.verticalDatum,
      coverage: input.manifest.coverage,
    },
    artifact: {
      id: artifact.id,
      sha256: artifact.sha256,
      longitudeDeg: artifact.longitudeDeg,
      latitudeDeg: artifact.latitudeDeg,
    },
    samples,
    limitations: input.manifest.limitations,
  };
}

/**
 * This explicit guard is the admission boundary. Point-only raw source
 * artifacts can support validation of an ingestion pipeline, never runtime
 * area weather, terrain, route, runway, collision, or LOS behavior.
 */
export function assertEligibleForAreaEnvironmentPack(source: SourcedPointAtmosphere): never {
  throw new TypeError(
    `Environment source ${source.identity.id}@${source.identity.version} is point-only and cannot admit an area environment pack.`,
  );
}
