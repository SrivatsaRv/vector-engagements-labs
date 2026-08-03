import type { StudyArea } from "./study-areas.ts";

export type ScenarioSpatialPoint = {
  longitude: number;
  latitude: number;
  altitudeM: number;
};

export type ScenarioSpatialEntity = {
  position: ScenarioSpatialPoint;
  headingDeg: number;
  speedMps: number;
  route: ScenarioSpatialPoint[];
};

export type ScenarioSpatialPlan = {
  blue: ScenarioSpatialEntity;
  red: ScenarioSpatialEntity;
};

export function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

export function geographicToLocal(
  point: ScenarioSpatialPoint,
  origin: StudyArea["anchor"],
) {
  const latitudeRad = (origin.latitude * Math.PI) / 180;
  return {
    x: (point.longitude - origin.longitude) * 111320 * Math.cos(latitudeRad),
    y: (point.latitude - origin.latitude) * 111320,
    z: point.altitudeM,
  };
}

export function localToGeographic(
  point: { x: number; y: number; z: number },
  origin: StudyArea["anchor"],
): ScenarioSpatialPoint {
  const latitudeRad = (origin.latitude * Math.PI) / 180;
  return {
    longitude:
      origin.longitude + point.x / (111320 * Math.cos(latitudeRad)),
    latitude: origin.latitude + point.y / 111320,
    altitudeM: point.z,
  };
}

export function createDefaultSpatialPlan(input: {
  studyArea: StudyArea;
  rangeM: number;
  blueAltitudeM: number;
  redAltitudeM: number;
  blueSpeedMps: number;
  redSpeedMps: number;
  crossingAngleDeg: number;
}): ScenarioSpatialPlan {
  const blueLocal = { x: -input.rangeM / 2, y: 0, z: input.blueAltitudeM };
  const redLocal = { x: input.rangeM / 2, y: 0, z: input.redAltitudeM };
  const blue = localToGeographic(blueLocal, input.studyArea.anchor);
  const red = localToGeographic(redLocal, input.studyArea.anchor);
  return {
    blue: {
      position: blue,
      headingDeg: 90,
      speedMps: input.blueSpeedMps,
      route: [
        blue,
        localToGeographic(
          { x: blueLocal.x + input.blueSpeedMps * 120, y: 0, z: blueLocal.z },
          input.studyArea.anchor,
        ),
      ],
    },
    red: {
      position: red,
      headingDeg: normalizeHeading(input.crossingAngleDeg - 90),
      speedMps: input.redSpeedMps,
      route: [
        red,
        localToGeographic(
          {
            x:
              redLocal.x +
              Math.sin(((input.crossingAngleDeg - 90) * Math.PI) / 180) *
                input.redSpeedMps *
                120,
            y:
              Math.cos(((input.crossingAngleDeg - 90) * Math.PI) / 180) *
                input.redSpeedMps *
                120,
            z: redLocal.z,
          },
          input.studyArea.anchor,
        ),
      ],
    },
  };
}

export function spatialSeparationM(plan: ScenarioSpatialPlan, area: StudyArea) {
  const blue = geographicToLocal(plan.blue.position, area.anchor);
  const red = geographicToLocal(plan.red.position, area.anchor);
  return Math.hypot(red.x - blue.x, red.y - blue.y, red.z - blue.z);
}

export function spatialHorizontalSeparationM(
  plan: ScenarioSpatialPlan,
  area: StudyArea,
) {
  const blue = geographicToLocal(plan.blue.position, area.anchor);
  const red = geographicToLocal(plan.red.position, area.anchor);
  return Math.hypot(red.x - blue.x, red.y - blue.y);
}

export function spatialAspectDeg(plan: ScenarioSpatialPlan, area: StudyArea) {
  const blue = geographicToLocal(plan.blue.position, area.anchor);
  const red = geographicToLocal(plan.red.position, area.anchor);
  const lineToBlue = { x: blue.x - red.x, y: blue.y - red.y };
  const headingRad = ((90 - plan.red.headingDeg) * Math.PI) / 180;
  const velocity = { x: Math.cos(headingRad), y: Math.sin(headingRad) };
  const length = Math.max(1, Math.hypot(lineToBlue.x, lineToBlue.y));
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (velocity.x * lineToBlue.x + velocity.y * lineToBlue.y) / length,
    ),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function withSpatialRangeM(
  plan: ScenarioSpatialPlan,
  area: StudyArea,
  rangeM: number,
): ScenarioSpatialPlan {
  const blue = geographicToLocal(plan.blue.position, area.anchor);
  const red = geographicToLocal(plan.red.position, area.anchor);
  const current = Math.hypot(red.x - blue.x, red.y - blue.y);
  const direction = current > 1
    ? { x: (red.x - blue.x) / current, y: (red.y - blue.y) / current }
    : { x: 1, y: 0 };
  const nextRed = localToGeographic(
    {
      x: blue.x + direction.x * rangeM,
      y: blue.y + direction.y * rangeM,
      z: red.z,
    },
    area.anchor,
  );
  return {
    ...plan,
    red: {
      ...plan.red,
      position: nextRed,
      route: plan.red.route.map((point, index) =>
        index === 0 ? nextRed : point,
      ),
    },
  };
}

export function withSpatialAspectDeg(
  plan: ScenarioSpatialPlan,
  area: StudyArea,
  aspectDeg: number,
): ScenarioSpatialPlan {
  const blue = geographicToLocal(plan.blue.position, area.anchor);
  const red = geographicToLocal(plan.red.position, area.anchor);
  const lineBearing = normalizeHeading(
    (Math.atan2(blue.x - red.x, blue.y - red.y) * 180) / Math.PI,
  );
  const signedCurrent =
    ((lineBearing - plan.red.headingDeg + 540) % 360) - 180;
  const side = signedCurrent < 0 ? -1 : 1;
  return {
    ...plan,
    red: {
      ...plan.red,
      headingDeg: normalizeHeading(lineBearing - side * aspectDeg),
    },
  };
}

export function isPointInsideStudyArea(
  point: ScenarioSpatialPoint,
  area: StudyArea,
) {
  const [[west, south], [east, north]] = area.bounds;
  return (
    point.longitude >= west &&
    point.longitude <= east &&
    point.latitude >= south &&
    point.latitude <= north
  );
}
