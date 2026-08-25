import corpus from "../../governance/nasa-tm-109057-generic-aam-verification-corpus.v5.json" with { type: "json" };
import { createHash } from "node:crypto";

type Vec3 = { x: number; y: number; z: number };

export type GenericAamVerificationInput = {
  schemaVersion: "vector.generic-aam-verification-input.v2";
  subjectId: "NASA_TM_109057_GENERIC_AAM_REFERENCE";
  intendedUse: "ENGINE_VERIFICATION_ONLY";
  semantics: "TM_109057_PRINTED_LISTING_BINARY64_V1";
  sourceSha256: string;
  corpusSha256: string;
  decisionSha256: string;
  caseRole: "PRINTED_LISTING_REPRODUCTION" | "TABLE_THRUST_CONFLICT_SENSITIVITY" | "COMMAND_LIMIT_SENSITIVITY";
  axisConvention: "EARTH_X_FORWARD_Y_RIGHT_Z_DOWN";
  units: "SI";
  tickRateHz: 32 | 64 | 128 | 256;
  maxTicks: number;
  seekerHalfAngleDeg: 15 | 20 | 30;
  seekerHalfAngleRad: 0.261798 | 0.349064 | 0.523596;
  missile: {
    speedMps: number;
    pitchRateRadS: number;
    pitchSignalMps2: number;
    yawRateRadS: number;
    yawSignalMps2: number;
    pitchRad: number;
    yawRad: number;
    positionM: Vec3;
    massKg: number;
  };
  target: {
    previousPositionM: Vec3;
    positionM: Vec3;
    velocityMps: Vec3;
  };
  constants: {
    navigationConstant: number;
    gravityMps2: number;
    maximumPitchG: number;
    maximumYawG: number;
    hitRangeM: number;
    operationalSpeedMps: number;
    motorThrustN: number;
    coastThrustN: number;
    burnSeconds: number;
    launchMassKg: number;
    burnoutMassKg: number;
    dragK1: number;
    dragK2: number;
    controlTimeConstantS: number;
  };
};

export type GenericAamTerminalState =
  | "HIT"
  | "MISS_SEEKER_LIMIT"
  | "MISS_OPENING_AFTER_BURN"
  | "MISS_GROUND_OR_ZERO_SPEED"
  | "MISS_ZERO_RELATIVE_SPEED"
  | "TIME_LIMIT";

export type GenericAamVerificationFrame = {
  tick: number;
  timeSeconds: number;
  missilePositionM: Vec3;
  targetPositionM: Vec3;
  speedMps: number;
  pitchRad: number;
  yawRad: number;
  pitchRateRadS: number;
  yawRateRadS: number;
  pitchSignalMps2: number;
  yawSignalMps2: number;
  massKg: number;
  thrustN: number;
  dragN: number;
  relativePositionM: Vec3;
  rangeM: number;
  seekerAngleRad: number;
  losRateRadS: Vec3;
  closingVelocityMps: number;
  pitchCommandMps2: number;
  yawCommandMps2: number;
  closestApproachTimeS: number;
  closestApproachDistanceM: number;
  state: "TRACKING" | GenericAamTerminalState;
};

export type GenericAamVerificationRun = {
  schemaVersion: "vector.generic-aam-verification-run.v3";
  subjectId: "NASA_TM_109057_GENERIC_AAM_REFERENCE";
  intendedUse: "ENGINE_VERIFICATION_ONLY";
  semantics: "TM_109057_PRINTED_LISTING_BINARY64_V1";
  backend: "typescript" | "rust-wasm";
  sourceSha256: string;
  corpusSha256: string;
  decisionSha256: string;
  inputSha256: string;
  outputSha256: string;
  contentSha256: string;
  caseRole: GenericAamVerificationInput["caseRole"];
  frames: GenericAamVerificationFrame[];
  terminal: { state: GenericAamTerminalState; tick: number; cause: string };
  limitations: string[];
};

export type GenericAamWorkloadCase = {
  id: string;
  tickRateHz: 32 | 64 | 128;
  seekerHalfAngleDeg: 15 | 20 | 30;
  seekerHalfAngleRad: 0.261798 | 0.349064 | 0.523596;
  maxTicks: number;
  caseRole?: GenericAamVerificationInput["caseRole"];
  targetPositionM: Vec3;
  expectedTerminal: GenericAamTerminalState;
  expectedTick: number;
  expectedCause: string;
  expectedFrameCount: number;
  semanticOutcomeSha256: string;
};

export type GenericAamSemanticOutcome = {
  schemaVersion: "vector.generic-aam-semantic-outcome.v1";
  quantization: { scheme: "ROUND_TO_NEAREST_INTEGER_BIN"; quantum: 0.000001; parityPolicyId: "TM109057_TS_RUST_PARITY_V1" };
  id: string;
  caseRole: GenericAamVerificationInput["caseRole"];
  tickRateHz: number;
  seekerHalfAngleDeg: number;
  seekerHalfAngleRad: number;
  maxTicks: number;
  targetPositionM: Vec3;
  terminalState: GenericAamTerminalState;
  terminalTick: number;
  terminalCause: string;
  frameCount: number;
  samples: Array<{
    tick: number;
    missilePositionBins: Vec3;
    speedBin: number;
    massBin: number;
    rangeBin: number;
    seekerAngleBin: number;
    pitchCommandBin: number;
    yawCommandBin: number;
  }>;
  aggregates: {
    minimumRangeBin: number;
    maximumAbsPitchCommandBin: number;
    maximumAbsYawCommandBin: number;
  };
};

