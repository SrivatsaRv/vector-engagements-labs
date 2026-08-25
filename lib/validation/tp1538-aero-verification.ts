import { createHash } from "node:crypto";
import {
  TP1538_AXES,
  TP1538_TABLE_INVENTORY,
  validateTp1538Corpus,
} from "../../scripts/lib/tp1538-aero-corpus.mjs";

export const TP1538_EVALUATOR_CONTRACT = "TP1538_APPENDIX_B_MULTILINEAR_FAIL_CLOSED_V1" as const;

export interface Tp1538AeroLookupRequest {
  schemaVersion: "vector.tp1538-aero-lookup.v1";
  tableId: string;
  angleUnit: "DEG";
  coordinates: Record<string, number>;
}

export interface Tp1538AeroLookupResult {
  schemaVersion: "vector.tp1538-aero-lookup-result.v1";
  corpusSha256: string;
  tableId: string;
  state: "AVAILABLE" | "PRINTED_BLANK" | "ILLEGIBLE" | "OUT_OF_DOMAIN";
  diagnostic: "EXACT_KNOT" | "INTERPOLATED" | "OUT_OF_DOMAIN" | "UNAVAILABLE_INTERPOLATION_CORNER";
  value: number | null;
  missingCorners: Array<Record<string, number>>;
}

export type Tp1538VerificationRecord = {
  schemaVersion: "vector.tp1538-aero-verification-record.v1";
  subject: "NASA_GENERIC_F16";
  deploymentClass: "ENGINE_VERIFICATION_ONLY";
  backend: "typescript" | "rust-wasm";
  evaluatorContract: typeof TP1538_EVALUATOR_CONTRACT;
  corpusSha256: string;
  modelPack: { schemaVersion: "vector.tp1538-verification-model-pack.v1"; id: "nasa-tp1538-generic-f16-aero-verification"; version: "1.0.0"; digest: string };
  lookups: Array<{ input: Tp1538AeroLookupRequest; result: Tp1538AeroLookupResult }>;
  limitations: string[];
  contentSha256: string;
};

type AxisName = keyof typeof TP1538_AXES;
type AdmittedCorpus = {
  corpusSha256: string;
  tables: Array<{
    id: string;
    cells: Array<{ state: "AVAILABLE" | "PRINTED_BLANK" | "ILLEGIBLE" | "OUT_OF_DOMAIN"; value: number | null }>;
  }>;
};

function exactKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with exact keys.`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must have exact keys.`);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function coordinateName(axis: AxisName): string {
  if (axis === "alphaDeg") return "alphaDeg";
  if (axis === "betaDeg") return "betaDeg";
  return "stabilatorDeg";
}

function bracket(axis: readonly number[], value: number): { lower: number; upper: number; fraction: number } | null {
  if (!Number.isFinite(value) || value < axis[0] || value > axis[axis.length - 1]) return null;
  const exact = axis.indexOf(value);
  if (exact >= 0) return { lower: exact, upper: exact, fraction: 0 };
  for (let upper = 1; upper < axis.length; upper += 1) {
    if (value < axis[upper]) {
      const lower = upper - 1;
      return { lower, upper, fraction: (value - axis[lower]) / (axis[upper] - axis[lower]) };
    }
  }
  return null;
}

function flatCellIndex(axisIndexes: readonly number[], axisLengths: readonly number[]): number {
  let index = 0;
  for (let axis = 0; axis < axisIndexes.length; axis += 1) index = index * axisLengths[axis] + axisIndexes[axis];
  return index;
}

