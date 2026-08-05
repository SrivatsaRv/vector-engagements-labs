import type {
  Altitude,
  GeographicPosition,
  GeoidModel,
  VerticalDatum,
} from "./contracts.ts";
import { sha256Identity } from "./digest.ts";

export const SYNTHETIC_ZERO_GEOID: GeoidModel = {
  id: "vector.synthetic-zero-geoid",
  version: "1.0.0",
  digest: sha256Identity({
    id: "vector.synthetic-zero-geoid",
    version: "1.0.0",
    undulation: "constant-zero-metres",
  }),
  operationVersion: "vector.vertical-datum-operation.v1",
  undulationM: () => 0,
};

export type GeoidConversionOperation = {
  schemaVersion: "vector.geoid-conversion.v1";
  model: GeoidModel;
};

export type GroundConversionOperation = {
  schemaVersion: "vector.ground-datum-conversion.v1";
  groundElevation: Altitude<"MSL">;
  terrainDatasetId: string;
  terrainDatasetVersion: string;
};

export function convertWithGeoid(
  position: GeographicPosition<"ELLIPSOID" | "MSL">,
  targetDatum: "ELLIPSOID",
  operation: GeoidConversionOperation,
): GeographicPosition<"ELLIPSOID">;
export function convertWithGeoid(
  position: GeographicPosition<"ELLIPSOID" | "MSL">,
  targetDatum: "MSL",
  operation: GeoidConversionOperation,
): GeographicPosition<"MSL">;
export function convertWithGeoid(
  position: GeographicPosition<"ELLIPSOID" | "MSL">,
  targetDatum: "ELLIPSOID" | "MSL",
  operation: GeoidConversionOperation,
): GeographicPosition<"ELLIPSOID" | "MSL"> {
  if (position.altitude.datum === targetDatum) {
    return structuredClone(position) as GeographicPosition<"ELLIPSOID" | "MSL">;
  }
  const undulationM = operation.model.undulationM(position);
  if (!Number.isFinite(undulationM)) {
    throw new RangeError("The selected geoid operation returned a non-finite undulation.");
  }
  return {
    longitudeDeg: position.longitudeDeg,
    latitudeDeg: position.latitudeDeg,
    altitude: {
      valueM: targetDatum === "ELLIPSOID"
        ? position.altitude.valueM + undulationM
        : position.altitude.valueM - undulationM,
      datum: targetDatum,
    },
  };
}

export function convertWithGroundSurface(
  altitude: Altitude<"MSL" | "AGL">,
  targetDatum: "MSL" | "AGL",
  operation: GroundConversionOperation,
): Altitude<"MSL" | "AGL"> {
  if (altitude.datum === targetDatum) return { ...altitude };
  return {
    valueM: targetDatum === "MSL"
      ? altitude.valueM + operation.groundElevation.valueM
      : altitude.valueM - operation.groundElevation.valueM,
    datum: targetDatum,
  };
}

export function requireAltitudeDatum<D extends VerticalDatum>(
  altitude: Altitude,
  datum: D,
): asserts altitude is Altitude<D> {
  if (altitude.datum !== datum) {
    throw new TypeError(
      `Altitude datum mismatch: expected ${datum}, received ${altitude.datum}. An explicit versioned conversion is required.`,
    );
  }
}