const ROOT_KEYS = ["schemaVersion", "id", "version", "ownerIssue", "parentIssues", "accessedAt", "reviewedAt", "subject", "artifact", "claims", "decisions", "evaluator", "evidencePolicy", "derivedFixtures", "promotion"];
const SUBJECT_KEYS = ["id", "intendedUse", "capabilities", "prohibitedBindings"];
const ARTIFACT_KEYS = ["id", "authority", "citationId", "reportNumber", "title", "publicationDate", "recordModifiedAt", "pageCount", "recordUri", "pdfUri", "localPath", "byteLength", "sha256", "documentState", "dissemination", "curationState", "copyrightDecision", "exportControl", "ear", "itar"];
const CLAIM_KEYS = ["id", "role", "pages", "ancestry", "permits", "prohibits"];
const DECISION_KEYS = ["id", "sourceConflict", "decision", "executableValue", "limitation"];
const EVALUATOR_KEYS = ["semantics", "axisConvention", "units", "reportTickRatesHz", "convergenceTickRatesHz", "seekerHalfAngles", "caseRoles", "maximumTicks", "maximumEstimatedScalarOperations", "safeInputBounds", "terminalPrecedence", "parityPolicy"];
const SEEKER_ANGLE_KEYS = ["degrees", "printedRadians"];
const SAFE_BOUND_KEYS = ["missilePositionAbsMaxM", "missileSpeedMinMps", "missileSpeedMaxMps", "angularRateAbsMaxRadS", "controlSignalAbsMaxMps2", "pitchAbsMaxRad", "yawAbsMaxRad", "dynamicScalarAbsMax", "estimatedScalarOperationsPerTick"];
const PARITY_POLICY_KEYS = ["id", "comparator", "formula", "prerequisites", "defaultTolerance", "overrides", "rationale", "evidence"];
const PARITY_TOLERANCE_KEYS = ["absoluteTolerance", "relativeTolerance", "fields"];
const PARITY_OVERRIDE_KEYS = ["field", "absoluteTolerance", "relativeTolerance"];
const PARITY_EVIDENCE_KEYS = ["hosts", "defaultToleranceExceedances", "exceedanceCountsByCase", "maximaByField", "maximaByRateAndSeeker"];
const PARITY_HOST_KEYS = ["runtime", "platform", "architecture"];
const PARITY_CASE_COUNT_KEYS = ["caseId", "count"];
const PARITY_FIELD_MAXIMUM_KEYS = ["field", "caseId", "tick", "typescriptValue", "rustWasmValue", "absoluteDelta", "relativeDelta"];
const PARITY_MATRIX_KEYS = ["tickRateHz", "seekerHalfAngleDeg", "field", "tick", "absoluteDelta"];
const POLICY_KEYS = ["eligibleAuthorities", "ineligibleKinds"];
const DERIVED_FIXTURE_KEYS = ["id", "path", "sha256", "byteLength", "role", "evidenceRole"];
const PROMOTION_KEYS = ["runtimeAuthority", "prohibitedSurfaces"];
const WORKLOAD_KEYS = ["schemaVersion", "id", "sourceSha256", "caseCount", "cases", "expectedBatchSha256"];
const WORKLOAD_CASE_KEYS = ["id", "tickRateHz", "seekerHalfAngleDeg", "seekerHalfAngleRad", "maxTicks", "targetPositionM", "expectedTerminal", "expectedTick", "expectedCause", "expectedFrameCount", "semanticOutcomeSha256"];
const INPUT_KEYS = ["schemaVersion", "subjectId", "intendedUse", "semantics", "sourceSha256", "corpusSha256", "decisionSha256", "caseRole", "axisConvention", "units", "tickRateHz", "maxTicks", "seekerHalfAngleDeg", "seekerHalfAngleRad", "missile", "target", "constants"];
const MISSILE_KEYS = ["speedMps", "pitchRateRadS", "pitchSignalMps2", "yawRateRadS", "yawSignalMps2", "pitchRad", "yawRad", "positionM", "massKg"];
const TARGET_KEYS = ["previousPositionM", "positionM", "velocityMps"];
const CONSTANT_KEYS = ["navigationConstant", "gravityMps2", "maximumPitchG", "maximumYawG", "hitRangeM", "operationalSpeedMps", "motorThrustN", "coastThrustN", "burnSeconds", "launchMassKg", "burnoutMassKg", "dragK1", "dragK2", "controlTimeConstantS"];
const VEC_KEYS = ["x", "y", "z"] as const;
const RUN_KEYS = ["schemaVersion", "subjectId", "intendedUse", "semantics", "backend", "sourceSha256", "corpusSha256", "decisionSha256", "inputSha256", "outputSha256", "contentSha256", "caseRole", "frames", "terminal", "limitations"];
const FRAME_KEYS = ["tick", "timeSeconds", "missilePositionM", "targetPositionM", "speedMps", "pitchRad", "yawRad", "pitchRateRadS", "yawRateRadS", "pitchSignalMps2", "yawSignalMps2", "massKg", "thrustN", "dragN", "relativePositionM", "rangeM", "seekerAngleRad", "losRateRadS", "closingVelocityMps", "pitchCommandMps2", "yawCommandMps2", "closestApproachTimeS", "closestApproachDistanceM", "state"];
const TERMINAL_KEYS = ["state", "tick", "cause"];
const FRAME_NUMERIC_KEYS = FRAME_KEYS.filter((key) => !["missilePositionM", "targetPositionM", "relativePositionM", "losRateRadS", "state"].includes(key));
const PARITY_DEFAULT_FIELDS = [
  "timeSeconds", "speedMps", "pitchRad", "yawRad", "pitchRateRadS", "yawRateRadS",
  "pitchSignalMps2", "yawSignalMps2", "massKg", "thrustN", "dragN", "rangeM",
  "seekerAngleRad", "closingVelocityMps", "pitchCommandMps2", "yawCommandMps2",
  "missilePositionM.x", "missilePositionM.y", "missilePositionM.z",
  "targetPositionM.x", "targetPositionM.y", "targetPositionM.z",
  "relativePositionM.x", "relativePositionM.y", "relativePositionM.z",
  "losRateRadS.x", "losRateRadS.y", "losRateRadS.z",
] as const;
const PARITY_OVERRIDE_FIELDS = ["closestApproachTimeS", "closestApproachDistanceM"] as const;
const PARITY_SCALAR_FIELDS = [
  "timeSeconds", "speedMps", "pitchRad", "yawRad", "pitchRateRadS", "yawRateRadS",
  "pitchSignalMps2", "yawSignalMps2", "massKg", "thrustN", "dragN", "rangeM",
  "seekerAngleRad", "closingVelocityMps", "pitchCommandMps2", "yawCommandMps2",
  ...PARITY_OVERRIDE_FIELDS,
] as const;
const PARITY_VECTOR_FIELDS = ["missilePositionM", "targetPositionM", "relativePositionM", "losRateRadS"] as const;
const TERMINAL_CAUSES: Record<GenericAamTerminalState, readonly string[]> = {
  HIT: ["EXACT_ZERO_RANGE", "CPA_HIT", "SEEKER_HIT", "OPENING_HIT"],
  MISS_SEEKER_LIMIT: ["SEEKER_LIMIT"],
  MISS_OPENING_AFTER_BURN: ["POST_BURN_OPEN"],
  MISS_GROUND_OR_ZERO_SPEED: ["GROUND_ZERO"],
  MISS_ZERO_RELATIVE_SPEED: ["EXACT_ZERO_RELATIVE_SPEED"],
  TIME_LIMIT: ["TIME_LIMIT"],
};
const LIMITATIONS = ["GENERIC_VERIFICATION_ONLY", "LITERAL_PITCH_AMBIGUITY", "FIGURES_NOT_VALIDATION", "NOT_FORTRAN_BIT_REPRODUCTION"];

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function compareUtf8(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}

export const GENERIC_AAM_SEMANTIC_QUANTUM = 0.000001 as const;
export const GENERIC_AAM_PARITY_POLICY_ID = "TM109057_TS_RUST_PARITY_V1" as const;

export function genericAamSemanticBin(value: number) {
  if (!Number.isFinite(value)) throw new Error("Generic AAM semantic projection requires finite trajectory values.");
  const encoded = Math.round(value / GENERIC_AAM_SEMANTIC_QUANTUM);
  if (!Number.isSafeInteger(encoded)) throw new Error("Generic AAM semantic projection exceeded its integer-bin range.");
  return encoded === 0 ? 0 : encoded;
}

