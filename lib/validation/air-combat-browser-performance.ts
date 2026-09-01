export const AIR_COMBAT_BROWSER_PERFORMANCE_POLICY = Object.freeze({
  schemaVersion: "vector.air-combat-browser-performance-policy.v1" as const,
  measurementProject: "laptop-1366" as const,
  playbackSpeed: 4,
  animationFrameSampleCount: 90,
  maximumPackageLoadMs: 10_000,
  maximumWorkerRunMs: 10_000,
  maximumCanonical3dSelectionMs: 2_000,
  maximumAnimationFrameP95Ms: 34,
  maximumAnimationFrameGapMs: 300,
  maximumLongTaskCount: 10,
  maximumLongTaskDurationMs: 1_000,
  maximumLongTaskTotalMs: 2_500,
  minimumRecordBytes: 12,
  maximumRecordBytes: 8 * 1_024 * 1_024,
  maximumPerStudyHeapGrowthBytes: 64 * 1_024 * 1_024,
  maximumRetainedHeapDriftBytes: 16 * 1_024 * 1_024,
  studies: Object.freeze([
    Object.freeze({
      scenarioId: "a2a-crossing-intercept" as const,
      frameIndex: 146,
      modelTimeSeconds: 36,
      effectClass: "KILL" as const,
    }),
    Object.freeze({
      scenarioId: "a2a-defensive-break" as const,
      frameIndex: 116,
      modelTimeSeconds: 28.4,
      effectClass: "KILL" as const,
    }),
    Object.freeze({
      scenarioId: "a2a-high-energy-crossing-challenge" as const,
      frameIndex: 461,
      modelTimeSeconds: 114.7,
      effectClass: "NO_EFFECT" as const,
    }),
  ]),
});

export type AirCombatBrowserPerformanceStudyId =
  (typeof AIR_COMBAT_BROWSER_PERFORMANCE_POLICY.studies)[number]["scenarioId"];

export type AirCombatBrowserPerformanceMeasurement = {
  scenarioId: AirCombatBrowserPerformanceStudyId;
  frameIndex: number;
  modelTimeSeconds: number;
  effectClass: string;
  packageLoadMs: number;
  workerRunMs: number;
  canonical3dSelectionMs: number;
  animationFrameIntervalsMs: number[];
  longTaskDurationsMs: number[];
  heapBeforeRunBytes: number;
  heapAfterPlaybackBytes: number;
  recordBytes: number;
  recordId: string;
  contentDigest: string;
  playbackStartFrameIndex: number;
  playbackEndFrameIndex: number;
};

export type AirCombatBrowserPerformanceEvidence = {
  schemaVersion: "vector.air-combat-browser-performance-evidence.v1";
  projectName: string;
  browserName: string;
  viewport: { width: number; height: number };
  userAgent: string;
  retainedHeapDriftBytes: number;
  measurements: AirCombatBrowserPerformanceMeasurement[];
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finiteNonNegative(value: number, label: string) {
  invariant(Number.isFinite(value) && value >= 0, `${label} must be finite and non-negative.`);
}

function nearestRank(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1]!;
}

/**
 * Fails closed on semantic drift before applying the browser regression limits.
 * The policy is intentionally a local Chromium/laptop alarm, not a production
 * capacity or named-platform performance claim.
 */