function lookupValidated(corpus: AdmittedCorpus, requestCandidate: unknown): Tp1538AeroLookupResult {
  exactKeys(requestCandidate, ["angleUnit", "coordinates", "schemaVersion", "tableId"], "TP-1538 lookup request");
  if (requestCandidate.schemaVersion !== "vector.tp1538-aero-lookup.v1") throw new Error("TP-1538 lookup schema version is invalid.");
  if (requestCandidate.angleUnit !== "DEG") throw new Error("TP-1538 lookup angle unit must be DEG.");
  if (typeof requestCandidate.tableId !== "string") throw new Error("TP-1538 lookup table identity is invalid.");
  const inventory = TP1538_TABLE_INVENTORY.find(({ id }: { id: string }) => id === requestCandidate.tableId);
  if (!inventory) throw new Error("TP-1538 lookup table identity is unknown.");
  const table = corpus.tables.find(({ id }) => id === inventory.id);
  if (!table) throw new Error("TP-1538 admitted corpus omits the requested table.");
  const coordinateKeys = inventory.axes.map((axis: AxisName) => coordinateName(axis));
  exactKeys(requestCandidate.coordinates, coordinateKeys, "TP-1538 lookup coordinates");
  const coordinate = requestCandidate.coordinates as Record<string, unknown>;
  const brackets = inventory.axes.map((axis: AxisName) => {
    const value = coordinate[coordinateName(axis)];
    if (typeof value !== "number") return null;
    return bracket(TP1538_AXES[axis], value);
  });
  const baseResult = {
    schemaVersion: "vector.tp1538-aero-lookup-result.v1" as const,
    corpusSha256: corpus.corpusSha256 as string,
    tableId: inventory.id as string,
  };
  if (brackets.some((candidate: unknown) => candidate === null)) {
    return { ...baseResult, state: "OUT_OF_DOMAIN", diagnostic: "OUT_OF_DOMAIN", value: null, missingCorners: [] };
  }

  const typedBrackets = brackets as Array<{ lower: number; upper: number; fraction: number }>;
  const corners: Array<{ indexes: number[]; weight: number; coordinate: Record<string, number> }> = [];
  const visit = (depth: number, indexes: number[], weight: number, cornerCoordinate: Record<string, number>): void => {
    if (depth === inventory.axes.length) {
      corners.push({ indexes: [...indexes], weight, coordinate: { ...cornerCoordinate } });
      return;
    }
    const axis = inventory.axes[depth] as AxisName;
    const descriptor = typedBrackets[depth];
    const name = coordinateName(axis);
    indexes[depth] = descriptor.lower;
    cornerCoordinate[name] = TP1538_AXES[axis][descriptor.lower];
    visit(depth + 1, indexes, weight * (descriptor.lower === descriptor.upper ? 1 : 1 - descriptor.fraction), cornerCoordinate);
    if (descriptor.upper !== descriptor.lower) {
      indexes[depth] = descriptor.upper;
      cornerCoordinate[name] = TP1538_AXES[axis][descriptor.upper];
      visit(depth + 1, indexes, weight * descriptor.fraction, cornerCoordinate);
    }
  };
  visit(0, [], 1, {});
  const axisLengths = inventory.axes.map((axis: AxisName) => TP1538_AXES[axis].length);
  const missing = corners.filter(({ indexes }) => table.cells[flatCellIndex(indexes, axisLengths)].state !== "AVAILABLE");
  if (missing.length > 0) {
    const state = table.cells[flatCellIndex(missing[0].indexes, axisLengths)].state as "PRINTED_BLANK" | "ILLEGIBLE" | "OUT_OF_DOMAIN";
    return { ...baseResult, state, diagnostic: "UNAVAILABLE_INTERPOLATION_CORNER", value: null, missingCorners: missing.map(({ coordinate: item }) => item) };
  }
  const value = corners.reduce((sum, corner) => {
    const cornerValue = table.cells[flatCellIndex(corner.indexes, axisLengths)].value;
    if (cornerValue === null) throw new Error("TP-1538 available interpolation corner omits its value.");
    return sum + cornerValue * corner.weight;
  }, 0);
  if (!Number.isFinite(value)) throw new Error("TP-1538 interpolation produced a nonfinite value.");
  const exact = typedBrackets.every(({ lower, upper }) => lower === upper);
  return { ...baseResult, state: "AVAILABLE", diagnostic: exact ? "EXACT_KNOT" : "INTERPOLATED", value, missingCorners: [] };
}

export function lookupTp1538Table(corpusCandidate: unknown, requestCandidate: unknown, expectedCorpusSha256: string): Tp1538AeroLookupResult {
  if (!/^[0-9a-f]{64}$/u.test(expectedCorpusSha256)) throw new Error("Expected TP-1538 compiled corpus identity is invalid.");
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  return lookupValidated(corpus, requestCandidate);
}

export interface Tp1538AeroAssemblyInput {
  schemaVersion: "vector.tp1538-aero-assembly-input.v1";
  angleUnit: "DEG";
  alphaDeg: number;
  betaDeg: number;
  stabilatorDeg: number;
  leadingEdgeFlapDeg: number;
  speedBrakeDeg: number;
  aileronDeg: number;
  rudderDeg: number;
  rollRateRadS: number;
  pitchRateRadS: number;
  yawRateRadS: number;
  trueAirspeedMps: number;
  cgChordFraction: number;
}

