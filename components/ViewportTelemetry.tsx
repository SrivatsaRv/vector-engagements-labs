"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { SimulationResult } from "@/lib/simulation";
import { TelemetryChart } from "@/components/TelemetryChart";
import { TargetEffectSummary } from "@/components/TargetEffectSummary";
import type { SelectedDisplayFrame } from "@/lib/frontend/selectors";
import {
  selectAirborneStoreTransferOutcomes,
  selectCanonicalTargetEffect,
} from "@/lib/frontend/selectors";

type Props = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  result: SimulationResult;
  selected: SelectedDisplayFrame;
};

/**
 * Presentation-only disclosure for canonical telemetry. The visibility choice
 * belongs to this browser session; it never changes the scenario or record.
 */
export function ViewportTelemetry({ expanded, onExpandedChange, result, selected }: Props) {
  const panelId = "synchronized-run-telemetry";
  const frame = selected.frame;
  const summary = frame
    ? `${(frame.range / 1000).toFixed(1)} km separation`
    : "Telemetry unavailable";
  const latestTransfer = selectAirborneStoreTransferOutcomes(result, selected).at(-1);
  const targetEffect = selectCanonicalTargetEffect(result, selected);

  return (
    <section
      className={`telemetry ${expanded ? "is-expanded" : "is-collapsed"}`}
      aria-label="Synchronized run telemetry"
      data-display-time={selected.displayTimeSeconds}
      data-frame-index={selected.frameIndex}
    >
      <div className="telemetry-title">
        <div>
          <strong>Synchronized run telemetry</strong>
          <span data-display-time={selected.displayTimeSeconds}>
            Computed at {selected.displayTimeSeconds.toFixed(1)} model seconds · {summary}
          </span>
          {latestTransfer && (
            <span
              data-testid="airborne-store-transfer-outcome"
              data-store-id={latestTransfer.storeId}
              data-station-id={latestTransfer.stationId}
              data-limiter={latestTransfer.limiter}
              data-cause={latestTransfer.cause}
            >
              Store {latestTransfer.operation.toLowerCase()} · {latestTransfer.achieved ? "achieved" : "rejected"} · frame {latestTransfer.frameIndex}
            </span>
          )}
          {!expanded && <TargetEffectSummary selection={targetEffect} compact />}
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
      {expanded && <TargetEffectSummary selection={targetEffect} />}
      <div id={panelId} hidden={!expanded}>
        <TelemetryChart result={result} selected={selected} />
      </div>
    </section>
  );
}
