"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { SimulationResult } from "@/lib/simulation";
import { TelemetryChart } from "@/components/TelemetryChart";

type Props = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  result: SimulationResult;
  time: number;
};

/**
 * Presentation-only disclosure for canonical telemetry. The visibility choice
 * belongs to this browser session; it never changes the scenario or record.
 */
export function ViewportTelemetry({ expanded, onExpandedChange, result, time }: Props) {
  const panelId = "synchronized-run-telemetry";
  const frame = result.frames.reduce((nearest, candidate) =>
    Math.abs(candidate.t - time) < Math.abs(nearest.t - time) ? candidate : nearest,
  result.frames[0]);
  const summary = frame
    ? `${(frame.range / 1000).toFixed(1)} km separation`
    : "Telemetry unavailable";

  return (
    <section className={`telemetry ${expanded ? "is-expanded" : "is-collapsed"}`} aria-label="Synchronized run telemetry">
      <div className="telemetry-title">
        <div>
          <strong>Synchronized run telemetry</strong>
          <span>Computed at {time.toFixed(1)} model seconds · {summary}</span>
        </div>
        <button
          type="button"
          className="telemetry-disclosure"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
          {expanded ? "Collapse telemetry" : "Expand telemetry"}
        </button>
      </div>
      <div id={panelId} hidden={!expanded}>
        <TelemetryChart result={result} time={time} />
      </div>
    </section>
  );
}
