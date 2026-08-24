import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import {
  runRustWasmSixDofVerification,
  SIX_DOF_FOUNDATION_VERIFIER_ARTIFACT,
} from "../lib/validation/sixdof-foundation-wasm.ts";
import {
  runSixDofVerification,
  SIX_DOF_VERIFICATION_LIMITS,
} from "../lib/validation/sixdof-foundation.ts";

const ZERO = { x: 0, y: 0, z: 0 };

test("the isolated 6DOF verification artifact has a stable bounded identity", () => {
  assert.match(SIX_DOF_FOUNDATION_VERIFIER_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
  assert.ok(SIX_DOF_FOUNDATION_VERIFIER_ARTIFACT.bytes > 100_000);
  assert.ok(SIX_DOF_FOUNDATION_VERIFIER_ARTIFACT.bytes < 500_000);
});

test("production Rust, WASM, backend, and Worker surfaces contain no 6DOF verifier", () => {
  const productionPaths = [
    new URL("../engine-rust/src/lib.rs", import.meta.url),
    new URL("../engine-rust/src/wasm_abi.rs", import.meta.url),
    new URL("../lib/engine/backend.ts", import.meta.url),
  ];
  for (const path of productionPaths) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /six.?dof|sixdof/i, path.pathname);
  }
  const generated = readFileSync(new URL("../lib/engine/generated/vector-engine-wasm.ts", import.meta.url), "utf8");
  const base64 = generated.match(/VECTOR_ENGINE_WASM_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(base64);
  const bytes = Buffer.from(base64, "base64");
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map(({ name }) => name);
  assert.ok(!exports.some((name) => /six.?dof|sixdof/i.test(name)));
  assert.doesNotMatch(new TextDecoder().decode(bytes), /six.?dof|sixdof/i);
  const collect = (directory) => existsSync(directory)
    ? readdirSync(directory).flatMap((entry) => {
      const path = new URL(entry, directory.href.endsWith("/") ? directory : new URL(`${directory.href}/`));
      return statSync(path).isDirectory() ? collect(path) : [path];
    })
    : [];
  for (const path of collect(new URL("../dist/", import.meta.url)).filter((entry) => /simulation\.worker-.*\.js$/.test(entry.pathname))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /vector_sixdof_verification_run_json|sixdof-foundation/i, path.pathname);
  }
});

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
const vectorDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function independentRotateBodyToWorld(quaternion, vector) {
  const magnitude = Math.hypot(quaternion.w, quaternion.x, quaternion.y, quaternion.z);
  const w = quaternion.w / magnitude;
  const x = quaternion.x / magnitude;
  const y = quaternion.y / magnitude;
  const z = quaternion.z / magnitude;
  return {
    x: (1 - 2 * (y * y + z * z)) * vector.x + 2 * (x * y - w * z) * vector.y + 2 * (x * z + w * y) * vector.z,
    y: 2 * (x * y + w * z) * vector.x + (1 - 2 * (x * x + z * z)) * vector.y + 2 * (y * z - w * x) * vector.z,
    z: 2 * (x * z - w * y) * vector.x + 2 * (y * z + w * x) * vector.y + (1 - 2 * (x * x + y * y)) * vector.z,
  };
}

function independentRotationalEnergy(inertia, omega) {
  return 0.5 * (
    inertia.xx * omega.x ** 2 + inertia.yy * omega.y ** 2 + inertia.zz * omega.z ** 2 +
    2 * inertia.xy * omega.x * omega.y +
    2 * inertia.xz * omega.x * omega.z +
    2 * inertia.yz * omega.y * omega.z
  );
}

function independentInertialAngularMomentum(inertia, state) {
  const omega = state.angularRateBodyRadS;
  const body = {
    x: inertia.xx * omega.x + inertia.xy * omega.y + inertia.xz * omega.z,
    y: inertia.xy * omega.x + inertia.yy * omega.y + inertia.yz * omega.z,
    z: inertia.xz * omega.x + inertia.yz * omega.y + inertia.zz * omega.z,
  };
  return independentRotateBodyToWorld(state.bodyToWorldQuaternion, body);
}

function assertBothReject(input, pattern) {
  assert.throws(() => runSixDofVerification(input), pattern);
  assert.throws(() => runRustWasmSixDofVerification(input), pattern);
}