export function genericAamSemanticOutcome(
  entry: Pick<GenericAamWorkloadCase, "id" | "caseRole" | "tickRateHz" | "seekerHalfAngleDeg" | "seekerHalfAngleRad" | "maxTicks" | "targetPositionM">,
  run: GenericAamVerificationRun,
): GenericAamSemanticOutcome {
  const sampleIndexes = [...new Set([0, Math.floor((run.frames.length - 1) / 2), run.frames.length - 1])];
  return {
    schemaVersion: "vector.generic-aam-semantic-outcome.v1",
    quantization: { scheme: "ROUND_TO_NEAREST_INTEGER_BIN", quantum: GENERIC_AAM_SEMANTIC_QUANTUM, parityPolicyId: GENERIC_AAM_PARITY_POLICY_ID },
    id: entry.id,
    caseRole: entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION",
    tickRateHz: entry.tickRateHz,
    seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
    seekerHalfAngleRad: entry.seekerHalfAngleRad,
    maxTicks: entry.maxTicks,
    targetPositionM: { ...entry.targetPositionM },
    terminalState: run.terminal.state,
    terminalTick: run.terminal.tick,
    terminalCause: run.terminal.cause,
    frameCount: run.frames.length,
    samples: sampleIndexes.map((index) => {
      const frame = run.frames[index];
      if (!frame) throw new Error("Generic AAM semantic projection requires at least one frame.");
      return {
        tick: frame.tick,
        missilePositionBins: {
          x: genericAamSemanticBin(frame.missilePositionM.x),
          y: genericAamSemanticBin(frame.missilePositionM.y),
          z: genericAamSemanticBin(frame.missilePositionM.z),
        },
        speedBin: genericAamSemanticBin(frame.speedMps),
        massBin: genericAamSemanticBin(frame.massKg),
        rangeBin: genericAamSemanticBin(frame.rangeM),
        seekerAngleBin: genericAamSemanticBin(frame.seekerAngleRad),
        pitchCommandBin: genericAamSemanticBin(frame.pitchCommandMps2),
        yawCommandBin: genericAamSemanticBin(frame.yawCommandMps2),
      };
    }),
    aggregates: {
      minimumRangeBin: genericAamSemanticBin(Math.min(...run.frames.map(({ rangeM }) => rangeM))),
      maximumAbsPitchCommandBin: genericAamSemanticBin(Math.max(...run.frames.map(({ pitchCommandMps2 }) => Math.abs(pitchCommandMps2)))),
      maximumAbsYawCommandBin: genericAamSemanticBin(Math.max(...run.frames.map(({ yawCommandMps2 }) => Math.abs(yawCommandMps2)))),
    },
  };
}

export function genericAamSemanticOutcomeSha256(
  entry: Pick<GenericAamWorkloadCase, "id" | "caseRole" | "tickRateHz" | "seekerHalfAngleDeg" | "seekerHalfAngleRad" | "maxTicks" | "targetPositionM">,
  run: GenericAamVerificationRun,
) {
  return sha256(canonical(genericAamSemanticOutcome(entry, run)));
}

export function genericAamSemanticBatchSha256(outcomes: readonly GenericAamSemanticOutcome[]) {
  const sorted = [...outcomes].sort((left, right) => compareUtf8(left.id, right.id));
  if (new Set(sorted.map(({ id }) => id)).size !== sorted.length) {
    throw new Error("Generic AAM semantic batch contains duplicate case IDs.");
  }
  return sha256(canonical(sorted));
}

const FRAME_VECTORS = ["missilePositionM", "targetPositionM", "relativePositionM", "losRateRadS"] as const;
const STATE_CODES: Record<GenericAamVerificationFrame["state"], number> = {
  TRACKING: 0, HIT: 1, MISS_SEEKER_LIMIT: 2, MISS_OPENING_AFTER_BURN: 3,
  MISS_GROUND_OR_ZERO_SPEED: 4, MISS_ZERO_RELATIVE_SPEED: 5, TIME_LIMIT: 6,
};
const CAUSE_CODES: Record<string, number> = {
  EXACT_ZERO_RANGE: 1, CPA_HIT: 2, SEEKER_HIT: 3, OPENING_HIT: 4,
  SEEKER_LIMIT: 5, POST_BURN_OPEN: 6, GROUND_ZERO: 7,
  EXACT_ZERO_RELATIVE_SPEED: 8, TIME_LIMIT: 9,
};

function outputDigestBytes(frames: GenericAamVerificationFrame[], terminal: GenericAamVerificationRun["terminal"]) {
  const bytesPerFrame = (FRAME_NUMERIC_KEYS.length + FRAME_VECTORS.length * 3) * 8 + 1;
  const bytes = new Uint8Array(4 + frames.length * bytesPerFrame + 10);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  view.setUint32(offset, frames.length, false);
  offset += 4;
  for (const frame of frames) {
    for (const key of FRAME_NUMERIC_KEYS) {
      view.setFloat64(offset, frame[key as keyof GenericAamVerificationFrame] as number, false);
      offset += 8;
    }
    for (const vector of FRAME_VECTORS) {
      for (const component of VEC_KEYS) {
        view.setFloat64(offset, frame[vector][component as keyof Vec3], false);
        offset += 8;
      }
    }
    bytes[offset] = STATE_CODES[frame.state];
    offset += 1;
  }
  view.setFloat64(offset, terminal.tick, false);
  offset += 8;
  bytes[offset] = STATE_CODES[terminal.state];
  bytes[offset + 1] = CAUSE_CODES[terminal.cause];
  return bytes;
}

