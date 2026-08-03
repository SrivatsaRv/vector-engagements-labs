"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { RaspTrack, SimulationResult } from "@/lib/simulation";
import { getFrameAt } from "@/lib/simulation";
import { tacticalSymbolMarkup } from "@/lib/tactical-symbol-markup";
import { emitBrowserTelemetry } from "@/lib/observability/client";
import {
  buildCoverageFeatures,
  buildDeclaredRouteFeatures,
  buildDirectionVectorFeatures,
  buildInstallationFeatures,
  buildLaunchFeatures,
  buildTrackFeatures,
  circlePolygon,
  localToLngLat,
  type MapInstallationRecord,
} from "@/lib/map-layer-contracts";

export type MapInstallation = MapInstallationRecord;

type Props = {
  result: SimulationResult;
  time: number;
  installations: MapInstallation[];
  raspTrack?: RaspTrack;
};
type MapScope = "ENGAGEMENT" | "REGION";

const minimalStyle = {
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
export function EngagementMap({ result, time, installations, raspTrack }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [mapScope, setMapScope] = useState<MapScope>("ENGAGEMENT");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState("");
  const spatial = result.engineRun.scenario.environment.studyArea;
  const origin = spatial.anchor;

  useEffect(() => {
    if (!mount.current) return;
    const mapStartedAt = performance.now();
    let disposed = false;
    setMapStatus("loading");
    setMapError("");
    const currentMarkers = markers.current;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mount.current) return;
      const map = new maplibregl.Map({
        container: mount.current,
        style: minimalStyle,
        center: [origin.longitude, origin.latitude],
        zoom: 5.3,
        pitch: 34,
        bearing: 0,
        attributionControl: false,
        dragRotate: true,
        touchPitch: true,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
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
          element.innerHTML = `${tacticalSymbolMarkup("BASE", affiliation, "ACTIVE")}<span></span>`;
          const label = element.querySelector("span");
          if (label) label.textContent = installation.name;
          element.title = `${installation.service} public-reference station · ${installation.name}`;
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
          basemap: "MINIMAL",
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
        basemap: "MINIMAL",
        durationMs: performance.now() - mapStartedAt,
      });
    });
    return () => {
      disposed = true;
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
      map.fitBounds(spatial.bounds, { padding: 46, duration: 250, pitch: 18 });
      return;
    }
    const coordinates = result.frames.flatMap((frame) =>
      frame.entities
        .filter((entity) => entity.lifecycle !== "STOWED")
        .map((entity) => localToLngLat(entity.position, origin)),
    );
    if (coordinates.length < 2) return;
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 86, duration: 250, maxZoom: 9.4, pitch: 26 },
    );
  }, [mapScope, mapStatus, origin, result, spatial.bounds]);

  useEffect(() => {
    const map = mapRef.current;
    const frame = getFrameAt(result, time);
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
      for (const entity of frame.entities) {
        const isObservedTrack = raspTrack?.observedEntityId === entity.id;
        const displayPosition = isObservedTrack && raspTrack?.visible
          ? raspTrack.position
          : entity.position;
        let marker = markers.current.get(entity.id);
        if (!marker) {
          const element = document.createElement("div");
          element.className = "map-tactical-marker";
          element.innerHTML = `${tacticalSymbolMarkup(entity.kind, entity.affiliation, entity.lifecycle)}<span></span>`;
          const label = element.querySelector("span");
          if (label) label.textContent = entity.callsign || entity.designation;
          element.title = `${entity.designation} · ${entity.lifecycle.toLowerCase()}`;
          const createdMarker = new maplibregl.Marker({ element, anchor: "center" });
          createdMarker.setLngLat(localToLngLat(displayPosition, origin)).addTo(map);
          markers.current.set(entity.id, createdMarker);
          marker = createdMarker;
        }
        marker.setLngLat(localToLngLat(displayPosition, origin));
        marker.getElement().style.setProperty(
          "--entity-heading",
          `${90 - (entity.headingRad * 180) / Math.PI}deg`,
        );
        marker.getElement().classList.toggle("is-stowed", entity.lifecycle === "STOWED");
        marker.getElement().classList.toggle(
          "is-hidden-track",
          Boolean(isObservedTrack && !raspTrack?.visible),
        );
      }
      let uncertainty = markers.current.get("rasp-uncertainty");
      if (raspTrack?.visible) {
        if (!uncertainty) {
          const element = document.createElement("div");
          element.className = "map-rasp-uncertainty";
          uncertainty = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat(localToLngLat(raspTrack.position, origin))
            .addTo(map);
          markers.current.set("rasp-uncertainty", uncertainty);
        }
        uncertainty.setLngLat(localToLngLat(raspTrack.position, origin));
        uncertainty.getElement().style.setProperty(
          "--track-uncertainty",
          `${Math.max(18, Math.min(82, raspTrack.uncertaintyMeters / 55))}px`,
        );
        uncertainty.getElement().hidden = false;
      } else if (uncertainty) {
        uncertainty.getElement().hidden = true;
      }
      const source = map.getSource("entity-tracks") as import("maplibre-gl").GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: buildTrackFeatures(
          result,
          frame,
          time,
          origin,
          raspTrack?.observedEntityId,
        ),
      });
      const vectors = map.getSource("direction-vectors") as import("maplibre-gl").GeoJSONSource | undefined;
      vectors?.setData({
        type: "FeatureCollection",
        features: buildDirectionVectorFeatures(frame, origin),
      });
      const coverage = map.getSource("coverage-envelopes") as import("maplibre-gl").GeoJSONSource | undefined;
      coverage?.setData({
        type: "FeatureCollection",
        features: buildCoverageFeatures(result, frame, origin),
      });
      const launchFilter: import("maplibre-gl").FilterSpecification = [
        "<=",
        ["get", "modelTime"],
        time,
      ];
      map.setFilter("launch-events", launchFilter);
      map.setFilter("launch-event-labels", launchFilter);
    });
  }, [mapStatus, origin, result, time, raspTrack]);

  return (
    <div className="engagement-map-shell">
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
      {mapStatus !== "ready" && (
        <div className={`map-status ${mapStatus}`} role={mapStatus === "error" ? "alert" : "status"}>
          <strong>{mapStatus === "error" ? "Basemap unavailable" : "Loading basemap"}</strong>
          <span>{mapStatus === "error" ? mapError : "Preparing geographic context and overlays."}</span>
        </div>
      )}
      <div className="map-layer-legend" aria-label="Map layer legend">
        <span><i className="route" />Declared route</span>
        <span><i className="track" />Recorded trajectory</span>
        <span><i className="sensor" />Sensor coverage</span>
        <span><i className="engagement" />Engagement envelope</span>
        <span><i className="launch" />Launch</span>
      </div>
      <div className="map-data-note">{spatial.name} · public educational area · pan, zoom, rotate, and tilt enabled</div>
    </div>
  );
}
