"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type {
  ScenarioSpatialEntity,
  ScenarioSpatialPoint,
} from "@/lib/scenario-spatial";
import {
  DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
  hasNonZeroRouteLegs,
  ROUTE_PLAN_SCHEMA_VERSION,
  withAirborneStart,
} from "@/lib/scenario-spatial";
import type { RouteWaypointTransition } from "@/lib/scenario-spatial";
import type { StudyArea } from "@/lib/study-areas";
import {
  MAX_AUTHORED_SCALAR_FRACTION_DIGITS,
  admitRawNumber,
  type NumericAuthority,
} from "@/lib/scenario-control-authority";

type Props = {
  team: "blue" | "red";
  designation: string;
  entity: ScenarioSpatialEntity;
  studyArea: StudyArea;
  onChange: (entity: ScenarioSpatialEntity) => void;
  onValidityChange: (valid: boolean) => void;
};

type PointDraft = {
  longitude: string;
  latitude: string;
  altitudeM: string;
};

type WaypointDraft = PointDraft & {
  acceptanceRadiusM: string;
  transition: Extract<RouteWaypointTransition, "FLY_BY" | "FLY_OVER">;
};

const formatCoordinate = (value: number) => String(Number(value.toFixed(6)));
const formatScalar = (value: number) => String(Number(value.toFixed(3)));
const numeric = (
  minimum: number,
  maximum: number,
  precision: number,
  unit: string,
): NumericAuthority => ({
  kind: "NUMBER",
  minimum,
  maximum,
  integer: false,
  nullable: false,
  precision,
  unit,
});
const LONGITUDE = numeric(-180, 180, 15, "deg_WGS84");
const LATITUDE = numeric(-90, 90, 15, "deg_WGS84");
const ALTITUDE = numeric(0, 25_000, MAX_AUTHORED_SCALAR_FRACTION_DIGITS, "m_MSL");
const HEADING = numeric(0, 359.999, MAX_AUTHORED_SCALAR_FRACTION_DIGITS, "deg_true");
const SPEED = numeric(0, 1_500, MAX_AUTHORED_SCALAR_FRACTION_DIGITS, "m/s");
const ACCEPTANCE_RADIUS = numeric(1, 25_000, MAX_AUTHORED_SCALAR_FRACTION_DIGITS, "m");
const parseStrict = (value: string, authority: NumericAuthority) => {
  const admitted = admitRawNumber(value, authority);
  return admitted.ok ? admitted.value : null;
};
const close = (left: number, right: number, tolerance: number) =>
  Math.abs(left - right) <= tolerance;

function pointDraft(point: ScenarioSpatialPoint): PointDraft {
  return {
    longitude: formatCoordinate(point.longitude),
    latitude: formatCoordinate(point.latitude),
    altitudeM: formatScalar(point.altitudeM),
  };
}

function waypointDraft(
  point: ScenarioSpatialPoint,
  acceptanceRadiusM: number,
  transition: Extract<RouteWaypointTransition, "FLY_BY" | "FLY_OVER">,
): WaypointDraft {
  return {
    ...pointDraft(point),
    acceptanceRadiusM: formatScalar(transition === "FLY_OVER" ? 1 : acceptanceRadiusM),
    transition,
  };
}

function pointError(draft: PointDraft, area: StudyArea) {
  const longitude = parseStrict(draft.longitude, LONGITUDE);
  const latitude = parseStrict(draft.latitude, LATITUDE);
  const altitudeM = parseStrict(draft.altitudeM, ALTITUDE);
  if (longitude === null || latitude === null || altitudeM === null) {
    return "Enter finite longitude, latitude, and altitude values.";
  }
  const [[west, south], [east, north]] = area.bounds;
  if (longitude < west || longitude > east || latitude < south || latitude > north) {
    return `Position must be inside ${area.shortName}.`;
  }
  return null;
}

function toPoint(draft: PointDraft): ScenarioSpatialPoint {
  return {
    longitude: Number(draft.longitude),
    latitude: Number(draft.latitude),
    altitudeM: Number(draft.altitudeM),
    verticalDatum: "MSL",
  };
}

