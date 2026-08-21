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
});