function runContentIdentity(record: Omit<GenericAamVerificationRun, "contentSha256">) {
  return {
    schemaVersion: record.schemaVersion,
    subjectId: record.subjectId,
    intendedUse: record.intendedUse,
    semantics: record.semantics,
    backend: record.backend,
    sourceSha256: record.sourceSha256,
    corpusSha256: record.corpusSha256,
    decisionSha256: record.decisionSha256,
    inputSha256: record.inputSha256,
    outputSha256: record.outputSha256,
    caseRole: record.caseRole,
    limitations: record.limitations,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const COMPILED_SOURCE_SHA256 = "30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa";
export const GENERIC_AAM_CORPUS_RAW_SHA256 = "bb8599aefa2b698396db6aa2dbdbae2e541532486e189e5a34b993a9f2bd9204";
export const GENERIC_AAM_CORPUS_RAW_BYTE_LENGTH = 11_521;
export const GENERIC_AAM_CORPUS_SHA256 = "e799212813fba8b635ee4b8bce114af842ba6a38ef0fb3fbcf21f32b4be55420";
export const GENERIC_AAM_DECISION_SHA256 = "884bca829ac1b94f959ecff1be6b9cf9847512810c7010f36d8b78cf6cef22f2";
const TRUSTED_CORPUS = deepFreeze(structuredClone(corpus));
const TRUSTED_CORPUS_CANONICAL = canonical(TRUSTED_CORPUS);
if (sha256(TRUSTED_CORPUS_CANONICAL) !== GENERIC_AAM_CORPUS_SHA256
  || sha256(canonical(TRUSTED_CORPUS.decisions)) !== GENERIC_AAM_DECISION_SHA256
  || TRUSTED_CORPUS.artifact.sha256 !== COMPILED_SOURCE_SHA256) {
  throw new Error("The private generic-AAM corpus bytes do not match compiled identities.");
}

export function genericAamCorpusView() {
  return deepFreeze(structuredClone(TRUSTED_CORPUS));
}

export function genericAamParityWithinTolerance(field: string, typescriptValue: number, rustWasmValue: number) {
  if (!Number.isFinite(typescriptValue) || !Number.isFinite(rustWasmValue)) {
    throw new Error("Generic AAM parity comparison requires finite values.");
  }
  const policy = TRUSTED_CORPUS.evaluator.parityPolicy;
  const override = policy.overrides.find((entry) => entry.field === field);
  const tolerance = override ?? (policy.defaultTolerance.fields.includes(field as typeof policy.defaultTolerance.fields[number])
    ? policy.defaultTolerance
    : undefined);
  if (!tolerance) throw new Error(`Generic AAM parity field ${field} is not governed.`);
  const absoluteDelta = Math.abs(typescriptValue - rustWasmValue);
  const bound = tolerance.absoluteTolerance
    + tolerance.relativeTolerance * Math.max(Math.abs(typescriptValue), Math.abs(rustWasmValue));
  return absoluteDelta <= bound;
}

export function assertGenericAamFullFrameParity(
  typescript: GenericAamVerificationRun,
  rustWasm: GenericAamVerificationRun,
) {
  if (canonical(typescript.terminal) !== canonical(rustWasm.terminal)) throw new Error("Generic AAM parity requires an exact terminal match.");
  if (typescript.frames.length !== rustWasm.frames.length) throw new Error("Generic AAM parity requires an exact frame-count match.");
  let numericComparisons = 0;
  for (let index = 0; index < typescript.frames.length; index += 1) {
    const typescriptFrame = typescript.frames[index];
    const rustWasmFrame = rustWasm.frames[index];
    if (!typescriptFrame || !rustWasmFrame || typescriptFrame.tick !== rustWasmFrame.tick || typescriptFrame.state !== rustWasmFrame.state) {
      throw new Error(`Generic AAM parity requires exact tick/state at frame ${index}.`);
    }
    for (const field of PARITY_SCALAR_FIELDS) {
      const typescriptValue = typescriptFrame[field];
      const rustWasmValue = rustWasmFrame[field];
      if (!genericAamParityWithinTolerance(field, typescriptValue, rustWasmValue)) {
        throw new Error(`Generic AAM parity exceeded the governed ${field} tolerance at tick ${typescriptFrame.tick}.`);
      }
      numericComparisons += 1;
    }
    for (const vectorField of PARITY_VECTOR_FIELDS) {
      for (const component of VEC_KEYS) {
        const field = `${vectorField}.${component}`;
        const typescriptValue = typescriptFrame[vectorField][component];
        const rustWasmValue = rustWasmFrame[vectorField][component];
        if (!genericAamParityWithinTolerance(field, typescriptValue, rustWasmValue)) {
          throw new Error(`Generic AAM parity exceeded the governed ${field} tolerance at tick ${typescriptFrame.tick}.`);
        }
        numericComparisons += 1;
      }
    }
  }
  return { framesCompared: typescript.frames.length, numericComparisons };
}

export function verifyGenericAamCorpus(candidate: unknown, sourceBytes: Uint8Array) {
  exactKeys(candidate, ROOT_KEYS, "corpus");
  exactKeys(candidate.subject, SUBJECT_KEYS, "subject");
  exactKeys(candidate.artifact, ARTIFACT_KEYS, "artifact");
  exactKeys(candidate.evaluator, EVALUATOR_KEYS, "evaluator");
  if (!Array.isArray(candidate.evaluator.seekerHalfAngles)) throw new Error("Seeker literal bindings must be an array.");
  for (const binding of candidate.evaluator.seekerHalfAngles) exactKeys(binding, SEEKER_ANGLE_KEYS, "seekerHalfAngle");
  exactKeys(candidate.evaluator.safeInputBounds, SAFE_BOUND_KEYS, "safeInputBounds");
  exactKeys(candidate.evaluator.parityPolicy, PARITY_POLICY_KEYS, "parityPolicy");
  const parityPolicy = candidate.evaluator.parityPolicy;
  exactKeys(parityPolicy.defaultTolerance, PARITY_TOLERANCE_KEYS, "parityDefaultTolerance");
  if (!Array.isArray(parityPolicy.prerequisites) || !Array.isArray(parityPolicy.defaultTolerance.fields) || !Array.isArray(parityPolicy.overrides)) throw new Error("Parity policy fields must be arrays.");
  for (const override of parityPolicy.overrides) exactKeys(override, PARITY_OVERRIDE_KEYS, "parityOverride");
  exactKeys(parityPolicy.evidence, PARITY_EVIDENCE_KEYS, "parityEvidence");
  if (!Array.isArray(parityPolicy.evidence.hosts) || !Array.isArray(parityPolicy.evidence.exceedanceCountsByCase) || !Array.isArray(parityPolicy.evidence.maximaByField) || !Array.isArray(parityPolicy.evidence.maximaByRateAndSeeker)) throw new Error("Parity evidence fields must be arrays.");
  for (const host of parityPolicy.evidence.hosts) exactKeys(host, PARITY_HOST_KEYS, "parityHost");
  for (const entry of parityPolicy.evidence.exceedanceCountsByCase) exactKeys(entry, PARITY_CASE_COUNT_KEYS, "parityCaseCount");
  for (const entry of parityPolicy.evidence.maximaByField) exactKeys(entry, PARITY_FIELD_MAXIMUM_KEYS, "parityFieldMaximum");
  for (const entry of parityPolicy.evidence.maximaByRateAndSeeker) exactKeys(entry, PARITY_MATRIX_KEYS, "parityMatrixEntry");
  const defaultTolerance = parityPolicy.defaultTolerance as unknown as { absoluteTolerance: number; relativeTolerance: number; fields: string[] };
  const overrides = parityPolicy.overrides as Array<{ field: string; absoluteTolerance: number; relativeTolerance: number }>;
  const allParityFields = [...defaultTolerance.fields, ...overrides.map(({ field }) => field)];
  const tolerances = [defaultTolerance, ...overrides];
  if (parityPolicy.id !== GENERIC_AAM_PARITY_POLICY_ID
    || parityPolicy.comparator !== "ABS_PLUS_RELATIVE_MAX_MAGNITUDE"
    || parityPolicy.formula !== "abs(ts-rust) <= absoluteTolerance + relativeTolerance*max(abs(ts),abs(rust))"
    || canonical(parityPolicy.prerequisites) !== canonical(["FINITE_VALUES", "EXACT_TERMINAL", "EXACT_FRAME_COUNT", "EXACT_TICK", "EXACT_STATE"])
    || canonical(defaultTolerance.fields) !== canonical(PARITY_DEFAULT_FIELDS)
    || canonical(overrides.map(({ field }) => field)) !== canonical(PARITY_OVERRIDE_FIELDS)
    || new Set(allParityFields).size !== allParityFields.length
    || tolerances.some(({ absoluteTolerance, relativeTolerance }) => !Number.isFinite(absoluteTolerance) || !Number.isFinite(relativeTolerance) || absoluteTolerance < 0 || relativeTolerance < 0)) {
    throw new Error("Generic AAM parity policy is malformed or incomplete.");
  }
  exactKeys(candidate.evidencePolicy, POLICY_KEYS, "evidencePolicy");
  if (!Array.isArray(candidate.derivedFixtures)) throw new Error("Derived fixtures must be an array.");
  for (const fixture of candidate.derivedFixtures) exactKeys(fixture, DERIVED_FIXTURE_KEYS, "derivedFixture");
  exactKeys(candidate.promotion, PROMOTION_KEYS, "promotion");
  if (!Array.isArray(candidate.claims) || !Array.isArray(candidate.decisions)) throw new Error("Claims and decisions must be arrays.");
  for (const claim of candidate.claims) exactKeys(claim, CLAIM_KEYS, "claim");
  for (const decision of candidate.decisions) exactKeys(decision, DECISION_KEYS, "decision");
  if (canonical(candidate) !== TRUSTED_CORPUS_CANONICAL) throw new Error("Corpus content or descendant conflicts with the reviewed immutable record.");
  const ids = [...candidate.claims, ...candidate.decisions].map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Corpus contains duplicate claim or decision IDs.");
  if (candidate.subject.id !== "NASA_TM_109057_GENERIC_AAM_REFERENCE" || candidate.subject.intendedUse !== "ENGINE_VERIFICATION_ONLY") throw new Error("Corpus subject binding is invalid.");
  if (candidate.artifact.authority !== "NASA_NTRS" || candidate.claims.some((claim) => !["SOURCE", "COMPARISON_ONLY"].includes(claim.role))) throw new Error("Corpus evidence role is ineligible or laundered.");
  if (candidate.promotion.runtimeAuthority !== "NONE") throw new Error("Verification corpus cannot acquire runtime authority.");
  if (sourceBytes.byteLength !== candidate.artifact.byteLength) throw new Error("NASA source byte length mismatch.");
  if (sha256(sourceBytes) !== candidate.artifact.sha256) throw new Error("NASA source digest mismatch.");
  return {
    schemaVersion: "vector.weapon-verification-corpus-report.v1" as const,
    corpusId: TRUSTED_CORPUS.id,
    sourceSha256: COMPILED_SOURCE_SHA256,
    byteLength: TRUSTED_CORPUS.artifact.byteLength,
    state: "VERIFIED" as const,
  };
}

export function verifyGenericAamCorpusArtifact(
  candidate: unknown,
  corpusBytes: Uint8Array,
  sourceBytes: Uint8Array,
) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(corpusBytes));
  } catch {
    throw new Error("Generic AAM corpus bytes are not valid JSON.");
  }
  if (corpusBytes.byteLength !== GENERIC_AAM_CORPUS_RAW_BYTE_LENGTH
    || sha256(corpusBytes) !== GENERIC_AAM_CORPUS_RAW_SHA256) {
    throw new Error("Generic AAM corpus bytes failed the governed raw identity.");
  }
  if (canonical(candidate) !== canonical(decoded)) {
    throw new Error("Generic AAM corpus object does not match the supplied corpus bytes.");
  }
  return verifyGenericAamCorpus(candidate, sourceBytes);
}

