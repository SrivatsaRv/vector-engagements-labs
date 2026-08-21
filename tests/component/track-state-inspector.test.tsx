import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrackStateInspector } from "@/components/TrackStateInspector";
import type { SelectedTrackState } from "@/lib/frontend/selectors";

const selected: SelectedTrackState = {
  state: "AVAILABLE",
  displayTimeSeconds: 12,
  track: {
    schemaVersion: "vector.observer-state.v1",
    perspective: "IAF",
    sensorState: "UNSUPPORTED",
    observationCount: 0,
    trackState: "UNSUPPORTED",
    visible: false,
    availabilityReason: "SENSOR_MODEL_UNAVAILABLE",
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: "No admitted sensor model pack is bound to this run.",
    modelTimeSeconds: 12,
    trackId: "UNAVAILABLE",
    classification: "UNAVAILABLE",
    identification: "UNKNOWN",
    source: "No admitted sensor model",
    lastUpdateSeconds: 12,
    ageSeconds: 0,
    confidence: 0,
    uncertaintyMeters: 0,
    status: "NO_TRACK",
  },
};

describe("TrackStateInspector", () => {
  it("shows an explicit unavailable observer state without a fabricated position", async () => {
    const user = userEvent.setup();
    const onPerspectiveChange = vi.fn();
    render(<TrackStateInspector selected={selected} perspective="IAF" onPerspectiveChange={onPerspectiveChange} />);

    expect(screen.getAllByText("UNSUPPORTED")).toHaveLength(2);
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText(/No position is displayed/i)).toBeVisible();
    expect(screen.queryByText(/80 km|420 m|red-object-1/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "PAF picture" }));
    expect(onPerspectiveChange).toHaveBeenCalledWith("PAF");
  });

  it("does not replace a missing picture with zero-valued track data", () => {
    render(<TrackStateInspector selected={{ state: "UNAVAILABLE", perspective: "PAF", displayTimeSeconds: 18, reason: "PICTURE_NOT_RECORDED" }} perspective="PAF" onPerspectiveChange={() => undefined} />);
    expect(screen.getByText(/No observer-picture sample was recorded at 18\.0 s/i)).toBeVisible();
    expect(screen.queryByText("0 m")).not.toBeInTheDocument();
  });
});
