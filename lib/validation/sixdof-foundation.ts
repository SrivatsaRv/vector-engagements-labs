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
    conservationState: "AVAILABLE_ZERO_WRENCH" | "NOT_APPLICABLE_NONZERO_WRENCH";
    relativeRotationalEnergyDrift: number | null;
    relativeInertialAngularMomentumDrift: number | null;
  };
};

export const SIX_DOF_VERIFICATION_LIMITS = Object.freeze({
  minimumFixedStepSeconds: 1e-6,
  maximumFixedStepSeconds: 1,
  maximumTickCount: 100_000,
  minimumMassKg: 1,
  maximumMassKg: 1e9,
  minimumInertiaScaleKgM2: 1e-6,
  maximumInertiaKgM2: 1e15,
  maximumAbsoluteState: 1e9,
  maximumAbsoluteWrench: 1e12,
  maximumAngularIncrementRad: 0.25,
  minimumStageQuaternionNorm: 0.5,
  maximumStageQuaternionNorm: 2,
  minimumRelativeCholeskyPivot: 2 ** -32,
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
  const normSquared = ((value.w * value.w + value.x * value.x) + value.y * value.y) + value.z * value.z;
  if (normSquared < 1e-24 || normSquared > 1e12) {
    throw new Error("The body-to-world quaternion has an invalid norm.");
  }
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
  if (input.massProperties.massKg < SIX_DOF_VERIFICATION_LIMITS.minimumMassKg) {
    throw new Error("massKg is below the minimum safe-domain bound.");
  }
  validateVector(input.massProperties.cgBodyM, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "cgBodyM");
  if (Object.values(input.massProperties.cgBodyM).some((value) => value !== 0)) {
    throw new Error("cgBodyM must be the exact zero vector for this CG-origin kernel.");
  }
  assertExactKeys(input.massProperties.inertiaKgM2, INERTIA_KEYS, "inertiaKgM2");
  const inertia = input.massProperties.inertiaKgM2;
  for (const key of INERTIA_KEYS) {
    assertFiniteBound(inertia[key], SIX_DOF_VERIFICATION_LIMITS.maximumInertiaKgM2, `inertiaKgM2.${key}`);
  }
  if (inertia.xy !== inertia.yx || inertia.xz !== inertia.zx || inertia.yz !== inertia.zy) {
    throw new Error("The inertia tensor must be exactly symmetric.");
  }
  validateConditionedPositiveDefiniteInertia(inertia);
  assertExactKeys(input.initialState, ["positionWorldM", "velocityBodyMps", "angularRateBodyRadS", "bodyToWorldQuaternion"], "initialState");
  validateVector(input.initialState.positionWorldM, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "positionWorldM");
  validateVector(input.initialState.velocityBodyMps, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "velocityBodyMps");
  validateVector(input.initialState.angularRateBodyRadS, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState, "angularRateBodyRadS");
  validateQuaternion(input.initialState.bodyToWorldQuaternion);
  assertAngularIncrement(input.initialState.angularRateBodyRadS, input.fixedStepSeconds, "initial state");
  assertExactKeys(input.appliedWrench, ["bodyForceN", "bodyMomentNm"], "appliedWrench");
  validateVector(input.appliedWrench.bodyForceN, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteWrench, "bodyForceN");
  validateVector(input.appliedWrench.bodyMomentNm, SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteWrench, "bodyMomentNm");
}

function validateConditionedPositiveDefiniteInertia(inertia: SixDofInertia) {
  factorConditionedInertia(inertia);
}

type ConditionedInertiaFactor = {
  scale: number;
  lower11: number;
  lower21: number;
  lower31: number;
  lower22: number;
  lower32: number;
  lower33: number;
};

function factorConditionedInertia(inertia: SixDofInertia): ConditionedInertiaFactor {
  const scale = Math.max(inertia.xx, inertia.yy, inertia.zz);
  if (!Number.isFinite(scale) || scale < SIX_DOF_VERIFICATION_LIMITS.minimumInertiaScaleKgM2) {
    throw new Error("The inertia tensor scale is below the minimum safe-domain bound.");
  }
  const normalizedXx = inertia.xx / scale;
  const normalizedYx = inertia.yx / scale;
  const normalizedYy = inertia.yy / scale;
  const normalizedZx = inertia.zx / scale;
  const normalizedZy = inertia.zy / scale;
  const normalizedZz = inertia.zz / scale;
  const firstPivot = normalizedXx;
  if (!Number.isFinite(firstPivot) || firstPivot < SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot) {
    throw new Error("The inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound.");
  }
  const lower11 = Math.sqrt(firstPivot);
  const lower21 = normalizedYx / lower11;
  const lower31 = normalizedZx / lower11;
  const secondPivot = normalizedYy - lower21 * lower21;
  if (!Number.isFinite(secondPivot) || secondPivot < SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot) {
    throw new Error("The inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound.");
  }
  const lower22 = Math.sqrt(secondPivot);
  const lower32 = (normalizedZy - lower31 * lower21) / lower22;
  const thirdPivot = (normalizedZz - lower31 * lower31) - lower32 * lower32;
  if (!Number.isFinite(thirdPivot) || thirdPivot < SIX_DOF_VERIFICATION_LIMITS.minimumRelativeCholeskyPivot) {
    throw new Error("The inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound.");
  }
  return { scale, lower11, lower21, lower31, lower22, lower32, lower33: Math.sqrt(thirdPivot) };
}

const add = (a: SixDofVector3, b: SixDofVector3): SixDofVector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: SixDofVector3, scalar: number): SixDofVector3 => ({ x: a.x * scalar, y: a.y * scalar, z: a.z * scalar });
const cross = (a: SixDofVector3, b: SixDofVector3): SixDofVector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: SixDofVector3, b: SixDofVector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const squaredNorm3 = (a: SixDofVector3) => (a.x * a.x + a.y * a.y) + a.z * a.z;
const norm3 = (a: SixDofVector3) => Math.sqrt(squaredNorm3(a));
const squaredNorm4 = (q: SixDofQuaternion) => ((q.w * q.w + q.x * q.x) + q.y * q.y) + q.z * q.z;
const subtract = (a: SixDofVector3, b: SixDofVector3) => add(a, scale(b, -1));

