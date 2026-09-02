"use client";

import { useEffect } from "react";
import { emitBrowserTelemetry } from "@/lib/observability/client";

const LONG_TASK_SAMPLE_INTERVAL_MS = 10_000;

export function BrowserTelemetry() {
  useEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) emitBrowserTelemetry({ type: "browser_navigation", durationMs: navigation.duration });
    if (!("PerformanceObserver" in window)) return;
    let observer: PerformanceObserver | undefined;
    let nextLongTaskSampleAtMs = 0;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.startTime < nextLongTaskSampleAtMs) continue;
          nextLongTaskSampleAtMs = entry.startTime + LONG_TASK_SAMPLE_INTERVAL_MS;
          emitBrowserTelemetry({ type: "browser_long_task", durationMs: entry.duration });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      return;
    }
    return () => observer?.disconnect();
  }, []);
  return null;
}
