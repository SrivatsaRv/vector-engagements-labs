import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewportTelemetry } from "@/components/ViewportTelemetry";
import { selectDisplayFrame } from "@/lib/frontend/selectors";
import { createReferencePreview } from "@/lib/simulation";
import { getScenarioDefinition } from "@/lib/scenarios";

const result = createReferencePreview(
  getScenarioDefinition("a2a-crossing-intercept")!.scenario,
);

describe("ViewportTelemetry", () => {
  it("keeps canonical telemetry hidden until the accessible disclosure is expanded", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    render(
      <ViewportTelemetry
        expanded={false}
        onExpandedChange={onExpandedChange}
        result={result}
        selected={selectDisplayFrame(result, 3.5)}
      />,
    );

    const toggle = screen.getByRole("button", { name: /expand telemetry/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "synchronized-run-telemetry");
    expect(screen.getByText(/computed at 3\.5 model seconds/i)).toBeVisible();
    expect(screen.getByRole("region", { name: "Canonical target effect" })).toHaveAttribute(
      "data-effect-state",
      "UNAVAILABLE",
    );
    expect(screen.queryByText("Altitude")).not.toBeVisible();

    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("renders the selected recorded-frame time instead of an in-between scrub request", () => {
    const selected = selectDisplayFrame(result, 11.38);
    render(
      <ViewportTelemetry
        expanded
        onExpandedChange={() => undefined}
        result={result}
        selected={selected}
      />,
    );

    expect(selected.displayTimeSeconds).toBe(11.5);
    expect(screen.getByText(/computed at 11\.5 model seconds/i)).toBeVisible();
    expect(screen.getByText("Altitude")).toBeVisible();
    expect(screen.getByRole("button", { name: /collapse telemetry/i })).toHaveAttribute("aria-expanded", "true");
  });
});
