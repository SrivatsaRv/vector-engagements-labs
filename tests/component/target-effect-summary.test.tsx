import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TargetEffectSummary } from "@/components/TargetEffectSummary";
import {
  selectCanonicalTargetEffect,
  selectDisplayFrame,
} from "@/lib/frontend/selectors";
import { getScenarioDefinition } from "@/lib/scenarios";
import { createReferencePreview } from "@/lib/simulation";

describe("TargetEffectSummary", () => {
  it("exposes canonical event/frame state and no terminal claim for an unavailable effect", () => {
    const result = createReferencePreview(
      getScenarioDefinition("a2a-defensive-break")!.scenario,
    );
    const selection = selectCanonicalTargetEffect(
      result,
      selectDisplayFrame(result, result.timeOfFlight),
    );
    render(<TargetEffectSummary selection={selection} />);

    const summary = screen.getByRole("region", { name: "Canonical target effect" });
    expect(summary).toHaveAttribute("data-effect-class", "EFFECT_UNAVAILABLE");
    expect(summary).toHaveAttribute("data-kill-claim-authorized", "false");
    expect(screen.getByText("Effect unavailable")).toBeVisible();
    expect(summary).not.toHaveTextContent(/\bkill(?:ed)?\b/i);
  });
});
