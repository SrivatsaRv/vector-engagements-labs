import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumericAuthoringInput } from "@/components/NumericAuthoringInput";
import type { NumericAuthority } from "@/lib/scenario-control-authority";

const authority: NumericAuthority = {
  kind: "NUMBER",
  minimum: 1,
  maximum: 64,
  integer: true,
  nullable: false,
  precision: 0,
  unit: "aircraft",
};

describe("NumericAuthoringInput", () => {
  it.each([" ", "+", ".", "1e", "NaN", "Infinity", "1,5", "１２", "12 aircraft"])(
    "preserves malformed raw text %j and never commits it",
    async (raw) => {
      const onChange = vi.fn();
      const onValidityChange = vi.fn();
      render(
        <NumericAuthoringInput
          controlId="airMission.tasks.cap.flightSize"
          ariaLabel="CAP flight size"
          value={2}
          authority={authority}
          onChange={onChange}
          onValidityChange={onValidityChange}
        />,
      );

      const input = screen.getByRole("textbox", { name: "CAP flight size" });
      fireEvent.change(input, { target: { value: raw } });

      expect(input).toHaveValue(raw);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toBeVisible();
      expect(onChange).not.toHaveBeenCalled();
      expect(onValidityChange).toHaveBeenLastCalledWith(
        "airMission.tasks.cap.flightSize",
        false,
      );
    },
  );

  it("commits only an admitted value and restores validity", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <NumericAuthoringInput
        controlId="airMission.tasks.cap.flightSize"
        ariaLabel="CAP flight size"
        value={2}
        authority={authority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "CAP flight size" });
    await user.clear(input);
    await user.type(input, "4");

    expect(input).toHaveValue("4");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(onChange).toHaveBeenLastCalledWith(4);
    expect(onValidityChange).toHaveBeenLastCalledWith(
      "airMission.tasks.cap.flightSize",
      true,
    );
  });

  it("preserves an admitted decimal draft while the parent accepts its numeric value", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const decimalAuthority: NumericAuthority = {
      ...authority,
      integer: false,
      precision: 3,
      unit: "m/s",
    };
    const { rerender } = render(
      <NumericAuthoringInput
        controlId="scenario.wind"
        ariaLabel="Eastward wind velocity"
        value={1}
        authority={decimalAuthority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Eastward wind velocity" });

    fireEvent.change(input, { target: { value: "1." } });
    rerender(
      <NumericAuthoringInput
        controlId="scenario.wind"
        ariaLabel="Eastward wind velocity"
        value={1}
        authority={decimalAuthority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    expect(input).toHaveValue("1.");

    fireEvent.change(input, { target: { value: "1.25" } });
    rerender(
      <NumericAuthoringInput
        controlId="scenario.wind"
        ariaLabel="Eastward wind velocity"
        value={1.25}
        authority={decimalAuthority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    expect(input).toHaveValue("1.25");
    expect(onChange).toHaveBeenLastCalledWith(1.25);
  });

  it("replaces a stale draft when another control or preset changes the value", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const { rerender } = render(
      <NumericAuthoringInput
        controlId="airMission.tasks.cap.flightSize"
        ariaLabel="CAP flight size"
        value={2}
        authority={authority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "CAP flight size" });

    rerender(
      <NumericAuthoringInput
        controlId="airMission.tasks.cap.flightSize"
        ariaLabel="CAP flight size"
        value={4}
        authority={authority}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );

    expect(input).toHaveValue("4");
    expect(onChange).not.toHaveBeenCalled();
  });
});