export interface Tp1538AeroAssemblyResult {
  schemaVersion: "vector.tp1538-aero-assembly-result.v1";
  corpusSha256: string;
  state: "AVAILABLE";
  coefficients: { cx: number; cz: number; cm: number; cy: number; cn: number; cl: number };
  contributionOrder: Record<"cx" | "cz" | "cm" | "cy" | "cn" | "cl", string[]>;
}

export interface Tp1538EvaluatorBatch {
  schemaVersion: "vector.tp1538-aero-evaluator-batch.v1";
  subject: "NASA_GENERIC_F16";
  deploymentClass: "ENGINE_VERIFICATION_ONLY";
  evaluatorContract: typeof TP1538_EVALUATOR_CONTRACT;
  corpusSha256: string;
  resolverTables: Array<{
    id: string;
    cells: Array<{ state: "AVAILABLE" | "PRINTED_BLANK" | "ILLEGIBLE" | "OUT_OF_DOMAIN"; value: number | null }>;
  }>;
  lookupRequests: Tp1538AeroLookupRequest[];
  assemblyRequests: Tp1538AeroAssemblyInput[];
}

export interface Tp1538EvaluatorBatchResult {
  schemaVersion: "vector.tp1538-aero-evaluator-batch-result.v1";
  backend: "rust-wasm";
  subject: "NASA_GENERIC_F16";
  deploymentClass: "ENGINE_VERIFICATION_ONLY";
  evaluatorContract: typeof TP1538_EVALUATOR_CONTRACT;
  corpusSha256: string;
  lookupResults: Tp1538AeroLookupResult[];
  assemblyResults: Tp1538AeroAssemblyResult[];
}

function request(tableId: string, coordinates: Record<string, number>): Tp1538AeroLookupRequest {
  return { schemaVersion: "vector.tp1538-aero-lookup.v1", tableId, angleUnit: "DEG", coordinates };
}

function required(corpus: AdmittedCorpus, tableId: string, coordinates: Record<string, number>): number {
  const result = lookupValidated(corpus, request(tableId, coordinates));
  if (result.state !== "AVAILABLE" || result.value === null) throw new Error(`TP-1538 Appendix B assembly requires available ${tableId}: ${result.diagnostic}.`);
  return result.value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`TP-1538 ${label} must be finite.`);
  return value;
}

