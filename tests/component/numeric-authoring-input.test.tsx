import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumericAuthoringInput } from "@/components/NumericAuthoringInput";
import type { NumericAuthority } from "@/lib/scenario-control-authority";
import {
  AUTHORED_STORE_TRANSFER_TIME_AUTHORITY,
  AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY,
  AUTHORED_WGS84_LONGITUDE_AUTHORITY,
} from "@/lib/scenario-control-authority";

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
  it("fails closed when a #197 live control is wired to a different authority", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    expect(() => render(
      <NumericAuthoringInput
        controlId="airMission.assignments[0].storeTransfer.requests[0].requestedTimeSeconds"
        ariaLabel="Store transfer requested time"
        value={4}
        authority={AUTHORED_WGS84_LONGITUDE_AUTHORITY}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    )).toThrow(/governed #197 numeric authority/);

    render(
      <NumericAuthoringInput
        controlId="airMission.assignments[0].storeTransfer.requests[0].requestedTimeSeconds"
        ariaLabel="Store transfer requested time"
        value={4}
        authority={AUTHORED_STORE_TRANSFER_TIME_AUTHORITY}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Store transfer requested time" })).toHaveValue("4");
  });

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

  it("does not register a disabled sentinel as an invalid editable draft", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <NumericAuthoringInput
        controlId="airMission.flightPlans[0].routePoints[0].acceptanceRadiusM"
        ariaLabel="blue-route-1 acceptance radius metres"
        value={0}
        authority={AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY}
        disabled
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "blue-route-1 acceptance radius metres",
    });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValidityChange).toHaveBeenLastCalledWith(
      "airMission.flightPlans[0].routePoints[0].acceptanceRadiusM",
      true,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores invalid raw-draft admission when a disabled control becomes editable", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const props = {
      controlId: "airMission.flightPlans[0].routePoints[0].acceptanceRadiusM",
      ariaLabel: "blue-route-1 acceptance radius metres",
      value: 0,
      authority: AUTHORED_ROUTE_ACCEPTANCE_RADIUS_AUTHORITY,
      onChange,
      onValidityChange,
    };
    const { rerender } = render(<NumericAuthoringInput {...props} disabled />);

    rerender(<NumericAuthoringInput {...props} disabled={false} />);

    const input = screen.getByRole("textbox", {
      name: "blue-route-1 acceptance radius metres",
    });
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toBeVisible();
    expect(onValidityChange).toHaveBeenLastCalledWith(
      "airMission.flightPlans[0].routePoints[0].acceptanceRadiusM",
      false,
    );
  });
});
