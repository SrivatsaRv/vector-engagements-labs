"use client";

import { CircleAlert, Target } from "lucide-react";
import type { SelectedGeometry } from "@/lib/frontend/selectors";

type Props = { geometry: SelectedGeometry };

function GeometryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Presentation only: all values arrive from selectCurrentGeometry. */
export function CurrentGeometry({ geometry }: Props) {
  return (
    <section
      className="right-card current-geometry"
      aria-label="Current geometry"
      data-display-time={geometry.displayTimeSeconds}
      data-frame-index={geometry.frameIndex}
    >
      <div className="right-title">
        <Target size={15} aria-hidden="true" />
        <strong>Current geometry</strong>
        <span>{geometry.state === "AVAILABLE" ? geometry.relationship.replaceAll("_", " ") : "Unavailable"}</span>
      </div>
      {geometry.state === "AVAILABLE" ? (
        <>
          <div className="geometry-data">
            <GeometryMetric label="Range" value={`${(geometry.rangeMeters / 1000).toFixed(1)} km`} />
            <GeometryMetric label="Closure" value={`${Math.round(geometry.closureRateMps)} m/s`} />
            <GeometryMetric label="LOS rate" value={`${geometry.lineOfSightRateRadS.toFixed(3)} rad/s`} />
            <GeometryMetric
              label="Weapon state"
              value={geometry.weapon.state === "AVAILABLE" ? geometry.weapon.flightState.replaceAll("_", " ") : "Not launched"}
            />
            {geometry.weapon.state === "AVAILABLE" && (
              <>
                <GeometryMetric label="Weapon speed" value={`${Math.round(geometry.weapon.speedMps)} m/s`} />
                <GeometryMetric label="Weapon Mach" value={geometry.weapon.mach.toFixed(2)} />
              </>
            )}
          </div>
          <p className="derived-note">
            {geometry.weapon.state === "AVAILABLE"
              ? "Weapon-to-target geometry is recorded by the selected engine frame."
              : "Aircraft-to-target geometry is derived from recorded aircraft state. Weapon values are unavailable before launch."}
          </p>
        </>
      ) : (
        <p className="track-state-unavailable" role="status">
          <CircleAlert size={14} aria-hidden="true" />
          Geometry is unavailable. {geometry.reason.replaceAll("_", " ")}.
        </p>
      )}
    </section>
  );
}
