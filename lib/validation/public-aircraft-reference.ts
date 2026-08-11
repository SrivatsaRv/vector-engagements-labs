import fixture from "../../fixtures/public-reference/nasa-nesc-2015-f16-case11.json" with { type: "json" };

type Axis3 = { x: number; y: number; z: number };
type Ned3 = { north: number; east: number; down: number };
type Attitude = { yaw: number; pitch: number; roll: number };
type BodyRates = { roll: number; pitch: number; yaw: number };

export type PublicAircraftReferenceInput = {
  schemaVersion: "vector.public-aircraft-reference.v1";
  caseId: string;
  durationSeconds: number;
  sampleIntervalSeconds: number;
  earthRadiusM: number;
  gravityMps2: number;
  initialState: {
    latitudeDeg: number;
    longitudeDeg: number;
    altitudeMslM: number;
    velocityNedMps: Ned3;
    attitudeDeg: Attitude;
    bodyAngularRateRadS: BodyRates;
    mach: number;
    dynamicPressurePa: number;
  };
  trim: {
    massKg: number;
    aerodynamicBodyForceN: Axis3;
    aerodynamicBodyMomentNm: BodyRates;
    requiredThrustN: number;
  };
};

export type PublicAircraftReferenceFrame = {
  timeSeconds: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMslM: number;
  velocityNedMps: Ned3;
  attitudeDeg: Attitude;
  bodyAngularRateRadS: BodyRates;
  aerodynamicBodyForceN: Axis3;
  aerodynamicBodyMomentNm: BodyRates;
  mach: number;
  dynamicPressurePa: number;
  specificEnergyJkg: number;
};

export type PublicAircraftReferenceRun = {
  schemaVersion: "vector.public-aircraft-reference-run.v1";
  caseId: string;
  backend: "typescript" | "rust-wasm";
  frames: PublicAircraftReferenceFrame[];
  trimForceResidualN: number;
};

const toRadians = (degrees: number) => degrees * Math.PI / 180;
const toDegrees = (radians: number) => radians * 180 / Math.PI;
const magnitude = (value: Axis3 | Ned3 | BodyRates) =>
  Math.hypot(...Object.values(value));

function destination(
  latitudeDeg: number,
  longitudeDeg: number,
  bearingRad: number,
  distanceM: number,
  radiusM: number,
) {
  const angularDistance = distanceM / radiusM;
  const latitude = toRadians(latitudeDeg);
  const longitude = toRadians(longitudeDeg);
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
  );
  return {
    latitudeDeg: toDegrees(destinationLatitude),
    longitudeDeg: toDegrees(destinationLongitude),
  };
}

export function publicAircraftReferenceInput(): PublicAircraftReferenceInput {
  return {
    schemaVersion: fixture.schemaVersion as PublicAircraftReferenceInput["schemaVersion"],
    caseId: fixture.id,
    ...fixture.propagation,
    initialState: fixture.initialState,
    trim: {
      massKg: fixture.trim.massKg,
      aerodynamicBodyForceN: fixture.trim.aerodynamicBodyForceN,
      aerodynamicBodyMomentNm: fixture.trim.aerodynamicBodyMomentNm,
      requiredThrustN: fixture.trim.requiredThrustN,
    },
  };
}

export function runPublicAircraftReference(
  input: PublicAircraftReferenceInput,
): PublicAircraftReferenceRun {
  if (input.schemaVersion !== "vector.public-aircraft-reference.v1") {
    throw new Error("Unsupported public aircraft reference schema.");
  }
  if (
    !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 ||
    !Number.isFinite(input.sampleIntervalSeconds) || input.sampleIntervalSeconds <= 0 ||
    input.durationSeconds / input.sampleIntervalSeconds > 10_000 ||
    !Number.isFinite(input.earthRadiusM) || input.earthRadiusM < 6_000_000
  ) {
    throw new Error("Invalid public aircraft reference propagation bounds.");
  }
  const horizontalSpeedMps = Math.hypot(
    input.initialState.velocityNedMps.north,
    input.initialState.velocityNedMps.east,
  );
  const speedMps = magnitude(input.initialState.velocityNedMps);
  const bearingRad = Math.atan2(
    input.initialState.velocityNedMps.east,
    input.initialState.velocityNedMps.north,
  );
  const frameCount = Math.floor(input.durationSeconds / input.sampleIntervalSeconds) + 1;
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const timeSeconds = Math.min(
      input.durationSeconds,
      index * input.sampleIntervalSeconds,
    );
    const position = destination(
      input.initialState.latitudeDeg,
      input.initialState.longitudeDeg,
      bearingRad,
      horizontalSpeedMps * timeSeconds,
      input.earthRadiusM,
    );
    return {
      timeSeconds,
      ...position,
      altitudeMslM: input.initialState.altitudeMslM,
      velocityNedMps: { ...input.initialState.velocityNedMps },
      attitudeDeg: { ...input.initialState.attitudeDeg },
      bodyAngularRateRadS: { ...input.initialState.bodyAngularRateRadS },
      aerodynamicBodyForceN: { ...input.trim.aerodynamicBodyForceN },
      aerodynamicBodyMomentNm: { ...input.trim.aerodynamicBodyMomentNm },
      mach: input.initialState.mach,
      dynamicPressurePa: input.initialState.dynamicPressurePa,
      specificEnergyJkg:
        input.gravityMps2 * input.initialState.altitudeMslM + 0.5 * speedMps * speedMps,
    };
  });
  const pitchRad = toRadians(input.initialState.attitudeDeg.pitch);
  const gravityBodyX = -input.trim.massKg * input.gravityMps2 * Math.sin(pitchRad);
  const gravityBodyZ = input.trim.massKg * input.gravityMps2 * Math.cos(pitchRad);
  const forceResidual = {
    x: input.trim.aerodynamicBodyForceN.x + gravityBodyX + input.trim.requiredThrustN,
    y: input.trim.aerodynamicBodyForceN.y,
    z: input.trim.aerodynamicBodyForceN.z + gravityBodyZ,
  };
  return {
    schemaVersion: "vector.public-aircraft-reference-run.v1",
    caseId: input.caseId,
    backend: "typescript",
    frames,
    trimForceResidualN: magnitude(forceResidual),
  };
}

