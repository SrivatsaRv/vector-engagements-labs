export type SixDofVector3 = { x: number; y: number; z: number };
export type SixDofQuaternion = { w: number; x: number; y: number; z: number };
export type SixDofInertia = {
  xx: number; xy: number; xz: number;
  yx: number; yy: number; yz: number;
  zx: number; zy: number; zz: number;
};

export type SixDofVerificationInput = {
  schemaVersion: "vector.sixdof-verification-input.v1";
  frameConvention: {
    worldFrame: "RIGHT_HANDED_INERTIAL_XYZ";
    bodyFrame: "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN";
    attitude: "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION";
    stateReference: "CENTER_OF_GRAVITY";
    units: "SI";
  };
  fixedStepSeconds: number;
  tickCount: number;
  massProperties: {
    massKg: number;
    cgBodyM: SixDofVector3;
    inertiaKgM2: SixDofInertia;
  };
  initialState: SixDofVerificationState;
  appliedWrench: {
    bodyForceN: SixDofVector3;
    bodyMomentNm: SixDofVector3;
  };
};

export type SixDofVerificationState = {
  positionWorldM: SixDofVector3;
  velocityBodyMps: SixDofVector3;
  angularRateBodyRadS: SixDofVector3;
  bodyToWorldQuaternion: SixDofQuaternion;
};

export type SixDofVerificationRun = {
  schemaVersion: "vector.sixdof-verification-run.v1";
  backend: "typescript" | "rust-wasm";
  numericalMethod: "RK4_FIXED_STEP_WITH_QUATERNION_NORMALIZATION";
  fixedStepSeconds: number;
  tickCount: number;
  frames: Array<{ tick: number; timeSeconds: number; state: SixDofVerificationState }>;
  diagnostics: {
    maximumQuaternionNormError: number;
    relativeRotationalEnergyDrift: number;
    relativeInertialAngularMomentumDrift: number;
  };
};

export const SIX_DOF_VERIFICATION_LIMITS = Object.freeze({
  minimumFixedStepSeconds: 1e-6,
  maximumFixedStepSeconds: 1,
  maximumTickCount: 100_000,
  maximumMassKg: 1e9,
  maximumInertiaKgM2: 1e15,
  maximumAbsoluteState: 1e9,
  maximumAbsoluteWrench: 1e12,
});

const VECTOR_KEYS = ["x", "y", "z"] as const;
const QUATERNION_KEYS = ["w", "x", "y", "z"] as const;
const INERTIA_KEYS = ["xx", "xy", "xz", "yx", "yy", "yz", "zx", "zy", "zz"] as const;

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object with exact keys.`);
  }
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exact keys: ${wanted.join(", ")}.`);
  }
}

function assertFiniteBound(value: unknown, limit: number, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  if (Math.abs(value) > limit) throw new Error(`${label} exceeds its declared bound.`);
}

function validateVector(value: SixDofVector3, limit: number, label: string) {
  assertExactKeys(value, VECTOR_KEYS, label);
  for (const key of VECTOR_KEYS) assertFiniteBound(value[key], limit, `${label}.${key}`);
}

function validateQuaternion(value: SixDofQuaternion) {
  assertExactKeys(value, QUATERNION_KEYS, "initialState.bodyToWorldQuaternion");
  for (const key of QUATERNION_KEYS) {
    assertFiniteBound(value[key], SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, `quaternion.${key}`);
  }
  const norm = Math.hypot(value.w, value.x, value.y, value.z);
  if (norm < 1e-12 || norm > 1e6) throw new Error("The body-to-world quaternion has an invalid norm.");
}