function adjacentFloat(value, ulps) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value);
  const direction = value < 0 ? -BigInt(ulps) : BigInt(ulps);
  view.setBigUint64(0, view.getBigUint64(0) + direction);
  return view.getFloat64(0);
}

function admissionState(run, input) {
  try {
    run(input);
    return "ACCEPTED";
  } catch {
    return "REJECTED";
  }
}

function assertMatchingAdmission(input, context) {
  assert.equal(
    admissionState(runRustWasmSixDofVerification, input),
    admissionState(runSixDofVerification, input),
    context,
  );
}

function canonicalAngularIncrementIsAdmitted(rate, stepSeconds) {
  const x = rate.x * stepSeconds;
  const y = rate.y * stepSeconds;
  const z = rate.z * stepSeconds;
  return ((x * x + y * y) + z * z) <= 0.25 * 0.25;
}

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
  const input = caseInput({
    tickCount: 200,
    appliedWrench: { bodyForceN: { x: 20, y: 0, z: 0 }, bodyMomentNm: { ...ZERO } },
  });
  for (const run of [runSixDofVerification(input), runRustWasmSixDofVerification(input)]) {
    assert.ok(Math.abs(last(run).state.velocityBodyMps.x - 4) < 1e-12);
    assert.ok(Math.abs(last(run).state.positionWorldM.x - 4) < 1e-12);
    assert.equal(run.diagnostics.conservationState, "NOT_APPLICABLE_NONZERO_WRENCH");
    assert.equal(run.diagnostics.relativeRotationalEnergyDrift, null);
    assert.equal(run.diagnostics.relativeInertialAngularMomentumDrift, null);
  }
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
  for (const run of [runSixDofVerification(input), runRustWasmSixDofVerification(input)]) {
    const initial = run.frames[0].state;
    const final = last(run).state;
    const inertia = input.massProperties.inertiaKgM2;
    const expectedEnergyDrift = Math.abs(
      independentRotationalEnergy(inertia, final.angularRateBodyRadS) -
      independentRotationalEnergy(inertia, initial.angularRateBodyRadS)
    ) / independentRotationalEnergy(inertia, initial.angularRateBodyRadS);
    const initialMomentum = independentInertialAngularMomentum(inertia, initial);
    const finalMomentum = independentInertialAngularMomentum(inertia, final);
    const expectedMomentumDrift = vectorDistance(initialMomentum, finalMomentum) / norm(initialMomentum);
    assert.equal(run.diagnostics.conservationState, "AVAILABLE_ZERO_WRENCH");
    assert.ok(run.diagnostics.maximumQuaternionNormError < 5e-16);
    assert.ok(run.diagnostics.relativeRotationalEnergyDrift < 1e-12);
    assert.ok(run.diagnostics.relativeInertialAngularMomentumDrift < 1e-11);
    assert.ok(Math.abs(run.diagnostics.relativeRotationalEnergyDrift - expectedEnergyDrift) < 1e-16);
    assert.ok(Math.abs(run.diagnostics.relativeInertialAngularMomentumDrift - expectedMomentumDrift) < 1e-16);
  }
});

test("body/world rotation and rotating-body translation follow independent closed-form oracles", () => {
  const quarterTurn = Math.PI / 4;
  const orientedInput = caseInput({
    fixedStepSeconds: 0.01,
    tickCount: 100,
    initialState: {
      ...caseInput().initialState,
      velocityBodyMps: { x: 10, y: 0, z: 0 },
      bodyToWorldQuaternion: { w: Math.cos(quarterTurn), x: 0, y: 0, z: Math.sin(quarterTurn) },
    },
  });
  const independentWorldVelocity = independentRotateBodyToWorld(
    orientedInput.initialState.bodyToWorldQuaternion,
    orientedInput.initialState.velocityBodyMps,
  );
  assert.ok(Math.abs(independentWorldVelocity.x) < 1e-14);
  assert.ok(Math.abs(independentWorldVelocity.y - 10) < 1e-14);
  for (const oriented of [runSixDofVerification(orientedInput), runRustWasmSixDofVerification(orientedInput)]) {
    assert.ok(Math.abs(last(oriented).state.positionWorldM.x) < 1e-12);
    assert.ok(Math.abs(last(oriented).state.positionWorldM.y - 10) < 1e-12);
  }

  const angularRate = 0.4;
  const duration = 1;
  const rotatingInput = caseInput({
    fixedStepSeconds: 0.002,
    tickCount: duration / 0.002,
    initialState: {
      ...caseInput().initialState,
      velocityBodyMps: { x: 10, y: 0, z: 0 },
      angularRateBodyRadS: { x: 0, y: 0, z: angularRate },
    },
  });
  for (const rotating of [runSixDofVerification(rotatingInput), runRustWasmSixDofVerification(rotatingInput)]) {
    assert.ok(Math.abs(last(rotating).state.positionWorldM.x - 10) < 1e-11);
    assert.ok(Math.abs(last(rotating).state.positionWorldM.y) < 1e-11);
    assert.ok(Math.abs(last(rotating).state.velocityBodyMps.x - 10 * Math.cos(angularRate * duration)) < 1e-11);
    assert.ok(Math.abs(last(rotating).state.velocityBodyMps.y + 10 * Math.sin(angularRate * duration)) < 1e-11);
  }
});