function assembleValidated(corpus: AdmittedCorpus, inputCandidate: unknown): Tp1538AeroAssemblyResult {
  const keys = ["aileronDeg", "alphaDeg", "angleUnit", "betaDeg", "cgChordFraction", "leadingEdgeFlapDeg", "pitchRateRadS", "rollRateRadS", "rudderDeg", "schemaVersion", "speedBrakeDeg", "stabilatorDeg", "trueAirspeedMps", "yawRateRadS"];
  exactKeys(inputCandidate, keys, "TP-1538 Appendix B assembly input");
  if (inputCandidate.schemaVersion !== "vector.tp1538-aero-assembly-input.v1" || inputCandidate.angleUnit !== "DEG") throw new Error("TP-1538 Appendix B assembly identity or angle unit is invalid.");
  const input = inputCandidate as unknown as Tp1538AeroAssemblyInput;
  for (const key of keys.filter((key) => !["schemaVersion", "angleUnit"].includes(key))) finite(input[key as keyof Tp1538AeroAssemblyInput], key);
  if (input.trueAirspeedMps <= 0 || input.stabilatorDeg < -25 || input.stabilatorDeg > 25 || Math.abs(input.aileronDeg) > 21.5 || Math.abs(input.rudderDeg) > 30 || input.leadingEdgeFlapDeg < 0 || input.leadingEdgeFlapDeg > 25 || input.speedBrakeDeg < 0 || input.speedBrakeDeg > 60 || input.cgChordFraction < 0 || input.cgChordFraction > 1) throw new Error("TP-1538 Appendix B assembly input exceeds a closed control, speed, or CG bound.");
  const ab = { alphaDeg: input.alphaDeg, betaDeg: input.betaDeg };
  const abs = { ...ab, stabilatorDeg: input.stabilatorDeg };
  const ab0 = { ...ab, stabilatorDeg: 0 };
  const a = { alphaDeg: input.alphaDeg };
  const lefScale = 1 - input.leadingEdgeFlapDeg / 25;
  const speedBrakeScale = input.speedBrakeDeg / 60;
  const aileronScale = input.aileronDeg / 20;
  const rudderScale = input.rudderDeg / 30;
  const chordRate = 3.45 / (2 * input.trueAirspeedMps);
  const spanRate = 9.144 / (2 * input.trueAirspeedMps);

  const cxBase = required(corpus, "CX_BASE", abs);
  const cx = cxBase
    + (lefScale === 0 ? 0 : (required(corpus, "CX_LEF", ab) - required(corpus, "CX_BASE", ab0)) * lefScale)
    + (speedBrakeScale === 0 ? 0 : required(corpus, "CX_SPEEDBRAKE_INCREMENT", a) * speedBrakeScale)
    + (input.pitchRateRadS === 0 ? 0 : chordRate * input.pitchRateRadS * (required(corpus, "CX_Q", a) + (lefScale === 0 ? 0 : required(corpus, "CX_Q_LEF_INCREMENT", a) * lefScale)));

  const czBase = required(corpus, "CZ_BASE", abs);
  const cz = czBase
    + (lefScale === 0 ? 0 : (required(corpus, "CZ_LEF", ab) - required(corpus, "CZ_BASE", ab0)) * lefScale)
    + (speedBrakeScale === 0 ? 0 : required(corpus, "CZ_SPEEDBRAKE_INCREMENT", a) * speedBrakeScale)
    + (input.pitchRateRadS === 0 ? 0 : chordRate * input.pitchRateRadS * (required(corpus, "CZ_Q", a) + (lefScale === 0 ? 0 : required(corpus, "CZ_Q_LEF_INCREMENT", a) * lefScale)));

  const cmBase = required(corpus, "CM_BASE", abs);
  const cm = cmBase * required(corpus, "CM_STABILATOR_EFFECTIVENESS", { stabilatorDeg: input.stabilatorDeg })
    + cz * (0.35 - input.cgChordFraction)
    + (lefScale === 0 ? 0 : (required(corpus, "CM_LEF", ab) - required(corpus, "CM_BASE", ab0)) * lefScale)
    + (speedBrakeScale === 0 ? 0 : required(corpus, "CM_SPEEDBRAKE_INCREMENT", a) * speedBrakeScale)
    + (input.pitchRateRadS === 0 ? 0 : chordRate * input.pitchRateRadS * (required(corpus, "CM_Q", a) + (lefScale === 0 ? 0 : required(corpus, "CM_Q_LEF_INCREMENT", a) * lefScale)))
    + required(corpus, "CM_ALPHA_INCREMENT", a)
    + required(corpus, "CM_DEEP_STALL_INCREMENT", { alphaDeg: input.alphaDeg, stabilatorDeg: input.stabilatorDeg });

  const cyBase = required(corpus, "CY_BASE", ab);
  const cy = cyBase
    + (lefScale === 0 ? 0 : (required(corpus, "CY_LEF", ab) - cyBase) * lefScale)
    + (aileronScale === 0 ? 0 : ((required(corpus, "CY_AILERON_20", ab) - cyBase) + (lefScale === 0 ? 0 : ((required(corpus, "CY_AILERON_20_LEF", ab) - required(corpus, "CY_LEF", ab)) - (required(corpus, "CY_AILERON_20", ab) - cyBase)) * lefScale)) * aileronScale)
    + (rudderScale === 0 ? 0 : (required(corpus, "CY_RUDDER_30", ab) - cyBase) * rudderScale)
    + (input.yawRateRadS === 0 ? 0 : spanRate * (required(corpus, "CY_R", a) + (lefScale === 0 ? 0 : required(corpus, "CY_R_LEF_INCREMENT", a) * lefScale)) * input.yawRateRadS)
    + (input.rollRateRadS === 0 ? 0 : spanRate * (required(corpus, "CY_P", a) + (lefScale === 0 ? 0 : required(corpus, "CY_P_LEF_INCREMENT", a) * lefScale)) * input.rollRateRadS);

  const cnBase = required(corpus, "CN_BASE", abs);
  const cn = cnBase
    + (lefScale === 0 ? 0 : (required(corpus, "CN_LEF", ab) - required(corpus, "CN_BASE", ab0)) * lefScale)
    - cy * (0.35 - input.cgChordFraction) * 3.45 / 9.144
    + (aileronScale === 0 ? 0 : ((required(corpus, "CN_AILERON_20", ab) - required(corpus, "CN_BASE", ab0)) + (lefScale === 0 ? 0 : ((required(corpus, "CN_AILERON_20_LEF", ab) - required(corpus, "CN_LEF", ab)) - (required(corpus, "CN_AILERON_20", ab) - required(corpus, "CN_BASE", ab0))) * lefScale)) * aileronScale)
    + (rudderScale === 0 ? 0 : (required(corpus, "CN_RUDDER_30", ab) - required(corpus, "CN_BASE", ab0)) * rudderScale)
    + (input.yawRateRadS === 0 ? 0 : spanRate * (required(corpus, "CN_R", a) + (lefScale === 0 ? 0 : required(corpus, "CN_R_LEF_INCREMENT", a) * lefScale)) * input.yawRateRadS)
    + (input.rollRateRadS === 0 ? 0 : spanRate * (required(corpus, "CN_P", a) + (lefScale === 0 ? 0 : required(corpus, "CN_P_LEF_INCREMENT", a) * lefScale)) * input.rollRateRadS)
    + (input.betaDeg === 0 ? 0 : required(corpus, "CN_BETA_INCREMENT", a) * input.betaDeg);

  const clBase = required(corpus, "CL_BASE", abs);
  const cl = clBase
    + (lefScale === 0 ? 0 : (required(corpus, "CL_LEF", ab) - required(corpus, "CL_BASE", ab0)) * lefScale)
    + (aileronScale === 0 ? 0 : ((required(corpus, "CL_AILERON_20", ab) - required(corpus, "CL_BASE", ab0)) + (lefScale === 0 ? 0 : ((required(corpus, "CL_AILERON_20_LEF", ab) - required(corpus, "CL_LEF", ab)) - (required(corpus, "CL_AILERON_20", ab) - required(corpus, "CL_BASE", ab0))) * lefScale)) * aileronScale)
    + (rudderScale === 0 ? 0 : (required(corpus, "CL_RUDDER_30", ab) - required(corpus, "CL_BASE", ab0)) * rudderScale)
    + (input.yawRateRadS === 0 ? 0 : spanRate * (required(corpus, "CL_R", a) + (lefScale === 0 ? 0 : required(corpus, "CL_R_LEF_INCREMENT", a) * lefScale)) * input.yawRateRadS)
    + (input.rollRateRadS === 0 ? 0 : spanRate * (required(corpus, "CL_P", a) + (lefScale === 0 ? 0 : required(corpus, "CL_P_LEF_INCREMENT", a) * lefScale)) * input.rollRateRadS)
    + (input.betaDeg === 0 ? 0 : required(corpus, "CL_BETA_INCREMENT", a) * input.betaDeg);

  const coefficients = { cx, cz, cm, cy, cn, cl };
  if (!Object.values(coefficients).every(Number.isFinite)) throw new Error("TP-1538 Appendix B assembly produced a nonfinite coefficient.");
  return {
    schemaVersion: "vector.tp1538-aero-assembly-result.v1",
    corpusSha256: corpus.corpusSha256,
    state: "AVAILABLE",
    coefficients,
    contributionOrder: {
      cx: ["BASE", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING"],
      cz: ["BASE", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING"],
      cm: ["BASE_TIMES_STABILATOR_EFFECTIVENESS", "CZ_CG_TRANSFER", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING", "ALPHA_INCREMENT", "DEEP_STALL_INCREMENT"],
      cy: ["BASE", "LEF_INCREMENT", "AILERON_INCREMENT", "RUDDER_INCREMENT", "R_DAMPING", "P_DAMPING"],
      cn: ["BASE", "LEF_INCREMENT", "CY_CG_TRANSFER", "AILERON_INCREMENT", "RUDDER_INCREMENT", "R_DAMPING", "P_DAMPING", "BETA_INCREMENT"],
      cl: ["BASE", "LEF_INCREMENT", "AILERON_INCREMENT", "RUDDER_INCREMENT", "R_DAMPING", "P_DAMPING", "BETA_INCREMENT"],
    },
  };
}

export function assembleTp1538Coefficients(corpusCandidate: unknown, inputCandidate: unknown, expectedCorpusSha256: string): Tp1538AeroAssemblyResult {
  if (!/^[0-9a-f]{64}$/u.test(expectedCorpusSha256)) throw new Error("Expected TP-1538 compiled corpus identity is invalid.");
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  return assembleValidated(corpus, inputCandidate);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createTp1538Evaluator(corpusCandidate: unknown, expectedCorpusSha256: string): Readonly<{
  corpusSha256: string;
  lookup: (requestCandidate: unknown) => Tp1538AeroLookupResult;
  assemble: (inputCandidate: unknown) => Tp1538AeroAssemblyResult;
}> {
  if (!/^[0-9a-f]{64}$/u.test(expectedCorpusSha256)) throw new Error("Expected TP-1538 compiled corpus identity is invalid.");
  const admitted = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }).corpus as AdmittedCorpus;
  const corpus = deepFreeze(structuredClone(admitted));
  return Object.freeze({
    corpusSha256: corpus.corpusSha256,
    lookup: (requestCandidate: unknown) => lookupValidated(corpus, requestCandidate),
    assemble: (inputCandidate: unknown) => assembleValidated(corpus, inputCandidate),
  });
}

export function createTp1538EvaluatorBatch(
  corpusCandidate: unknown,
  expectedCorpusSha256: string,
  lookupRequests: Tp1538AeroLookupRequest[],
  assemblyRequests: Tp1538AeroAssemblyInput[],
): Tp1538EvaluatorBatch {
  if (!Array.isArray(lookupRequests) || !Array.isArray(assemblyRequests)
    || lookupRequests.length + assemblyRequests.length < 1
    || lookupRequests.length + assemblyRequests.length > 4096) {
    throw new Error("TP-1538 evaluator batch requires 1 through 4,096 operations.");
  }
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  for (const input of lookupRequests) lookupValidated(corpus, input);
  for (const input of assemblyRequests) assembleValidated(corpus, input);
  return {
    schemaVersion: "vector.tp1538-aero-evaluator-batch.v1",
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    evaluatorContract: TP1538_EVALUATOR_CONTRACT,
    corpusSha256: corpus.corpusSha256,
    resolverTables: corpus.tables.map((table) => ({
      id: table.id,
      cells: table.cells.map(({ state, value }) => ({ state, value })),
    })),
    lookupRequests: structuredClone(lookupRequests),
    assemblyRequests: structuredClone(assemblyRequests),
  };
}

export function validateTp1538EvaluatorBatchResult(
  corpusCandidate: unknown,
  batch: Tp1538EvaluatorBatch,
  resultCandidate: unknown,
  expectedCorpusSha256: string,
): Tp1538EvaluatorBatchResult {
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  const expected: Tp1538EvaluatorBatchResult = {
    schemaVersion: "vector.tp1538-aero-evaluator-batch-result.v1",
    backend: "rust-wasm",
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    evaluatorContract: TP1538_EVALUATOR_CONTRACT,
    corpusSha256: corpus.corpusSha256,
    lookupResults: batch.lookupRequests.map((input) => lookupValidated(corpus, input)),
    assemblyResults: batch.assemblyRequests.map((input) => assembleValidated(corpus, input)),
  };
  if (canonical(resultCandidate) !== canonical(expected)) throw new Error("TP-1538 Rust/WASM batch result fails complete TypeScript replay parity.");
  return structuredClone(expected);
}

function verificationModelPack(corpusSha256: string): Tp1538VerificationRecord["modelPack"] {
  const identity = {
    schemaVersion: "vector.tp1538-verification-model-pack.v1" as const,
    id: "nasa-tp1538-generic-f16-aero-verification" as const,
    version: "1.0.0" as const,
    corpusSha256,
    evaluatorContract: TP1538_EVALUATOR_CONTRACT,
  };
  return { schemaVersion: identity.schemaVersion, id: identity.id, version: identity.version, digest: sha256(canonical(identity)) };
}

export function tp1538VerificationRecordContentSha256(record: Tp1538VerificationRecord): string {
  const candidate = structuredClone(record) as Tp1538VerificationRecord;
  candidate.contentSha256 = "";
  return sha256(canonical(candidate));
}

export function createTp1538VerificationRecord(
  corpusCandidate: unknown,
  inputs: Tp1538AeroLookupRequest[],
  expectedCorpusSha256: string,
  backend: "typescript" | "rust-wasm",
): Tp1538VerificationRecord {
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 4096) throw new Error("TP-1538 verification record lookup workload is empty or exceeds 4,096 cases.");
  const lookups = inputs.map((input) => ({ input: structuredClone(input), result: lookupValidated(corpus, input) }));
  const record: Tp1538VerificationRecord = {
    schemaVersion: "vector.tp1538-aero-verification-record.v1",
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    backend,
    evaluatorContract: TP1538_EVALUATOR_CONTRACT,
    corpusSha256: corpus.corpusSha256,
    modelPack: verificationModelPack(corpus.corpusSha256),
    lookups,
    limitations: [
      "LOW_SPEED_SUBSCALE_WIND_TUNNEL_VERIFICATION_ONLY",
      "NO_PROPULSION_OR_FLIGHT_CONTROL_LAWS",
      "NO_NAMED_AIRCRAFT_OR_PRODUCTION_AUTHORITY",
    ],
    contentSha256: "",
  };
  record.contentSha256 = tp1538VerificationRecordContentSha256(record);
  validateTp1538VerificationRecord(corpus, record, expectedCorpusSha256);
  return record;
}

export function validateTp1538VerificationRecord(
  corpusCandidate: unknown,
  recordCandidate: unknown,
  expectedCorpusSha256: string,
): { record: Tp1538VerificationRecord; lookupCount: number } {
  const { corpus } = validateTp1538Corpus(corpusCandidate, { expectedCorpusSha256 }) as { corpus: AdmittedCorpus };
  exactKeys(recordCandidate, ["backend", "contentSha256", "corpusSha256", "deploymentClass", "evaluatorContract", "limitations", "lookups", "modelPack", "schemaVersion", "subject"], "TP-1538 verification record");
  const record = recordCandidate as unknown as Tp1538VerificationRecord;
  if (record.schemaVersion !== "vector.tp1538-aero-verification-record.v1" || record.subject !== "NASA_GENERIC_F16" || record.deploymentClass !== "ENGINE_VERIFICATION_ONLY" || !["typescript", "rust-wasm"].includes(record.backend) || record.evaluatorContract !== TP1538_EVALUATOR_CONTRACT || record.corpusSha256 !== corpus.corpusSha256) throw new Error("TP-1538 verification record identity is invalid.");
  exactKeys(record.modelPack, ["digest", "id", "schemaVersion", "version"], "TP-1538 verification model pack");
  if (canonical(record.modelPack) !== canonical(verificationModelPack(corpus.corpusSha256))) throw new Error("TP-1538 verification record model-pack identity is invalid.");
  if (canonical(record.limitations) !== canonical(["LOW_SPEED_SUBSCALE_WIND_TUNNEL_VERIFICATION_ONLY", "NO_PROPULSION_OR_FLIGHT_CONTROL_LAWS", "NO_NAMED_AIRCRAFT_OR_PRODUCTION_AUTHORITY"])) throw new Error("TP-1538 verification record limitations are invalid.");
  if (!Array.isArray(record.lookups) || record.lookups.length < 1 || record.lookups.length > 4096) throw new Error("TP-1538 verification record lookup workload is invalid.");
  for (const [index, lookup] of record.lookups.entries()) {
    exactKeys(lookup, ["input", "result"], `TP-1538 verification record lookup ${index}`);
    const replay = lookupValidated(corpus, lookup.input);
    if (canonical(replay) !== canonical(lookup.result)) throw new Error(`TP-1538 verification record lookup ${index} result fails deterministic replay.`);
  }
  if (!/^[0-9a-f]{64}$/u.test(record.contentSha256) || record.contentSha256 !== tp1538VerificationRecordContentSha256(record)) throw new Error("TP-1538 verification record content digest is invalid.");
  return { record, lookupCount: record.lookups.length };
}

export function encodeTp1538VerificationRecord(record: Tp1538VerificationRecord): Uint8Array {
  if (record.contentSha256 !== tp1538VerificationRecordContentSha256(record)) throw new Error("TP-1538 verification record must be valid before persistence.");
  return new TextEncoder().encode(`${JSON.stringify(record)}\n`);
}

export function readTp1538VerificationRecord(
  corpusCandidate: unknown,
  bytes: Uint8Array,
  expectedCorpusSha256: string,
): { record: Tp1538VerificationRecord; lookupCount: number; byteLength: number } {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > 8 * 1024 * 1024) throw new Error("TP-1538 verification record byte length is outside its closed bound.");
  let record: unknown;
  try {
    record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("TP-1538 verification record bytes are not exact UTF-8 JSON.");
  }
  return { ...validateTp1538VerificationRecord(corpusCandidate, record, expectedCorpusSha256), byteLength: bytes.byteLength };
}
