"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { RaspTrack, SimulationResult } from "@/lib/simulation";
import { getFrameAt } from "@/lib/simulation";
import { DEFAULT_MAP_ORIGIN } from "@/lib/installations";
import { tacticalSymbolMarkup } from "@/lib/tactical-symbol-markup";
import { emitBrowserTelemetry } from "@/lib/observability/client";

export type MapInstallation = {
  id: string;
  service: "IAF" | "PAF";
  name: string;
  installation_type: string;
  longitude: number;
  latitude: number;
};

type Props = {
  result: SimulationResult;
  time: number;
  installations: MapInstallation[];
  raspTrack?: RaspTrack;
};
type Basemap = "MINIMAL" | "SATELLITE";
type MapScope = "ENGAGEMENT" | "REGION";

const minimalStyle = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 512,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
};
const satelliteStyle = {
  version: 8 as const,
  sources: {
    imagery: {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri World Imagery",
    },
  },
  layers: [{ id: "imagery", type: "raster" as const, source: "imagery" }],
};
const regionalFallback = {
  MINIMAL:
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/export?bbox=64,23,84,40&bboxSR=4326&imageSR=4326&size=1600,900&format=png32&f=image",
  SATELLITE:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=64,23,84,40&bboxSR=4326&imageSR=4326&size=1600,900&format=png32&f=image",
} satisfies Record<Basemap, string>;

function localToLngLat(position: { x: number; y: number }) {
  const latitude = DEFAULT_MAP_ORIGIN.latitude + position.y / 111320;
  const longitude =
    DEFAULT_MAP_ORIGIN.longitude +
    position.x / (111320 * Math.cos((DEFAULT_MAP_ORIGIN.latitude * Math.PI) / 180));
  return [longitude, latitude] as [number, number];
}

export function EngagementMap({ result, time, installations, raspTrack }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [basemap, setBasemap] = useState<Basemap>("MINIMAL");
  const [mapScope, setMapScope] = useState<MapScope>("ENGAGEMENT");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState("");

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
        style: basemap === "MINIMAL" ? minimalStyle : satelliteStyle,
        center: [DEFAULT_MAP_ORIGIN.longitude, DEFAULT_MAP_ORIGIN.latitude],
        zoom: 5.3,
        pitch: 34,
        bearing: 0,
        attributionControl: false,
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
        map.addSource("public-installations", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: installations.map((item) => ({
              type: "Feature" as const,
              properties: { name: item.name, service: item.service },
              geometry: { type: "Point" as const, coordinates: [item.longitude, item.latitude] },
            })),
          },
        });
        map.addLayer({
          id: "public-installations",
          type: "circle",
          source: "public-installations",
          paint: {
            "circle-radius": 4,
            "circle-color": ["match", ["get", "service"], "IAF", "#2f6fb5", "#a94f45"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "public-installation-labels",
          type: "symbol",
          source: "public-installations",
          minzoom: 5.5,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
          },
          paint: {
            "text-color": basemap === "SATELLITE" ? "#ffffff" : "#3f4a53",
            "text-halo-color": basemap === "SATELLITE" ? "#1c252c" : "#ffffff",
            "text-halo-width": 1,
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
        setMapStatus("ready");
        emitBrowserTelemetry({
          type: "map_loaded",
          basemap,
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
        basemap,
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
  }, [basemap, installations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") return;
    if (mapScope === "REGION") {
      map.fitBounds(
        [
          [66, 25],
          [79.5, 36],
        ],
        { padding: 46, duration: 250, pitch: 18 },
      );
      return;
    }
    const coordinates = result.frames.flatMap((frame) =>
      frame.entities
        .filter((entity) => entity.lifecycle !== "STOWED")
        .map((entity) => localToLngLat(entity.position)),
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
  }, [mapScope, mapStatus, result]);

  useEffect(() => {
    const map = mapRef.current;
    const frame = getFrameAt(result, time);
    if (!map || !frame || !map.isStyleLoaded()) return;
    import("maplibre-gl").then((maplibregl) => {
      const visibleEntityIds = new Set(frame.entities.map((entity) => entity.id));
      for (const [id, marker] of markers.current.entries()) {
        if (id === "rasp-uncertainty" || visibleEntityIds.has(id)) continue;
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
          createdMarker.setLngLat(localToLngLat(displayPosition)).addTo(map);
          markers.current.set(entity.id, createdMarker);
          marker = createdMarker;
        }
        marker.setLngLat(localToLngLat(displayPosition));
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
            .setLngLat(localToLngLat(raspTrack.position))
            .addTo(map);
          markers.current.set("rasp-uncertainty", uncertainty);
        }
        uncertainty.setLngLat(localToLngLat(raspTrack.position));
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
        features: frame.entities
          .filter((entity) => raspTrack?.observedEntityId !== entity.id)
          .map((entity) => ({
          type: "Feature" as const,
          properties: { affiliation: entity.affiliation, kind: entity.kind },
          geometry: {
            type: "LineString" as const,
            coordinates: result.frames
              .filter((sample) => sample.t <= time)
              .map((sample) => sample.entities.find((item) => item.id === entity.id))
              .filter((item) => item && item.lifecycle !== "STOWED")
              .map((item) => localToLngLat(item!.position)),
          },
        })),
      });
    });
  }, [result, time, basemap, raspTrack]);

  return (
    <div className="engagement-map-shell">
      <div className="map-basemap-switch" aria-label="Basemap">
        <button className={basemap === "MINIMAL" ? "active" : ""} onClick={() => setBasemap("MINIMAL")}>Minimal</button>
        <button className={basemap === "SATELLITE" ? "active" : ""} onClick={() => setBasemap("SATELLITE")}>Satellite</button>
      </div>
      <div className="map-scope-switch" aria-label="Map extent">
        <button
          className={mapScope === "ENGAGEMENT" ? "active" : ""}
          onClick={() => setMapScope("ENGAGEMENT")}
        >
          Engagement
        </button>
        <button
          className={mapScope === "REGION" ? "active" : ""}
          onClick={() => setMapScope("REGION")}
        >
          Region
        </button>
      </div>
      <Image
        className="map-static-fallback"
        src={regionalFallback[basemap]}
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        unoptimized
      />
      <div ref={mount} className="engagement-map" aria-label="Geographic engagement map" />
      {mapStatus !== "ready" && (
        <div className={`map-status ${mapStatus}`} role={mapStatus === "error" ? "alert" : "status"}>
          <strong>{mapStatus === "error" ? "Basemap unavailable" : "Loading basemap"}</strong>
          <span>{mapStatus === "error" ? mapError : "Preparing geographic context and overlays."}</span>
        </div>
      )}
      <div className="map-data-note">Public-reference installations · local scenario projection · not an operational map</div>
    </div>
  );
}
