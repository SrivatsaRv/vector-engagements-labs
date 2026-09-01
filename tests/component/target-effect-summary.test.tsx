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
  it("authorizes modeled-kill wording only from the canonical terminal event and frame", () => {
    const result = createReferencePreview(
      getScenarioDefinition("a2a-defensive-break")!.scenario,
    );
    const selection = selectCanonicalTargetEffect(
      result,
      selectDisplayFrame(result, result.timeOfFlight),
    );
    render(<TargetEffectSummary selection={selection} />);

    const summary = screen.getByRole("region", { name: "Canonical target effect" });
    expect(summary).toHaveAttribute("data-effect-state", "RECORDED");
    expect(summary).toHaveAttribute("data-effect-class", "KILL");
    expect(summary).toHaveAttribute("data-target-lifecycle", "TERMINATED");
    expect(summary).toHaveAttribute("data-kill-claim-authorized", "true");
    expect(screen.getByText("Modeled kill")).toBeVisible();
    expect(summary).toHaveTextContent(/scored a modeled kill/i);
    expect(summary).toHaveTextContent(/MODEL_ASSUMPTION limitations:/);
  });
});
