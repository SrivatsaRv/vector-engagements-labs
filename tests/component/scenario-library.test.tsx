import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";

describe("ScenarioLibrary deployment admission", () => {
  it("offers admitted Air scenarios and labels disabled domains without run links", async () => {
    const user = userEvent.setup();
    render(<ScenarioLibrary />);

    expect(screen.getAllByRole("link", { name: /review and run/i }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^A2G/i }));

    expect(screen.queryByRole("link", { name: /review and run/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/outside the active release scope/i).length,
    ).toBeGreaterThan(0);
  });
});

