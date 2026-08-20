"use client";

import { CircleAlert, Radio } from "lucide-react";
import type { SelectedTrackState } from "@/lib/frontend/selectors";

type Perspective = "IAF" | "PAF";

type Props = {
  selected: SelectedTrackState;
  perspective: Perspective;
  onPerspectiveChange: (perspective: Perspective) => void;
};

/**
 * Presentation-only inspector for a frozen observer-picture sample. It only
 * renders a selected recorded value and intentionally has no simulation input.
 */
export function TrackStateInspector({
  selected,
  perspective,
  onPerspectiveChange,
}: Props) {
  const unavailable = selected.state === "UNAVAILABLE";
  const track = unavailable ? null : selected.track;
  const stateLabel = selected.state === "UNAVAILABLE"
    ? "Unavailable"
    : selected.track.trackState.replaceAll("_", " ");
  const availability = selected.state === "UNAVAILABLE"
    ? selected.reason
    : selected.track.availabilityReason;

  return (
    <section className="right-card track-state-inspector" aria-label="Selected track state">
      <div className="right-title">
        <Radio size={15} aria-hidden="true" />
        <strong>Selected track state</strong>
        <span>{stateLabel}</span>
      </div>
      <div className="track-perspective-tabs" role="tablist" aria-label="Observer picture">
        {(["IAF", "PAF"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={perspective === candidate}
            onClick={() => onPerspectiveChange(candidate)}
          >
            {candidate} picture
          </button>
        ))}
      </div>
      {track ? (
        <>
          <dl className="track-state-data">
            <div><dt>Owner</dt><dd>{track.perspective}</dd></div>
            <div><dt>Lifecycle</dt><dd>{track.trackState.replaceAll("_", " ")}</dd></div>
            <div><dt>Freshness</dt><dd>{track.ageSeconds.toFixed(1)} s old</dd></div>
            <div><dt>Uncertainty</dt><dd>{track.visible ? `${Math.round(track.uncertaintyMeters)} m` : "Unavailable"}</dd></div>
            <div><dt>Source</dt><dd>{track.source}</dd></div>
            <div><dt>Cause</dt><dd>{track.availabilityReason.replaceAll("_", " ")}</dd></div>
          </dl>
          <p className="track-state-note">{track.stateExplanation}</p>
          {!track.visible && (
            <p className="track-state-unavailable" role="status">
              <CircleAlert size={14} aria-hidden="true" />
              No position is displayed. {availability.replaceAll("_", " ")} prevents an admitted current track.
            </p>
          )}
        </>
      ) : (
        <p className="track-state-unavailable" role="status">
          <CircleAlert size={14} aria-hidden="true" />
          No observer-picture sample was recorded at {selected.displayTimeSeconds.toFixed(1)} s. The inspector does not infer a track.
        </p>
      )}
    </section>
  );
}
