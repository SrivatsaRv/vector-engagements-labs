import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const telemetry = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock("@/lib/observability/client", () => ({
  emitBrowserTelemetry: telemetry.emit,
}));

import { BrowserTelemetry } from "@/components/BrowserTelemetry";

describe("BrowserTelemetry", () => {
  afterEach(() => {
    cleanup();
    telemetry.emit.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("samples long tasks at a bounded per-document cadence", () => {
    let callback: PerformanceObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();

    class TestPerformanceObserver {
      constructor(next: PerformanceObserverCallback) {
        callback = next;
      }

      observe = observe;
      disconnect = disconnect;
      takeRecords = () => [];
    }

    vi.stubGlobal("PerformanceObserver", TestPerformanceObserver);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { duration: 125 } as PerformanceNavigationTiming,
    ]);

    const view = render(<BrowserTelemetry />);
    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: true });
    expect(callback).toBeTypeOf("function");

    callback?.(
      {
        getEntries: () => [
          { startTime: 100, duration: 60 },
          { startTime: 5_000, duration: 70 },
          { startTime: 10_100, duration: 80 },
        ],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    expect(telemetry.emit.mock.calls).toEqual([
      [{ type: "browser_navigation", durationMs: 125 }],
      [{ type: "browser_long_task", durationMs: 60 }],
      [{ type: "browser_long_task", durationMs: 80 }],
    ]);

    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
