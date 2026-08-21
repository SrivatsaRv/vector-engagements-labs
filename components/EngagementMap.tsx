"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Layers3 } from "lucide-react";
import { VectorMapControls, type MapCameraTelemetry } from "@/components/VectorMapControls";
import type { RaspTrack, SimulationResult } from "@/lib/simulation";
import { tacticalSymbolMarkup } from "@/lib/tactical-symbol-markup";
import { emitBrowserTelemetry } from "@/lib/observability/client";
import {
  selectObserverEntityPresentation,
  type SelectedDisplayFrame,
} from "@/lib/frontend/selectors";
import {
  buildCoverageFeatures,
  buildDeclaredRouteFeatures,
  buildDirectionVectorFeatures,
  buildInstallationFeatures,
  buildLaunchFeatures,
  buildTrackFeatures,
  circlePolygon,
  localToLngLat,
  recordedLngLat,
  type MapInstallationRecord,
} from "@/lib/map-layer-contracts";
import {
  buildVectorMapStyle,
  readVectorBasemap,
  setVectorBasemapVisibility,
  writeVectorBasemap,
  type VectorBasemap,
} from "@/lib/vector-map";

export type MapInstallation = MapInstallationRecord;

type Props = {
  result: SimulationResult;
  selected: SelectedDisplayFrame;
  installations: MapInstallation[];
  raspTrack?: RaspTrack;
  layoutRevision?: number;
};
type MapScope = "ENGAGEMENT" | "REGION";

