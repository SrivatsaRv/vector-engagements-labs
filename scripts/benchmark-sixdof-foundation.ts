import { performance } from "node:perf_hooks";
import { runRustWasmSixDofVerification } from "../lib/validation/sixdof-foundation-wasm.ts";
import { runSixDofVerification, type SixDofVerificationInput } from "../lib/validation/sixdof-foundation.ts";

const input: SixDofVerificationInput = {
  schemaVersion: "vector.sixdof-verification-input.v1",
  frameConvention: {
    worldFrame: "RIGHT_HANDED_INERTIAL_XYZ",
    bodyFrame: "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN",
    attitude: "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION",
    stateReference: "CENTER_OF_GRAVITY",
    units: "SI",
  },
  fixedStepSeconds: 0.001,
  tickCount: 10_000,
  massProperties: {
    massKg: 10,
    cgBodyM: { x: 0, y: 0, z: 0 },
    inertiaKgM2: {
      xx: 2, xy: 0, xz: 0,
      yx: 0, yy: 3, yz: 0,
      zx: 0, zy: 0, zz: 4,
    },
  },
  initialState: {
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityBodyMps: { x: 100, y: 3, z: -2 },
    angularRateBodyRadS: { x: 0.7, y: 1.1, z: 1.3 },
    bodyToWorldQuaternion: { w: 1, x: 0, y: 0, z: 0 },
  },
  appliedWrench: {
    bodyForceN: { x: 30, y: -5, z: 8 },
    bodyMomentNm: { x: 0.2, y: -0.1, z: 0.3 },
  },
};

const measurements = [
  ["typescript", () => runSixDofVerification(input), 1_000],
  ["node-hosted-rust-wasm", () => runRustWasmSixDofVerification(input), 2_000],
] as const;

const results = measurements.map(([backend, operation, thresholdMs]) => {
  operation();
  const started = performance.now();
  const run = operation();
  const elapsedMs = performance.now() - started;
  if (run.frames.length !== input.tickCount + 1) throw new Error(`${backend} returned an incomplete batch.`);
  if (elapsedMs > thresholdMs) {
    throw new Error(`${backend} six-DOF batch took ${elapsedMs.toFixed(2)} ms; threshold is ${thresholdMs} ms.`);
  }
  return { backend, ticks: input.tickCount, elapsedMs, thresholdMs };
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.sixdof-verification-benchmark.v1",
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  results,
})}\n`);