function validateInput(input: SixDofVerificationInput) {
  assertExactKeys(input, [
    "schemaVersion", "frameConvention", "fixedStepSeconds", "tickCount",
    "massProperties", "initialState", "appliedWrench",
  ], "six-DOF input");
  if (input.schemaVersion !== "vector.sixdof-verification-input.v1") {
    throw new Error("Unsupported six-DOF verification schema.");
  }
  assertExactKeys(input.frameConvention, ["worldFrame", "bodyFrame", "attitude", "stateReference", "units"], "frameConvention");
  if (
    input.frameConvention.worldFrame !== "RIGHT_HANDED_INERTIAL_XYZ" ||
    input.frameConvention.bodyFrame !== "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN" ||
    input.frameConvention.attitude !== "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION" ||
    input.frameConvention.stateReference !== "CENTER_OF_GRAVITY" ||
    input.frameConvention.units !== "SI"
  ) throw new Error("Unsupported six-DOF frame, reference, attitude, or unit convention.");
  assertFiniteBound(input.fixedStepSeconds, SIX_DOF_VERIFICATION_LIMITS.maximumFixedStepSeconds, "fixedStepSeconds");
  if (input.fixedStepSeconds < SIX_DOF_VERIFICATION_LIMITS.minimumFixedStepSeconds) {
    throw new Error("fixedStepSeconds is outside its declared bound.");
  }
  if (!Number.isSafeInteger(input.tickCount) || input.tickCount < 0 || input.tickCount > SIX_DOF_VERIFICATION_LIMITS.maximumTickCount) {
    throw new Error("tickCount must be a bounded non-negative safe integer.");
  }
  assertExactKeys(input.massProperties, ["massKg", "cgBodyM", "inertiaKgM2"], "massProperties");
  assertFiniteBound(input.massProperties.massKg, SIX_DOF_VERIFICATION_LIMITS.maximumMassKg, "massKg");
  if (input.massProperties.massKg <= 0) throw new Error("massKg must be positive.");
  validateVector(input.massProperties.cgBodyM, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "cgBodyM");
  assertExactKeys(input.massProperties.inertiaKgM2, INERTIA_KEYS, "inertiaKgM2");
  const inertia = input.massProperties.inertiaKgM2;
  for (const key of INERTIA_KEYS) {
    assertFiniteBound(inertia[key], SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2, `inertiaKgM2.${key}`);
  }
  if (inertia.xy !== inertia.yx || inertia.xz !== inertia.zx || inertia.yz !== inertia.zy) {
    throw new Error("The inertia tensor must be exactly symmetric.");
  }
  const leading2 = inertia.xx * inertia.yy - inertia.xy * inertia.xy;
  const determinant = determinant3(inertia);
  if (inertia.xx <= 0 || leading2 <= 0 || determinant <= 0 || !Number.isFinite(determinant)) {
    throw new Error("The inertia tensor must be symmetric positive definite.");
  }
  assertExactKeys(input.initialState, ["positionWorldM", "velocityBodyMps", "angularRateBodyRadS", "bodyToWorldQuaternion"], "initialState");
  validateVector(input.initialState.positionWorldM, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "positionWorldM");
  validateVector(input.initialState.velocityBodyMps, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "velocityBodyMps");
  validateVector(input.initialState.angularRateBodyRadS, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "angularRateBodyRadS");
  validateQuaternion(input.initialState.bodyToWorldQuaternion);
  assertExactKeys(input.appliedWrench, ["bodyForceN", "bodyMomentNm"], "appliedWrench");
  validateVector(input.appliedWrench.bodyForceN, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteWrench, "bodyForceN");
  validateVector(input.appliedWrench.bodyMomentNm, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteWrench, "bodyMomentNm");
}

const add = (a: SixDofVector3, b: SixDofVector3): SixDofVector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: SixDofVector3, scalar: number): SixDofVector3 => ({ x: a.x * scalar, y: a.y * scalar, z: a.z * scalar });
const cross = (a: SixDofVector3, b: SixDofVector3): SixDofVector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: SixDofVector3, b: SixDofVector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm3 = (a: SixDofVector3) => Math.hypot(a.x, a.y, a.z);
const subtract = (a: SixDofVector3, b: SixDofVector3) => add(a, scale(b, -1));

function determinant3(i: SixDofInertia) {
  return i.xx * (i.yy * i.zz - i.yz * i.zy)
    - i.xy * (i.yx * i.zz - i.yz * i.zx)
    + i.xz * (i.yx * i.zy - i.yy * i.zx);
}

function matrixVector(i: SixDofInertia, value: SixDofVector3): SixDofVector3 {
  return {
    x: i.xx * value.x + i.xy * value.y + i.xz * value.z,
    y: i.yx * value.x + i.yy * value.y + i.yz * value.z,
    z: i.zx * value.x + i.zy * value.y + i.zz * value.z,
  };
}