export function EngagementMap({ result, selected, installations, raspTrack, layoutRevision = 0 }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [mapScope, setMapScope] = useState<MapScope>("ENGAGEMENT");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState("");
  const [basemap, setBasemap] = useState<VectorBasemap>("MINIMAL");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [camera, setCamera] = useState<MapCameraTelemetry>({
    longitude: 0,
    latitude: 0,
    zoom: 5.3,
    bearing: 0,
    pitch: 0,
  });
  const spatial = result.engineRun.scenario.environment.studyArea;
  const origin = spatial.anchor;

  useEffect(() => {
    queueMicrotask(() => setBasemap(readVectorBasemap()));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) setVectorBasemapVisibility(map, basemap);
    writeVectorBasemap(basemap);
  }, [basemap]);

  useEffect(() => {
    if (!mount.current) return;
    const mapStartedAt = performance.now();
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    setMapStatus("loading");
    setMapError("");
    const currentMarkers = markers.current;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mount.current) return;
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: mount.current,
        style: buildVectorMapStyle("MINIMAL"),
        center: [origin.longitude, origin.latitude],
        zoom: 5.3,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        dragRotate: true,
        touchZoomRotate: true,
        touchPitch: false,
        pitchWithRotate: false,
        maxPitch: 60,
        bearingSnap: 0,
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
      map.on("mousemove", (event) => {
        setCamera((current) => ({ ...current, longitude: event.lngLat.lng, latitude: event.lngLat.lat }));
      });
      map.on("error", (event) => {
        if (disposed) return;
        // A single remote tile can fail while the map and static regional
        // fallback remain usable. Only block the surface if initialization
        // itself fails before the style has loaded.
        if (!map.isStyleLoaded()) {
          setMapStatus("error");
          setMapError(event.error?.message ?? "Basemap could not be loaded");
        }
      });
      map.on("load", () => {
        map.resize();
        const activeBasemap = readVectorBasemap();
        setVectorBasemapVisibility(map, activeBasemap);
        const [[west, south], [east, north]] = spatial.bounds;
        map.addSource("study-area", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { name: spatial.name },
            geometry: {
              type: "Polygon",
              coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
            },
          },
        });
        map.addLayer({
          id: "study-area-fill",
          type: "fill",
          source: "study-area",
          paint: { "fill-color": "#2f6fb5", "fill-opacity": 0.035 },
        });
        map.addLayer({
          id: "study-area-outline",
          type: "line",
          source: "study-area",
          paint: { "line-color": "#6688a8", "line-width": 1, "line-dasharray": [5, 4] },
        });
        map.addSource("public-installations", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: buildInstallationFeatures(installations),
          },
        });
        for (const installation of installations) {
          const element = document.createElement("div");
          element.className = "map-tactical-marker map-installation-marker";
          const affiliation = installation.service === "IAF" ? "BLUE" : "RED";
          element.innerHTML = `${tacticalSymbolMarkup("BASE", affiliation, "ACTIVE", "AIR_BASE")}<span></span>`;
          const label = element.querySelector("span");
          if (label) label.textContent = installation.icao_code
            ? `${installation.name} · ${installation.icao_code}`
            : installation.name;
          element.title = `${installation.service} public-reference station · ${installation.name}${installation.icao_code ? ` · ${installation.icao_code}` : ""}`;
          const marker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([installation.longitude, installation.latitude])
            .addTo(map);
          currentMarkers.set(`installation:${installation.id}`, marker);
        }
        map.addSource("coverage-envelopes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: result.envelopes
              .filter((envelope) => envelope.radiusM > 0)
              .map((envelope) => {
                const definition = result.engineRun.scenario.entities.find(
                  (entity) => entity.id === envelope.entityId,
                );
                const center = localToLngLat(
                  definition?.initial.position ?? { x: 0, y: 0 },
                  origin,
                );
                return {
                  type: "Feature" as const,
                  properties: {
                    id: envelope.id,
                    kind: envelope.kind,
                    affiliation: envelope.affiliation,
                    label: envelope.label,
                  },
                  geometry: {
                    type: "Polygon" as const,
                    coordinates: circlePolygon(center, envelope.radiusM),
                  },
                };
              }),
          },
        });
        map.addLayer({
          id: "coverage-envelopes-fill",
          type: "fill",
          source: "coverage-envelopes",
          paint: {
            "fill-color": [
              "match", ["get", "kind"],
              "DETECTION", "#5c7f9f",
              "TRACKING", "#8e6a35",
              "ENGAGEMENT", "#a94f45",
              "#8b8f91",
            ],
            "fill-opacity": ["match", ["get", "kind"], "MINIMUM_RANGE", 0.04, 0.075],
          },
        });
        map.addLayer({
          id: "coverage-envelopes-outline",
          type: "line",
          source: "coverage-envelopes",
          paint: {
            "line-color": [
              "match", ["get", "kind"],
              "DETECTION", "#5c7f9f",
              "TRACKING", "#8e6a35",
              "ENGAGEMENT", "#a94f45",
              "#8b8f91",
            ],
            "line-width": 1.25,
            "line-dasharray": [4, 3],
          },
        });
        map.addSource("declared-routes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: buildDeclaredRouteFeatures(result, origin),
          },
        });
        map.addLayer({
          id: "declared-routes",
          type: "line",
          source: "declared-routes",
          paint: {
            "line-color": ["match", ["get", "affiliation"], "BLUE", "#2f6fb5", "RED", "#a94f45", "#606b73"],
            "line-width": 1,
            "line-opacity": 0.42,
            "line-dasharray": [7, 5],
          },
        });
        map.addSource("entity-tracks", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "entity-tracks",
          type: "line",
          source: "entity-tracks",
          paint: {
            "line-color": ["match", ["get", "affiliation"], "BLUE", "#2f6fb5", "RED", "#a94f45", "#606b73"],
            "line-width": ["match", ["get", "kind"], "GUIDED_WEAPON", 2.5, 1.4],
            "line-opacity": 0.8,
          },
        });
        map.addSource("direction-vectors", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "direction-vectors",
          type: "line",
          source: "direction-vectors",
          paint: {
            "line-color": ["match", ["get", "affiliation"], "BLUE", "#1f5f9e", "RED", "#983f36", "#4f5960"],
            "line-width": 2,
          },
        });
        const launchFeatures = buildLaunchFeatures(result, origin);
        map.addSource("launch-events", {
          type: "geojson",
          data: { type: "FeatureCollection", features: launchFeatures },
        });
        map.addLayer({
          id: "launch-events",
          type: "circle",
          source: "launch-events",
          filter: ["<=", ["get", "modelTime"], 0],
          paint: {
            "circle-radius": 6,
            "circle-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-stroke-color": ["match", ["get", "affiliation"], "BLUE", "#2f6fb5", "#a94f45"],
          },
        });
        map.addLayer({
          id: "launch-event-labels",
          type: "symbol",
          source: "launch-events",
          filter: ["<=", ["get", "modelTime"], 0],
          minzoom: 6,
          layout: {
            "text-field": ["concat", ["get", "label"], " · T+", ["to-string", ["get", "modelTime"]], "s"],
            "text-size": 10,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
          },
          paint: { "text-color": "#34424c", "text-halo-color": "#ffffff", "text-halo-width": 1 },
        });
        setMapStatus("ready");
        emitBrowserTelemetry({
          type: "map_loaded",
          basemap: activeBasemap,
          durationMs: performance.now() - mapStartedAt,
        });
      });
      mapRef.current = map;
    }).catch((error: unknown) => {
      if (disposed) return;
      setMapStatus("error");
      setMapError(error instanceof Error ? error.message : "Map renderer could not be loaded");
      emitBrowserTelemetry({
        type: "map_failed",
        basemap: readVectorBasemap(),
        durationMs: performance.now() - mapStartedAt,
      });
    });
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      for (const marker of currentMarkers.values()) marker.remove();
      currentMarkers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [installations, origin, result, spatial]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") return;
    if (mapScope === "REGION") {
      map.fitBounds(spatial.bounds, { padding: 46, duration: 220, pitch: 0 });
      return;
    }
    const coordinates = result.frames.flatMap((frame) =>
      frame.entities
        .filter((entity) => entity.lifecycle !== "STOWED")
        .map((entity) => recordedLngLat(
          frame.geographicPositions,
          entity.id,
          entity.position,
          origin,
        )),
    );
    if (coordinates.length < 2) return;
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 86, duration: 220, maxZoom: 9.4, pitch: 0 },
    );
  }, [mapScope, mapStatus, origin, result, spatial.bounds]);

  // ResizeObserver covers ordinary reflow. The disclosure commits a grid-row
  // change, so explicitly schedule the MapLibre resize after that commit too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const frame = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(frame);
  }, [layoutRevision]);

  useEffect(() => {
    const map = mapRef.current;
    const frame = selected.frame;
    const displayTimeSeconds = selected.displayTimeSeconds;
    if (!map || !frame || mapStatus !== "ready") return;
    import("maplibre-gl").then((maplibregl) => {
      const visibleEntityIds = new Set(frame.entities.map((entity) => entity.id));
      for (const [id, marker] of markers.current.entries()) {
        if (
          id === "rasp-uncertainty" ||
          id.startsWith("installation:") ||
          visibleEntityIds.has(id)
        ) continue;
        marker.remove();
        markers.current.delete(id);
      }
      const labelPriority = [...frame.entities]
        .sort((left, right) => {
          const score = (entity: typeof left) =>
            (entity.lifecycle === "ENGAGING" ? 40 : 0) +
            (entity.kind === "GUIDED_WEAPON" ? 20 : 0) +
            (entity.kind === "AIRCRAFT" ? 10 : 0);
          return score(right) - score(left) || left.id.localeCompare(right.id);
        })
        .reduce((priorities, entity, index) => priorities.set(entity.id, index), new Map<string, number>());
      for (const entity of frame.entities) {
        const observerPresentation = selectObserverEntityPresentation(raspTrack, entity.id);
        if (observerPresentation.state === "HIDDEN") {
          markers.current.get(entity.id)?.remove();
          markers.current.delete(entity.id);
          continue;
        }
        const displayPosition = entity.position;
        const displayLngLat = recordedLngLat(
          frame.geographicPositions,
          entity.id,
          displayPosition,
          origin,
        );
        let marker = markers.current.get(entity.id);
        if (!marker) {
          const element = document.createElement("div");
          element.className = "map-tactical-marker";
          element.innerHTML = `${tacticalSymbolMarkup(entity.kind, entity.affiliation, entity.lifecycle, entity.symbolRole)}<span></span>`;
          const label = element.querySelector("span");
          // Generated engine callsigns preserve replay identity but are not
          // useful operator labels. Default map presentation names the actual
          // catalog object; a later presentation setting may deliberately
          // switch to a declared scenario callsign.
          if (label) label.textContent = entity.designation;
          element.dataset.labelPriority = String(labelPriority.get(entity.id) ?? 99);
          element.title = `${entity.designation} · ${entity.lifecycle.toLowerCase()}`;
          const createdMarker = new maplibregl.Marker({ element, anchor: "center" });
          createdMarker.setLngLat(displayLngLat).addTo(map);
          markers.current.set(entity.id, createdMarker);
          marker = createdMarker;
        }
        marker.setLngLat(displayLngLat);
        marker.getElement().style.setProperty(
          "--entity-heading",
          `${90 - (entity.headingRad * 180) / Math.PI}deg`,
        );
        marker.getElement().classList.toggle("is-stowed", entity.lifecycle === "STOWED");
        marker.getElement().dataset.labelPriority = String(labelPriority.get(entity.id) ?? 99);
      }
      // No uncertainty marker is shown until an admitted sensor model emits a
      // side-owned position estimate.
      markers.current.get("rasp-uncertainty")?.getElement().setAttribute("hidden", "");
      const source = map.getSource("entity-tracks") as import("maplibre-gl").GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: buildTrackFeatures(
          result,
          frame,
          displayTimeSeconds,
          origin,
          undefined,
        ),
      });
      const vectors = map.getSource("direction-vectors") as import("maplibre-gl").GeoJSONSource | undefined;
      vectors?.setData({
        type: "FeatureCollection",
        features: buildDirectionVectorFeatures(frame, origin, undefined),
      });
      const coverage = map.getSource("coverage-envelopes") as import("maplibre-gl").GeoJSONSource | undefined;
      coverage?.setData({
        type: "FeatureCollection",
        features: buildCoverageFeatures(result, frame, origin),
      });
      const launchFilter: import("maplibre-gl").FilterSpecification = [
        "<=",
        ["get", "modelTime"],
        displayTimeSeconds,
      ];
      map.setFilter("launch-events", launchFilter);
      map.setFilter("launch-event-labels", launchFilter);
    });
  }, [mapStatus, origin, result, selected, raspTrack]);

  return (
    <div
      className="engagement-map-shell"
      data-display-frame-index={selected.frameIndex}
      data-display-time={selected.displayTimeSeconds}
    >
      <div className="map-scope-switch" aria-label="Map extent">
        <button
          className={mapScope === "ENGAGEMENT" ? "active" : ""}
          onClick={() => setMapScope("ENGAGEMENT")}
        >
          Fit run
        </button>
        <button
          className={mapScope === "REGION" ? "active" : ""}
          onClick={() => setMapScope("REGION")}
        >
          Study area
        </button>
      </div>
      <div ref={mount} className="engagement-map" aria-label="Geographic engagement map" />
      <VectorMapControls
        basemap={basemap}
        camera={camera}
        paletteOpen={paletteOpen}
        onPaletteToggle={() => setPaletteOpen((current) => !current)}
        onBasemap={(value) => { setBasemap(value); setPaletteOpen(false); }}
        onZoomIn={() => mapRef.current?.zoomIn({ duration: 120 })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: 120 })}
        onTilt={() => mapRef.current?.easeTo({ pitch: camera.pitch > 5 ? 0 : 52, duration: 220 })}
        onReset={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 220 })}
        onFit={() => setMapScope((current) => current === "ENGAGEMENT" ? "REGION" : "ENGAGEMENT")}
        fitLabel={mapScope === "ENGAGEMENT" ? "Fit study area" : "Fit run"}
      />
      {mapStatus !== "ready" && (
        <div className={`map-status ${mapStatus}`} role={mapStatus === "error" ? "alert" : "status"}>
          <strong>{mapStatus === "error" ? "Basemap unavailable" : "Loading basemap"}</strong>
          <span>{mapStatus === "error" ? mapError : "Preparing geographic context and overlays."}</span>
        </div>
      )}
      <details className="map-layer-legend">
        <summary><Layers3 size={14} aria-hidden="true" /> Layers <span>5 available</span></summary>
        <div aria-label="Map layer legend">
          <span><i className="route" />Declared route</span>
          <span><i className="track" />Recorded trajectory</span>
          <span><i className="sensor" />Sensor coverage</span>
          <span><i className="engagement" />Engagement envelope</span>
          <span><i className="launch" />Launch</span>
        </div>
      </details>
      <details className="map-context-disclosure">
        <summary><CircleHelp size={14} aria-hidden="true" /> Study area</summary>
        <div>
          <strong>{spatial.name}</strong>
          <p>Public educational area. This map gives geographic context only.</p>
          <p>Drag to pan. Use the controls for extent, layers and tilt preview.</p>
        </div>
      </details>
    </div>
  );
}
