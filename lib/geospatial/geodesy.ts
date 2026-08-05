import type {
  EcefPosition,
  GeographicPosition,
  LocalFrame,
  LocalPosition,
  ScenarioOrigin,
} from "./contracts.ts";
import { WGS84_ELLIPSOID } from "./contracts.ts";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const A = WGS84_ELLIPSOID.semiMajorAxisM;
const F = 1 / WGS84_ELLIPSOID.inverseFlattening;
const E2 = F * (2 - F);
const B = A * (1 - F);
const EP2 = (A * A - B * B) / (B * B);

function assertLongitudeLatitude(longitudeDeg: number, latitudeDeg: number) {
  if (!Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180) {
    throw new RangeError("Longitude must be finite and inside [-180, 180] degrees.");
  }
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new RangeError("Latitude must be finite and inside [-90, 90] degrees.");
  }
}

function assertEcef(position: EcefPosition) {
  if (![position.xM, position.yM, position.zM].every(Number.isFinite)) {
    throw new RangeError("ECEF coordinates must be finite.");
  }
}

function assertLocal(position: LocalPosition) {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new RangeError("Local-frame coordinates must be finite.");
  }
}

export function normalizeLongitude(longitudeDeg: number) {
  const normalized = ((longitudeDeg + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 && longitudeDeg > 0 ? 180 : normalized;
}

export function geodeticToEcef(
  position: GeographicPosition<"ELLIPSOID">,
): EcefPosition {
  const { longitudeDeg, latitudeDeg, altitude } = position;
  assertLongitudeLatitude(longitudeDeg, latitudeDeg);
  if (altitude.datum !== "ELLIPSOID") {
    throw new TypeError("ECEF conversion requires an explicit ellipsoid altitude.");
  }
  if (!Number.isFinite(altitude.valueM)) {
    throw new RangeError("Altitude must be finite.");
  }
  const longitude = longitudeDeg * DEG_TO_RAD;
  const latitude = latitudeDeg * DEG_TO_RAD;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const normalRadius = A / Math.sqrt(1 - E2 * sinLatitude * sinLatitude);
  return {
    xM: (normalRadius + altitude.valueM) * cosLatitude * Math.cos(longitude),
    yM: (normalRadius + altitude.valueM) * cosLatitude * Math.sin(longitude),
    zM: (normalRadius * (1 - E2) + altitude.valueM) * sinLatitude,
  };
}

export function ecefToGeodetic(
  position: EcefPosition,
): GeographicPosition<"ELLIPSOID"> {
  assertEcef(position);
  const p = Math.hypot(position.xM, position.yM);
  if (p < 1e-9) {
    return {
      longitudeDeg: 0,
      latitudeDeg: position.zM >= 0 ? 90 : -90,
      altitude: { valueM: Math.abs(position.zM) - B, datum: "ELLIPSOID" },
    };
  }
  const theta = Math.atan2(position.zM * A, p * B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latitude = Math.atan2(
    position.zM + EP2 * B * sinTheta ** 3,
    p - E2 * A * cosTheta ** 3,
  );
  const longitude = Math.atan2(position.yM, position.xM);
  const sinLatitude = Math.sin(latitude);
  const normalRadius = A / Math.sqrt(1 - E2 * sinLatitude * sinLatitude);
  const altitude = p / Math.cos(latitude) - normalRadius;
  return {
    longitudeDeg: normalizeLongitude(longitude * RAD_TO_DEG),
    latitudeDeg: latitude * RAD_TO_DEG,
    altitude: { valueM: altitude, datum: "ELLIPSOID" },
  };
}

function ecefDeltaToEnu(delta: EcefPosition, origin: ScenarioOrigin): LocalPosition {
  const longitude = origin.geographic.longitudeDeg * DEG_TO_RAD;
  const latitude = origin.geographic.latitudeDeg * DEG_TO_RAD;
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  return {
    x: -sinLongitude * delta.xM + cosLongitude * delta.yM,
    y:
      -sinLatitude * cosLongitude * delta.xM
      - sinLatitude * sinLongitude * delta.yM
      + cosLatitude * delta.zM,
    z:
      cosLatitude * cosLongitude * delta.xM
      + cosLatitude * sinLongitude * delta.yM
      + sinLatitude * delta.zM,
  };
}

function enuToEcefDelta(position: LocalPosition, origin: ScenarioOrigin): EcefPosition {
  const longitude = origin.geographic.longitudeDeg * DEG_TO_RAD;
  const latitude = origin.geographic.latitudeDeg * DEG_TO_RAD;
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  return {
    xM:
      -sinLongitude * position.x
      - sinLatitude * cosLongitude * position.y
      + cosLatitude * cosLongitude * position.z,
    yM:
      cosLongitude * position.x
      - sinLatitude * sinLongitude * position.y
      + cosLatitude * sinLongitude * position.z,
    zM: cosLatitude * position.y + sinLatitude * position.z,
  };
}

export function ecefToLocal(position: EcefPosition, origin: ScenarioOrigin): LocalPosition {
  assertEcef(position);
  const originEcef = geodeticToEcef(origin.geographic);
  const enu = ecefDeltaToEnu({
    xM: position.xM - originEcef.xM,
    yM: position.yM - originEcef.yM,
    zM: position.zM - originEcef.zM,
  }, origin);
  return origin.frame === "ENU" ? enu : { x: enu.y, y: enu.x, z: -enu.z };
}

export function localToEcef(position: LocalPosition, origin: ScenarioOrigin): EcefPosition {
  assertLocal(position);
  const enu = origin.frame === "ENU"
    ? position
    : { x: position.y, y: position.x, z: -position.z };
  const delta = enuToEcefDelta(enu, origin);
  const originEcef = geodeticToEcef(origin.geographic);
  return {
    xM: originEcef.xM + delta.xM,
    yM: originEcef.yM + delta.yM,
    zM: originEcef.zM + delta.zM,
  };
}

export function geographicToLocalFrame(
  position: GeographicPosition<"ELLIPSOID">,
  origin: ScenarioOrigin,
) {
  return ecefToLocal(geodeticToEcef(position), origin);
}

export function localFrameToGeographic(
  position: LocalPosition,
  origin: ScenarioOrigin,
) {
  return ecefToGeodetic(localToEcef(position, origin));
}

export function convertLocalFrame(
  position: LocalPosition,
  from: LocalFrame,
  to: LocalFrame,
): LocalPosition {
  if (from === to) return { ...position };
  return { x: position.y, y: position.x, z: -position.z };
}

export function cameraRelativeThreePosition(
  recordedEnu: LocalPosition,
  cameraOriginEnu: LocalPosition = { x: 0, y: 0, z: 0 },
) {
  return new Float32Array([
    recordedEnu.x - cameraOriginEnu.x,
    recordedEnu.z - cameraOriginEnu.z,
    recordedEnu.y - cameraOriginEnu.y,
  ]);
}

export function geodesicDistanceBearing(
  start: Pick<GeographicPosition, "longitudeDeg" | "latitudeDeg">,
  end: Pick<GeographicPosition, "longitudeDeg" | "latitudeDeg">,
) {
  assertLongitudeLatitude(start.longitudeDeg, start.latitudeDeg);
  assertLongitudeLatitude(end.longitudeDeg, end.latitudeDeg);
  const reducedStart = Math.atan((1 - F) * Math.tan(start.latitudeDeg * DEG_TO_RAD));
  const reducedEnd = Math.atan((1 - F) * Math.tan(end.latitudeDeg * DEG_TO_RAD));
  const sinStart = Math.sin(reducedStart);
  const cosStart = Math.cos(reducedStart);
  const sinEnd = Math.sin(reducedEnd);
  const cosEnd = Math.cos(reducedEnd);
  const longitudeDifference = normalizeLongitude(
    end.longitudeDeg - start.longitudeDeg,
  ) * DEG_TO_RAD;
  let lambda = longitudeDifference;
  let previous = Number.POSITIVE_INFINITY;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSquaredAlpha = 0;
  let cosDoubleSigmaMidpoint = 0;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(
      cosEnd * sinLambda,
      cosStart * sinEnd - sinStart * cosEnd * cosLambda,
    );
    if (sinSigma === 0) return { distanceM: 0, initialBearingDeg: 0 };
    cosSigma = sinStart * sinEnd + cosStart * cosEnd * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosStart * cosEnd * sinLambda) / sinSigma;
    cosSquaredAlpha = 1 - sinAlpha * sinAlpha;
    cosDoubleSigmaMidpoint = cosSquaredAlpha > 1e-15
      ? cosSigma - (2 * sinStart * sinEnd) / cosSquaredAlpha
      : 0;
    const coefficient = (F / 16) * cosSquaredAlpha
      * (4 + F * (4 - 3 * cosSquaredAlpha));
    previous = lambda;
    lambda = longitudeDifference + (1 - coefficient) * F * sinAlpha * (
      sigma + coefficient * sinSigma * (
        cosDoubleSigmaMidpoint + coefficient * cosSigma
          * (-1 + 2 * cosDoubleSigmaMidpoint * cosDoubleSigmaMidpoint)
      )
    );
    if (Math.abs(lambda - previous) < 1e-12) break;
    if (iteration === 199) {
      throw new RangeError("The WGS84 inverse geodesic did not converge for this point pair.");
    }
  }
  const squaredU = cosSquaredAlpha * (A * A - B * B) / (B * B);
  const coefficientA = 1 + (squaredU / 16_384) * (
    4096 + squaredU * (-768 + squaredU * (320 - 175 * squaredU))
  );
  const coefficientB = (squaredU / 1024) * (
    256 + squaredU * (-128 + squaredU * (74 - 47 * squaredU))
  );
  const deltaSigma = coefficientB * sinSigma * (
    cosDoubleSigmaMidpoint + (coefficientB / 4) * (
      cosSigma * (-1 + 2 * cosDoubleSigmaMidpoint ** 2)
      - (coefficientB / 6) * cosDoubleSigmaMidpoint
        * (-3 + 4 * sinSigma ** 2)
        * (-3 + 4 * cosDoubleSigmaMidpoint ** 2)
    )
  );
  const initialBearing = Math.atan2(
    cosEnd * Math.sin(lambda),
    cosStart * sinEnd - sinStart * cosEnd * Math.cos(lambda),
  ) * RAD_TO_DEG;
  return {
    distanceM: B * coefficientA * (sigma - deltaSigma),
    initialBearingDeg: (initialBearing + 360) % 360,
  };
}