test("a fully coupled SPD tensor follows an independent eigenaxis solution in both backends", () => {
  const inertia = {
    xx: 4, xy: 1, xz: 0.5,
    yx: 1, yy: 4, yz: 0.5,
    zx: 0.5, zy: 0.5, zz: 5,
  };
  const input = caseInput({
    fixedStepSeconds: 0.002,
    tickCount: 500,
    massProperties: { ...caseInput().massProperties, inertiaKgM2: inertia },
    appliedWrench: { bodyForceN: { ...ZERO }, bodyMomentNm: { x: 3, y: -3, z: 0 } },
  });
  const expectedAngle = Math.sqrt(2) / 2;
  for (const run of [runSixDofVerification(input), runRustWasmSixDofVerification(input)]) {
    const state = last(run).state;
    assert.ok(Math.abs(state.angularRateBodyRadS.x - 1) < 2e-12);
    assert.ok(Math.abs(state.angularRateBodyRadS.y + 1) < 2e-12);
    assert.ok(Math.abs(state.angularRateBodyRadS.z) < 2e-12);
    assert.ok(Math.abs(state.bodyToWorldQuaternion.w - Math.cos(expectedAngle / 2)) < 2e-10);
    assert.ok(Math.abs(state.bodyToWorldQuaternion.x - Math.sin(expectedAngle / 2) / Math.sqrt(2)) < 2e-10);
    assert.ok(Math.abs(state.bodyToWorldQuaternion.y + Math.sin(expectedAngle / 2) / Math.sqrt(2)) < 2e-10);
  }
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
  assert.throws(() => runSixDofVerification(caseInput({
    massProperties: { ...caseInput().massProperties, cgBodyM: { x: 0.001, y: 0, z: 0 } },
  })), /CG-origin/);
});

test("both backends enforce identical angular-increment and RK stage constraints", () => {
  const boundaryRate = SIX_DOF_VERIFICATION_LIMITS.maximumAngularIncrementRad / 0.01;
  const boundary = caseInput({
    tickCount: 1,
    initialState: {
      ...caseInput().initialState,
      angularRateBodyRadS: { x: boundaryRate, y: 0, z: 0 },
    },
  });
  assert.equal(runSixDofVerification(boundary).frames.length, 2);
  assert.equal(runRustWasmSixDofVerification(boundary).frames.length, 2);
  assertBothReject(caseInput({
    tickCount: 1,
    initialState: {
      ...caseInput().initialState,
      angularRateBodyRadS: { x: boundaryRate * (1 + 1e-12), y: 0, z: 0 },
    },
  }), /angular increment/);
  assertBothReject(caseInput({
    tickCount: 1,
    appliedWrench: { bodyForceN: { ...ZERO }, bodyMomentNm: { x: 20_000, y: 0, z: 0 } },
  }), /RK4 stage|angular increment/);

  const boundaryPosition = SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState - 1;
  const stateBoundary = (velocityX) => caseInput({
    tickCount: 1,
    initialState: {
      ...caseInput().initialState,
      positionWorldM: { x: boundaryPosition, y: 0, z: 0 },
      velocityBodyMps: { x: velocityX, y: 0, z: 0 },
    },
  });
  assert.equal(last(runSixDofVerification(stateBoundary(100))).state.positionWorldM.x, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState);
  assert.equal(last(runRustWasmSixDofVerification(stateBoundary(100))).state.positionWorldM.x, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState);
  assertBothReject(stateBoundary(101), /state bound/);
});

