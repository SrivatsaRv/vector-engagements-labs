import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformEvidence } from "@/components/PlatformEvidence";

describe("PlatformEvidence", () => {
  it("labels categorical systems as context-only and does not claim an ALQ-211 fit", () => {
    render(<PlatformEvidence platformId="f-16c-block52-paf" />);
    expect(screen.getByText("12 delivered single-seat aircraft")).toBeInTheDocument();
    const radar = screen.getByTestId("platform-system-radar");
    expect(within(radar).getByText("Not established")).toBeInTheDocument();
    expect(within(radar).getByText("UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("AN/APG-68(V)9 requested-programme association only")).toBeInTheDocument();
    expect(screen.getByText("Link 16 requested-programme association only")).toBeInTheDocument();
    const ew = screen.getByTestId("platform-system-defensive-ew");
    expect(within(ew).getByText("Not established")).toBeInTheDocument();
    const defaultLoadout = screen.getByTestId("platform-default-loadout");
    expect(within(defaultLoadout).getByText(/2 × AIM-120C-5/)).toBeInTheDocument();
    expect(within(defaultLoadout).getByText("MODEL_ASSUMPTION")).toBeInTheDocument();
    expect(screen.queryByText(/ALQ-211/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Named-aircraft performance remains unsupported/i)).toBeInTheDocument();
  });
});
