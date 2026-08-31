import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("binds every #197 spatial text control to malformed, nonfinite, precision, and range admission", async () => {
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const cases = [
      ["spatial.blue.start.longitude", "31.1234567890123456", "181", "75.5"],
      ["spatial.blue.start.latitude", "31.1234567890123456", "91", "31.5"],
      ["spatial.blue.start.altitude", "1.0001", "15000.001", "8500"],
      ["spatial.blue.start.heading", "1.0001", "360", "90"],
      ["spatial.blue.start.speed", "1.0001", "450.001", "270"],
      ["spatial.blue.route[*].longitude", "31.1234567890123456", "181", "75.5"],
      ["spatial.blue.route[*].latitude", "31.1234567890123456", "91", "31.5"],
      ["spatial.blue.route[*].altitudeM", "1.0001", "15000.001", "9200"],
      ["spatial.blue.route[*].acceptanceRadiusM", "1.0001", "25000.001", "2500"],
    ] as const;

    for (const [controlId, overPrecision, outOfRange, valid] of cases) {
      const input = document.querySelector<HTMLInputElement>(`[data-control-id="${controlId}"]`);
      expect(input, controlId).not.toBeNull();
      for (const raw of ["1e", "1e999", overPrecision, outOfRange]) {
        fireEvent.change(input!, { target: { value: raw } });
        expect(input).toHaveValue(raw);
        expect(input).toHaveAttribute("aria-invalid", "true");
      }
      fireEvent.change(input!, { target: { value: valid } });
      expect(input, controlId).toHaveAttribute("aria-invalid", "false");
    }
  });

  it("preserves an invalid speed instead of silently clamping it", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const speed = screen.getByRole("textbox", { name: /true airspeed/i });

    await user.clear(speed);
    await user.type(speed, "-1");

    expect(speed).toHaveValue("-1");
    expect(speed).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/speed must be from 0 to 450 m\/s/i)).toBeVisible();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.clear(speed);
    await user.type(speed, "275");
    await user.keyboard("{Enter}");

    expect(speed).toHaveValue("275");
    expect(speed).toHaveAttribute("aria-invalid", "false");
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it("uses the same three-decimal altitude and TAS boundaries as final admission", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);
    const start = screen.getByRole("group", { name: "Airborne start" });
    const speed = within(start).getByRole("textbox", { name: /true airspeed/i });
    const altitude = within(start).getByRole("textbox", { name: /^altitude/i });

    await user.clear(speed);
    await user.type(speed, "450.001");
    expect(speed).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.clear(speed);
    await user.type(speed, "450");
    await user.keyboard("{Enter}");
    expect(speed).toHaveAttribute("aria-invalid", "false");

    await user.clear(altitude);
    await user.type(altitude, "15000.001");
    expect(altitude).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
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
    await user.type(altitude, "9200.123");
    await user.keyboard("{Enter}");
    expect(altitude).toHaveValue("9200.123");
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
    const transition = within(route).getByRole("combobox", { name: /transition/i });
    expect(transition).toHaveAttribute("data-vector-overlay-exempt", "ua-native-select");
    await user.selectOptions(transition, "FLY_OVER");
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
        schemaVersion: "vector.installation-origin.v2",
        installationId: "pathankot-afs",
        sourceId: "public-reference:iaf-installations-v1",
        startKind: "RUNWAY",
        runwayId: "runway:test",
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
