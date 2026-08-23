import assert from "node:assert/strict";
import test from "node:test";
import { runRustWasmSixDofVerification } from "../lib/engine/backend.ts";
import {
  runSixDofVerification,
  SIX_DOF_VERIFICATION_LIMITS,
} from "../lib/validation/sixdof-foundation.ts";

const ZERO = { x: 0, y: 0, z: 0 };

function caseInput(overrides = {}) {
  return {
    schemaVersion: "vector.sixdof-verification-input.v1",
    frameConvention: {
      worldFrame: "RIGHT_HANDED_INERTIAL_XYZ",
      bodyFrame: "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN",
      attitude: "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION",
      stateReference: "CENTER_OF_GRAVITY",
      units: "SI",
    },
    fixedStepSeconds: 0.01,
    tickCount: 100,
    massProperties: {
      massKg: 10,
      cgBodyM: { ...ZERO },
      inertiaKgM2: {
        xx: 2, xy: 0, xz: 0,
        yx: 0, yy: 3, yz: 0,
        zx: 0, zy: 0, zz: 4,
      },
    },
    initialState: {
      positionWorldM: { ...ZERO },
      velocityBodyMps: { ...ZERO },
      angularRateBodyRadS: { ...ZERO },
      bodyToWorldQuaternion: { w: 1, x: 0, y: 0, z: 0 },
    },
    appliedWrench: {
      bodyForceN: { ...ZERO },
      bodyMomentNm: { ...ZERO },
    },
    ...overrides,
  };
}

const last = (run) => run.frames.at(-1);
const norm = (value) => Math.hypot(...Object.values(value));

test("force- and moment-free state remains fixed and uses the integer tick clock", () => {
  const run = runSixDofVerification(caseInput());
  assert.equal(run.schemaVersion, "vector.sixdof-verification-run.v1");
  assert.equal(run.numericalMethod, "RK4_FIXED_STEP_WITH_QUATERNION_NORMALIZATION");
  assert.equal(run.frames.length, 101);
  assert.equal(last(run).tick, 100);
  assert.equal(last(run).timeSeconds, 1);
  assert.deepEqual(last(run).state.positionWorldM, ZERO);
  assert.deepEqual(last(run).state.velocityBodyMps, ZERO);
  assert.deepEqual(last(run).state.angularRateBodyRadS, ZERO);
  assert.deepEqual(last(run).state.bodyToWorldQuaternion, { w: 1, x: 0, y: 0, z: 0 });
});

test("constant body force matches the independent one-dimensional solution", () => {
  const run = runSixDofVerification(caseInput({
    tickCount: 200,
    appliedWrench: { bodyForceN: { x: 20, y: 0, z: 0 }, bodyMomentNm: { ...ZERO } },
  }));
  assert.ok(Math.abs(last(run).state.velocityBodyMps.x - 4) < 1e-12);
  assert.ok(Math.abs(last(run).state.positionWorldM.x - 4) < 1e-12);
});

test("constant principal-axis moment matches angular acceleration and attitude", () => {
  const run = runSixDofVerification(caseInput({
    tickCount: 100,
    appliedWrench: { bodyForceN: { ...ZERO }, bodyMomentNm: { x: 2, y: 0, z: 0 } },
  }));
  assert.ok(Math.abs(last(run).state.angularRateBodyRadS.x - 1) < 1e-12);
  const q = last(run).state.bodyToWorldQuaternion;
  assert.ok(Math.abs(q.w - Math.cos(0.25)) < 2e-10);
  assert.ok(Math.abs(q.x - Math.sin(0.25)) < 2e-10);
  assert.ok(Math.abs(norm(q) - 1) < 1e-14);
});

test("torque-free asymmetric rotation preserves inertial momentum and energy bounds", () => {
  const input = caseInput({
    fixedStepSeconds: 0.001,
    tickCount: 10_000,
    initialState: {
      positionWorldM: { ...ZERO },
      velocityBodyMps: { ...ZERO },
      angularRateBodyRadS: { x: 0.7, y: 1.1, z: 1.3 },
      bodyToWorldQuaternion: { w: 1, x: 0, y: 0, z: 0 },
    },
  });
  const run = runSixDofVerification(input);
  assert.ok(run.diagnostics.maximumQuaternionNormError < 5e-16);
  assert.ok(run.diagnostics.relativeRotationalEnergyDrift < 1e-12);
  assert.ok(run.diagnostics.relativeInertialAngularMomentumDrift < 1e-11);
});

