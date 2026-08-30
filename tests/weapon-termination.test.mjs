import assert from "node:assert/strict";
import test from "node:test";
import { closestApproachOnRelativeSegment } from "../lib/engine/weapon-termination.ts";

test("between-step closest approach catches a crossing missed by both endpoints", () => {
  const result = closestApproachOnRelativeSegment(
    { x: 120, y: 30, z: 0 },
    { x: -80, y: 30, z: 0 },
  );
  assert.equal(result.distanceM, 30);
  assert.equal(result.fraction, 0.6);
});

test("closest approach clamps to the retained segment endpoints", () => {
  assert.deepEqual(
    closestApproachOnRelativeSegment(
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ),
    { distanceM: 10, fraction: 0 },
  );
  assert.deepEqual(
    closestApproachOnRelativeSegment(
      { x: 20, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ),
    { distanceM: 10, fraction: 1 },
  );
});

test("stationary relative geometry remains deterministic", () => {
  assert.deepEqual(
    closestApproachOnRelativeSegment(
      { x: 3, y: 4, z: 12 },
      { x: 3, y: 4, z: 12 },
    ),
    { distanceM: 13, fraction: 0 },
  );
});