function inverseMatrixVector(i: SixDofInertia, value: SixDofVector3): SixDofVector3 {
  const det = determinant3(i);
  return {
    x: ((i.yy * i.zz - i.yz * i.zy) * value.x + (i.xz * i.zy - i.xy * i.zz) * value.y + (i.xy * i.yz - i.xz * i.yy) * value.z) / det,
    y: ((i.yz * i.zx - i.yx * i.zz) * value.x + (i.xx * i.zz - i.xz * i.zx) * value.y + (i.xz * i.yx - i.xx * i.yz) * value.z) / det,
    z: ((i.yx * i.zy - i.yy * i.zx) * value.x + (i.xy * i.zx - i.xx * i.zy) * value.y + (i.xx * i.yy - i.xy * i.yx) * value.z) / det,
  };
}

function normalizeQuaternion(q: SixDofQuaternion): SixDofQuaternion {
  const magnitude = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / magnitude, x: q.x / magnitude, y: q.y / magnitude, z: q.z / magnitude };
}

function rotateBodyToWorld(q: SixDofQuaternion, v: SixDofVector3): SixDofVector3 {
  const qv = { x: q.x, y: q.y, z: q.z };
  const normSquared = q.w * q.w + dot(qv, qv);
  const twiceCross = scale(cross(qv, v), 2 / normSquared);
  return add(v, add(scale(twiceCross, q.w), cross(qv, twiceCross)));
}

function quaternionDerivative(q: SixDofQuaternion, omega: SixDofVector3): SixDofQuaternion {
  return {
    w: -0.5 * (q.x * omega.x + q.y * omega.y + q.z * omega.z),
    x: 0.5 * (q.w * omega.x + q.y * omega.z - q.z * omega.y),
    y: 0.5 * (q.w * omega.y + q.z * omega.x - q.x * omega.z),
    z: 0.5 * (q.w * omega.z + q.x * omega.y - q.y * omega.x),
  };
}

type Derivative = SixDofVerificationState;

function derivative(input: SixDofVerificationInput, state: SixDofVerificationState): Derivative {
  const angularMomentumBody = matrixVector(input.massProperties.inertiaKgM2, state.angularRateBodyRadS);
  return {
    positionWorldM: rotateBodyToWorld(state.bodyToWorldQuaternion, state.velocityBodyMps),
    velocityBodyMps: subtract(
      scale(input.appliedWrench.bodyForceN, 1 / input.massProperties.massKg),
      cross(state.angularRateBodyRadS, state.velocityBodyMps),
    ),
    angularRateBodyRadS: inverseMatrixVector(
      input.massProperties.inertiaKgM2,
      subtract(input.appliedWrench.bodyMomentNm, cross(state.angularRateBodyRadS, angularMomentumBody)),
    ),
    bodyToWorldQuaternion: quaternionDerivative(state.bodyToWorldQuaternion, state.angularRateBodyRadS),
  };
}

function advanceState(state: SixDofVerificationState, change: Derivative, factor: number): SixDofVerificationState {
  return {
    positionWorldM: add(state.positionWorldM, scale(change.positionWorldM, factor)),
    velocityBodyMps: add(state.velocityBodyMps, scale(change.velocityBodyMps, factor)),
    angularRateBodyRadS: add(state.angularRateBodyRadS, scale(change.angularRateBodyRadS, factor)),
    bodyToWorldQuaternion: {
      w: state.bodyToWorldQuaternion.w + change.bodyToWorldQuaternion.w * factor,
      x: state.bodyToWorldQuaternion.x + change.bodyToWorldQuaternion.x * factor,
      y: state.bodyToWorldQuaternion.y + change.bodyToWorldQuaternion.y * factor,
      z: state.bodyToWorldQuaternion.z + change.bodyToWorldQuaternion.z * factor,
    },
  };
}

