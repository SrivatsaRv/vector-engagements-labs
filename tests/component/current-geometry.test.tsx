import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrentGeometry } from "@/components/CurrentGeometry";
import { selectCurrentGeometry, selectDisplayFrame } from "@/lib/frontend/selectors";
import { createReferencePreview } from "@/lib/simulation";
import { getScenarioDefinition } from "@/lib/scenarios";

const result = createReferencePreview(
  getScenarioDefinition("a2a-crossing-intercept")!.scenario,
);

describe("CurrentGeometry", () => {
  it("renders the exact selected-frame relationship and never aliases a launch platform as a weapon", () => {
    const launchFrameIndex = result.frames.findIndex((frame) =>
      frame.entities.some((entity) => entity.id === result.engineRun.primaryWeaponId));
    expect(launchFrameIndex).toBeGreaterThan(0);
    const selected = selectDisplayFrame(result, result.frames[launchFrameIndex].t);
    const activeGeometry = selectCurrentGeometry(result, selected);
    const { rerender } = render(<CurrentGeometry geometry={activeGeometry} />);

    const panel = screen.getByLabelText("Current geometry");
    expect(panel).toHaveAttribute("data-display-time", String(selected.displayTimeSeconds));
    expect(panel).toHaveAttribute("data-frame-index", String(selected.frameIndex));
    expect(screen.getByText("WEAPON TO TARGET")).toBeVisible();
    expect(screen.getByText("Weapon speed")).toBeVisible();

    const prelaunchFrameIndex = launchFrameIndex - 1;
    const prelaunchTimeSeconds = result.frames[prelaunchFrameIndex].t;
    const beforeLaunch = selectCurrentGeometry(
      result,
      selectDisplayFrame(result, prelaunchTimeSeconds),
    );
    rerender(<CurrentGeometry geometry={beforeLaunch} />);
    expect(screen.getByText("AIRCRAFT TO TARGET")).toBeVisible();
    expect(screen.getByText("Not launched")).toBeVisible();
    expect(screen.queryByText("Weapon speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Weapon Mach")).not.toBeInTheDocument();
    expect(screen.queryByText("Relative-position diagram")).not.toBeInTheDocument();

    const held = {
      ...result,
      frames: result.frames.map((frame, index) => index !== prelaunchFrameIndex
        ? frame
        : {
            ...frame,
            entities: frame.entities.map((entity) => entity.id !== "blue-platform-1"
              ? entity
              : {
                  ...entity,
                  aircraftOperationalState: "HOLD_SHORT" as const,
                  aircraftMovementValueState: "UNAVAILABLE" as const,
                  aircraftMovementUnavailableReason: "GROUND_DYNAMICS_MODEL_UNAVAILABLE" as const,
                }),
          }),
    };
    rerender(<CurrentGeometry geometry={selectCurrentGeometry(
      held,
      selectDisplayFrame(held, prelaunchTimeSeconds),
    )} />);
    expect(screen.getByText("HOLD SHORT")).toBeVisible();
    expect(screen.getByText("UNAVAILABLE")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aircraft movement is unavailable. GROUND DYNAMICS MODEL UNAVAILABLE.",
    );

    for (const operationalState of ["TAKEOFF_ROLL", "ROTATE", "CLIMBOUT", "ENROUTE"] as const) {
      const valid = {
        ...result,
        frames: result.frames.map((frame, index) => index !== prelaunchFrameIndex
          ? frame
          : {
              ...frame,
              entities: frame.entities.map((entity) => entity.id !== "blue-platform-1"
                ? entity
                : {
                    ...entity,
                    aircraftOperationalState: operationalState,
                    aircraftMovementValueState: "VALID" as const,
                    aircraftMovementUnavailableReason: undefined,
                  }),
            }),
      };
      rerender(<CurrentGeometry geometry={selectCurrentGeometry(
        valid,
        selectDisplayFrame(valid, prelaunchTimeSeconds),
      )} />);
      expect(screen.getByText(operationalState.replaceAll("_", " "))).toBeVisible();
      expect(screen.getByText("VALID")).toBeVisible();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });
});
