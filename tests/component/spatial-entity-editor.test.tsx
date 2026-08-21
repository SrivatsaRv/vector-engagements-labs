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

function Harness({ onValidityChange, onEntityChange, initial = initialEntity }: {
  onValidityChange: (valid: boolean) => void;
  onEntityChange?: (entity: ScenarioSpatialEntity) => void;
  initial?: ScenarioSpatialEntity;
}) {
  const [entity, setEntity] = useState<ScenarioSpatialEntity>(initial);
  return (
    <SpatialEntityEditor
      team="blue"
      designation="Test aircraft"
      entity={entity}
      studyArea={area}
      onChange={(next) => {
        setEntity(next);
        onEntityChange?.(next);
      }}
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

  it("does not admit a waypoint acceptance radius outside the compiled contract", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const route = screen.getByRole("region", { name: /test aircraft route coordinates/i });
    const radius = within(route).getByRole("textbox", { name: /acceptance radius/i });

    expect(screen.getByTestId("compiled-route-plan-preview")).toHaveTextContent("vector.route-plan.v2");
    await user.clear(radius);
    await user.type(radius, "0");

    expect(radius).toHaveAttribute("aria-invalid", "true");
    expect(route).toHaveTextContent(/acceptance radius must be from 1 to 25,000 m/i);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it("commits an explicit fly-over transition into the compiled route plan", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    const onEntityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} onEntityChange={onEntityChange} />);

    const route = screen.getByRole("region", { name: /test aircraft route coordinates/i });
    await user.selectOptions(within(route).getByRole("combobox", { name: /transition/i }), "FLY_OVER");
    await user.tab();

    await waitFor(() => expect(onEntityChange).toHaveBeenCalled());
    expect(onEntityChange.mock.calls.at(-1)?.[0].routeWaypointTransitions).toEqual(["START", "FLY_OVER"]);
  });

  it("changes a selected installation origin into manual airborne placement when coordinates change", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    const installationEntity: ScenarioSpatialEntity = {
      ...initialEntity,
      originReference: {
        schemaVersion: "vector.installation-origin.v1",
        installationId: "pathankot-afs",
        sourceId: "public-reference:iaf-installations-v1",
        environment: {
          studyAreaId: area.id,
          weatherPresetId: area.defaultWeatherPresetId,
        },
      },
    };
    render(<Harness onValidityChange={onValidityChange} initial={installationEntity} />);

    expect(screen.getByText(/installation origin selected/i)).toBeVisible();
    expect(screen.getByText(/pathankot-afs/i)).toBeVisible();

    const start = screen.getByRole("group", { name: "Airborne start" });
    const longitude = within(start).getByRole("textbox", { name: "Longitude" });
    await user.clear(longitude);
    await user.type(longitude, String(installationEntity.position.longitude + 0.01));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText(/manual airborne start/i)).toBeVisible());
    expect(screen.getByText(/no installation identity will be compiled/i)).toBeVisible();
  });
});
