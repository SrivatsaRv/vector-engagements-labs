"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogObject } from "@/lib/object-catalog";
import type { MapInstallation } from "@/components/EngagementMap";
import type { Scenario } from "@/lib/simulation";
import {
  createDefaultSpatialPlan,
  DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
  isPointInsideStudyArea,
  type ScenarioSpatialPlan,
} from "@/lib/scenario-spatial";
import type { StudyArea } from "@/lib/study-areas";
import { tacticalSymbolMarkup } from "@/lib/tactical-symbol-markup";
import { presentTacticalSymbol } from "@/lib/tactical-symbol-contract";
import { VectorMapControls, type MapCameraTelemetry } from "@/components/VectorMapControls";
import { SpatialEntityEditor } from "@/components/SpatialEntityEditor";
import {
  buildVectorMapStyle,
  readVectorBasemap,
  setVectorBasemapVisibility,
  writeVectorBasemap,
  type VectorBasemap,
} from "@/lib/vector-map";

type TeamKey = "blue" | "red";

function originReference(
  installation: MapInstallation,
  studyAreaId: string,
  weatherPresetId: string,
) {
  return {
    schemaVersion: "vector.installation-origin.v1" as const,
    installationId: installation.id,
    sourceId: installation.source_id,
    environment: {
      studyAreaId,
      weatherPresetId,
    },
  };
}

type Props = {
  scenario: Scenario;
  studyArea: StudyArea;
  blueObject: CatalogObject;
  redObject: CatalogObject;
  installations: MapInstallation[];
  onChange: (plan: ScenarioSpatialPlan) => void;
  onValidityChange: (valid: boolean) => void;
};

