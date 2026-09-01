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
    const effectEvent = result.engineRun.events.state === "AVAILABLE"
      ? result.engineRun.events.items.find((event) => event.payload.kind === "TARGET_EFFECT_COMMITTED")
      : undefined;
    expect(effectEvent?.frameIndex).toBeGreaterThan(0);
    if (!effectEvent || effectEvent.frameIndex < 1) {
      throw new Error("Expected a retained frame before the canonical target-effect boundary.");
    }
    const selected = selectDisplayFrame(result, result.frames[effectEvent.frameIndex - 1].t);
    render(
      <ViewportTelemetry
        expanded={false}
        onExpandedChange={onExpandedChange}
        result={result}
        selected={selected}
      />,
    );

    const toggle = screen.getByRole("button", { name: /expand telemetry/i });
    const telemetry = screen.getByRole("region", { name: "Synchronized run telemetry" });
    expect(telemetry).toHaveAttribute("data-frame-index", String(selected.frameIndex));
    expect(telemetry).toHaveAttribute("data-display-time", String(selected.displayTimeSeconds));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "synchronized-run-telemetry");
    expect(screen.getByText((content) =>
      content.includes(`Computed at ${selected.displayTimeSeconds.toFixed(1)} model seconds`))).toBeVisible();
    const effectSummary = screen.getByRole("region", { name: "Canonical target effect" });
    expect(effectSummary).toHaveAttribute("data-effect-state", "BEFORE_EFFECT_BOUNDARY");
    expect(effectSummary).toHaveAttribute("data-kill-claim-authorized", "false");
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
