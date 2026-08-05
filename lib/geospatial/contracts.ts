import type { Vec3 } from "../engine/primitives.ts";

export const WGS84_ELLIPSOID = {
  id: "EPSG:7030",
  semiMajorAxisM: 6_378_137,
  inverseFlattening: 298.257223563,
} as const;

export type VerticalDatum = "ELLIPSOID" | "MSL" | "AGL";

export type Altitude<D extends VerticalDatum = VerticalDatum> = {
  valueM: number;
  datum: D;
};

export type GeographicPosition<D extends VerticalDatum = VerticalDatum> = {
  longitudeDeg: number;
  latitudeDeg: number;
  altitude: Altitude<D>;
};

export type EcefPosition = {
  xM: number;
  yM: number;
  zM: number;
};

export type LocalFrame = "ENU" | "NED";

export type ScenarioOrigin = {
  schemaVersion: "vector.scenario-origin.v1";
  id: string;
  frame: LocalFrame;
  geographic: GeographicPosition<"ELLIPSOID">;
  transformVersion: "vector.wgs84-ecef-local.v1";
};

export type LocalPosition = Vec3;

export type DatasetIdentity = {
  id: string;
  version: string;
  digest: `sha256:${string}`;
};

export type GeoidModelIdentity = DatasetIdentity & {
  operationVersion: "vector.vertical-datum-operation.v1";
};

export interface GeoidModel extends GeoidModelIdentity {
  undulationM(position: Pick<GeographicPosition, "longitudeDeg" | "latitudeDeg">): number;
}

export type GeographicEntityState = {
  entityId: string;
  position: GeographicPosition<"ELLIPSOID">;
};

export type RecordedGeographicPosition = GeographicEntityState;

export type CoverageBasis = "DECLARED" | "GEOMETRIC" | "SENSOR_COMPUTED";

export type WeatherVectorSample = {
  windEnuMps: Vec3;
  temperatureOffsetC: number;
  humidityPercent: number;
  visibilityM: number;
};

export interface WeatherVectorField {
  identity: DatasetIdentity;
  frame: "ENU";
  sample(
    position: GeographicPosition<"ELLIPSOID">,
    modelTimeSeconds: number,
  ): WeatherVectorSample;
}

export type AtmosphereFieldSample = {
  temperatureK: number;
  pressureKpa: number;
  densityKgM3: number;
  speedOfSoundMps: number;
};

export interface AtmosphereField {
  identity: DatasetIdentity;
  verticalCoordinate: {
    kind: "SCENARIO_LOCAL_UP";
    originDatum: "ELLIPSOID";
  };
  sample(
    position: LocalPosition,
    modelTimeSeconds: number,
  ): AtmosphereFieldSample;
}
