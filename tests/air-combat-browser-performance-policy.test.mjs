import assert from "node:assert/strict";
import test from "node:test";

import {
  AIR_COMBAT_BROWSER_PERFORMANCE_POLICY,
  assertAirCombatBrowserPerformanceEvidence,
} from "../lib/validation/air-combat-browser-performance.ts";

function validEvidence() {
  const policy = AIR_COMBAT_BROWSER_PERFORMANCE_POLICY;
  return {
    schemaVersion: "vector.air-combat-browser-performance-evidence.v1",
    projectName: policy.measurementProject,
    browserName: "chromium",
    viewport: { width: 1_366, height: 768 },
    userAgent: "governed Chromium fixture",
    retainedHeapDriftBytes: 0,
    measurements: policy.studies.map((study, index) => ({
      ...study,
      packageLoadMs: 100,
      workerRunMs: 200,
      canonical3dSelectionMs: 50,
      animationFrameIntervalsMs: Array.from(
        { length: policy.animationFrameSampleCount },
        () => 16.7,
      ),
      longTaskDurationsMs: [],
      heapBeforeRunBytes: 10_000_000,
      heapAfterPlaybackBytes: 11_000_000,
      recordBytes: 1_000_000,
      recordId: String(index + 1).repeat(64),
      contentDigest: String(index + 4).repeat(64),
      playbackStartFrameIndex: 0,
      playbackEndFrameIndex: 10,
    })),
  };
}

test("the exact Air-combat browser policy is closed over three governed studies and one comparable project", () => {
  const policy = AIR_COMBAT_BROWSER_PERFORMANCE_POLICY;
  assert.equal(policy.schemaVersion, "vector.air-combat-browser-performance-policy.v1");
  assert.equal(policy.measurementProject, "laptop-1366");
  assert.deepEqual(policy.studies.map(({ scenarioId }) => scenarioId), [
    "a2a-crossing-intercept",
    "a2a-defensive-break",
    "a2a-high-energy-crossing-challenge",
  ]);
  assert.equal(policy.animationFrameSampleCount, 90);
  assert.equal(policy.maximumAnimationFrameGapMs, 300);
  assert.equal(policy.maximumLongTaskDurationMs, 1_000);
  assert.equal(policy.maximumLongTaskTotalMs, 2_500);
  assert.equal(policy.maximumRecordBytes, 8 * 1_024 * 1_024);
  assert.doesNotThrow(() => assertAirCombatBrowserPerformanceEvidence(validEvidence()));
});

test("the browser performance verifier rejects semantic, cadence, long-task, record, and retained-heap drift independently", () => {
  const policy = AIR_COMBAT_BROWSER_PERFORMANCE_POLICY;
  const falsifiers = [
    ["canonical frame", (evidence) => { evidence.measurements[0].frameIndex += 1; }],
    ["package load", (evidence) => { evidence.measurements[0].packageLoadMs = policy.maximumPackageLoadMs + 1; }],
    ["Worker run", (evidence) => { evidence.measurements[0].workerRunMs = policy.maximumWorkerRunMs + 1; }],
    ["canonical 3D selection", (evidence) => { evidence.measurements[0].canonical3dSelectionMs = policy.maximumCanonical3dSelectionMs + 1; }],
    ["animation-frame p95", (evidence) => { evidence.measurements[0].animationFrameIntervalsMs.fill(policy.maximumAnimationFrameP95Ms + 1); }],
    ["long-task maximum", (evidence) => { evidence.measurements[0].longTaskDurationsMs = [policy.maximumLongTaskDurationMs + 1]; }],
    ["heap growth", (evidence) => { evidence.measurements[0].heapAfterPlaybackBytes = evidence.measurements[0].heapBeforeRunBytes + policy.maximumPerStudyHeapGrowthBytes + 1; }],
    ["retained VSR size", (evidence) => { evidence.measurements[0].recordBytes = policy.maximumRecordBytes + 1; }],
    ["retained heap drift", (evidence) => { evidence.retainedHeapDriftBytes = policy.maximumRetainedHeapDriftBytes + 1; }],
    ["playback advance", (evidence) => { evidence.measurements[0].playbackEndFrameIndex = evidence.measurements[0].playbackStartFrameIndex; }],
  ];
  for (const [label, falsify] of falsifiers) {
    const evidence = validEvidence();
    falsify(evidence);
    assert.throws(
      () => assertAirCombatBrowserPerformanceEvidence(evidence),
      undefined,
      label,
    );
  }
});
