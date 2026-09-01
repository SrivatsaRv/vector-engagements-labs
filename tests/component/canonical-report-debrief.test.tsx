import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanonicalReportDebrief } from "@/components/CanonicalReportDebrief";
import { buildCanonicalReportDebrief } from "@/lib/report-debrief";
import { getScenarioDefinition } from "@/lib/scenarios";
import { simulate } from "@/lib/simulation";
import { buildAuthoredProfileBinding } from "@/lib/report-profile";

describe("CanonicalReportDebrief", () => {
  it("renders governed profile identity, recorded transitions, causal effect and aircraft state", () => {
    const definition = getScenarioDefinition("a2a-defensive-break")!;
    const debrief = buildCanonicalReportDebrief(
      simulate(definition.scenario),
      definition,
      definition.scenario,
    );
    render(<CanonicalReportDebrief debrief={debrief} />);

    const report = screen.getByRole("region", { name: "Canonical run debrief" });
    expect(report).toBeVisible();
    expect(report).toHaveAttribute("data-effect-event-id", debrief.targetEffect.eventId);
    expect("frameIndex" in debrief.targetEffect.projection).toBe(true);
    if ("frameIndex" in debrief.targetEffect.projection) {
      expect(report).toHaveAttribute(
        "data-effect-frame-index",
        String(debrief.targetEffect.projection.frameIndex),
      );
    }
    expect(report).toHaveAttribute(
      "data-effect-class",
      debrief.targetEffect.presentation.effectClass ?? "NONE",
    );
    expect(screen.getByTestId("report-authored-route-profile")).toHaveTextContent(
      /wvr-one-circle-defensive-break · AUTHORED_ROUTE · MATCHED · WVR_BFM/,
    );
    expect(screen.getByTestId("report-authored-route-profile")).toHaveTextContent(
      /autonomous pilot.*not modelled/i,
    );
    const explanation = screen.getByTestId("report-canonical-effect-explanation");
    expect(explanation).toHaveTextContent(debrief.explanation);
    expect(explanation).toHaveTextContent(/MODEL_ASSUMPTION limitations:/i);
    expect(explanation).toHaveTextContent(/not named-system effectiveness/i);
    if (debrief.targetEffect.presentation.effectClass === "KILL") {
      expect(explanation).toHaveTextContent(
        /Blue Su-30MKI presentation aircraft recorded KILL against Red F-16C Block 52 presentation/i,
      );
    }
    expect(screen.getByTestId("report-recorded-causal-facts")).toHaveTextContent(
      /Weapon entered world.*20\.000 s/i,
    );
    expect(screen.getByTestId("report-recorded-causal-facts")).toHaveTextContent(
      /Target effect event.*frame \d+.*event-\d+/i,
    );
    expect(screen.getByTestId("report-exact-causal-inputs")).toHaveTextContent(
      /45 s · SCENARIO_AUTHORED/i,
    );
    expect(screen.getByTestId("report-exact-causal-inputs")).toHaveTextContent(
      /RELEASE blue-weapon-1 at 20 s · installed drag 0\.03 m² · blue-flight-1-store-transfer-1/i,
    );
    expect(screen.getByTestId("report-exact-causal-inputs")).toHaveTextContent(
      /Point 4.*FLY_BY.*acceptance 500 m/i,
    );
    expect(screen.getByTestId("report-weapon-flight-state-timeline")).toHaveTextContent(
      /BOOST.*INTERCEPT/i,
    );
    expect(screen.getByTestId("report-observer-track-availability")).toHaveTextContent(
      /IAF: sensor UNSUPPORTED · track UNSUPPORTED · SENSOR_MODEL_UNAVAILABLE/i,
    );
    expect(screen.getByTestId("report-aircraft-state-blue")).toHaveTextContent(/Su-30MKI/);
    expect(screen.getByTestId("report-aircraft-state-red")).toHaveTextContent(/F-16C Block 52/);
  });

  it("retains modified profile ancestry without presenting its leg intents as current", () => {
    const definition = getScenarioDefinition("a2a-defensive-break")!;
    const scenario = structuredClone(definition.scenario);
    scenario.spatialPlan!.red.route[2].longitude += 0.001;
    const library = {
      ...definition,
      authoredProfileBinding: buildAuthoredProfileBinding(definition, scenario),
    };
    const debrief = buildCanonicalReportDebrief(
      simulate(scenario),
      library,
      scenario,
    );
    render(<CanonicalReportDebrief debrief={debrief} />);

    expect(screen.getByTestId("report-authored-route-profile")).toHaveAttribute(
      "data-profile-applicability",
      "MODIFIED_FROM",
    );
    expect(screen.getByTestId("report-profile-leg-intent-qualification")).toHaveTextContent(
      /leg intents are not asserted/i,
    );
    expect(screen.queryByText(/BLUE leg 1/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("report-canonical-effect-explanation")).toHaveTextContent(
      /modified from source authored route profile/i,
    );
  });

  it("renders the exact BVR weapon world-entry geometry", () => {
    const definition = getScenarioDefinition("a2a-crossing-intercept")!;
    const debrief = buildCanonicalReportDebrief(
      simulate(definition.scenario),
      definition,
      definition.scenario,
    );
    render(<CanonicalReportDebrief debrief={debrief} />);

    expect(screen.getByTestId("report-launch-geometry")).toHaveTextContent(
      /WEAPON_TO_TARGET · frame 17 · 4\.000 s · range 36792\.146 m · closure 322\.564 m\/s · Blue altitude 9500\.000 m MSL · Red altitude 8200\.000 m MSL/i,
    );
    expect(screen.getByTestId("report-canonical-geometry")).toHaveTextContent(
      /not autonomous-pilot choices or named-system effectiveness/i,
    );
  });

  it("renders the exact WVR closest active-aircraft approach", () => {
    const definition = getScenarioDefinition("a2a-defensive-break")!;
    const debrief = buildCanonicalReportDebrief(
      simulate(definition.scenario),
      definition,
      definition.scenario,
    );
    render(<CanonicalReportDebrief debrief={debrief} />);

    expect(screen.getByTestId("report-closest-aircraft-approach")).toHaveTextContent(
      /AIRCRAFT_TO_AIRCRAFT · frame 115 · 28\.350 s · range 4224\.485 m · closure 344\.846 m\/s/i,
    );
  });

  it("renders exact transition initial-commit and achieved recommit geometry", () => {
    const definition = getScenarioDefinition("a2a-high-energy-crossing-challenge")!;
    const debrief = buildCanonicalReportDebrief(
      simulate(definition.scenario),
      definition,
      definition.scenario,
    );
    render(<CanonicalReportDebrief debrief={debrief} />);

    expect(screen.getByTestId("report-initial-commit-geometry")).toHaveTextContent(
      /frame 1 · 0\.050 s · range 33530\.450 m · closure 340\.213 m\/s/i,
    );
    expect(screen.getByTestId("report-recommit-geometry")).toHaveAttribute(
      "data-recording-state",
      "RECORDED",
    );
    expect(screen.getByTestId("report-recommit-geometry")).toHaveTextContent(
      /frame 383 · 95\.500 s · range 19896\.024 m · closure 47\.766 m\/s/i,
    );
    expect(screen.getByTestId("report-final-aircraft-separation")).toHaveTextContent(
      "19381.558 m",
    );
    expect(screen.getByTestId("report-canonical-geometry")).toHaveAttribute(
      "data-authored-transition-state",
      "RECORDED",
    );
  });
});