function matrixVector(i: SixDofInertia, value: SixDofVector3): SixDofVector3 {
  return {
    x: i.xx * value.x + i.xy * value.y + i.xz * value.z,
    y: i.yx * value.x + i.yy * value.y + i.yz * value.z,
    z: i.zx * value.x + i.zy * value.y + i.zz * value.z,
  };
}

function inverseMatrixVector(i: SixDofInertia, value: SixDofVector3): SixDofVector3 {
  const factor = factorConditionedInertia(i);
  const scaled = scale(value, 1 / factor.scale);
  const forwardX = scaled.x / factor.lower11;
  const forwardY = (scaled.y - factor.lower21 * forwardX) / factor.lower22;
  const forwardZ = ((scaled.z - factor.lower31 * forwardX) - factor.lower32 * forwardY) / factor.lower33;
  const resultZ = forwardZ / factor.lower33;
  const resultY = (forwardY - factor.lower32 * resultZ) / factor.lower22;
  const resultX = ((forwardX - factor.lower21 * resultY) - factor.lower31 * resultZ) / factor.lower11;
  return {
    x: resultX,
    y: resultY,
    z: resultZ,
  };
}

function normalizeQuaternion(q: SixDofQuaternion): SixDofQuaternion {
  const magnitude = Math.sqrt(squaredNorm4(q));
  return { w: q.w / magnitude, x: q.x / magnitude, y: q.y / magnitude, z: q.z / magnitude };
}

function assertAngularIncrement(angularRate: SixDofVector3, stepSeconds: number, label: string) {
  const scaledRate = scale(angularRate, stepSeconds);
  const squaredIncrement = squaredNorm3(scaledRate);
  const squaredLimit = SIX_DOF_VERIFICATION_LIMITS.maximumAngularIncrementRad
    * SIX_DOF_VERIFICATION_LIMITS.maximumAngularIncrementRad;
  if (!Number.isFinite(squaredIncrement) || squaredIncrement > squaredLimit) {
    throw new Error(`${label} angular increment exceeds the fixed-step bound.`);
  }
}

function assertStageQuaternion(quaternion: SixDofQuaternion, label: string) {
  const quaternionNormSquared = squaredNorm4(quaternion);
  if (
    !Number.isFinite(quaternionNormSquared) ||
    quaternionNormSquared < SIX_DOF_VERIFICATION_LIMITS.minimumStageQuaternionNorm ** 2 ||
    quaternionNormSquared > SIX_DOF_VERIFICATION_LIMITS.maximumStageQuaternionNorm ** 2
  ) throw new Error(`${label} quaternion is outside the RK4 stage norm bound.`);
}