export function verifyGenericAamWorkload(candidate: unknown, workloadBytes: Uint8Array) {
  exactKeys(candidate, WORKLOAD_KEYS, "workload");
  const workload = candidate as unknown as {
    schemaVersion: string; id: string; sourceSha256: string; caseCount: number; expectedBatchSha256: string;
    cases: GenericAamWorkloadCase[];
  };
  if (!Array.isArray(workload.cases)) throw new Error("Workload cases must be an array.");
  for (const entry of workload.cases) {
    const keys = "caseRole" in entry ? [...WORKLOAD_CASE_KEYS, "caseRole"] : WORKLOAD_CASE_KEYS;
    exactKeys(entry, keys, "workloadCase");
    exactKeys(entry.targetPositionM, VEC_KEYS, "workloadTarget");
    const literal = seekerLiteral(entry.seekerHalfAngleDeg);
    const role = entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION";
    if (!/^[A-Z0-9_]+$/.test(entry.id) || !["PRINTED_LISTING_REPRODUCTION", "TABLE_THRUST_CONFLICT_SENSITIVITY", "COMMAND_LIMIT_SENSITIVITY"].includes(role) || ![32, 64, 128].includes(entry.tickRateHz) || entry.seekerHalfAngleRad !== literal || entry.maxTicks !== entry.tickRateHz * 30 || !Object.keys(TERMINAL_CAUSES).includes(entry.expectedTerminal) || !TERMINAL_CAUSES[entry.expectedTerminal].includes(entry.expectedCause) || !Number.isInteger(entry.expectedTick) || entry.expectedTick <= 0 || entry.expectedTick > entry.maxTicks || entry.expectedFrameCount !== entry.expectedTick || !/^[a-f0-9]{64}$/.test(entry.semanticOutcomeSha256)) throw new Error("Workload case bounds or expected result are invalid.");
  }
  if (workload.schemaVersion !== "vector.generic-aam-verification-workload.v5" || workload.id !== "nasa-tm-109057-appendix-b-bounded-sweep.v5" || workload.sourceSha256 !== COMPILED_SOURCE_SHA256 || workload.caseCount !== 15 || workload.cases.length !== workload.caseCount || !/^[a-f0-9]{64}$/.test(workload.expectedBatchSha256)) throw new Error("Workload identity or count is invalid.");
  const decoded = JSON.parse(new TextDecoder().decode(workloadBytes));
  if (canonical(candidate) !== canonical(decoded)) throw new Error("Workload object does not match supplied bytes.");
  const governed = TRUSTED_CORPUS.derivedFixtures[0];
  if (workloadBytes.byteLength !== governed.byteLength || sha256(workloadBytes) !== governed.sha256) throw new Error("Workload bytes failed governed digest verification.");
  const ids = workload.cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error("Workload case IDs must be unique.");
  const rates = new Set(workload.cases.map((entry) => entry.tickRateHz));
  const seekers = new Set(workload.cases.map((entry) => entry.seekerHalfAngleDeg));
  if (!([32, 64, 128] as const).every((value) => rates.has(value)) || !([15, 20, 30] as const).every((value) => seekers.has(value))) throw new Error("Workload report sweep coverage is incomplete.");
  const positions = workload.cases.map((entry) => entry.targetPositionM);
  if (!positions.some(({ x }) => x === 0) || !positions.some(({ x }) => x === 4500) || !positions.some(({ y }) => y === -4000) || !positions.some(({ y }) => y === 4000) || !positions.some(({ z }) => z === -2000) || !positions.some(({ z }) => z === -12000)) throw new Error("Workload Appendix B boundary coverage is incomplete.");
  return { schemaVersion: workload.schemaVersion, workloadId: workload.id, cases: workload.caseCount, sha256: governed.sha256, byteLength: governed.byteLength };
}

const PRINTED_CONSTANTS: GenericAamVerificationInput["constants"] = {
  navigationConstant: 4,
  gravityMps2: 9.8,
  maximumPitchG: 30,
  maximumYawG: 30,
  hitRangeM: 10,
  operationalSpeedMps: 700,
  motorThrustN: 6800,
  coastThrustN: 0,
  burnSeconds: 8,
  launchMassKg: 56.7,
  burnoutMassKg: 22.7,
  dragK1: 0.009412,
  dragK2: 93850 / (9.8 ** 2),
  controlTimeConstantS: 0.25,
};

function seekerLiteral(degrees: number): GenericAamVerificationInput["seekerHalfAngleRad"] {
  const binding = TRUSTED_CORPUS.evaluator.seekerHalfAngles.find((entry) => entry.degrees === degrees);
  if (!binding) throw new Error("Generic AAM seeker case is not bound to a printed radian literal.");
  return binding.printedRadians as GenericAamVerificationInput["seekerHalfAngleRad"];
}

export function genericAamVerificationInput(
  overrides: Partial<GenericAamVerificationInput> = {},
): GenericAamVerificationInput {
  const initial: GenericAamVerificationInput = {
    schemaVersion: "vector.generic-aam-verification-input.v2",
    subjectId: "NASA_TM_109057_GENERIC_AAM_REFERENCE",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    semantics: "TM_109057_PRINTED_LISTING_BINARY64_V1",
    sourceSha256: COMPILED_SOURCE_SHA256,
    corpusSha256: GENERIC_AAM_CORPUS_SHA256,
    decisionSha256: GENERIC_AAM_DECISION_SHA256,
    caseRole: "PRINTED_LISTING_REPRODUCTION",
    axisConvention: "EARTH_X_FORWARD_Y_RIGHT_Z_DOWN",
    units: "SI",
    tickRateHz: 128,
    maxTicks: 30 * 128,
    seekerHalfAngleDeg: 30,
    seekerHalfAngleRad: 0.523596,
    missile: {
      speedMps: 200,
      pitchRateRadS: 0,
      pitchSignalMps2: 0,
      yawRateRadS: 0,
      yawSignalMps2: 0,
      pitchRad: 0,
      yawRad: 0,
      positionM: { x: 0, y: 0, z: -6000 },
      massKg: 56.7,
    },
    target: {
      previousPositionM: { x: 4500, y: 0, z: -6000 },
      positionM: { x: 4500, y: 0, z: -6000 },
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
    constants: { ...PRINTED_CONSTANTS },
  };
  const selectedDegrees = overrides.seekerHalfAngleDeg ?? initial.seekerHalfAngleDeg;
  return {
    ...initial,
    ...overrides,
    seekerHalfAngleDeg: selectedDegrees,
    seekerHalfAngleRad: overrides.seekerHalfAngleRad ?? seekerLiteral(selectedDegrees),
    missile: overrides.missile ?? initial.missile,
    target: overrides.target ?? initial.target,
    constants: overrides.constants ?? initial.constants,
  };
}

function finiteRecord(value: Record<string, unknown>) {
  return Object.values(value).every((field) => typeof field === "number" && Number.isFinite(field));
}

function exactFiniteVec(value: unknown, label: string): value is Vec3 {
  exactKeys(value, VEC_KEYS, label);
  return typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y)
    && typeof value.z === "number" && Number.isFinite(value.z);
}

