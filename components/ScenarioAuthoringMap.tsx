"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogObject } from "@/lib/object-catalog";
import type { MapInstallation } from "@/components/EngagementMap";
import type { Scenario } from "@/lib/simulation";
import {
  createDefaultSpatialPlan,
  isPointInsideStudyArea,
  normalizeHeading,
  type ScenarioSpatialPlan,
} from "@/lib/scenario-spatial";
import type { StudyArea } from "@/lib/study-areas";
import { tacticalSymbolMarkup } from "@/lib/tactical-symbol-markup";

type TeamKey = "blue" | "red";

type Props = {
  scenario: Scenario;
  studyArea: StudyArea;
  blueObject: CatalogObject;
  redObject: CatalogObject;
  installations: MapInstallation[];
  onChange: (plan: ScenarioSpatialPlan) => void;
};

const style = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster" as const,
      tiles: ["/api/map-tile?z={z}&x={x}&y={y}"],
      tileSize: 512,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
};

export function ScenarioAuthoringMap({
  scenario,
  studyArea,
  blueObject,
  redObject,
  installations,
  onChange,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [selected, setSelected] = useState<TeamKey>("blue");
  const [tool, setTool] = useState<"MOVE" | "WAYPOINT">("MOVE");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const selectedRef = useRef(selected);
  const toolRef = useRef(tool);
  const onChangeRef = useRef(onChange);
  const plan = useMemo(
    () =>
      scenario.spatialPlan ??
      createDefaultSpatialPlan({
        studyArea,
        rangeM: scenario.range,
        blueAltitudeM: scenario.altitude,
        redAltitudeM: Math.max(0, scenario.altitude + scenario.targetDelta),
        blueSpeedMps: scenario.launcherSpeed,
        redSpeedMps: scenario.targetSpeed,
        crossingAngleDeg: scenario.aspect,
      }),
    [scenario, studyArea],
  );
  const planRef = useRef(plan);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    planRef.current = plan;
    if (!scenario.spatialPlan) onChangeRef.current(plan);
  }, [plan, scenario.spatialPlan]);

  useEffect(() => {
    if (!mount.current) return;
    let disposed = false;
    const currentMarkers = markers.current;
    setReady(false);
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mount.current) return;
      const map = new maplibregl.Map({
        container: mount.current,
        style,
        center: [studyArea.anchor.longitude, studyArea.anchor.latitude],
        zoom: 6.2,
        pitch: 18,
        bearing: 0,
        dragRotate: true,
        touchPitch: true,
        maxBounds: [
          [studyArea.bounds[0][0] - 1, studyArea.bounds[0][1] - 1],
          [studyArea.bounds[1][0] + 1, studyArea.bounds[1][1] + 1],
        ],
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: true }),
        "top-right",
      );
      map.on("load", () => {
        const [[west, south], [east, north]] = studyArea.bounds;
        map.addSource("authoring-area", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [west, south],
                  [east, south],
                  [east, north],
                  [west, north],
                  [west, south],
                ],
              ],
            },
          },
        });
        map.addLayer({
          id: "authoring-area-fill",
          type: "fill",
          source: "authoring-area",
          paint: { "fill-color": "#2f6fb5", "fill-opacity": 0.035 },
        });
        map.addLayer({
          id: "authoring-area-outline",
          type: "line",
          source: "authoring-area",
          paint: {
            "line-color": "#5c7f9f",
            "line-width": 1.25,
            "line-dasharray": [5, 4],
          },
        });
        map.addSource("authoring-routes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "authoring-routes",
          type: "line",
          source: "authoring-routes",
          paint: {
            "line-color": [
              "match",
              ["get", "team"],
              "blue",
              "#2f6fb5",
              "#a94f45",
            ],
            "line-width": 2,
            "line-dasharray": [6, 4],
          },
        });
        map.fitBounds(studyArea.bounds, { padding: 42, duration: 0 });
        setReady(true);
      });
      map.on("click", (event) => {
        if (toolRef.current !== "WAYPOINT") return;
        const current = planRef.current;
        const team = selectedRef.current;
        const nextPoint = {
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          altitudeM: current[team].position.altitudeM,
        };
        if (!isPointInsideStudyArea(nextPoint, studyArea)) {
          setMessage("Waypoint rejected: keep it inside the selected study area.");
          return;
        }
        onChangeRef.current({
          ...current,
          [team]: {
            ...current[team],
            route: [...current[team].route, nextPoint],
          },
        });
        setMessage(`${team === "blue" ? "Blue" : "Red"} waypoint added.`);
      });
      mapRef.current = map;
    });
    return () => {
      disposed = true;
      for (const marker of currentMarkers.values()) marker.remove();
      currentMarkers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [studyArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    import("maplibre-gl").then((maplibregl) => {
      const activeKeys = new Set<string>();
      const objects = { blue: blueObject, red: redObject };
      for (const installation of installations) {
        if (
          !isPointInsideStudyArea(
            {
              longitude: installation.longitude,
              latitude: installation.latitude,
              altitudeM: 0,
            },
            studyArea,
          )
        ) continue;
        const key = `installation:${installation.id}`;
        activeKeys.add(key);
        let installationMarker = markers.current.get(key);
        if (!installationMarker) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = `authoring-installation-marker ${installation.service === "IAF" ? "blue" : "red"}`;
          element.innerHTML = `${tacticalSymbolMarkup("BASE", installation.service === "IAF" ? "BLUE" : "RED", "ACTIVE", "AIR_BASE")}<span>${installation.name}</span>`;
          element.title = `Use ${installation.name} as ${installation.service === "IAF" ? "Blue" : "Red"} origin`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const team: TeamKey = installation.service === "IAF" ? "blue" : "red";
            const current = planRef.current;
            const point = {
              longitude: installation.longitude,
              latitude: installation.latitude,
              altitudeM: current[team].position.altitudeM,
            };
            setSelected(team);
            onChangeRef.current({
              ...current,
              [team]: {
                ...current[team],
                position: point,
                route: current[team].route.map((routePoint, index) =>
                  index === 0 ? point : routePoint,
                ),
              },
            });
            setMessage(`${installation.name} selected as the ${team === "blue" ? "Blue" : "Red"} origin.`);
          });
          installationMarker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([installation.longitude, installation.latitude])
            .addTo(map);
          markers.current.set(key, installationMarker);
        }
      }
      for (const team of ["blue", "red"] as const) {
        const entity = plan[team];
        const object = objects[team];
        const affiliation = team === "blue" ? "BLUE" : "RED";
        const key = `entity:${team}`;
        activeKeys.add(key);
        let marker = markers.current.get(key);
        if (!marker) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = `authoring-entity-marker ${team}`;
          element.innerHTML = `${tacticalSymbolMarkup(
            object.kind === "FIXED_SITE" ? "FIXED_OBJECTIVE" : object.kind,
            affiliation,
            "ACTIVE",
            object.symbolRole,
          )}<span>${object.designation}</span>`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            setSelected(team);
          });
          marker = new maplibregl.Marker({
            element,
            anchor: "center",
            draggable: true,
          })
            .setLngLat([
              entity.position.longitude,
              entity.position.latitude,
            ])
            .addTo(map);
          marker.on("dragend", () => {
            const position = marker!.getLngLat();
            const current = planRef.current;
            const point = {
              longitude: position.lng,
              latitude: position.lat,
              altitudeM: current[team].position.altitudeM,
            };
            if (!isPointInsideStudyArea(point, studyArea)) {
              marker!.setLngLat([
                current[team].position.longitude,
                current[team].position.latitude,
              ]);
              setMessage("Placement rejected: keep the entity inside the selected study area.");
              return;
            }
            onChangeRef.current({
              ...current,
              [team]: {
                ...current[team],
                position: point,
                route: current[team].route.map((routePoint, index) =>
                  index === 0 ? point : routePoint,
                ),
              },
            });
            setMessage(`${team === "blue" ? "Blue" : "Red"} start position updated.`);
          });
          markers.current.set(key, marker);
        }
        marker.setLngLat([entity.position.longitude, entity.position.latitude]);
        marker.getElement().classList.toggle("selected", selected === team);
        marker.getElement().style.setProperty(
          "--entity-heading",
          `${entity.headingDeg}deg`,
        );

        entity.route.slice(1).forEach((waypoint, index) => {
          const waypointKey = `waypoint:${team}:${index + 1}`;
          activeKeys.add(waypointKey);
          let waypointMarker = markers.current.get(waypointKey);
          if (!waypointMarker) {
            const element = document.createElement("button");
            element.type = "button";
            element.className = `authoring-waypoint-marker ${team}`;
            element.textContent = String(index + 1);
            element.title = `${team === "blue" ? "Blue" : "Red"} waypoint ${index + 1}`;
            waypointMarker = new maplibregl.Marker({
              element,
              anchor: "center",
              draggable: true,
            })
              .setLngLat([waypoint.longitude, waypoint.latitude])
              .addTo(map);
            waypointMarker.on("dragend", () => {
              const position = waypointMarker!.getLngLat();
              const current = planRef.current;
              const routeIndex = index + 1;
              const currentWaypoint = current[team].route[routeIndex];
              const point = {
                longitude: position.lng,
                latitude: position.lat,
                altitudeM:
                  currentWaypoint?.altitudeM ??
                  current[team].position.altitudeM,
              };
              if (!isPointInsideStudyArea(point, studyArea)) {
                if (currentWaypoint) {
                  waypointMarker!.setLngLat([
                    currentWaypoint.longitude,
                    currentWaypoint.latitude,
                  ]);
                }
                setMessage("Waypoint rejected: keep it inside the selected study area.");
                return;
              }
              onChangeRef.current({
                ...current,
                [team]: {
                  ...current[team],
                  route: current[team].route.map((candidate, candidateIndex) =>
                    candidateIndex === routeIndex ? point : candidate,
                  ),
                },
              });
            });
            markers.current.set(waypointKey, waypointMarker);
          }
          waypointMarker.setLngLat([waypoint.longitude, waypoint.latitude]);
        });
      }
      for (const [key, marker] of markers.current) {
        if (activeKeys.has(key)) continue;
        marker.remove();
        markers.current.delete(key);
      }
      const routeSource = map.getSource(
        "authoring-routes",
      ) as import("maplibre-gl").GeoJSONSource;
      routeSource?.setData({
        type: "FeatureCollection",
        features: (["blue", "red"] as const).flatMap((team) =>
          plan[team].route.length > 1
            ? [
                {
                  type: "Feature" as const,
                  properties: { team },
                  geometry: {
                    type: "LineString" as const,
                    coordinates: plan[team].route.map((point) => [
                      point.longitude,
                      point.latitude,
                    ]),
                  },
                },
              ]
            : [],
        ),
      });
    });
  }, [blueObject, installations, plan, ready, redObject, selected, studyArea]);

  const updateEntity = (
    team: TeamKey,
    patch: Partial<ScenarioSpatialPlan[TeamKey]>,
  ) => onChange({ ...plan, [team]: { ...plan[team], ...patch } });
  const selectedEntity = plan[selected];
  const selectedObject = selected === "blue" ? blueObject : redObject;
  const availableOrigins = installations.filter((installation) =>
    isPointInsideStudyArea(
      {
        longitude: installation.longitude,
        latitude: installation.latitude,
        altitudeM: 0,
      },
      studyArea,
    ),
  );
  const selectOrigin = (team: TeamKey, installation: MapInstallation) => {
    const entity = plan[team];
    const position = {
      longitude: installation.longitude,
      latitude: installation.latitude,
      altitudeM: entity.position.altitudeM,
    };
    setSelected(team);
    onChange({
      ...plan,
      [team]: {
        ...entity,
        position,
        route: entity.route.map((point, index) =>
          index === 0 ? position : point,
        ),
      },
    });
    setMessage(`${installation.name} selected as the ${team === "blue" ? "Blue" : "Red"} origin.`);
  };

  return (
    <section className="scenario-authoring-surface">
      <header>
        <div>
          <span>MAP AUTHORING</span>
          <strong>Place the selected forces inside {studyArea.shortName}.</strong>
          <p>
            Choose a public-reference base or drag either aircraft to its start
            position. Altitude, heading, speed, and any planned route compile
            into the same scenario state.
          </p>
        </div>
        <div className="origin-pickers" aria-label="Team origin selection">
          {(["blue", "red"] as const).map((team) => {
            const service = team === "blue" ? "IAF" : "PAF";
            const options = availableOrigins.filter((item) => item.service === service);
            return (
              <details className={team} key={team}>
                <summary>{team === "blue" ? "Blue" : "Red"} origin</summary>
                <div>
                  {options.length ? options.map((installation) => (
                    <button key={installation.id} onClick={() => selectOrigin(team, installation)} type="button">
                      {installation.name}
                    </button>
                  )) : <span>No {service} base in this study area. Drag the start marker instead.</span>}
                </div>
              </details>
            );
          })}
        </div>
      </header>
      <div className="scenario-authoring-map-shell">
        <div ref={mount} className="scenario-authoring-map" aria-label="Scenario placement map" />
        {!ready && <div className="authoring-map-status">Loading placement surface…</div>}
        <div className="authoring-map-scope">Preset boundary · {studyArea.shortName}</div>
      </div>
      <div className="authoring-inspector">
        <div className="authoring-team-tabs">
          {(["blue", "red"] as const).map((team) => (
            <button key={team} className={selected === team ? "active" : ""} onClick={() => setSelected(team)}>
              {team === "blue" ? "Blue Team" : "Red Team"} · {team === "blue" ? blueObject.designation : redObject.designation}
            </button>
          ))}
        </div>
        <div className="authoring-fields">
          <label>Altitude <span>m ASL</span><input type="number" min={0} max={25000} value={Math.round(selectedEntity.position.altitudeM)} onChange={(event) => updateEntity(selected, { position: { ...selectedEntity.position, altitudeM: Number(event.target.value) } })} /></label>
          <label>Heading <span>degrees true</span><input type="number" min={0} max={359} value={Math.round(selectedEntity.headingDeg)} onChange={(event) => updateEntity(selected, { headingDeg: normalizeHeading(Number(event.target.value)) })} /></label>
          <label>Speed <span>m/s</span><input type="number" min={0} max={1500} value={Math.round(selectedEntity.speedMps)} onChange={(event) => updateEntity(selected, { speedMps: Math.max(0, Number(event.target.value)) })} /></label>
          <div className="authoring-route-summary">
            <span>Declared route</span>
            <strong>
              {Math.max(0, selectedEntity.route.length - 1)}{
                selectedEntity.route.length === 2 ? " waypoint" : " waypoints"
              }
            </strong>
            <button
              className={tool === "WAYPOINT" ? "active" : ""}
              onClick={() => setTool(tool === "WAYPOINT" ? "MOVE" : "WAYPOINT")}
              type="button"
            >
              {tool === "WAYPOINT"
                ? `Click map for ${selected === "blue" ? "Blue" : "Red"} waypoint`
                : `Add ${selected === "blue" ? "Blue" : "Red"} waypoint`}
            </button>
            <button disabled={selectedEntity.route.length <= 1} onClick={() => updateEntity(selected, { route: [selectedEntity.position] })}>Clear route</button>
          </div>
        </div>
        <p className="authoring-selection-note">
          Editing {selectedObject.designation}. Scope: this scenario draft only.
        </p>
        {message && <p className="authoring-message" role="status">{message}</p>}
      </div>
    </section>
  );
}
