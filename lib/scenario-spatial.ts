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
import type { InstallationOriginReference } from "./mission-admission.ts";

export type ScenarioSpatialPoint = {
  longitude: number;
  latitude: number;
  altitudeM: number;
  verticalDatum: "MSL";
};

/** How the route controller may transition away from an authored waypoint. */
export type RouteWaypointTransition = "START" | "FLY_BY" | "FLY_OVER";

export type ScenarioSpatialEntity = {
  position: ScenarioSpatialPoint;
  headingDeg: number;
  speedMps: number;
  route: ScenarioSpatialPoint[];
  /** One explicit acceptance radius per route point; only waypoint radii are consumed. */
  routeAcceptanceRadiiM: number[];
  /** One explicit transition mode per route point; index zero is always START. */
  routeWaypointTransitions: RouteWaypointTransition[];
  /** Present only when an admitted public installation was selected. */
  originReference?: InstallationOriginReference;
};

export type ScenarioSpatialPlan = {
  blue: ScenarioSpatialEntity;
  red: ScenarioSpatialEntity;
};

export const ROUTE_PLAN_SCHEMA_VERSION = "vector.route-plan.v2";
export const DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M = 500;

/**
 * Apply an airborne start edit without allowing an installation reference to
 * become a misleading coordinate label. Altitude remains an aircraft flight
 * input at the selected installation; a horizontal move is an explicit manual
 * placement and therefore removes the installation identity before compile.
 */
export function withAirborneStart(
  entity: ScenarioSpatialEntity,
  position: ScenarioSpatialPoint,
): ScenarioSpatialEntity {
  const movedHorizontally =
    Math.abs(entity.position.longitude - position.longitude) > 1e-6 ||
    Math.abs(entity.position.latitude - position.latitude) > 1e-6;
  return {
    ...entity,
    position,
    route: entity.route.map((point, index) => (index === 0 ? position : point)),
    routeAcceptanceRadiiM: [...entity.routeAcceptanceRadiiM],
    routeWaypointTransitions: [...entity.routeWaypointTransitions],
    originReference: movedHorizontally ? undefined : entity.originReference,
  };
}

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
      routeAcceptanceRadiiM: [1, DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M],
      routeWaypointTransitions: ["START", "FLY_BY"],
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
      routeAcceptanceRadiiM: [1, DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M],
      routeWaypointTransitions: ["START", "FLY_BY"],
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

export function hasNonZeroRouteLegs(
  entity: ScenarioSpatialEntity,
  area: StudyArea,
) {
  const localRoute = entity.route.map((point) => geographicToLocal(point, area));
  return localRoute.every((point, index) => {
    if (index === 0) return true;
    const previous = localRoute[index - 1];
    return Math.hypot(
      point.x - previous.x,
      point.y - previous.y,
      point.z - previous.z,
    ) > 1;
  });
}

export function hasValidRouteAcceptanceRadii(entity: ScenarioSpatialEntity) {
  return entity.routeAcceptanceRadiiM.length === entity.route.length &&
    entity.routeAcceptanceRadiiM.every((radius, index) =>
      Number.isFinite(radius) && radius >= 1 && radius <= 25_000 &&
        (index > 0 || radius === 1),
    );
}

export function hasValidRouteWaypointTransitions(entity: ScenarioSpatialEntity) {
  return entity.routeWaypointTransitions.length === entity.route.length &&
    entity.routeWaypointTransitions.every((transition, index) =>
      index === 0
        ? transition === "START"
        : (transition === "FLY_BY" || transition === "FLY_OVER") &&
          (transition !== "FLY_OVER" || entity.routeAcceptanceRadiiM[index] === 1),
    );
}
