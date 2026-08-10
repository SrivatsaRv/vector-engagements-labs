import type { StudyArea } from "./study-areas.ts";
import type { ScenarioOrigin } from "./geospatial/contracts.ts";
import {
  geographicToLocalFrame,
  localFrameToGeographic,
} from "./geospatial/geodesy.ts";
import {
  SYNTHETIC_ZERO_GEOID,
  convertWithGeoid,
} from "./geospatial/vertical-datums.ts";

export type ScenarioSpatialPoint = {
  longitude: number;
  latitude: number;
  altitudeM: number;
  verticalDatum: "MSL";
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

export function scenarioOrigin(area: StudyArea): ScenarioOrigin {
  return {
    schemaVersion: "vector.scenario-origin.v1",
    id: `study-area:${area.id}:origin:v1`,
    frame: "ENU",
    geographic: {
      longitudeDeg: area.anchor.longitude,
      latitudeDeg: area.anchor.latitude,
      altitude: { valueM: 0, datum: "ELLIPSOID" },
    },
    transformVersion: "vector.wgs84-ecef-local.v1",
  };
}

export function geographicToLocal(
  point: ScenarioSpatialPoint,
  area: StudyArea,
) {
  if (point.verticalDatum !== "MSL") {
    throw new TypeError("Configured scenario authoring requires an explicit MSL altitude.");
  }
  const ellipsoid = convertWithGeoid(
    {
      longitudeDeg: point.longitude,
      latitudeDeg: point.latitude,
      altitude: { valueM: point.altitudeM, datum: "MSL" },
    },
    "ELLIPSOID",
    {
      schemaVersion: "vector.geoid-conversion.v1",
      model: SYNTHETIC_ZERO_GEOID,
    },
  );
  return geographicToLocalFrame(
    ellipsoid,
    scenarioOrigin(area),
  );
}

export function localToGeographic(
  point: { x: number; y: number; z: number },
  area: StudyArea,
): ScenarioSpatialPoint {
  const ellipsoid = localFrameToGeographic(point, scenarioOrigin(area));
  const msl = convertWithGeoid(ellipsoid, "MSL", {
    schemaVersion: "vector.geoid-conversion.v1",
    model: SYNTHETIC_ZERO_GEOID,
  });
  return {
    longitude: msl.longitudeDeg,
    latitude: msl.latitudeDeg,
    altitudeM: msl.altitude.valueM,
    verticalDatum: "MSL",
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
  const blue = localToGeographic(blueLocal, input.studyArea);
  const red = localToGeographic(redLocal, input.studyArea);
  return {
    blue: {
      position: blue,
      headingDeg: 90,
      speedMps: input.blueSpeedMps,
      route: [
        blue,
        localToGeographic(
          { x: blueLocal.x + input.blueSpeedMps * 120, y: 0, z: blueLocal.z },
          input.studyArea,
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
          input.studyArea,
        ),
      ],
    },
  };
}

export function spatialSeparationM(plan: ScenarioSpatialPlan, area: StudyArea) {
  const blue = geographicToLocal(plan.blue.position, area);
  const red = geographicToLocal(plan.red.position, area);
  return Math.hypot(red.x - blue.x, red.y - blue.y, red.z - blue.z);
}

export function spatialHorizontalSeparationM(
  plan: ScenarioSpatialPlan,
  area: StudyArea,
) {
  const blue = geographicToLocal(plan.blue.position, area);
  const red = geographicToLocal(plan.red.position, area);
  return Math.hypot(red.x - blue.x, red.y - blue.y);
}

export function spatialAspectDeg(plan: ScenarioSpatialPlan, area: StudyArea) {
  const blue = geographicToLocal(plan.blue.position, area);
  const red = geographicToLocal(plan.red.position, area);
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
  const blue = geographicToLocal(plan.blue.position, area);
  const red = geographicToLocal(plan.red.position, area);
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
    area,
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
  const blue = geographicToLocal(plan.blue.position, area);
  const red = geographicToLocal(plan.red.position, area);
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