function validateInput(input: GenericAamVerificationInput) {
  exactKeys(input, INPUT_KEYS, "input");
  exactKeys(input.missile, MISSILE_KEYS, "missile");
  exactKeys(input.target, TARGET_KEYS, "target");
  exactKeys(input.constants, CONSTANT_KEYS, "constants");
  exactKeys(input.missile.positionM, VEC_KEYS, "missile.positionM");
  exactKeys(input.target.previousPositionM, VEC_KEYS, "target.previousPositionM");
  exactKeys(input.target.positionM, VEC_KEYS, "target.positionM");
  exactKeys(input.target.velocityMps, VEC_KEYS, "target.velocityMps");
  if (input.schemaVersion !== "vector.generic-aam-verification-input.v2" || input.subjectId !== "NASA_TM_109057_GENERIC_AAM_REFERENCE" || input.intendedUse !== "ENGINE_VERIFICATION_ONLY" || input.semantics !== "TM_109057_PRINTED_LISTING_BINARY64_V1") throw new Error("Generic AAM verification identity is invalid.");
  if (input.sourceSha256 !== COMPILED_SOURCE_SHA256 || input.corpusSha256 !== GENERIC_AAM_CORPUS_SHA256 || input.decisionSha256 !== GENERIC_AAM_DECISION_SHA256) throw new Error("Generic AAM verification digest binding is invalid.");
  if (input.axisConvention !== "EARTH_X_FORWARD_Y_RIGHT_Z_DOWN" || input.units !== "SI") throw new Error("Generic AAM axes or units are invalid.");
  const estimatedOperations = input.maxTicks * TRUSTED_CORPUS.evaluator.safeInputBounds.estimatedScalarOperationsPerTick;
  if (![32, 64, 128, 256].includes(input.tickRateHz) || !Number.isInteger(input.maxTicks) || input.maxTicks <= 0 || input.maxTicks > TRUSTED_CORPUS.evaluator.maximumTicks || estimatedOperations > TRUSTED_CORPUS.evaluator.maximumEstimatedScalarOperations || input.seekerHalfAngleRad !== seekerLiteral(input.seekerHalfAngleDeg)) throw new Error("Generic AAM work or seeker bounds are invalid.");
  const { positionM: missilePosition, ...missileScalars } = input.missile;
  if (!finiteRecord(missileScalars) || !finiteRecord(missilePosition) || !finiteRecord(input.target.previousPositionM) || !finiteRecord(input.target.positionM) || !finiteRecord(input.target.velocityMps) || !finiteRecord(input.constants)) throw new Error("Generic AAM numeric input must be finite.");
  const target = input.target.positionM;
  const bounds = TRUSTED_CORPUS.evaluator.safeInputBounds;
  const missileScalarsWithinBounds = input.missile.speedMps >= bounds.missileSpeedMinMps
    && input.missile.speedMps <= bounds.missileSpeedMaxMps
    && Math.abs(input.missile.pitchRateRadS) <= bounds.angularRateAbsMaxRadS
    && Math.abs(input.missile.yawRateRadS) <= bounds.angularRateAbsMaxRadS
    && Math.abs(input.missile.pitchSignalMps2) <= bounds.controlSignalAbsMaxMps2
    && Math.abs(input.missile.yawSignalMps2) <= bounds.controlSignalAbsMaxMps2
    && Math.abs(input.missile.pitchRad) <= bounds.pitchAbsMaxRad
    && Math.abs(input.missile.yawRad) <= bounds.yawAbsMaxRad;
  if (!missileScalarsWithinBounds || !Object.values(input.missile.positionM).every((value) => Math.abs(value) <= bounds.missilePositionAbsMaxM) || input.missile.massKg !== input.constants.launchMassKg || input.constants.burnoutMassKg <= 0 || target.x < 0 || target.x > 4500 || target.y < -4000 || target.y > 4000 || target.z > -2000 || target.z < -12000 || input.target.velocityMps.x !== 234.375 || input.target.velocityMps.y !== 0 || input.target.velocityMps.z !== 0) throw new Error("Generic AAM state is outside the reviewed safe domain.");
  const expectedThrust = input.caseRole === "TABLE_THRUST_CONFLICT_SENSITIVITY" ? 690 * 4.4482216152605 : 6800;
  const normalized = { ...input.constants, motorThrustN: 6800, maximumPitchG: 30, maximumYawG: 30 };
  const expectedLimit = input.caseRole === "COMMAND_LIMIT_SENSITIVITY" ? 1 : 30;
  if (!["PRINTED_LISTING_REPRODUCTION", "TABLE_THRUST_CONFLICT_SENSITIVITY", "COMMAND_LIMIT_SENSITIVITY"].includes(input.caseRole) || input.constants.motorThrustN !== expectedThrust || input.constants.maximumPitchG !== expectedLimit || input.constants.maximumYawG !== expectedLimit || canonical(normalized) !== canonical(PRINTED_CONSTANTS)) throw new Error("Generic AAM constants are not a closed reviewed decision.");
  if (canonical(input.target.previousPositionM) !== canonical(input.target.positionM)) throw new Error("Initial previous/current target state is inconsistent.");
  const initialRelative = subtract(input.target.positionM, input.missile.positionM);
  if (magnitude(initialRelative) === 0) throw new Error("D09 rejects an initial zero range.");
  const initialMissileVelocity = {
    x: input.missile.speedMps * Math.cos(input.missile.pitchRad) * Math.cos(input.missile.yawRad),
    y: input.missile.speedMps * Math.cos(input.missile.pitchRad) * Math.sin(input.missile.yawRad),
    z: input.missile.speedMps * Math.sin(input.missile.pitchRad),
  };
  if (magnitude(subtract(input.target.velocityMps, initialMissileVelocity)) === 0) throw new Error("D09 rejects an initial zero relative speed.");
}

const magnitude = (value: Vec3) => Math.hypot(value.x, value.y, value.z);
const subtract = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
const scale = (value: Vec3, factor: number): Vec3 => ({ x: value.x * factor, y: value.y * factor, z: value.z * factor });
const add = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
const dot = (left: Vec3, right: Vec3) => left.x * right.x + left.y * right.y + left.z * right.z;

function assertFiniteStage(label: string, ...values: Array<number | Vec3>) {
  const bound = TRUSTED_CORPUS.evaluator.safeInputBounds.dynamicScalarAbsMax;
  for (const value of values) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > bound) throw new Error(`Generic AAM ${label} stage exceeded its finite safe bound.`);
    } else if (![value.x, value.y, value.z].every((component) => Number.isFinite(component) && Math.abs(component) <= bound)) {
      throw new Error(`Generic AAM ${label} stage exceeded its finite safe bound.`);
    }
  }
}

