"use client";

import { Crosshair, Map, Minus, Orbit, Plus, RotateCcw } from "lucide-react";
import type { VectorBasemap } from "@/lib/vector-map";

export type MapCameraTelemetry = {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

type Props = {
  basemap: VectorBasemap;
  camera: MapCameraTelemetry;
  paletteOpen: boolean;
  onPaletteToggle: () => void;
  onBasemap: (value: VectorBasemap) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTilt: () => void;
  onReset: () => void;
  onFit: () => void;
  fitLabel: string;
};

export function VectorMapControls({
  basemap,
  camera,
  paletteOpen,
  onPaletteToggle,
  onBasemap,
  onZoomIn,
  onZoomOut,
  onTilt,
  onReset,
  onFit,
  fitLabel,
}: Props) {
  return (
    <>
      <div className="vector-map-toolbar" aria-label="Map controls">
        <button type="button" title="Basemap" aria-label="Basemap" className={paletteOpen ? "active" : ""} onClick={onPaletteToggle}><Map size={15} /></button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}><Plus size={15} /></button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}><Minus size={15} /></button>
        <button type="button" title="Tilt preview" aria-label="Tilt preview" className={camera.pitch > 5 ? "active" : ""} onClick={onTilt}><Orbit size={15} /></button>
        <button type="button" title="Reset north and tilt" aria-label="Reset north and tilt" onClick={onReset}><RotateCcw size={15} /></button>
        <button type="button" title={fitLabel} aria-label={fitLabel} onClick={onFit}><Crosshair size={15} /></button>
      </div>
      {paletteOpen && (
        <div className="vector-basemap-palette" aria-label="Basemap selection">
          <span>BASEMAP</span>
          {(["STANDARD", "MINIMAL", "TACTICAL"] as const).map((mode) => (
            <button type="button" key={mode} className={basemap === mode ? "active" : ""} onClick={() => onBasemap(mode)}>
              <span>{mode === "STANDARD" ? "Standard" : mode === "MINIMAL" ? "Minimal" : "Tactical"}</span>
              <strong>{basemap === mode ? "ON" : "OFF"}</strong>
            </button>
          ))}
          <small>Tactical is a low-light context map. Simulation colors keep their affiliation meaning.</small>
        </div>
      )}
      <div className="vector-map-telemetry" aria-label="Map camera telemetry">
        <span>{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</span>
        <span>Z {camera.zoom.toFixed(1)}</span>
        <span>BRG {Math.round((camera.bearing + 360) % 360)}°</span>
        <span>TILT {Math.round(camera.pitch)}°</span>
      </div>
    </>
  );
}
