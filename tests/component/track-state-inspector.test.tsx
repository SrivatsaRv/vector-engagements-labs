import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrackStateInspector } from "@/components/TrackStateInspector";
import type { SelectedTrackState } from "@/lib/frontend/selectors";

const selected: SelectedTrackState = {
  state: "AVAILABLE",
  displayTimeSeconds: 12,
  track: {
    schemaVersion: "vector.observer-state.v2",
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

  it("renders every retained side-owned track in a mixed-lifecycle picture", () => {
    const source = { modelPackDigest: "7".repeat(64), sensorModelId: "generic-verification-sensor", sensorModelVersion: "1.0.0" };
    const makeTrack = (suffix: string, state: "CONFIRMED" | "COASTING") => ({
      schemaVersion: "vector.track.v1" as const,
      trackId: `IAF-TRACK-${suffix}`,
      owner: "IAF" as const,
      sourceAssociationId: `IAF-SOURCE-${suffix}`,
      source,
      sourceSequence: 4,
      sourceTimeSeconds: 0.15,
      state,
      estimate: { valueState: "ESTIMATED" as const, positionM: { x: 1, y: 2, z: 3 }, velocityMps: { x: 4, y: 5, z: 6 } },
      uncertainty: { valueState: "ESTIMATED" as const, positionStandardDeviationM: { x: 40, y: 40, z: 60 }, velocityStandardDeviationMps: { x: 3, y: 3, z: 4 } },
      updateCount: 4,
      ageSeconds: 0.05,
      freshUntilSeconds: 0.2,
      expiresAtSeconds: 0.3,
    });
    const multi: SelectedTrackState = {
      state: "AVAILABLE",
      displayTimeSeconds: 0.2,
      track: {
        schemaVersion: "vector.observer-state.v3",
        perspective: "IAF",
        sensorState: "SEARCH",
        observationCount: 0,
        trackCount: 2,
        visibleTrackCount: 2,
        scanReason: "SCAN_NOT_DUE",
        effectScope: "AIR_PICTURE_ONLY",
        stateExplanation: "Two tracks retained.",
        sensorModelId: source.sensorModelId,
        observations: [],
        tracks: [makeTrack("0001", "CONFIRMED"), makeTrack("0002", "COASTING")],
        modelTimeSeconds: 0.2,
      },
    };
    render(<TrackStateInspector selected={multi} perspective="IAF" onPerspectiveChange={() => undefined} />);
    expect(screen.getByText("IAF-TRACK-0001")).toBeVisible();
    expect(screen.getByText("IAF-TRACK-0002")).toBeVisible();
    expect(screen.getByText("CONFIRMED")).toBeVisible();
    expect(screen.getByText("COASTING")).toBeVisible();
  });
});