function rk4(input: SixDofVerificationInput, state: SixDofVerificationState) {
  const dt = input.fixedStepSeconds;
  const k1 = derivative(input, state);
  const k2 = derivative(input, advanceState(state, k1, dt / 2));
  const k3 = derivative(input, advanceState(state, k2, dt / 2));
  const k4 = derivative(input, advanceState(state, k3, dt));
  const combineVector = (key: "positionWorldM" | "velocityBodyMps" | "angularRateBodyRadS") => scale(add(add(k1[key], scale(k2[key], 2)), add(scale(k3[key], 2), k4[key])), dt / 6);
  const q = state.bodyToWorldQuaternion;
  const combinedQ = {
    w: q.w + dt * (k1.bodyToWorldQuaternion.w + 2 * k2.bodyToWorldQuaternion.w + 2 * k3.bodyToWorldQuaternion.w + k4.bodyToWorldQuaternion.w) / 6,
    x: q.x + dt * (k1.bodyToWorldQuaternion.x + 2 * k2.bodyToWorldQuaternion.x + 2 * k3.bodyToWorldQuaternion.x + k4.bodyToWorldQuaternion.x) / 6,
    y: q.y + dt * (k1.bodyToWorldQuaternion.y + 2 * k2.bodyToWorldQuaternion.y + 2 * k3.bodyToWorldQuaternion.y + k4.bodyToWorldQuaternion.y) / 6,
    z: q.z + dt * (k1.bodyToWorldQuaternion.z + 2 * k2.bodyToWorldQuaternion.z + 2 * k3.bodyToWorldQuaternion.z + k4.bodyToWorldQuaternion.z) / 6,
  };
  const next = {
    positionWorldM: add(state.positionWorldM, combineVector("positionWorldM")),
    velocityBodyMps: add(state.velocityBodyMps, combineVector("velocityBodyMps")),
    angularRateBodyRadS: add(state.angularRateBodyRadS, combineVector("angularRateBodyRadS")),
    bodyToWorldQuaternion: normalizeQuaternion(combinedQ),
  };
  for (const vector of [next.positionWorldM, next.velocityBodyMps, next.angularRateBodyRadS]) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error("Six-DOF integration produced non-finite state.");
  }
  return next;
}

function rotationalEnergy(inertia: SixDofInertia, state: SixDofVerificationState) {
  return 0.5 * dot(state.angularRateBodyRadS, matrixVector(inertia, state.angularRateBodyRadS));
}

function inertialAngularMomentum(inertia: SixDofInertia, state: SixDofVerificationState) {
  return rotateBodyToWorld(state.bodyToWorldQuaternion, matrixVector(inertia, state.angularRateBodyRadS));
}

export function runSixDofVerification(input: SixDofVerificationInput): SixDofVerificationRun {
  validateInput(input);
  let state: SixDofVerificationState = {
    positionWorldM: { ...input.initialState.positionWorldM },
    velocityBodyMps: { ...input.initialState.velocityBodyMps },
    angularRateBodyRadS: { ...input.initialState.angularRateBodyRadS },
    bodyToWorldQuaternion: normalizeQuaternion(input.initialState.bodyToWorldQuaternion),
  };
  const initialEnergy = rotationalEnergy(input.massProperties.inertiaKgM2, state);
  const initialMomentum = inertialAngularMomentum(input.massProperties.inertiaKgM2, state);
  let maximumQuaternionNormError = Math.abs(Math.hypot(...Object.values(state.bodyToWorldQuaternion)) - 1);
  const frames = [{ tick: 0, timeSeconds: 0, state: structuredClone(state) }];
  for (let tick = 1; tick <= input.tickCount; tick += 1) {
    state = rk4(input, state);
    maximumQuaternionNormError = Math.max(maximumQuaternionNormError, Math.abs(Math.hypot(...Object.values(state.bodyToWorldQuaternion)) - 1));
    frames.push({ tick, timeSeconds: tick * input.fixedStepSeconds, state: structuredClone(state) });
  }
  const finalEnergy = rotationalEnergy(input.massProperties.inertiaKgM2, state);
  const finalMomentum = inertialAngularMomentum(input.massProperties.inertiaKgM2, state);
  return {
    schemaVersion: "vector.sixdof-verification-run.v1",
    backend: "typescript",
    numericalMethod: "RK4_FIXED_STEP_WITH_QUATERNION_NORMALIZATION",
    fixedStepSeconds: input.fixedStepSeconds,
    tickCount: input.tickCount,
    frames,
    diagnostics: {
      maximumQuaternionNormError,
      relativeRotationalEnergyDrift: Math.abs(finalEnergy - initialEnergy) / Math.max(Math.abs(initialEnergy), 1e-15),
      relativeInertialAngularMomentumDrift: norm3(subtract(finalMomentum, initialMomentum)) / Math.max(norm3(initialMomentum), 1e-15),
    },
  };
}
