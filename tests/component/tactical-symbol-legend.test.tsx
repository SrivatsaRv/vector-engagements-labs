import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TacticalSymbolLegend } from "@/components/TacticalSymbolLegend";
import { presentTacticalSymbol } from "@/lib/tactical-symbol-contract";

describe("TacticalSymbolLegend", () => {
  it("exposes a selected symbol and an explicit unavailable symbol without a generic fallback", () => {
    const selected = presentTacticalSymbol({
      id: "blue-1",
      designation: "Blue One",
      kind: "AIRCRAFT",
      affiliation: "BLUE",
      lifecycle: "ACTIVE",
      symbolRole: "FIGHTER",
      headingRad: 0,
      headingRequired: true,
      selected: true,
      valueState: "WORLD",
    });
    const unavailable = presentTacticalSymbol({
      id: "unknown-1",
      designation: "Unknown contact",
      kind: "AIRCRAFT",
      affiliation: "NEUTRAL",
      lifecycle: "ACTIVE",
      symbolRole: "FIGHTER",
      headingRad: 0,
      headingRequired: true,
      valueState: "UNSUPPORTED",
    });
    render(<TacticalSymbolLegend symbols={[selected, unavailable]} label="Tactical display legend" />);

    expect(screen.getByRole("list", { name: "Tactical display legend" })).toBeVisible();
    expect(screen.getByLabelText(/blue one: blue fighter, active, recorded world state, selected/i))
      .toHaveAttribute("data-selected", "true");
    expect(screen.getByLabelText(/unknown contact: unavailable/i))
      .toHaveAttribute("data-availability", "UNAVAILABLE");
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByText(/generic/i)).not.toBeInTheDocument();
  });

  it("keeps hidden map-label detail available to assistive technology in the legend", () => {
    const selected = presentTacticalSymbol({
      id: "blue-selected",
      designation: "Blue Selected",
      kind: "AIRCRAFT",
      affiliation: "BLUE",
      lifecycle: "ACTIVE",
      symbolRole: "FIGHTER",
      headingRad: 0,
      headingRequired: true,
      selected: true,
      valueState: "WORLD",
    });
    render(<TacticalSymbolLegend symbols={[selected]} label="Selected tactical entity" />);
    expect(screen.getByRole("list", { name: "Selected tactical entity" })).toBeVisible();
    expect(screen.getByLabelText(/blue selected: blue fighter.*selected/i)).toBeVisible();
  });
});