test("angular admission uses one ordered squared representation at every boundary ULP", () => {
  const mismatchRate = {
    x: 14.485848611447416,
    y: 16.020079621048747,
    z: 12.590362939227987,
  };
  const boundaryVectors = [
    { x: 0, y: 15, z: 20 },
    { x: 7, y: 24, z: 0 },
    mismatchRate,
  ];
  for (const vector of boundaryVectors) {
    const variedKey = vector.z === 0 ? "y" : "z";
    for (const varied of [
      adjacentFloat(vector[variedKey], -1),
      vector[variedKey],
      adjacentFloat(vector[variedKey], 1),
    ]) {
      const rate = { ...vector, [variedKey]: varied };
      const input = caseInput({
        tickCount: 0,
        initialState: { ...caseInput().initialState, angularRateBodyRadS: rate },
      });
      const expected = canonicalAngularIncrementIsAdmitted(rate, input.fixedStepSeconds);
      for (const run of [runSixDofVerification, runRustWasmSixDofVerification]) {
        if (expected) assert.equal(run(input).frames.length, 1);
        else assert.throws(() => run(input), /angular increment/);
      }
    }
  }
});

test("the embedded WASM ABI round-trips authored binary64 values before admission", () => {
  const preserved = 0.9999999999999999;
  const input = caseInput({
    tickCount: 0,
    initialState: {
      ...caseInput().initialState,
      positionWorldM: { x: preserved, y: 0, z: 0 },
    },
  });
  assert.equal(runSixDofVerification(input).frames[0].state.positionWorldM.x, preserved);
  assert.equal(runRustWasmSixDofVerification(input).frames[0].state.positionWorldM.x, preserved);

  for (const outside of [
    caseInput({
      tickCount: 0,
      massProperties: { ...caseInput().massProperties, massKg: adjacentFloat(1, -1) },
    }),
    caseInput({
      tickCount: 0,
      massProperties: {
        ...caseInput().massProperties,
        massKg: adjacentFloat(SIX_DOF_VERIFICATION_LIMITS.maximumMassKg, 1),
      },
    }),
    caseInput({
      tickCount: 0,
      massProperties: {
        ...caseInput().massProperties,
        inertiaKgM2: {
          xx: adjacentFloat(SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2, 1),
          xy: 0, xz: 0,
          yx: 0, yy: adjacentFloat(SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2, 1), yz: 0,
          zx: 0, zy: 0, zz: adjacentFloat(SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2, 1),
        },
      },
    }),
    caseInput({
      tickCount: 0,
      initialState: {
        ...caseInput().initialState,
        bodyToWorldQuaternion: { w: adjacentFloat(1e6, 1), x: 0, y: 0, z: 0 },
      },
    }),
  ]) assertBothReject(outside, /massKg|inertia|quaternion/i);
});

