import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpatialEntityEditor } from "@/components/SpatialEntityEditor";
import {
  createDefaultSpatialPlan,
  type ScenarioSpatialEntity,
} from "@/lib/scenario-spatial";
import { STUDY_AREAS } from "@/lib/study-areas";

const area = STUDY_AREAS[0];
const initialEntity = createDefaultSpatialPlan({
  studyArea: area,
  rangeM: 46_000,
  blueAltitudeM: 8_500,
  redAltitudeM: 10_000,
  blueSpeedMps: 270,
  redSpeedMps: 250,
  crossingAngleDeg: 90,
}).blue;

function Harness({ onValidityChange }: { onValidityChange: (valid: boolean) => void }) {
  const [entity, setEntity] = useState<ScenarioSpatialEntity>(initialEntity);
  return (
    <SpatialEntityEditor
      team="blue"
      designation="Test aircraft"
      entity={entity}
      studyArea={area}
      onChange={setEntity}
      onValidityChange={onValidityChange}
    />
  );
}

describe("SpatialEntityEditor", () => {
  it("preserves an invalid speed instead of silently clamping it", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const speed = screen.getByRole("textbox", { name: /true airspeed/i });

    await user.clear(speed);
    await user.type(speed, "-1");

    expect(speed).toHaveValue("-1");
    expect(speed).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/speed must be from 0 to 1,500 m\/s/i)).toBeVisible();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.clear(speed);
    await user.type(speed, "275");
    await user.keyboard("{Enter}");

    expect(speed).toHaveValue("275");
    expect(speed).toHaveAttribute("aria-invalid", "false");
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it("rejects 360 degrees instead of normalizing it to north", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const heading = screen.getByRole("textbox", { name: /heading/i });

    await user.clear(heading);
    await user.type(heading, "360");

    expect(heading).toHaveValue("360");
    expect(heading).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/360 degrees exclusive/i)).toBeVisible();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it("edits waypoint altitude and rejects a zero-length coordinate-added leg", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const route = screen.getByRole("region", { name: /test aircraft route coordinates/i });
    const altitude = within(route).getByRole("textbox", { name: /^altitude/i });

    await user.clear(altitude);
    await user.type(altitude, "9200");
    await user.keyboard("{Enter}");
    expect(altitude).toHaveValue("9200");
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole("button", { name: /add by coordinates/i }));
    expect(route).toHaveTextContent(/each route leg must be longer than 1 m/i);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });
});