function assertIntegrationStage(state: SixDofVerificationState, stepSeconds: number, label: string) {
  for (const [stateLabel, vector] of [
    ["position", state.positionWorldM],
    ["velocity", state.velocityBodyMps],
    ["angular rate", state.angularRateBodyRadS],
  ] as const) {
    if (Object.values(vector).some((value) => !Number.isFinite(value) || Math.abs(value) > SIX_DOF_VERIFICATION_LIMITS.maximumAbsoluteState)) {
      throw new Error(`${label} ${stateLabel} is outside the finite state bound.`);
    }
  }
  assertStageQuaternion(state.bodyToWorldQuaternion, label);
  assertAngularIncrement(state.angularRateBodyRadS, stepSeconds, label);
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
  assertIntegrationStage(state, dt, "RK4 stage 1");
  const k1 = derivative(input, state);
  const secondState = advanceState(state, k1, dt / 2);
  assertIntegrationStage(secondState, dt, "RK4 stage 2");
  const k2 = derivative(input, secondState);
  const thirdState = advanceState(state, k2, dt / 2);
  assertIntegrationStage(thirdState, dt, "RK4 stage 3");
  const k3 = derivative(input, thirdState);
  const fourthState = advanceState(state, k3, dt);
  assertIntegrationStage(fourthState, dt, "RK4 stage 4");
  const k4 = derivative(input, fourthState);
  const combineVector = (key: "positionWorldM" | "velocityBodyMps" | "angularRateBodyRadS") => scale(add(add(k1[key], scale(k2[key], 2)), add(scale(k3[key], 2), k4[key])), dt / 6);
  const q = state.bodyToWorldQuaternion;
  const combinedQ = {
    w: q.w + dt * (k1.bodyToWorldQuaternion.w + 2 * k2.bodyToWorldQuaternion.w + 2 * k3.bodyToWorldQuaternion.w + k4.bodyToWorldQuaternion.w) / 6,
    x: q.x + dt * (k1.bodyToWorldQuaternion.x + 2 * k2.bodyToWorldQuaternion.x + 2 * k3.bodyToWorldQuaternion.x + k4.bodyToWorldQuaternion.x) / 6,
    y: q.y + dt * (k1.bodyToWorldQuaternion.y + 2 * k2.bodyToWorldQuaternion.y + 2 * k3.bodyToWorldQuaternion.y + k4.bodyToWorldQuaternion.y) / 6,
    z: q.z + dt * (k1.bodyToWorldQuaternion.z + 2 * k2.bodyToWorldQuaternion.z + 2 * k3.bodyToWorldQuaternion.z + k4.bodyToWorldQuaternion.z) / 6,
  };
  assertStageQuaternion(combinedQ, "RK4 combined quaternion");
  const next = {
    positionWorldM: add(state.positionWorldM, combineVector("positionWorldM")),
    velocityBodyMps: add(state.velocityBodyMps, combineVector("velocityBodyMps")),
    angularRateBodyRadS: add(state.angularRateBodyRadS, combineVector("angularRateBodyRadS")),
    bodyToWorldQuaternion: normalizeQuaternion(combinedQ),
  };
  assertIntegrationStage(next, dt, "RK4 committed state");
  return next;
}

function rotationalEnergy(inertia: SixDofInertia, state: SixDofVerificationState) {
  const omega = state.angularRateBodyRadS;
  return 0.5 * (
    inertia.xx * omega.x ** 2 + inertia.yy * omega.y ** 2 + inertia.zz * omega.z ** 2
    + 2 * inertia.xy * omega.x * omega.y
    + 2 * inertia.xz * omega.x * omega.z
    + 2 * inertia.yz * omega.y * omega.z
  );
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
  const zeroWrench = [
    ...Object.values(input.appliedWrench.bodyForceN),
    ...Object.values(input.appliedWrench.bodyMomentNm),
  ].every((value) => value === 0);
  const initialEnergy = zeroWrench ? rotationalEnergy(input.massProperties.inertiaKgM2, state) : null;
  const initialMomentum = zeroWrench ? inertialAngularMomentum(input.massProperties.inertiaKgM2, state) : null;
  let maximumQuaternionNormError = Math.abs(Math.sqrt(squaredNorm4(state.bodyToWorldQuaternion)) - 1);
  const frames = [{ tick: 0, timeSeconds: 0, state: structuredClone(state) }];
  for (let tick = 1; tick <= input.tickCount; tick += 1) {
    state = rk4(input, state);
    maximumQuaternionNormError = Math.max(
      maximumQuaternionNormError,
      Math.abs(Math.sqrt(squaredNorm4(state.bodyToWorldQuaternion)) - 1),
    );
    frames.push({ tick, timeSeconds: tick * input.fixedStepSeconds, state: structuredClone(state) });
  }
  const finalEnergy = zeroWrench ? rotationalEnergy(input.massProperties.inertiaKgM2, state) : null;
  const finalMomentum = zeroWrench ? inertialAngularMomentum(input.massProperties.inertiaKgM2, state) : null;
  return {
    schemaVersion: "vector.sixdof-verification-run.v1",
    backend: "typescript",
    numericalMethod: "RK4_FIXED_STEP_WITH_QUATERNION_NORMALIZATION",
    fixedStepSeconds: input.fixedStepSeconds,
    tickCount: input.tickCount,
    frames,
    diagnostics: {
      maximumQuaternionNormError,
      conservationState: zeroWrench ? "AVAILABLE_ZERO_WRENCH" : "NOT_APPLICABLE_NONZERO_WRENCH",
      relativeRotationalEnergyDrift: zeroWrench && initialEnergy !== null && finalEnergy !== null
        ? Math.abs(finalEnergy - initialEnergy) / Math.max(Math.abs(initialEnergy), 1e-15)
        : null,
      relativeInertialAngularMomentumDrift: zeroWrench && initialMomentum !== null && finalMomentum !== null
        ? norm3(subtract(finalMomentum, initialMomentum)) / Math.max(norm3(initialMomentum), 1e-15)
        : null,
    },
  };
}
