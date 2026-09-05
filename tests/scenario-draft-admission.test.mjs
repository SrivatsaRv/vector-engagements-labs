import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelActiveDraftAdmission,
  ScenarioDraftAdmissionError,
  ScenarioDraftAdmissionTracker,
} from "../lib/scenario-draft-admission.ts";

test("#193 latest-draft admission accepts only the exact active canonical draft", async () => {
  const tracker = new ScenarioDraftAdmissionTracker();
  const receipt = await tracker.begin({ speed: 275, route: { altitudeM: 9_500 } }, "run-1");
  const accepted = await tracker.accept(receipt, { route: { altitudeM: 9_500 }, speed: 275 });
  assert.equal(accepted.draftDigest, receipt.draftDigest, "object key order must not alter draft identity");
});

test("#193 latest-draft admission rejects an edited draft and a tampered receipt", async () => {
  const tracker = new ScenarioDraftAdmissionTracker();
  const receipt = await tracker.begin({ speed: 275 }, "run-1");
  await assert.rejects(
    tracker.accept(receipt, { speed: 276 }),
    (error) => error instanceof ScenarioDraftAdmissionError
      && error.code === "DRAFT_ADMISSION_STALE_DRAFT"
      && error.fieldPath === "$.draftDigest"
      && error.stage === "LATEST_DRAFT"
      && error.severity === "BLOCKING"
      && error.correctiveGuidance === "Discard this response and run the current scenario draft again.",
  );
  await assert.rejects(
    tracker.accept({ ...receipt, draftDigest: "0".repeat(64) }, { speed: 275 }),
    (error) => error instanceof ScenarioDraftAdmissionError
      && error.code === "DRAFT_ADMISSION_STALE_REQUEST",
  );
});

test("#193 latest-draft admission rejects cancellation during hashing and a superseded response", async () => {
  const tracker = new ScenarioDraftAdmissionTracker();
  const cancelled = tracker.begin({ speed: 275 }, "run-cancelled");
  tracker.invalidate();
  await assert.rejects(
    cancelled,
    (error) => error instanceof ScenarioDraftAdmissionError
      && error.code === "DRAFT_ADMISSION_STALE_REQUEST",
  );

  const first = await tracker.begin({ speed: 275 }, "run-first");
  tracker.invalidate();
  const second = await tracker.begin({ speed: 276 }, "run-second");
  await assert.rejects(
    tracker.accept(first, { speed: 276 }),
    (error) => error instanceof ScenarioDraftAdmissionError
      && error.code === "DRAFT_ADMISSION_STALE_REQUEST",
  );
  await tracker.accept(second, { speed: 276 });
});

test("#193 cancellation revokes publication authority before invoking the Worker", async () => {
  const tracker = new ScenarioDraftAdmissionTracker();
  const draft = { speed: 275 };
  const receipt = await tracker.begin(draft, "run-cancel-race");
  let cancellationObservedRevocation = false;

  await cancelActiveDraftAdmission(tracker, async () => {
    await assert.rejects(
      tracker.accept(receipt, draft),
      (error) => error instanceof ScenarioDraftAdmissionError
        && error.code === "DRAFT_ADMISSION_STALE_REQUEST",
    );
    cancellationObservedRevocation = true;
  });

  assert.equal(cancellationObservedRevocation, true);
});
