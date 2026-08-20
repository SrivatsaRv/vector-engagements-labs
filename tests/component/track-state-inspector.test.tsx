import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrackStateInspector } from "@/components/TrackStateInspector";
import type { SelectedTrackState } from "@/lib/frontend/selectors";

const selected: SelectedTrackState = Object.freeze({
  state: "AVAILABLE" as const,
  displayTimeSeconds: 12,
  track: Object.freeze({
    perspective: "IAF" as const,
    modelTimeSeconds: 12,
    trackId: "IAF-red-object-1-track-v1",
    classification: "Unidentified airborne track",
    identification: "UNKNOWN" as const,
    source: "Onboard radar",
    lastUpdateSeconds: 11.5,
    ageSeconds: 0.5,
    confidence: 80,
    uncertaintyMeters: 420,
    position: Object.freeze({ x: 1, y: 2, z: 3 }),
    observedEntityId: "red-object-1",
    visible: true,
    status: "TRACKING" as const,
    trackState: "CONFIRMED" as const,
    availabilityReason: "AVAILABLE" as const,
    effectScope: "AIR_PICTURE_ONLY" as const,
    stateExplanation: "Onboard radar updated this side-owned track at 11.50 s.",
  }),
});

describe("TrackStateInspector", () => {
  it("renders frozen canonical track state without mutating it", async () => {
    const user = userEvent.setup();
    const onPerspectiveChange = vi.fn();
    render(
      <TrackStateInspector
        selected={selected}
        perspective="IAF"
        onPerspectiveChange={onPerspectiveChange}
      />,
    );

    expect(screen.getByText("Selected track state")).toBeVisible();
    expect(screen.getAllByText("CONFIRMED")).toHaveLength(2);
    expect(screen.getByText("0.5 s old")).toBeVisible();
    expect(screen.getByText("420 m")).toBeVisible();
    expect(selected.track.ageSeconds).toBe(0.5);

    await user.click(screen.getByRole("tab", { name: "PAF picture" }));
    expect(onPerspectiveChange).toHaveBeenCalledWith("PAF");
    expect(selected.track.modelTimeSeconds).toBe(12);
  });

  it("does not replace a missing picture with zero-valued track data", () => {
    render(
      <TrackStateInspector
        selected={{
          state: "UNAVAILABLE",
          perspective: "PAF",
          displayTimeSeconds: 18,
          reason: "PICTURE_NOT_RECORDED",
        }}
        perspective="PAF"
        onPerspectiveChange={() => undefined}
      />,
    );

    expect(screen.getByText(/No observer-picture sample was recorded at 18\.0 s/i)).toBeVisible();
    expect(screen.queryByText("0 m")).not.toBeInTheDocument();
  });
});
