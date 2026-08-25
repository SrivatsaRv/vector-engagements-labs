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
    const selected = selectDisplayFrame(result, 3.5);
    const activeGeometry = selectCurrentGeometry(result, selected);
    const { rerender } = render(<CurrentGeometry geometry={activeGeometry} />);

    const panel = screen.getByLabelText("Current geometry");
    expect(panel).toHaveAttribute("data-display-time", String(selected.displayTimeSeconds));
    expect(panel).toHaveAttribute("data-frame-index", String(selected.frameIndex));
    expect(screen.getByText("WEAPON TO TARGET")).toBeVisible();
    expect(screen.getByText("Weapon speed")).toBeVisible();

    const prelaunch = {
      ...result,
      frames: result.frames.map((frame, index) => index !== selected.frameIndex
        ? frame
        : { ...frame, entities: frame.entities.filter((entity) => entity.id !== result.engineRun.primaryWeaponId) }),
    };
    const beforeLaunch = selectCurrentGeometry(
      prelaunch,
      selectDisplayFrame(prelaunch, selected.displayTimeSeconds),
    );
    rerender(<CurrentGeometry geometry={beforeLaunch} />);
    expect(screen.getByText("AIRCRAFT TO TARGET")).toBeVisible();
    expect(screen.getByText("Not launched")).toBeVisible();
    expect(screen.queryByText("Weapon speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Weapon Mach")).not.toBeInTheDocument();
    expect(screen.queryByText("Relative-position diagram")).not.toBeInTheDocument();

    const held = {
      ...prelaunch,
      frames: prelaunch.frames.map((frame, index) => index !== selected.frameIndex
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
      selectDisplayFrame(held, selected.displayTimeSeconds),
    )} />);
    expect(screen.getByText("HOLD SHORT")).toBeVisible();
    expect(screen.getByText("UNAVAILABLE")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aircraft movement is unavailable. GROUND DYNAMICS MODEL UNAVAILABLE.",
    );

    for (const operationalState of ["TAKEOFF_ROLL", "ROTATE", "CLIMBOUT", "ENROUTE"] as const) {
      const valid = {
        ...prelaunch,
        frames: prelaunch.frames.map((frame, index) => index !== selected.frameIndex
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
        selectDisplayFrame(valid, selected.displayTimeSeconds),
      )} />);
      expect(screen.getByText(operationalState.replaceAll("_", " "))).toBeVisible();
      expect(screen.getByText("VALID")).toBeVisible();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });
});