export function ScenarioAuthoringMap({
  scenario,
  studyArea,
  blueObject,
  redObject,
  installations,
  onChange,
  onValidityChange,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [selected, setSelected] = useState<TeamKey>("blue");
  const [tool, setTool] = useState<"MOVE" | "WAYPOINT">("MOVE");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [basemap, setBasemap] = useState<VectorBasemap>("MINIMAL");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [teamValidity, setTeamValidity] = useState({ blue: true, red: true });
  const [camera, setCamera] = useState<MapCameraTelemetry>({
    longitude: studyArea.anchor.longitude,
    latitude: studyArea.anchor.latitude,
    zoom: 5.3,
    bearing: 0,
    pitch: 0,
  });
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
  const reportSelectedValidity = useCallback(
    (valid: boolean) =>
      setTeamValidity((current) =>
        current[selected] === valid ? current : { ...current, [selected]: valid },
      ),
    [selected],
  );

  useEffect(() => {
    queueMicrotask(() => setBasemap(readVectorBasemap()));
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (map) setVectorBasemapVisibility(map, basemap);
    writeVectorBasemap(basemap);
  }, [basemap]);
  useEffect(() => {
    if (tool === "WAYPOINT") mapRef.current?.easeTo({ pitch: 0, duration: 140 });
  }, [tool]);

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
    onValidityChange(teamValidity.blue && teamValidity.red);
  }, [onValidityChange, teamValidity]);

  useEffect(() => {
    if (!mount.current) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const currentMarkers = markers.current;
    setReady(false);
    setMapError("");
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mount.current) return;
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: mount.current,
        style: buildVectorMapStyle("MINIMAL"),
        center: [studyArea.anchor.longitude, studyArea.anchor.latitude],
        zoom: 6.2,
        pitch: 0,
        bearing: 0,
        dragRotate: true,
        touchZoomRotate: true,
        touchPitch: false,
        pitchWithRotate: false,
        maxPitch: 60,
        bearingSnap: 0,
        maxBounds: [
          [studyArea.bounds[0][0] - 1, studyArea.bounds[0][1] - 1],
          [studyArea.bounds[1][0] + 1, studyArea.bounds[1][1] + 1],
        ],
      });
      map.touchZoomRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.dragRotate.enable();
      map.touchPitch.disable();
      map.keyboard.enable();
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mount.current);
      const updateCamera = () => {
        const center = map.getCenter();
        setCamera((current) => ({
          ...current,
          longitude: center.lng,
          latitude: center.lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: Math.max(0, Math.min(58, map.getPitch())),
        }));
      };
      map.on("move", updateCamera);
      map.on("zoom", updateCamera);
      map.on("rotate", updateCamera);
      map.on("mousemove", (event) => setCamera((current) => ({
        ...current,
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      })));
      map.on("error", (event) => {
        if (!map.isStyleLoaded()) setMapError(event.error?.message ?? "Basemap could not be loaded");
      });
      map.on("load", () => {
        map.resize();
        setVectorBasemapVisibility(map, readVectorBasemap());
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
          verticalDatum: "MSL" as const,
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
            routeAcceptanceRadiiM: [
              ...current[team].routeAcceptanceRadiiM,
              DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
            ],
          },
        });
        setMessage(`${team === "blue" ? "Blue" : "Red"} waypoint added.`);
      });
      mapRef.current = map;
    });
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
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
              verticalDatum: "MSL" as const,
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
          element.innerHTML = `${tacticalSymbolMarkup(presentTacticalSymbol({
            id: installation.id,
            designation: installation.name,
            kind: "BASE",
            affiliation: installation.service === "IAF" ? "BLUE" : "RED",
            lifecycle: "ACTIVE",
            symbolRole: "AIR_BASE",
            valueState: "WORLD",
          }))}<span>${installation.name}${installation.icao_code ? ` · ${installation.icao_code}` : ""}</span>`;
          element.title = `Use ${installation.name} as ${installation.service === "IAF" ? "Blue" : "Red"} origin`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const team: TeamKey = installation.service === "IAF" ? "blue" : "red";
            const current = planRef.current;
            const point = {
              longitude: installation.longitude,
              latitude: installation.latitude,
              altitudeM: current[team].position.altitudeM,
              verticalDatum: "MSL" as const,
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
                originReference: originReference(
                  installation,
                  scenario.studyAreaId,
                  scenario.weatherPresetId,
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
        const presentation = presentTacticalSymbol({
          id: `${team}:${object.id}`,
          designation: object.designation,
          kind: object.kind === "FIXED_SITE" ? "FIXED_OBJECTIVE" : object.kind,
          affiliation,
          lifecycle: "ACTIVE",
          symbolRole: object.symbolRole,
          headingRad: (entity.headingDeg * Math.PI) / 180,
          headingRequired: true,
          selected: selected === team,
          valueState: "WORLD",
        });
        const key = `entity:${team}`;
        activeKeys.add(key);
        let marker = markers.current.get(key);
        if (!marker) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = `authoring-entity-marker ${team}`;
          element.innerHTML = `${tacticalSymbolMarkup(presentation)}<span>${object.designation}</span>`;
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
              verticalDatum: "MSL" as const,
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
                originReference: undefined,
              },
            });
            setMessage(`${team === "blue" ? "Blue" : "Red"} start position updated.`);
          });
          markers.current.set(key, marker);
        }
        marker.setLngLat([entity.position.longitude, entity.position.latitude]);
        marker.getElement().classList.toggle("selected", selected === team);
        const symbol = marker.getElement().querySelector("svg");
        if (
          symbol?.getAttribute("data-selected") !== String(presentation.availability === "AVAILABLE" && presentation.selected)
          || symbol.getAttribute("data-availability") !== presentation.availability
        ) {
          marker.getElement().innerHTML = `${tacticalSymbolMarkup(presentation)}<span>${presentation.label.text}</span>`;
        }
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
                verticalDatum: "MSL" as const,
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
  }, [blueObject, installations, plan, ready, redObject, scenario.studyAreaId, scenario.weatherPresetId, selected, studyArea]);

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
        verticalDatum: "MSL" as const,
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
      verticalDatum: "MSL" as const,
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
        originReference: originReference(
          installation,
          scenario.studyAreaId,
          scenario.weatherPresetId,
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
                      {installation.name}{installation.icao_code ? ` · ${installation.icao_code}` : ""}
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
        <VectorMapControls
          basemap={basemap}
          camera={camera}
          paletteOpen={paletteOpen}
          onPaletteToggle={() => setPaletteOpen((current) => !current)}
          onBasemap={(value) => { setBasemap(value); setPaletteOpen(false); }}
          onZoomIn={() => mapRef.current?.zoomIn({ duration: 120 })}
          onZoomOut={() => mapRef.current?.zoomOut({ duration: 120 })}
          onTilt={() => {
            if (tool === "WAYPOINT") {
              setMessage("Tilt is disabled while placing waypoints so route geometry remains unambiguous.");
              return;
            }
            mapRef.current?.easeTo({ pitch: camera.pitch > 5 ? 0 : 52, duration: 220 });
          }}
          onReset={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 220 })}
          onFit={() => mapRef.current?.fitBounds(studyArea.bounds, { padding: 42, duration: 220, pitch: 0 })}
          fitLabel="Fit study area"
        />
        {!ready && <div className={`authoring-map-status${mapError ? " error" : ""}`}>{mapError || "Loading placement surface…"}</div>}
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
        <SpatialEntityEditor
          key={`${selected}:${JSON.stringify(selectedEntity)}`}
          team={selected}
          designation={selectedObject.designation}
          entity={selectedEntity}
          studyArea={studyArea}
          onChange={(entity) => updateEntity(selected, entity)}
          onValidityChange={reportSelectedValidity}
        />
        <div className="authoring-fields">
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
            <button disabled={selectedEntity.route.length <= 1} onClick={() => updateEntity(selected, { route: [selectedEntity.position], routeAcceptanceRadiiM: [1] })}>Clear route</button>
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
