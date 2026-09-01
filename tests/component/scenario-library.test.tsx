import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";

describe("ScenarioLibrary deployment admission", () => {
  it("shows only admitted runnable scenarios", () => {
    render(<ScenarioLibrary />);

    expect(screen.getAllByRole("link", { name: /review and run/i })).toHaveLength(3);
    expect(screen.getByText(/BVR mutual offset and defensive turn/i)).toBeInTheDocument();
    expect(screen.queryByText(/Air strike: hardened aircraft shelters/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^A2G/i })).not.toBeInTheDocument();
  });
});
