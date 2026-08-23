import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteTransitionInspector } from "@/components/RouteTransitionInspector";
import { selectDisplayFrame, selectRouteTransitionStates } from "@/lib/frontend/selectors";
import { createReferencePreview } from "@/lib/simulation";
import { getScenarioDefinition } from "@/lib/scenarios";

const result = createReferencePreview(
  getScenarioDefinition("a2a-crossing-intercept")!.scenario,
);
const routeControlTime = result.frames.find((frame) =>
  frame.entities.some((entity) => entity.id === "blue-platform-1" && entity.aircraftControl)
)!.t;

describe("RouteTransitionInspector", () => {
  it("renders the selected-frame transition from the compiled route without changing the record", () => {
    const selected = selectDisplayFrame(result, routeControlTime);
    const originalFrame = structuredClone(selected.frame);
    render(<RouteTransitionInspector transitions={selectRouteTransitionStates(result, selected)} />);

    const inspector = screen.getByLabelText("Route transition state");
    expect(inspector).toHaveAttribute("data-display-time", String(selected.displayTimeSeconds));
    expect(inspector).toHaveAttribute("data-frame-index", String(selected.frameIndex));
    expect(screen.getAllByText("Fly-by").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Declared capture radius/i).length).toBeGreaterThan(0);
    expect(selected.frame).toEqual(originalFrame);
  });

  it("names legacy semantics and makes incomplete compiled control explicit", () => {
    const selected = selectDisplayFrame(result, routeControlTime);
    const transitions = selectRouteTransitionStates(result, selected).map((item, index) => index === 0 && item.state === "ACTIVE"
      ? { ...item, semantics: "LEGACY_ALL_FLY_BY" as const }
      : item);
    const { rerender } = render(<RouteTransitionInspector transitions={transitions} />);
    expect(screen.getByText(/Legacy v1 record/i)).toBeVisible();

    rerender(<RouteTransitionInspector transitions={[{
      state: "UNAVAILABLE",
      entityId: "blue-platform-1",
      designation: "Test aircraft",
      displayTimeSeconds: selected.displayTimeSeconds,
      frameIndex: selected.frameIndex,
      reason: "ROUTE_CONTROL_NOT_RECORDED",
    }]} />);
    expect(screen.getByText("Route control unavailable")).toBeVisible();
    expect(screen.queryByText(/capture radius/i)).not.toBeInTheDocument();
  });
});