export function genericAamLosRate(relative: Vec3, relativeVelocity: Vec3): Vec3 {
  const rangeSquared = dot(relative, relative);
  if (rangeSquared === 0) throw new Error("D09 zero range requires explicit terminal handling.");
  return {
    x: (relative.y * relativeVelocity.z - relative.z * relativeVelocity.y) / rangeSquared,
    y: (relative.z * relativeVelocity.x - relative.x * relativeVelocity.z) / rangeSquared,
    z: (relative.x * relativeVelocity.y - relative.y * relativeVelocity.x) / rangeSquared,
  };
}

export function genericAamClosestApproach(relative: Vec3, relativeVelocity: Vec3) {
  const speedSquared = dot(relativeVelocity, relativeVelocity);
  if (speedSquared === 0) throw new Error("D09 zero relative speed requires explicit terminal handling.");
  const timeSeconds = -dot(relative, relativeVelocity) / speedSquared;
  return {
    timeSeconds,
    distanceM: magnitude(add(relative, scale(relativeVelocity, timeSeconds))),
  };
}

export function genericAamControlLagStep(rate: number, command: number, dt: number, timeConstant: number) {
  if (![rate, command, dt, timeConstant].every(Number.isFinite) || dt <= 0 || timeConstant <= 0 || dt > timeConstant) throw new Error("Control-lag fixture is outside its reviewed domain.");
  return rate + (command - rate) / timeConstant * dt;
}

export function assertGenericAamVerificationRun(
  run: unknown,
  input: GenericAamVerificationInput,
  backend: GenericAamVerificationRun["backend"],
): asserts run is GenericAamVerificationRun {
  exactKeys(run, RUN_KEYS, "run");
  const record = run as unknown as GenericAamVerificationRun;
  exactKeys(record.terminal, TERMINAL_KEYS, "terminal");
  if (!Array.isArray(record.frames) || !Array.isArray(record.limitations)) throw new Error("Generic AAM run arrays are invalid.");
  if (record.schemaVersion !== "vector.generic-aam-verification-run.v3" || record.subjectId !== input.subjectId || record.intendedUse !== input.intendedUse || record.semantics !== input.semantics || record.backend !== backend || record.sourceSha256 !== input.sourceSha256 || record.corpusSha256 !== input.corpusSha256 || record.decisionSha256 !== input.decisionSha256 || record.inputSha256 !== sha256(JSON.stringify(input)) || record.caseRole !== input.caseRole || canonical(record.limitations) !== canonical(LIMITATIONS)) throw new Error("Generic AAM run identity, digest or limitation binding is invalid.");
  if (!/^[a-f0-9]{64}$/.test(record.outputSha256) || !/^[a-f0-9]{64}$/.test(record.contentSha256)) throw new Error("Generic AAM run digests are invalid.");
  const terminals = Object.keys(TERMINAL_CAUSES) as GenericAamTerminalState[];
  if (!terminals.includes(record.terminal.state) || !Number.isInteger(record.terminal.tick) || record.terminal.tick <= 0 || record.terminal.tick > input.maxTicks || !TERMINAL_CAUSES[record.terminal.state].includes(record.terminal.cause) || record.frames.length !== record.terminal.tick) throw new Error("Generic AAM terminal contract is invalid.");
  for (const [index, frame] of record.frames.entries()) {
    exactKeys(frame, FRAME_KEYS, "frame");
    let finiteScalars = true;
    for (const key of FRAME_NUMERIC_KEYS) {
      const value = frame[key as keyof GenericAamVerificationFrame];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        finiteScalars = false;
        break;
      }
    }
    const finiteVectors = exactFiniteVec(frame.missilePositionM, "frame.missilePositionM")
      && exactFiniteVec(frame.targetPositionM, "frame.targetPositionM")
      && exactFiniteVec(frame.relativePositionM, "frame.relativePositionM")
      && exactFiniteVec(frame.losRateRadS, "frame.losRateRadS");
    const knownState = frame.state === "TRACKING" || terminals.includes(frame.state as GenericAamTerminalState);
    if (!finiteScalars || !finiteVectors || frame.tick !== index + 1 || frame.timeSeconds !== frame.tick / input.tickRateHz || !knownState || (index < record.frames.length - 1 && frame.state !== "TRACKING") || (index === record.frames.length - 1 && frame.state !== record.terminal.state)) throw new Error("Generic AAM frame contract is invalid.");
    const expectedRelative = subtract(frame.targetPositionM, frame.missilePositionM);
    const tolerance = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * Number.EPSILON * 32;
    if (!tolerance(frame.relativePositionM.x, expectedRelative.x)
      || !tolerance(frame.relativePositionM.y, expectedRelative.y)
      || !tolerance(frame.relativePositionM.z, expectedRelative.z)
      || !tolerance(frame.rangeM, magnitude(frame.relativePositionM))) {
      throw new Error("Generic AAM frame geometry is internally inconsistent.");
    }
  }
  const outputSha256 = sha256(outputDigestBytes(record.frames, record.terminal));
  const { contentSha256: ignored, ...content } = record;
  void ignored;
  const contentSha256 = sha256(canonical(runContentIdentity(content)));
  if (record.outputSha256 !== outputSha256 || record.contentSha256 !== contentSha256) throw new Error("Generic AAM run content digest mismatch.");
}

export function decodeGenericAamVerificationRunJson(
  encoded: string,
  input: GenericAamVerificationInput,
  backend: GenericAamVerificationRun["backend"],
): GenericAamVerificationRun {
  const decoded: unknown = JSON.parse(encoded);
  assertGenericAamVerificationRun(decoded, input, backend);
  return decoded;
}

export function genericAamLimitedSignal(raw: number, maximumG: number, mass: number, speed: number, constants: GenericAamVerificationInput["constants"]) {
  const velocityFactor = Math.min(1, speed ** 2 / constants.operationalSpeedMps ** 2);
  const massSpeedLimitG = constants.burnoutMassKg / mass * velocityFactor * maximumG;
  const limited = Math.max(-maximumG, Math.min(maximumG, Math.max(-massSpeedLimitG, Math.min(massSpeedLimitG, raw))));
  if (![raw, maximumG, mass, speed, velocityFactor, massSpeedLimitG, limited].every(Number.isFinite) || maximumG <= 0 || mass <= 0 || speed <= 0) throw new Error("PN limiter stage is outside the finite reviewed domain.");
  return limited;
}

