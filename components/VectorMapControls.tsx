"use client";

import { Crosshair, Map, Minus, Orbit, Plus, RotateCcw } from "lucide-react";
import type { VectorBasemap } from "@/lib/vector-map";
import { VectorSelect } from "@/components/ui/OverlayPrimitives";

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
        <VectorSelect
          className="vector-basemap-select"
          footer={<small>Tactical is a low-light context map. Simulation colors keep their affiliation meaning.</small>}
          header={<span>BASEMAP</span>}
          label="Basemap"
          matchTriggerWidth={false}
          maxWidth={260}
          onChange={onBasemap}
          options={(["STANDARD", "MINIMAL", "TACTICAL"] as const).map((mode) => ({
            value: mode,
            label: mode === "STANDARD" ? "Standard" : mode === "MINIMAL" ? "Minimal" : "Tactical",
          }))}
          renderOption={(option, state) => (
            <>
              <span>{option.label}</span>
              <strong>{state.selected ? "ON" : "OFF"}</strong>
            </>
          )}
          renderTrigger={() => <Map aria-hidden="true" size={15} />}
          showLabel={false}
          surfaceClassName="vector-basemap-palette"
          triggerClassName="vector-basemap-trigger"
          value={basemap}
        />
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}><Plus size={15} /></button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}><Minus size={15} /></button>
        <button type="button" title="Tilt preview" aria-label="Tilt preview" className={camera.pitch > 5 ? "active" : ""} onClick={onTilt}><Orbit size={15} /></button>
        <button type="button" title="Reset north and tilt" aria-label="Reset north and tilt" onClick={onReset}><RotateCcw size={15} /></button>
        <button type="button" title={fitLabel} aria-label={fitLabel} onClick={onFit}><Crosshair size={15} /></button>
      </div>
      <div className="vector-map-telemetry" aria-label="Map camera telemetry">
        <span>{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</span>
        <span>Z {camera.zoom.toFixed(1)}</span>
        <span>BRG {Math.round((camera.bearing + 360) % 360)}°</span>
        <span>TILT {Math.round(camera.pitch)}°</span>
      </div>
    </>
  );
}
