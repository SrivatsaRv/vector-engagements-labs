import type { Vec3 } from "./primitives.ts";

export type SegmentClosestApproach = {
  distanceM: number;
  fraction: number;
};

/**
 * Exact minimum of the linearly interpolated relative-position segment for one
 * fixed integration step. This is deliberately independent of rendered frame
 * sampling so a fast crossing between retained samples cannot be missed.
 */
export function closestApproachOnRelativeSegment(
  relativePositionAtStartM: Vec3,
  relativePositionAtEndM: Vec3,
): SegmentClosestApproach {
  const delta = {
    x: relativePositionAtEndM.x - relativePositionAtStartM.x,
    y: relativePositionAtEndM.y - relativePositionAtStartM.y,
    z: relativePositionAtEndM.z - relativePositionAtStartM.z,
  };
  const denominator = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
  const unclamped = denominator === 0
    ? 0
    : -(
        relativePositionAtStartM.x * delta.x +
        relativePositionAtStartM.y * delta.y +
        relativePositionAtStartM.z * delta.z
      ) / denominator;
  const fraction = Math.max(0, Math.min(1, unclamped));
  const closest = {
    x: relativePositionAtStartM.x + delta.x * fraction,
    y: relativePositionAtStartM.y + delta.y * fraction,
    z: relativePositionAtStartM.z + delta.z * fraction,
  };
  return {
    distanceM: Math.hypot(closest.x, closest.y, closest.z),
    fraction,
  };
}
