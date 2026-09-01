import assert from "node:assert/strict";
import test from "node:test";

import {
  assertControlMatrixComplete,
  executeControlMatrixEvidence,
  readControlMatrix,
  validateControlMatrix,
} from "../scripts/verify-air-combat-control-matrix.mjs";

test("#197 control matrix has fourteen closed-scope rows without claiming #193 completion", () => {
  const matrix = readControlMatrix();
  const summary = validateControlMatrix(matrix);
  assert.deepEqual(summary, {
    rowCount: 14,
    coveredCount: 14,
    gapCount: 0,
    caseCount: 64,
    completionReady: true,
  });
  assert.doesNotThrow(() => assertControlMatrixComplete(matrix));
});

test("every #197 matrix evidence case executes by exact test name", { timeout: 60_000 }, () => {
  executeControlMatrixEvidence(readControlMatrix());
});
