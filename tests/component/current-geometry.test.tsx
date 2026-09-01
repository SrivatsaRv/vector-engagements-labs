import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentGeometry } from "@/components/CurrentGeometry";
import { SimulationScene } from "@/components/SimulationScene";
import { cameraRelativeThreePosition } from "@/lib/geospatial/geodesy";
import { selectCurrentGeometry, selectDisplayFrame } from "@/lib/frontend/selectors";
import { createReferencePreview } from "@/lib/simulation";
import { getScenarioDefinition } from "@/lib/scenarios";

const result = createReferencePreview(
  getScenarioDefinition("a2a-crossing-intercept")!.scenario,
);

const threeProbe = vi.hoisted(() => ({
  scene: null as import("three").Scene | null,
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    readonly domElement = document.createElement("canvas");

    setPixelRatio() {}
    setSize() {}
    dispose() {}
    render(scene: import("three").Scene) {
      threeProbe.scene = scene;
    }
  }
  return { ...actual, WebGLRenderer };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    readonly target = { set() {} };
    enableDamping = false;
    dampingFactor = 0;

    update() {}
    dispose() {}
  },
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const canvasContext = {
  arc() {},
  beginPath() {},
  clearRect() {},
  closePath() {},
  fill() {},
  lineTo() {},
  moveTo() {},
  rect() {},
  restore() {},
  save() {},
  setLineDash() {},
  stroke() {},
  translate() {},
} as unknown as CanvasRenderingContext2D;

function routePositions(scene: import("three").Scene) {
  return scene.children
    .filter((object): object is import("three").Line => {
      if (!("geometry" in object) || !("material" in object)) return false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      return materials.some((material) =>
        "isLineDashedMaterial" in material && material.isLineDashedMaterial === true &&
        material.opacity === 0.34
      );
    })
    .map((line) => ({
      line,
      positions: Array.from(line.geometry.getAttribute("position").array),
    }));
}

function expectedRoutePositions(route: Array<{ x: number; y: number; z: number }>) {
  return route.flatMap((position) =>
    cameraRelativeThreePosition(position).map((value) => Math.fround(value))
  );
}

describe("CurrentGeometry", () => {
  it("renders the exact selected-frame relationship and never aliases a launch platform as a weapon", () => {
    const launchFrameIndex = result.frames.findIndex((frame) =>
      frame.entities.some((entity) => entity.id === result.engineRun.primaryWeaponId));
    expect(launchFrameIndex).toBeGreaterThan(0);
    const selected = selectDisplayFrame(result, result.frames[launchFrameIndex].t);
    const activeGeometry = selectCurrentGeometry(result, selected);
    const { rerender } = render(<CurrentGeometry geometry={activeGeometry} />);

    const panel = screen.getByLabelText("Current geometry");
    expect(panel).toHaveAttribute("data-display-time", String(selected.displayTimeSeconds));
    expect(panel).toHaveAttribute("data-frame-index", String(selected.frameIndex));
    expect(screen.getByText("WEAPON TO TARGET")).toBeVisible();
    expect(screen.getByText("Weapon speed")).toBeVisible();

    const prelaunchFrameIndex = launchFrameIndex - 1;
    const prelaunchTimeSeconds = result.frames[prelaunchFrameIndex].t;
    const beforeLaunch = selectCurrentGeometry(
      result,
      selectDisplayFrame(result, prelaunchTimeSeconds),
    );
    rerender(<CurrentGeometry geometry={beforeLaunch} />);
    expect(screen.getByText("AIRCRAFT TO TARGET")).toBeVisible();
    expect(screen.getByText("Not launched")).toBeVisible();
    expect(screen.queryByText("Weapon speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Weapon Mach")).not.toBeInTheDocument();
    expect(screen.queryByText("Relative-position diagram")).not.toBeInTheDocument();

    const held = {
      ...result,
      frames: result.frames.map((frame, index) => index !== prelaunchFrameIndex
        ? frame
        : {
            ...frame,
            entities: frame.entities.map((entity) => entity.id !== "blue-platform-1"
              ? entity
              : {
                  ...entity,
                  aircraftOperationalState: "HOLD_SHORT" as const,
                  aircraftMovementValueState: "UNAVAILABLE" as const,
                  aircraftMovementUnavailableReason: "GROUND_DYNAMICS_MODEL_UNAVAILABLE" as const,
                }),
          }),
    };
    rerender(<CurrentGeometry geometry={selectCurrentGeometry(
      held,
      selectDisplayFrame(held, prelaunchTimeSeconds),
    )} />);
    expect(screen.getByText("HOLD SHORT")).toBeVisible();
    expect(screen.getByText("UNAVAILABLE")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aircraft movement is unavailable. GROUND DYNAMICS MODEL UNAVAILABLE.",
    );

    for (const operationalState of ["TAKEOFF_ROLL", "ROTATE", "CLIMBOUT", "ENROUTE"] as const) {
      const valid = {
        ...result,
        frames: result.frames.map((frame, index) => index !== prelaunchFrameIndex
          ? frame
          : {
              ...frame,
              entities: frame.entities.map((entity) => entity.id !== "blue-platform-1"
                ? entity
                : {
                    ...entity,
                    aircraftOperationalState: operationalState,
                    aircraftMovementValueState: "VALID" as const,
                    aircraftMovementUnavailableReason: undefined,
                  }),
            }),
      };
      rerender(<CurrentGeometry geometry={selectCurrentGeometry(
        valid,
        selectDisplayFrame(valid, prelaunchTimeSeconds),
      )} />);
      expect(screen.getByText(operationalState.replaceAll("_", " "))).toBeVisible();
      expect(screen.getByText("VALID")).toBeVisible();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });
});

describe("SimulationScene route reconciliation", () => {
  beforeEach(() => {
    threeProbe.scene = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("replaces declared route geometry when a new result keeps the same entity IDs", async () => {
    const blue = result.engineRun.scenario.entities.find(
      (entity) => entity.id === "blue-platform-1",
    );
    expect(blue?.route?.length).toBeGreaterThan(1);
    const originalRoute = expectedRoutePositions(blue!.route!);
    const selected = selectDisplayFrame(result, result.frames[0].t);
    const view = render(
      <SimulationScene
        result={result}
        selected={selected}
        profile="short"
        layers={{ interceptor: true, target: true, lineOfSight: true }}
      />,
    );

    let originalLine: import("three").Line | undefined;
    await waitFor(() => {
      expect(threeProbe.scene).not.toBeNull();
      originalLine = routePositions(threeProbe.scene!).find(
        (candidate) => candidate.positions.join(",") === originalRoute.join(","),
      )?.line;
      expect(originalLine).toBeDefined();
    });
    const originalGeometry = originalLine!.geometry;
    const dispose = vi.spyOn(originalGeometry, "dispose");

    const replacement = structuredClone(result);
    const replacementBlue = replacement.engineRun.scenario.entities.find(
      (entity) => entity.id === "blue-platform-1",
    )!;
    replacementBlue.route = replacementBlue.route!.map((point, index) => ({
      ...point,
      x: point.x + 8_000 + index * 1_000,
      y: point.y - 3_000,
    }));
    const replacementRoute = expectedRoutePositions(replacementBlue.route);

    view.rerender(
      <SimulationScene
        result={replacement}
        selected={selectDisplayFrame(replacement, replacement.frames[0].t)}
        profile="short"
        layers={{ interceptor: true, target: true, lineOfSight: true }}
      />,
    );

    await waitFor(() => {
      const routes = routePositions(threeProbe.scene!);
      expect(routes.some((candidate) =>
        candidate.positions.join(",") === replacementRoute.join(",")
      )).toBe(true);
      expect(routes.some((candidate) =>
        candidate.positions.join(",") === originalRoute.join(",")
      )).toBe(false);
      expect(originalLine!.geometry).not.toBe(originalGeometry);
      expect(dispose).toHaveBeenCalledOnce();
    });
  });
});