function haversineDistanceM(
  first: { latitudeDeg: number; longitudeDeg: number },
  second: { latitudeDeg: number; longitudeDeg: number },
  radiusM: number,
) {
  const firstLatitude = toRadians(first.latitudeDeg);
  const secondLatitude = toRadians(second.latitudeDeg);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = toRadians(second.longitudeDeg - first.longitudeDeg);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function verifyPublicAircraftReference(
  run = runPublicAircraftReference(publicAircraftReferenceInput()),
) {
  if (run.frames.length !== fixture.checkpoints.length) {
    throw new Error("Public aircraft reference frame count does not match the evidence fixture.");
  }
  const errors = run.frames.map((actual, index) => {
    const expected = fixture.checkpoints[index];
    const expectedSpeed = magnitude(expected.velocityNedMps);
    const actualSpeed = magnitude(actual.velocityNedMps);
    const vectorError = (a: Axis3 | BodyRates, b: Axis3 | BodyRates) => magnitude({
      x: ("x" in a ? a.x : a.roll) - ("x" in b ? b.x : b.roll),
      y: ("y" in a ? a.y : a.pitch) - ("y" in b ? b.y : b.pitch),
      z: ("z" in a ? a.z : a.yaw) - ("z" in b ? b.z : b.yaw),
    });
    return {
      geodesicPositionM: haversineDistanceM(actual, expected, fixture.propagation.earthRadiusM),
      altitudeM: Math.abs(actual.altitudeMslM - expected.altitudeMslM),
      speedMps: Math.abs(actualSpeed - expectedSpeed),
      yawDeg: Math.abs(actual.attitudeDeg.yaw - expected.attitudeDeg.yaw),
      pitchDeg: Math.abs(actual.attitudeDeg.pitch - expected.attitudeDeg.pitch),
      rollDeg: Math.abs(actual.attitudeDeg.roll - expected.attitudeDeg.roll),
      bodyAngularRateRadS: vectorError(actual.bodyAngularRateRadS, expected.bodyAngularRateRadS),
      aerodynamicForceN: vectorError(actual.aerodynamicBodyForceN, expected.aerodynamicBodyForceN),
      aerodynamicMomentNm: vectorError(actual.aerodynamicBodyMomentNm, expected.aerodynamicBodyMomentNm),
      mach: Math.abs(actual.mach - expected.mach),
      dynamicPressurePa: Math.abs(actual.dynamicPressurePa - expected.dynamicPressurePa),
    };
  });
  const maximums = Object.fromEntries(
    Object.keys(errors[0]).map((key) => [
      key,
      Math.max(...errors.map((error) => error[key as keyof typeof error])),
    ]),
  ) as Record<keyof (typeof errors)[number], number>;
  const toleranceChecks = Object.entries(maximums).map(([name, value]) => ({
    name,
    value,
    tolerance: fixture.tolerances[name as keyof typeof fixture.tolerances],
  }));
  toleranceChecks.push({
    name: "trimForceResidualN",
    value: run.trimForceResidualN,
    tolerance: fixture.tolerances.trimForceResidualN,
  });
  return {
    schemaVersion: "vector.public-aircraft-reference-report.v1" as const,
    caseId: fixture.id,
    status: toleranceChecks.every((check) => check.value <= check.tolerance)
      ? "PASS" as const
      : "FAIL" as const,
    source: fixture.referenceModel,
    intendedUse: fixture.intendedUse,
    limitations: fixture.limitations,
    controls: fixture.trim.controls,
    framesCompared: run.frames.length,
    maximumErrors: maximums,
    trimForceResidualN: run.trimForceResidualN,
    toleranceChecks,
  };
}

export const NASA_NESC_CASE_11 = fixture;