function acceptanceRadiusError(value: string) {
  const radius = parseStrict(value, ACCEPTANCE_RADIUS);
  return radius === null
    ? "Waypoint acceptance radius must be from 1 to 25,000 m."
    : null;
}

export function SpatialEntityEditor({
  team,
  designation,
  entity,
  studyArea,
  onChange,
  onValidityChange,
}: Props) {
  const id = useId();
  const [start, setStart] = useState(() => pointDraft(entity.position));
  const [heading, setHeading] = useState(() => formatScalar(entity.headingDeg));
  const [speed, setSpeed] = useState(() => formatScalar(entity.speedMps));
  const [waypoints, setWaypoints] = useState<WaypointDraft[]>(() =>
    entity.route.slice(1).map((point, index) =>
      waypointDraft(
        point,
        entity.routeAcceptanceRadiiM[index + 1] ?? DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
        entity.routeWaypointTransitions?.[index + 1] === "FLY_OVER" ? "FLY_OVER" : "FLY_BY",
      ),
    ),
  );

  const startError = pointError(start, studyArea);
  const headingValue = parseStrict(heading, HEADING);
  const headingError =
    headingValue === null || headingValue < 0 || headingValue >= 360
      ? "Heading must be from 0 degrees inclusive to 360 degrees exclusive."
      : null;
  const speedValue = parseStrict(speed, SPEED);
  const speedError =
    speedValue === null || speedValue < 0 || speedValue > 1_500
      ? "Speed must be from 0 to 1,500 m/s."
      : null;
  const waypointErrors = useMemo(
    () => waypoints.map((draft) =>
      pointError(draft, studyArea) ??
      (draft.transition === "FLY_OVER" ? null : acceptanceRadiusError(draft.acceptanceRadiusM)),
    ),
    [studyArea, waypoints],
  );
  const routeError =
    !startError && waypointErrors.every((error) => !error) &&
    !hasNonZeroRouteLegs(
      {
        ...entity,
        position: toPoint(start),
        route: [toPoint(start), ...waypoints.map(toPoint)],
      },
      studyArea,
    )
      ? "Each route leg must be longer than 1 m."
      : null;
  const valid =
    !startError &&
    !headingError &&
    !speedError &&
    !routeError &&
    waypointErrors.every((error) => !error);
  const dirty = valid && (
    !close(Number(start.longitude), entity.position.longitude, 1e-6) ||
    !close(Number(start.latitude), entity.position.latitude, 1e-6) ||
    !close(Number(start.altitudeM), entity.position.altitudeM, 1e-3) ||
    !close(headingValue!, entity.headingDeg, 1e-3) ||
    !close(speedValue!, entity.speedMps, 1e-3) ||
    waypoints.length !== entity.route.length - 1 ||
    waypoints.some((draft, index) => {
      const point = entity.route[index + 1];
      return !point ||
        !close(Number(draft.longitude), point.longitude, 1e-6) ||
        !close(Number(draft.latitude), point.latitude, 1e-6) ||
        !close(Number(draft.altitudeM), point.altitudeM, 1e-3) ||
        !close(Number(draft.acceptanceRadiusM), entity.routeAcceptanceRadiiM[index + 1], 1e-3) ||
        draft.transition !== (entity.routeWaypointTransitions?.[index + 1] ?? "FLY_BY");
    })
  );

  useEffect(() => onValidityChange(valid && !dirty), [dirty, onValidityChange, valid]);

  const commitStart = () => {
    if (startError) return;
    const position = toPoint(start);
    // An installation reference identifies the geographic origin, not merely
    // a suggested map label. A horizontal move must not carry the old identity
    // into compilation.
    onChange(withAirborneStart(entity, position));
  };
  const commitHeading = () => {
    if (headingError || headingValue === null) return;
    onChange({ ...entity, headingDeg: headingValue });
  };
  const commitSpeed = () => {
    if (speedError || speedValue === null) return;
    onChange({ ...entity, speedMps: speedValue });
  };
  const commitWaypoint = (index: number) => {
    if (waypointErrors[index]) return;
    const route = [...entity.route];
    route[index + 1] = toPoint(waypoints[index]);
    const routeAcceptanceRadiiM = [...entity.routeAcceptanceRadiiM];
    routeAcceptanceRadiiM[index + 1] = waypoints[index].transition === "FLY_OVER"
      ? 1
      : Number(waypoints[index].acceptanceRadiusM);
    // Editing any legacy v1 route upgrades it to explicit v2 transitions.
    const routeWaypointTransitions = [...(entity.routeWaypointTransitions ??
      entity.route.map((_, routeIndex) => routeIndex === 0 ? "START" : "FLY_BY"))];
    routeWaypointTransitions[index + 1] = waypoints[index].transition;
    onChange({ ...entity, route, routeAcceptanceRadiiM, routeWaypointTransitions });
  };
  const updatePointDraft = <T extends PointDraft>(
    current: T,
    field: keyof T,
    value: string,
  ) => ({ ...current, [field]: value }) as T;
  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  return (
    <div className={`spatial-entity-editor ${team}`}>
      <div className="spatial-editor-heading">
        <span>Selected aircraft</span>
        <strong>{designation}</strong>
        <small>Coordinates use WGS84. Altitudes use metres MSL.</small>
      </div>
      <p className="origin-reference-state" role="status">
        {entity.originReference ? (
          <>
            <strong>Installation origin selected</strong>
            <span>
              {entity.originReference.installationId} · source {entity.originReference.sourceId}
            </span>
            <small>Changing longitude or latitude switches this to a manual airborne start.</small>
          </>
        ) : (
          <>
            <strong>Manual airborne start</strong>
            <small>No installation identity will be compiled for this aircraft.</small>
          </>
        )}
      </p>
      <fieldset>
        <legend>Airborne start</legend>
        <label>
          Longitude
          <input
            data-control-id={`spatial.${team}.start.longitude`}
            aria-invalid={Boolean(startError)}
            aria-describedby={startError ? `${id}-start-error` : undefined}
            inputMode="decimal"
            value={start.longitude}
            onChange={(event) =>
              setStart((current) => updatePointDraft(current, "longitude", event.target.value))
            }
            onBlur={commitStart}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          Latitude
          <input
            data-control-id={`spatial.${team}.start.latitude`}
            aria-invalid={Boolean(startError)}
            aria-describedby={startError ? `${id}-start-error` : undefined}
            inputMode="decimal"
            value={start.latitude}
            onChange={(event) =>
              setStart((current) => updatePointDraft(current, "latitude", event.target.value))
            }
            onBlur={commitStart}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          Altitude <span>m MSL</span>
          <input
            data-control-id={`spatial.${team}.start.altitude`}
            aria-invalid={Boolean(startError)}
            aria-describedby={startError ? `${id}-start-error` : undefined}
            inputMode="decimal"
            value={start.altitudeM}
            onChange={(event) =>
              setStart((current) => updatePointDraft(current, "altitudeM", event.target.value))
            }
            onBlur={commitStart}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          Heading <span>° true</span>
          <input
            data-control-id={`spatial.${team}.start.heading`}
            aria-invalid={Boolean(headingError)}
            aria-describedby={headingError ? `${id}-heading-error` : undefined}
            inputMode="decimal"
            value={heading}
            onChange={(event) => setHeading(event.target.value)}
            onBlur={commitHeading}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          True airspeed <span>m/s</span>
          <input
            data-control-id={`spatial.${team}.start.speed`}
            aria-invalid={Boolean(speedError)}
            aria-describedby={speedError ? `${id}-speed-error` : undefined}
            inputMode="decimal"
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
            onBlur={commitSpeed}
            onKeyDown={blurOnEnter}
          />
        </label>
      </fieldset>
      {startError && <p className="field-error" id={`${id}-start-error`}>{startError}</p>}
      {headingError && <p className="field-error" id={`${id}-heading-error`}>{headingError}</p>}
      {speedError && <p className="field-error" id={`${id}-speed-error`}>{speedError}</p>}

      <section className="route-coordinate-editor" aria-label={`${designation} route coordinates`}>
        <header>
          <div>
            <span>Flight route</span>
            <strong>{waypoints.length} {waypoints.length === 1 ? "waypoint" : "waypoints"}</strong>
            <small data-testid="compiled-route-plan-preview">
              Will compile as {ROUTE_PLAN_SCHEMA_VERSION}. Each waypoint is a fly-by or fly-over transition.
            </small>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextWaypoint = waypointDraft(
                entity.route.at(-1) ?? entity.position,
                DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
                "FLY_BY",
              );
              setWaypoints((current) => [...current, nextWaypoint]);
              onChange({
                ...entity,
                route: [...entity.route, toPoint(nextWaypoint)],
                routeAcceptanceRadiiM: [...entity.routeAcceptanceRadiiM, DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M],
                routeWaypointTransitions: [
                  ...(entity.routeWaypointTransitions ??
                    entity.route.map((_, routeIndex) => routeIndex === 0 ? "START" : "FLY_BY")),
                  "FLY_BY",
                ],
              });
            }}
          >
            Add by coordinates
          </button>
        </header>
        {waypoints.map((draft, index) => (
          <fieldset key={index}>
            <legend>Waypoint {index + 1}</legend>
            {(["longitude", "latitude", "altitudeM", "acceptanceRadiusM"] as const).map((field) => (
              <label key={field}>
                {field === "longitude" ? "Longitude" : field === "latitude" ? "Latitude" : field === "altitudeM" ? "Altitude" : "Acceptance radius"}
                {field === "altitudeM" && <span>m MSL</span>}
                {field === "acceptanceRadiusM" && <span>m</span>}
                <input
                  data-control-id={`spatial.${team}.route[*].${field}`}
                  aria-invalid={Boolean(waypointErrors[index])}
                  aria-describedby={waypointErrors[index] ? `${id}-waypoint-${index}-error` : undefined}
                  inputMode="decimal"
                  value={draft[field]}
                  disabled={field === "acceptanceRadiusM" && draft.transition === "FLY_OVER"}
                  onChange={(event) =>
                    setWaypoints((current) =>
                      current.map((point, pointIndex) =>
                        pointIndex === index
                          ? updatePointDraft(point, field, event.target.value)
                          : point,
                      ),
                    )
                  }
                  onBlur={() => commitWaypoint(index)}
                  onKeyDown={blurOnEnter}
                />
              </label>
            ))}
            <label>
              Transition
              <select
                data-control-id={`spatial.${team}.route[*].transition`}
                data-vector-overlay-exempt="ua-native-select"
                value={draft.transition}
                onChange={(event) =>
                  setWaypoints((current) => current.map((point, pointIndex) =>
                    pointIndex === index
                      ? {
                          ...point,
                          transition: event.target.value as WaypointDraft["transition"],
                          acceptanceRadiusM: event.target.value === "FLY_OVER" ? "1" : point.acceptanceRadiusM,
                        }
                      : point,
                  ))
                }
                onBlur={() => commitWaypoint(index)}
              >
                <option value="FLY_BY">Fly-by</option>
                <option value="FLY_OVER">Fly-over</option>
              </select>
            </label>
            {draft.transition === "FLY_OVER" && (
              <small>Fly-over uses the finite-step pass-through guard. Acceptance radius is fixed at 1 m.</small>
            )}
            <button
              type="button"
              onClick={() => {
                setWaypoints((current) => current.filter((_, itemIndex) => itemIndex !== index));
                onChange({
                  ...entity,
                  route: entity.route.filter((_, routeIndex) => routeIndex !== index + 1),
                  routeAcceptanceRadiiM: entity.routeAcceptanceRadiiM.filter((_, radiusIndex) => radiusIndex !== index + 1),
                  routeWaypointTransitions: (entity.routeWaypointTransitions ??
                    entity.route.map((_, routeIndex) => routeIndex === 0 ? "START" : "FLY_BY")
                  ).filter((_, transitionIndex) => transitionIndex !== index + 1),
                });
              }}
            >
              Remove waypoint {index + 1}
            </button>
            {waypointErrors[index] && (
              <p className="field-error" id={`${id}-waypoint-${index}-error`}>
                {waypointErrors[index]}
              </p>
            )}
          </fieldset>
        ))}
        {routeError && <p className="field-error">{routeError}</p>}
      </section>
      {(!valid || dirty) && (
        <p className="spatial-editor-status" role="status">
          {valid
            ? "Apply the edited flight input with Enter or by leaving the field."
            : "Correct the marked flight inputs before validation."}
        </p>
      )}
    </div>
  );
}