test("the embedded WASM ABI preserves angular and full-cross Cholesky admission over a deterministic ULP sweep", () => {
  const previouslyDivergentRate = {
    x: -3.6206049912700933,
    y: -23.983878218246478,
    z: 6.055146993220906,
  };
  const previouslyDivergentAngularInput = caseInput({
    tickCount: 0,
    initialState: {
      ...caseInput().initialState,
      angularRateBodyRadS: previouslyDivergentRate,
    },
  });
  assert.equal(admissionState(runSixDofVerification, previouslyDivergentAngularInput), "ACCEPTED");
  assertMatchingAdmission(previouslyDivergentAngularInput, "previously divergent angular ABI value");

  const previouslyDivergentInertia = {
    xx: 0.000001,
    xy: 2e-7,
    xz: -2.5e-7,
    yx: 2e-7,
    yy: 4.000000023283065e-8,
    yz: -4.999618530273437e-8,
    zx: -2.5e-7,
    zy: -4.999618530273437e-8,
    zz: 1.2500000023283064e-7,
  };
  const previouslyDivergentCholeskyInput = caseInput({
    tickCount: 0,
    massProperties: {
      ...caseInput().massProperties,
      inertiaKgM2: previouslyDivergentInertia,
    },
  });
  assert.equal(admissionState(runSixDofVerification, previouslyDivergentCholeskyInput), "REJECTED");
  assertMatchingAdmission(previouslyDivergentCholeskyInput, "previously divergent full-cross Cholesky ABI value");

  let generatorState = 0x6d2b79f5;
  const nextSignedInteger = () => {
    generatorState = (Math.imul(generatorState, 1664525) + 1013904223) >>> 0;
    return (generatorState % 2_000_001) - 1_000_000;
  };
  let cases = 0;
  for (let index = 0; index < 300; index += 1) {
    const raw = { x: nextSignedInteger(), y: nextSignedInteger(), z: nextSignedInteger() };
    const magnitude = Math.sqrt(raw.x * raw.x + raw.y * raw.y + raw.z * raw.z);
    const rate = {
      x: 25 * raw.x / magnitude,
      y: 25 * raw.y / magnitude,
      z: 25 * raw.z / magnitude,
    };
    for (const ulps of [-4, -2, -1, 0, 1, 2, 4]) {
      const varied = { ...rate, z: adjacentFloat(rate.z, ulps) };
      assertMatchingAdmission(caseInput({
        tickCount: 0,
        initialState: { ...caseInput().initialState, angularRateBodyRadS: varied },
      }), `angular sweep case ${index}/${ulps}`);
      cases += 1;
    }
  }

  const minimumPivot = SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot;
  for (const scale of [1e-6, 0.01, 1, 1e12, 1e15]) {
    for (const lower21 of [0.2, -0.3, 0.7071067811865475]) {
      for (const lower31 of [-0.25, 0.125]) {
        for (const lower32 of [0.25, -0.4]) {
          const lower22 = Math.sqrt(minimumPivot);
          const lower33 = Math.sqrt(minimumPivot);
          const normalized = {
            xx: 1,
            xy: lower21,
            xz: lower31,
            yx: lower21,
            yy: lower21 * lower21 + lower22 * lower22,
            yz: lower31 * lower21 + lower32 * lower22,
            zx: lower31,
            zy: lower31 * lower21 + lower32 * lower22,
            zz: lower31 * lower31 + lower32 * lower32 + lower33 * lower33,
          };
          for (const field of ["yy", "yz", "zz"]) {
            for (const ulps of [-4, -2, -1, 0, 1, 2, 4]) {
              const varied = { ...normalized, [field]: adjacentFloat(normalized[field], ulps) };
              if (field === "yz") varied.zy = varied.yz;
              const inertiaKgM2 = Object.fromEntries(
                Object.entries(varied).map(([key, value]) => [key, value * scale]),
              );
              assertMatchingAdmission(caseInput({
                tickCount: 0,
                massProperties: { ...caseInput().massProperties, inertiaKgM2 },
              }), `Cholesky sweep ${scale}/${lower21}/${lower31}/${lower32}/${field}/${ulps}`);
              cases += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 3_360);
});

test("both backends use a scale-aware Cholesky conditioning gate", () => {
  for (const scale of [1, 1e12]) {
    assertBothReject(caseInput({
      massProperties: { ...caseInput().massProperties, inertiaKgM2: {
        xx: scale, xy: 0, xz: 0,
        yx: 0, yy: scale * 1e-12, yz: 0,
        zx: 0, zy: 0, zz: scale,
      } },
    }), /conditioned positive definite/);
  }
  const coupled = caseInput({
    tickCount: 1,
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      xx: 4, xy: 1, xz: 0.5,
      yx: 1, yy: 4, yz: 0.5,
      zx: 0.5, zy: 0.5, zz: 5,
    } },
  });
  assert.equal(runSixDofVerification(coupled).frames.length, 2);
  assert.equal(runRustWasmSixDofVerification(coupled).frames.length, 2);
});

test("Cholesky admission uses one normalized exact and ULP boundary", () => {
  const diagonalCase = (scale, secondDiagonal) => caseInput({
    tickCount: 0,
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      xx: scale, xy: 0, xz: 0,
      yx: 0, yy: secondDiagonal, yz: 0,
      zx: 0, zy: 0, zz: scale,
    } },
  });
  for (const scale of [1, 0.01, 1e12]) {
    const nominal = scale * SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot;
    for (const secondDiagonal of [
      adjacentFloat(nominal, -1),
      nominal,
      adjacentFloat(nominal, 1),
    ]) {
      const expected = secondDiagonal >= nominal;
      for (const run of [runSixDofVerification, runRustWasmSixDofVerification]) {
        if (expected) assert.equal(run(diagonalCase(scale, secondDiagonal)).frames.length, 1);
        else assert.throws(() => run(diagonalCase(scale, secondDiagonal)), /conditioned positive definite/);
      }
    }
  }
});

test("subnormal mass and inertia scales fail admission before integration", () => {
  assertBothReject(caseInput({
    tickCount: 0,
    massProperties: { ...caseInput().massProperties, massKg: Number.MIN_VALUE },
  }), /minimum safe-domain bound/);
  assertBothReject(caseInput({
    tickCount: 0,
    massProperties: { ...caseInput().massProperties, inertiaKgM2: {
      xx: 1e-108, xy: 0, xz: 0,
      yx: 0, yy: 1e-108, yz: 0,
      zx: 0, zy: 0, zz: 1e-108,
    } },
  }), /minimum safe-domain bound/);
});

test("safe-domain mass and conditioned-inertia boundaries execute a zero-wrench tick", () => {
  for (const massKg of [
    SIX_DOF_VERIFICATION_LIMITS.minimumMassKg,
    SIX_DOF_VERIFICATION_LIMITS.maximumMassKg,
  ]) {
    for (const inertiaScale of [
      SIX_DOF_VERIFICATION_LIMITS.minimumInertiaScaleKgM2,
      1,
      SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2,
    ]) {
      const minimumPivot = inertiaScale * SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot;
      const input = caseInput({
        tickCount: 1,
        massProperties: {
          massKg,
          cgBodyM: { ...ZERO },
          inertiaKgM2: {
            xx: inertiaScale, xy: 0, xz: 0,
            yx: 0, yy: minimumPivot, yz: 0,
            zx: 0, zy: 0, zz: inertiaScale,
          },
        },
      });
      for (const run of [runSixDofVerification(input), runRustWasmSixDofVerification(input)]) {
        assert.equal(run.frames.length, 2);
        for (const state of run.frames.map((frame) => frame.state)) {
          for (const vector of [state.positionWorldM, state.velocityBodyMps, state.angularRateBodyRadS]) {
            assert.ok(Object.values(vector).every(Number.isFinite));
          }
        }
      }
    }
  }
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
  assert.equal(JSON.stringify(runSixDofVerification(input)), JSON.stringify(first));
  const rust = runRustWasmSixDofVerification(input);
  assert.equal(JSON.stringify(runRustWasmSixDofVerification(input)), JSON.stringify(rust));
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

test("both backends remain finite and scale-consistent at admitted numeric extremes", () => {
  const input = caseInput({
    fixedStepSeconds: SIX_DOF_VERIFICATION_LIMITS.minimumFixedStepSeconds,
    tickCount: 1,
    massProperties: {
      massKg: SIX_DOF_VERIFICATION_LIMITS.maximumMassKg,
      cgBodyM: { ...ZERO },
      inertiaKgM2: {
        xx: 1e15, xy: 1e14, xz: 5e13,
        yx: 1e14, yy: 8e14, yz: 2e13,
        zx: 5e13, zy: 2e13, zz: 9e14,
      },
    },
    initialState: {
      positionWorldM: { x: 1e9 - 2_000, y: -1e9 + 2_000, z: 1e9 - 2_000 },
      velocityBodyMps: { x: 9e8, y: -9e8, z: 9e8 },
      angularRateBodyRadS: { x: 10_000, y: 0, z: 0 },
      bodyToWorldQuaternion: { w: 1e6, x: 0, y: 0, z: 0 },
    },
    appliedWrench: {
      bodyForceN: { x: 1e12, y: -1e12, z: 1e12 },
      bodyMomentNm: { x: 1e12, y: -1e12, z: 1e12 },
    },
  });
  const typescript = last(runSixDofVerification(input)).state;
  const rust = last(runRustWasmSixDofVerification(input)).state;
  for (const key of ["positionWorldM", "velocityBodyMps", "angularRateBodyRadS", "bodyToWorldQuaternion"]) {
    for (const component of Object.keys(typescript[key])) {
      assert.ok(Number.isFinite(typescript[key][component]));
      assert.ok(Number.isFinite(rust[key][component]));
      const scale = Math.max(1, Math.abs(typescript[key][component]));
      assert.ok(Math.abs(typescript[key][component] - rust[key][component]) <= scale * 1e-12);
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
  assert.throws(() => runRustWasmSixDofVerification(caseInput({
    massProperties: { ...caseInput().massProperties, cgBodyM: { x: 0, y: 0, z: -1 } },
  })), /CG origin/i);
});