export function assertAirCombatBrowserPerformanceEvidence(
  evidence: AirCombatBrowserPerformanceEvidence,
) {
  const policy = AIR_COMBAT_BROWSER_PERFORMANCE_POLICY;
  invariant(
    evidence.schemaVersion === "vector.air-combat-browser-performance-evidence.v1",
    "Air-combat browser performance evidence schema is invalid.",
  );
  invariant(
    evidence.projectName === policy.measurementProject,
    `Air-combat browser performance evidence requires ${policy.measurementProject}.`,
  );
  invariant(evidence.browserName === "chromium", "Air-combat browser performance evidence requires Chromium.");
  invariant(evidence.viewport.width === 1_366 && evidence.viewport.height === 768, "Air-combat browser performance viewport is invalid.");
  invariant(evidence.userAgent.length > 0, "Air-combat browser performance user agent is required.");
  invariant(
    evidence.measurements.length === policy.studies.length,
    "Air-combat browser performance evidence must contain exactly three studies.",
  );
  finiteNonNegative(evidence.retainedHeapDriftBytes, "Retained heap drift");
  invariant(
    evidence.retainedHeapDriftBytes <= policy.maximumRetainedHeapDriftBytes,
    `Retained heap drift exceeded ${policy.maximumRetainedHeapDriftBytes} bytes.`,
  );

  const recordIds = new Set<string>();
  for (const [index, expected] of policy.studies.entries()) {
    const measurement = evidence.measurements[index]!;
    invariant(measurement.scenarioId === expected.scenarioId, `Study order/identity mismatch at index ${index}.`);
    invariant(measurement.frameIndex === expected.frameIndex, `${expected.scenarioId} canonical frame mismatch.`);
    invariant(measurement.modelTimeSeconds === expected.modelTimeSeconds, `${expected.scenarioId} canonical time mismatch.`);
    invariant(measurement.effectClass === expected.effectClass, `${expected.scenarioId} canonical effect mismatch.`);
    finiteNonNegative(measurement.packageLoadMs, `${expected.scenarioId} package load`);
    finiteNonNegative(measurement.workerRunMs, `${expected.scenarioId} Worker run`);
    finiteNonNegative(measurement.canonical3dSelectionMs, `${expected.scenarioId} canonical 3D selection`);
    invariant(measurement.packageLoadMs <= policy.maximumPackageLoadMs, `${expected.scenarioId} package load exceeded its regression limit.`);
    invariant(measurement.workerRunMs <= policy.maximumWorkerRunMs, `${expected.scenarioId} Worker run exceeded its regression limit.`);
    invariant(
      measurement.canonical3dSelectionMs <= policy.maximumCanonical3dSelectionMs,
      `${expected.scenarioId} canonical 3D selection exceeded its regression limit.`,
    );

    invariant(
      measurement.animationFrameIntervalsMs.length === policy.animationFrameSampleCount,
      `${expected.scenarioId} animation-frame sample count mismatch.`,
    );
    measurement.animationFrameIntervalsMs.forEach((duration, sampleIndex) =>
      finiteNonNegative(duration, `${expected.scenarioId} animation frame ${sampleIndex}`));
    invariant(
      nearestRank(measurement.animationFrameIntervalsMs, 0.95) <= policy.maximumAnimationFrameP95Ms,
      `${expected.scenarioId} animation-frame p95 exceeded its regression limit.`,
    );
    invariant(
      Math.max(...measurement.animationFrameIntervalsMs) <= policy.maximumAnimationFrameGapMs,
      `${expected.scenarioId} animation-frame maximum gap exceeded its regression limit.`,
    );

    invariant(
      measurement.longTaskDurationsMs.length <= policy.maximumLongTaskCount,
      `${expected.scenarioId} long-task count exceeded its regression limit.`,
    );
    measurement.longTaskDurationsMs.forEach((duration, taskIndex) =>
      finiteNonNegative(duration, `${expected.scenarioId} long task ${taskIndex}`));
    invariant(
      Math.max(0, ...measurement.longTaskDurationsMs) <= policy.maximumLongTaskDurationMs,
      `${expected.scenarioId} long-task maximum exceeded its regression limit.`,
    );
    invariant(
      measurement.longTaskDurationsMs.reduce((sum, duration) => sum + duration, 0) <=
        policy.maximumLongTaskTotalMs,
      `${expected.scenarioId} long-task total exceeded its regression limit.`,
    );

    finiteNonNegative(measurement.heapBeforeRunBytes, `${expected.scenarioId} pre-run heap`);
    finiteNonNegative(measurement.heapAfterPlaybackBytes, `${expected.scenarioId} post-playback heap`);
    invariant(
      Math.max(0, measurement.heapAfterPlaybackBytes - measurement.heapBeforeRunBytes) <=
        policy.maximumPerStudyHeapGrowthBytes,
      `${expected.scenarioId} heap growth exceeded its regression limit.`,
    );
    invariant(
      Number.isSafeInteger(measurement.recordBytes) &&
        measurement.recordBytes >= policy.minimumRecordBytes &&
        measurement.recordBytes <= policy.maximumRecordBytes,
      `${expected.scenarioId} retained VSR size exceeded its exact-study bounds.`,
    );
    invariant(/^[a-f0-9]{64}$/.test(measurement.recordId), `${expected.scenarioId} record ID is invalid.`);
    invariant(/^[a-f0-9]{64}$/.test(measurement.contentDigest), `${expected.scenarioId} content digest is invalid.`);
    invariant(!recordIds.has(measurement.recordId), `${expected.scenarioId} reused another study's record ID.`);
    recordIds.add(measurement.recordId);
    invariant(
      Number.isSafeInteger(measurement.playbackStartFrameIndex) &&
        Number.isSafeInteger(measurement.playbackEndFrameIndex) &&
        measurement.playbackEndFrameIndex > measurement.playbackStartFrameIndex,
      `${expected.scenarioId} did not advance canonical 3D playback during cadence measurement.`,
    );
  }
}