test("smaller steps converge for a coupled force and moment case", () => {
  const initialState = {
    positionWorldM: { x: 1, y: -2, z: 3 },
    velocityBodyMps: { x: 50, y: 2, z: -4 },
    angularRateBodyRadS: { x: 0.4, y: -0.3, z: 0.2 },
    bodyToWorldQuaternion: { w: 0.9, x: 0.1, y: -0.2, z: 0.3 },
  };
  const wrench = {
    bodyForceN: { x: 15, y: -8, z: 4 },
    bodyMomentNm: { x: 0.7, y: -0.5, z: 0.3 },
  };
  const coarse = last(runSixDofVerification(caseInput({
    fixedStepSeconds: 0.02, tickCount: 50, initialState, appliedWrench: wrench,
  }))).state;
  const medium = last(runSixDofVerification(caseInput({
    fixedStepSeconds: 0.01, tickCount: 100, initialState, appliedWrench: wrench,
  }))).state;
  const fine = last(runSixDofVerification(caseInput({
    fixedStepSeconds: 0.005, tickCount: 200, initialState, appliedWrench: wrench,
  }))).state;
  const stateDistance = (a, b) => Math.hypot(
    a.positionWorldM.x - b.positionWorldM.x,
    a.positionWorldM.y - b.positionWorldM.y,
    a.positionWorldM.z - b.positionWorldM.z,
    a.velocityBodyMps.x - b.velocityBodyMps.x,
    a.velocityBodyMps.y - b.velocityBodyMps.y,
    a.velocityBodyMps.z - b.velocityBodyMps.z,
    a.angularRateBodyRadS.x - b.angularRateBodyRadS.x,
    a.angularRateBodyRadS.y - b.angularRateBodyRadS.y,
    a.angularRateBodyRadS.z - b.angularRateBodyRadS.z,
  );
  assert.ok(stateDistance(medium, fine) < stateDistance(coarse, medium) / 8);
});

test("schema, finite, work, inertia, and quaternion violations fail closed", () => {
  assert.throws(() => runSixDofVerification({ ...caseInput(), extra: true }), /exact keys/);
  assert.throws(() => runSixDofVerification({ ...caseInput(), tickCount: 1.5 }), /tickCount/);
  assert.throws(() => runSixDofVerification({
    ...caseInput(), tickCount: SIX_DOF_VERIFICATION_LIMITS.maximumTickCount + 1,
  }), /tickCount/);
  assert.throws(() => runSixDofVerification({ ...caseInput(), fixedStepSeconds: Number.NaN }), /finite/);
  assert.throws(() => runSixDofVerification(caseInput({
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      xx: 1, xy: 2, xz: 0, yx: 2, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1,
    } },
  })), /positive definite/);
  assert.throws(() => runSixDofVerification(caseInput({
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      ...caseInput().massProperties.inertiaKgM2, yx: 0.1,
    } },
  })), /symmetric/);
  assert.throws(() => runSixDofVerification(caseInput({
    initialState: { ...caseInput().initialState, bodyToWorldQuaternion: { w: 0, x: 0, y: 0, z: 0 } },
  })), /quaternion/);
});

test("runs repeat exactly and TypeScript matches Rust/WASM within the declared parity tolerance", () => {
  const input = caseInput({
    fixedStepSeconds: 0.002,
    tickCount: 500,
    initialState: {
      positionWorldM: { x: 10, y: -5, z: 2 },
      velocityBodyMps: { x: 100, y: 3, z: -1 },
      angularRateBodyRadS: { x: 0.2, y: -0.1, z: 0.3 },
      bodyToWorldQuaternion: { w: 2, x: 0.2, y: -0.1, z: 0.3 },
    },
    appliedWrench: {
      bodyForceN: { x: 40, y: -10, z: 20 },
      bodyMomentNm: { x: 0.5, y: 0.2, z: -0.3 },
    },
  });
  const first = runSixDofVerification(input);
  assert.deepEqual(runSixDofVerification(input), first);
  const rust = runRustWasmSixDofVerification(input);
  assert.equal(rust.backend, "rust-wasm");
  assert.equal(rust.frames.length, first.frames.length);
  for (let index = 0; index < first.frames.length; index += 1) {
    const tsState = first.frames[index].state;
    const rustState = rust.frames[index].state;
    for (const key of ["positionWorldM", "velocityBodyMps", "angularRateBodyRadS", "bodyToWorldQuaternion"]) {
      for (const component of Object.keys(tsState[key])) {
        assert.ok(Math.abs(tsState[key][component] - rustState[key][component]) <= 2e-12);
      }
    }
  }
});

test("the Rust/WASM boundary independently rejects unknown fields, invalid inertia, quaternion, and work", () => {
  assert.throws(
    () => runRustWasmSixDofVerification({ ...caseInput(), extra: true }),
    /unknown field.*extra/i,
  );
  assert.throws(() => runRustWasmSixDofVerification(caseInput({
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      xx: 1, xy: 2, xz: 0, yx: 2, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1,
    } },
  })), /positive definite/);
  assert.throws(() => runRustWasmSixDofVerification(caseInput({
    initialState: { ...caseInput().initialState, bodyToWorldQuaternion: { w: 0, x: 0, y: 0, z: 0 } },
  })), /quaternion/);
  assert.throws(() => runRustWasmSixDofVerification({
    ...caseInput(), tickCount: SIX_DOF_VERIFICATION_LIMITS.maximumTickCount + 1,
  }), /tickCount|invalid value/i);
});
