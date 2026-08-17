"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type {
  ScenarioSpatialEntity,
  ScenarioSpatialPoint,
} from "@/lib/scenario-spatial";
import { hasNonZeroRouteLegs } from "@/lib/scenario-spatial";
import type { StudyArea } from "@/lib/study-areas";

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

const formatCoordinate = (value: number) => String(Number(value.toFixed(6)));
const formatScalar = (value: number) => String(Number(value.toFixed(3)));
const parseFinite = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function pointError(draft: PointDraft, area: StudyArea) {
  const longitude = parseFinite(draft.longitude);
  const latitude = parseFinite(draft.latitude);
  const altitudeM = parseFinite(draft.altitudeM);
  if (longitude === null || latitude === null || altitudeM === null) {
    return "Enter finite longitude, latitude, and altitude values.";
  }
  const [[west, south], [east, north]] = area.bounds;
  if (longitude < west || longitude > east || latitude < south || latitude > north) {
    return `Position must be inside ${area.shortName}.`;
  }
  if (altitudeM < 0 || altitudeM > 25_000) {
    return "Altitude must be from 0 to 25,000 m MSL.";
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
  const [waypoints, setWaypoints] = useState(() =>
    entity.route.slice(1).map(pointDraft),
  );

  const startError = pointError(start, studyArea);
  const headingValue = parseFinite(heading);
  const headingError =
    headingValue === null || headingValue < 0 || headingValue >= 360
      ? "Heading must be from 0 degrees inclusive to 360 degrees exclusive."
      : null;
  const speedValue = parseFinite(speed);
  const speedError =
    speedValue === null || speedValue < 0 || speedValue > 1_500
      ? "Speed must be from 0 to 1,500 m/s."
      : null;
  const waypointErrors = useMemo(
    () => waypoints.map((draft) => pointError(draft, studyArea)),
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
        !close(Number(draft.altitudeM), point.altitudeM, 1e-3);
    })
  );

  useEffect(() => onValidityChange(valid && !dirty), [dirty, onValidityChange, valid]);

  const commitStart = () => {
    if (startError) return;
    const position = toPoint(start);
    onChange({
      ...entity,
      position,
      route: entity.route.map((point, index) => (index === 0 ? position : point)),
    });
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
    onChange({ ...entity, route });
  };
  const updatePointDraft = (
    current: PointDraft,
    field: keyof PointDraft,
    value: string,
  ) => ({ ...current, [field]: value });
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
      <fieldset>
        <legend>Airborne start</legend>
        <label>
          Longitude
          <input
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
          </div>
          <button
            type="button"
            onClick={() => {
              const next = pointDraft(entity.route.at(-1) ?? entity.position);
              setWaypoints((current) => [...current, next]);
              onChange({ ...entity, route: [...entity.route, toPoint(next)] });
            }}
          >
            Add by coordinates
          </button>
        </header>
        {waypoints.map((draft, index) => (
          <fieldset key={index}>
            <legend>Waypoint {index + 1}</legend>
            {(["longitude", "latitude", "altitudeM"] as const).map((field) => (
              <label key={field}>
                {field === "longitude" ? "Longitude" : field === "latitude" ? "Latitude" : "Altitude"}
                {field === "altitudeM" && <span>m MSL</span>}
                <input
                  aria-invalid={Boolean(waypointErrors[index])}
                  aria-describedby={waypointErrors[index] ? `${id}-waypoint-${index}-error` : undefined}
                  inputMode="decimal"
                  value={draft[field]}
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
            <button
              type="button"
              onClick={() => {
                setWaypoints((current) => current.filter((_, itemIndex) => itemIndex !== index));
                onChange({
                  ...entity,
                  route: entity.route.filter((_, routeIndex) => routeIndex !== index + 1),
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