export function runGenericAamVerification(input: GenericAamVerificationInput): GenericAamVerificationRun {
  validateInput(input);
  const dt = 1 / input.tickRateHz;
  const constants = input.constants;
  let missile = structuredClone(input.missile);
  let target = structuredClone(input.target.positionM);
  const frames: GenericAamVerificationFrame[] = [];
  let terminal: GenericAamVerificationRun["terminal"] | undefined;
  for (let tick = 1; tick <= input.maxTicks; tick += 1) {
    const second = Math.floor((tick - 1) / input.tickRateHz) + 1;
    const oldTarget = target;
    target = add(target, scale(input.target.velocityMps, dt));
    const currentRelative = subtract(oldTarget, missile.positionM);
    const currentRange = magnitude(currentRelative);
    const thrust = second <= constants.burnSeconds ? constants.motorThrustN : constants.coastThrustN;
    const drag = constants.dragK1 * missile.speedMps ** 2 + constants.dragK2 * (missile.pitchRateRadS ** 2 + missile.yawRateRadS ** 2) / missile.speedMps ** 2;
    const acceleration = (thrust - drag) / missile.massKg - constants.gravityMps2 * Math.sin(missile.pitchRad);
    const nextPitchRate = genericAamControlLagStep(missile.pitchRateRadS, missile.pitchSignalMps2, dt, constants.controlTimeConstantS);
    const nextYawRate = genericAamControlLagStep(missile.yawRateRadS, missile.yawSignalMps2, dt, constants.controlTimeConstantS);
    const pitchDerivative = (missile.pitchRateRadS - Math.cos(missile.pitchRad)) / missile.speedMps;
    const yawDerivative = missile.yawRateRadS / (missile.speedMps * Math.cos(missile.pitchRad));
    const velocity = {
      x: missile.speedMps * Math.cos(missile.pitchRad) * Math.cos(missile.yawRad),
      y: missile.speedMps * Math.cos(missile.pitchRad) * Math.sin(missile.yawRad),
      z: missile.speedMps * Math.sin(missile.pitchRad),
    };
    assertFiniteStage("pre-integration", target, currentRelative, currentRange, thrust, drag, acceleration, nextPitchRate, nextYawRate, pitchDerivative, yawDerivative, velocity);
    missile = {
      ...missile,
      speedMps: missile.speedMps + acceleration * dt,
      pitchRateRadS: nextPitchRate,
      yawRateRadS: nextYawRate,
      pitchRad: missile.pitchRad + pitchDerivative * dt,
      yawRad: missile.yawRad + yawDerivative * dt,
      positionM: { x: missile.positionM.x + velocity.x * dt, y: missile.positionM.y + velocity.y * dt, z: missile.positionM.z - velocity.z * dt },
      massKg: second <= constants.burnSeconds
        ? tick === constants.burnSeconds * input.tickRateHz
          ? constants.burnoutMassKg
          : missile.massKg - (constants.launchMassKg - constants.burnoutMassKg) / constants.burnSeconds * dt
        : missile.massKg,
    };
    assertFiniteStage("integrated-state", missile.positionM, missile.speedMps, missile.pitchRateRadS, missile.yawRateRadS, missile.pitchRad, missile.yawRad, missile.massKg);
    const relative = subtract(target, missile.positionM);
    const range = magnitude(relative);
    const relativeVelocity = scale(subtract(currentRelative, relative), input.tickRateHz);
    const closingVelocity = -(currentRange - range) * input.tickRateHz;
    const relativeSpeedSquared = dot(relativeVelocity, relativeVelocity);
    const zeroRange = range === 0;
    const zeroRelativeSpeed = relativeSpeedSquared === 0;
    const losRate = zeroRange ? { x: 0, y: 0, z: 0 } : genericAamLosRate(relative, relativeVelocity);
    const pitchOffset = -Math.sin(missile.yawRad) * losRate.x + Math.cos(missile.yawRad) * losRate.y;
    const yawOffset = Math.sin(missile.pitchRad) * (Math.cos(missile.yawRad) * losRate.x + Math.sin(missile.yawRad) * losRate.y) + Math.cos(missile.pitchRad) * losRate.z;
    const pitchCommand = constants.gravityMps2 * genericAamLimitedSignal(constants.navigationConstant * closingVelocity * pitchOffset, constants.maximumPitchG, missile.massKg, missile.speedMps, constants);
    const yawCommand = constants.gravityMps2 * genericAamLimitedSignal(constants.navigationConstant * closingVelocity * yawOffset, constants.maximumYawG, missile.massKg, missile.speedMps, constants);
    missile.pitchSignalMps2 = pitchCommand;
    missile.yawSignalMps2 = yawCommand;
    const closestApproach = zeroRange
      ? { timeSeconds: 0, distanceM: 0 }
      : zeroRelativeSpeed
        ? { timeSeconds: 0, distanceM: range }
        : genericAamClosestApproach(relative, relativeVelocity);
    const closestTime = closestApproach.timeSeconds;
    const closestDistance = closestApproach.distanceM;
    const seekerAngle = zeroRange ? 0 : Math.atan(Math.hypot(relative.y, relative.z) / Math.abs(relative.x));
    assertFiniteStage("guidance-and-terminal", relative, range, relativeVelocity, relativeSpeedSquared, closingVelocity, losRate, pitchOffset, yawOffset, pitchCommand, yawCommand, closestTime, closestDistance, seekerAngle);
    let state: GenericAamVerificationFrame["state"] = "TRACKING";
    let cause = "tracking";
    if (missile.positionM.z > 0 || missile.speedMps <= 0) {
      state = "MISS_GROUND_OR_ZERO_SPEED";
      cause = "GROUND_ZERO";
    } else if (zeroRange) {
      state = "HIT";
      cause = "EXACT_ZERO_RANGE";
    } else if (zeroRelativeSpeed) {
      state = "MISS_ZERO_RELATIVE_SPEED";
      cause = "EXACT_ZERO_RELATIVE_SPEED";
    } else if (closestDistance < constants.hitRangeM && closestTime >= 0 && closestTime <= dt) {
      state = "HIT";
      cause = "CPA_HIT";
    } else if (Math.abs(seekerAngle) > input.seekerHalfAngleRad) {
      state = range < constants.hitRangeM ? "HIT" : "MISS_SEEKER_LIMIT";
      cause = range < constants.hitRangeM ? "SEEKER_HIT" : "SEEKER_LIMIT";
    } else if (closingVelocity > 0 && second > constants.burnSeconds) {
      state = range < constants.hitRangeM ? "HIT" : "MISS_OPENING_AFTER_BURN";
      cause = range < constants.hitRangeM ? "OPENING_HIT" : "POST_BURN_OPEN";
    } else if (tick === input.maxTicks) {
      state = "TIME_LIMIT";
      cause = "TIME_LIMIT";
    }
    frames.push({ tick, timeSeconds: tick / input.tickRateHz, missilePositionM: { ...missile.positionM }, targetPositionM: { ...target }, speedMps: missile.speedMps, pitchRad: missile.pitchRad, yawRad: missile.yawRad, pitchRateRadS: missile.pitchRateRadS, yawRateRadS: missile.yawRateRadS, pitchSignalMps2: missile.pitchSignalMps2, yawSignalMps2: missile.yawSignalMps2, massKg: missile.massKg, thrustN: thrust, dragN: drag, relativePositionM: relative, rangeM: range, seekerAngleRad: seekerAngle, losRateRadS: losRate, closingVelocityMps: closingVelocity, pitchCommandMps2: pitchCommand, yawCommandMps2: yawCommand, closestApproachTimeS: closestTime, closestApproachDistanceM: closestDistance, state });
    if (state !== "TRACKING") {
      terminal = { state, tick, cause };
      break;
    }
  }
  if (!terminal) throw new Error("Generic AAM evaluator failed to produce an exhaustive terminal state.");
  const runWithoutDigests = {
    schemaVersion: "vector.generic-aam-verification-run.v3" as const,
    subjectId: input.subjectId,
    intendedUse: input.intendedUse,
    semantics: input.semantics,
    backend: "typescript" as const,
    sourceSha256: input.sourceSha256,
    corpusSha256: input.corpusSha256,
    decisionSha256: input.decisionSha256,
    inputSha256: sha256(JSON.stringify(input)),
    caseRole: input.caseRole,
    frames,
    terminal,
    limitations: [...LIMITATIONS],
  };
  const outputSha256 = sha256(outputDigestBytes(frames, terminal));
  const contentSha256 = sha256(canonical(runContentIdentity({ ...runWithoutDigests, outputSha256 })));
  const run: GenericAamVerificationRun = { ...runWithoutDigests, outputSha256, contentSha256 };
  return run;
}
