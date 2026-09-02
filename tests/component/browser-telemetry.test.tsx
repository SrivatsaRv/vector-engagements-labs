import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserTelemetry } from "@/components/BrowserTelemetry";
import { PUBLIC_API_ADMISSION_POLICY } from "@/lib/security/admission-policy";

describe("BrowserTelemetry", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps five dense viewport documents below the isolated telemetry budget", async () => {
    let callback: PerformanceObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const requests: RequestInit[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response(null, { status: 204 });
    });

    class TestPerformanceObserver {
      constructor(next: PerformanceObserverCallback) {
        callback = next;
      }

      observe = observe;
      disconnect = disconnect;
      takeRecords = () => [];
    }

    vi.stubGlobal("PerformanceObserver", TestPerformanceObserver);
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { duration: 125 } as PerformanceNavigationTiming,
    ]);

    for (let viewport = 0; viewport < 5; viewport += 1) {
      const view = render(<BrowserTelemetry />);
      expect(callback).toBeTypeOf("function");
      callback?.(
        {
          getEntries: () => Array.from({ length: 600 }, (_, index) => ({
            startTime: index * 100,
            duration: 50 + (index % 10),
          })),
        } as PerformanceObserverEntryList,
        {} as PerformanceObserver,
      );
      view.unmount();
    }

    const expectedRequests = 5 * (1 + 6);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(expectedRequests));

    expect(observe).toHaveBeenCalledTimes(5);
    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: true });
    expect(disconnect).toHaveBeenCalledTimes(5);
    expect(expectedRequests).toBeLessThan(
      PUBLIC_API_ADMISSION_POLICY.BROWSER_TELEMETRY_RATE_LIMITER.limit,
    );
    expect(requests.every((request) => request.keepalive === true)).toBe(true);
    expect(fetch.mock.calls.every(([url]) => url === "/api/telemetry")).toBe(true);
    expect(
      requests.map(({ body }) => JSON.parse(String(body)).type).filter(
        (type) => type === "browser_navigation",
      ),
    ).toHaveLength(5);
    expect(
      requests.map(({ body }) => JSON.parse(String(body)).type).filter(
        (type) => type === "browser_long_task",
      ),
    ).toHaveLength(30);
  });
});
