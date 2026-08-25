import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import sourceManifest from "../../governance/sources/nasa-tp1538/manifest.v1.json" with { type: "json" };

export const TP1538_SOURCE_MANIFEST_SHA256 = "d4736dae888054e502c34912374b8c032dd52f84414bc7e9137b9953acbe4e6b";
export const MAX_TP1538_TRANSCRIPTION_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const MAX_TP1538_CORPUS_ARTIFACT_BYTES = 32 * 1024 * 1024;
export const MAX_TP1538_COMPARISON_MISMATCHES = 2 * 14_705;

export const TP1538_AXES = deepFreeze({
  alphaDeg: [-20,-15,-10,-5,0,5,10,15,20,25,30,35,40,45,50,55,60,70,80,90],
  betaDeg: [-30,-25,-20,-15,-10,-8,-6,-4,-2,0,2,4,6,8,10,15,20,25,30],
  stabilatorBaseLongitudinalDeg: [-25,-10,0,10,25],
  stabilatorBaseLateralDeg: [-25,0,25],
  deepStallStabilatorDeg: [-25,-10,0,10,15,20,25],
});

const TABLE_SPECS = [
  ["CX_BASE", "CX", ["alphaDeg", "betaDeg", "stabilatorBaseLongitudinalDeg"], [51,52,53,54,55], "TRILINEAR"],
  ["CX_LEF", "CX", ["alphaDeg", "betaDeg"], [56], "BILINEAR"],
  ["CX_SPEEDBRAKE_INCREMENT", "CX", ["alphaDeg"], [57], "LINEAR"],
  ["CX_Q", "CX", ["alphaDeg"], [57], "LINEAR"],
  ["CX_Q_LEF_INCREMENT", "CX", ["alphaDeg"], [57], "LINEAR"],
  ["CZ_BASE", "CZ", ["alphaDeg", "betaDeg", "stabilatorBaseLongitudinalDeg"], [58,59,60,61,62], "TRILINEAR"],
  ["CZ_LEF", "CZ", ["alphaDeg", "betaDeg"], [63], "BILINEAR"],
  ["CZ_SPEEDBRAKE_INCREMENT", "CZ", ["alphaDeg"], [64], "LINEAR"],
  ["CZ_Q", "CZ", ["alphaDeg"], [64], "LINEAR"],
  ["CZ_Q_LEF_INCREMENT", "CZ", ["alphaDeg"], [64], "LINEAR"],
  ["CM_BASE", "CM", ["alphaDeg", "betaDeg", "stabilatorBaseLongitudinalDeg"], [65,66,67,68,69], "TRILINEAR"],
  ["CM_LEF", "CM", ["alphaDeg", "betaDeg"], [70], "BILINEAR"],
  ["CM_SPEEDBRAKE_INCREMENT", "CM", ["alphaDeg"], [71], "LINEAR"],
  ["CM_ALPHA_INCREMENT", "CM", ["alphaDeg"], [71], "LINEAR"],
  ["CM_STABILATOR_EFFECTIVENESS", "CM", ["stabilatorBaseLongitudinalDeg"], [71], "LINEAR"],
  ["CM_Q", "CM", ["alphaDeg"], [72], "LINEAR"],
  ["CM_Q_LEF_INCREMENT", "CM", ["alphaDeg"], [72], "LINEAR"],
  ["CM_DEEP_STALL_INCREMENT", "CM", ["alphaDeg", "deepStallStabilatorDeg"], [73], "BILINEAR"],
  ["CY_BASE", "CY", ["alphaDeg", "betaDeg"], [74], "BILINEAR"],
  ["CY_LEF", "CY", ["alphaDeg", "betaDeg"], [75], "BILINEAR"],
  ["CY_AILERON_20", "CY", ["alphaDeg", "betaDeg"], [76], "BILINEAR"],
  ["CY_AILERON_20_LEF", "CY", ["alphaDeg", "betaDeg"], [77], "BILINEAR"],
  ["CY_RUDDER_30", "CY", ["alphaDeg", "betaDeg"], [78], "BILINEAR"],
  ["CY_R", "CY", ["alphaDeg"], [79], "LINEAR"],
  ["CY_R_LEF_INCREMENT", "CY", ["alphaDeg"], [79], "LINEAR"],
  ["CY_P", "CY", ["alphaDeg"], [79], "LINEAR"],
  ["CY_P_LEF_INCREMENT", "CY", ["alphaDeg"], [79], "LINEAR"],
  ["CN_BASE", "CN", ["alphaDeg", "betaDeg", "stabilatorBaseLateralDeg"], [80,81,82], "TRILINEAR"],
  ["CN_LEF", "CN", ["alphaDeg", "betaDeg"], [83], "BILINEAR"],
  ["CN_AILERON_20", "CN", ["alphaDeg", "betaDeg"], [84], "BILINEAR"],
  ["CN_AILERON_20_LEF", "CN", ["alphaDeg", "betaDeg"], [85], "BILINEAR"],
  ["CN_RUDDER_30", "CN", ["alphaDeg", "betaDeg"], [86], "BILINEAR"],
  ["CN_R", "CN", ["alphaDeg"], [87], "LINEAR"],
  ["CN_BETA_INCREMENT", "CN", ["alphaDeg"], [87], "LINEAR"],
  ["CN_AILERON_INCREMENT", "CN", ["alphaDeg"], [87], "LINEAR"],
  ["CN_R_LEF_INCREMENT", "CN", ["alphaDeg"], [88], "LINEAR"],
  ["CN_P", "CN", ["alphaDeg"], [88], "LINEAR"],
  ["CN_P_LEF_INCREMENT", "CN", ["alphaDeg"], [88], "LINEAR"],
  ["CL_BASE", "CL", ["alphaDeg", "betaDeg", "stabilatorBaseLateralDeg"], [89,90,91], "TRILINEAR"],
  ["CL_LEF", "CL", ["alphaDeg", "betaDeg"], [92], "BILINEAR"],
  ["CL_AILERON_20", "CL", ["alphaDeg", "betaDeg"], [93], "BILINEAR"],
  ["CL_AILERON_20_LEF", "CL", ["alphaDeg", "betaDeg"], [94], "BILINEAR"],
  ["CL_RUDDER_30", "CL", ["alphaDeg", "betaDeg"], [95], "BILINEAR"],
  ["CL_R", "CL", ["alphaDeg"], [96], "LINEAR"],
  ["CL_BETA_INCREMENT", "CL", ["alphaDeg"], [96], "LINEAR"],
  ["CL_R_LEF_INCREMENT", "CL", ["alphaDeg"], [96], "LINEAR"],
  ["CL_P", "CL", ["alphaDeg"], [97], "LINEAR"],
  ["CL_P_LEF_INCREMENT", "CL", ["alphaDeg"], [97], "LINEAR"],
];

const LIMITED_ALPHA_TABLES = new Set([
  "CX_LEF", "CX_Q_LEF_INCREMENT",
  "CZ_LEF", "CZ_Q_LEF_INCREMENT",
  "CM_LEF", "CM_Q_LEF_INCREMENT",
  "CY_LEF", "CY_AILERON_20_LEF", "CY_R_LEF_INCREMENT", "CY_P_LEF_INCREMENT",
  "CN_LEF", "CN_AILERON_20_LEF", "CN_R_LEF_INCREMENT", "CN_P_LEF_INCREMENT",
  "CL_LEF", "CL_AILERON_20_LEF", "CL_R_LEF_INCREMENT", "CL_P_LEF_INCREMENT",
]);

export const TP1538_TABLE_INVENTORY = deepFreeze(TABLE_SPECS.map(([id, coefficient, axes, pdfPages, interpolation]) => ({
  id,
  coefficient,
  configurationId: `TP1538_${id}`,
  axes,
  pdfPages,
  interpolation,
  units: "DIMENSIONLESS",
  alphaValidityDeg: LIMITED_ALPHA_TABLES.has(id) ? [-20, 45] : [-20, 90],
  cellCount: axes.reduce((product, axis) => product * TP1538_AXES[axis].length, 1),
})));

const ROOT_KEYS = ["contentSha256", "deploymentClass", "entrantId", "isolationSessionId", "method", "schemaVersion", "sourceManifestSha256", "status", "subject", "tables", "transcriptionId"];
const TABLE_KEYS = ["cells", "tableId"];
const CELL_KEYS = ["coordinate", "printedValue", "state"];
const STATES = new Set(["AVAILABLE", "PRINTED_BLANK", "ILLEGIBLE", "OUT_OF_DOMAIN", "UNENTERED"]);
const DECIMAL = /^[+-]?(?:0|[1-9]\d*)?\.\d+$/u;
const CORPUS_ROOT_KEYS = ["appendixB", "axes", "comparison", "corpusId", "corpusSha256", "cropRecipe", "deploymentClass", "limitations", "referenceData", "schemaVersion", "signs", "source", "sourcePages", "subject", "tables", "transcriptions"];
const CORPUS_TABLE_KEYS = ["alphaValidityDeg", "axes", "cells", "coefficient", "configurationId", "id", "interpolation", "pdfPages", "units"];
const CORPUS_CELL_KEYS = ["coordinate", "lineage", "printedValue", "state", "value"];
const LINEAGE_KEYS = ["cropPath", "cropSha256", "leftTranscriptionId", "pdfPage", "reportPage", "resolution", "rightTranscriptionId"];

export const TP1538_REFERENCE_DATA = deepFreeze({
  weight: { si: { value: 91188, unit: "N" }, customary: { value: 20500, unit: "lb" } },
  inertia: {
    ix: { si: { value: 12875, unit: "kg*m^2" }, customary: { value: 9496, unit: "slug*ft^2" } },
    iy: { si: { value: 75674, unit: "kg*m^2" }, customary: { value: 55814, unit: "slug*ft^2" } },
    iz: { si: { value: 85552, unit: "kg*m^2" }, customary: { value: 63100, unit: "slug*ft^2" } },
    ixz: { si: { value: 1331, unit: "kg*m^2" }, customary: { value: 982, unit: "slug*ft^2" } },
  },
  wing: {
    span: { si: { value: 9.144, unit: "m" }, customary: { value: 30, unit: "ft" } },
    area: { si: { value: 27.87, unit: "m^2" }, customary: { value: 300, unit: "ft^2" } },
    meanAerodynamicChord: { si: { value: 3.45, unit: "m" }, customary: { value: 11.32, unit: "ft" } },
  },
  referenceCgChordFraction: 0.35,
  controlLimitsDeg: { stabilator: 25, differentialTailPerSurface: 5.375, aileron: 21.5, rudder: 30, leadingEdgeFlap: 25, speedBrake: 60 },
  source: { pdfPage: 49, reportPage: 43 },
});

export const TP1538_APPENDIX_B = deepFreeze({
  sourcePdfPages: [42,43,44,45,46],
  referenceMomentCgChordFraction: 0.35,
  coefficientOrder: ["CX_TOTAL", "CZ_TOTAL", "CM_TOTAL", "CY_TOTAL", "CN_TOTAL", "CL_TOTAL"],
  contributions: {
    CX_TOTAL: ["CX_BASE", "CX_LEF_INCREMENT", "CX_SPEEDBRAKE_INCREMENT", "CX_Q_DAMPING"],
    CZ_TOTAL: ["CZ_BASE", "CZ_LEF_INCREMENT", "CZ_SPEEDBRAKE_INCREMENT", "CZ_Q_DAMPING"],
    CM_TOTAL: ["CM_BASE_TIMES_STABILATOR_EFFECTIVENESS", "CZ_CG_TRANSFER", "CM_LEF_INCREMENT", "CM_SPEEDBRAKE_INCREMENT", "CM_Q_DAMPING", "CM_ALPHA_INCREMENT", "CM_DEEP_STALL_INCREMENT"],
    CY_TOTAL: ["CY_BASE", "CY_LEF_INCREMENT", "CY_AILERON_INCREMENT", "CY_RUDDER_INCREMENT", "CY_R_DAMPING", "CY_P_DAMPING"],
    CN_TOTAL: ["CN_BASE", "CN_LEF_INCREMENT", "CY_CG_TRANSFER", "CN_AILERON_INCREMENT", "CN_RUDDER_INCREMENT", "CN_R_DAMPING", "CN_P_DAMPING", "CN_BETA_INCREMENT"],
    CL_TOTAL: ["CL_BASE", "CL_LEF_INCREMENT", "CL_AILERON_INCREMENT", "CL_RUDDER_INCREMENT", "CL_R_DAMPING", "CL_P_DAMPING", "CL_BETA_INCREMENT"],
  },
  printedTablesNotReferencedByTotalCoefficientEquations: [{
    tableId: "CN_AILERON_INCREMENT",
    tablePdfPage: 87,
    equationPdfPage: 45,
    decision: "LOOKUP_ONLY_WITHHELD_FROM_ASSEMBLY",
    rationale: "Table III prints delta-Cn-delta-a(alpha), but the Appendix B Cn total equation and definitions do not reference that one-dimensional table.",
  }],
});

export const TP1538_SIGNS = deepFreeze({
  bodyAxes: "X_FORWARD_Y_RIGHT_Z_DOWN",
  positiveStabilator: "NOSE_DOWN",
  positiveAileronDifferentialTail: "LEFT_ROLL",
  positiveRudder: "LEFT_YAW",
  positiveLeadingEdgeFlap: "DOWN",
});

export const TP1538_LIMITATIONS = deepFreeze([
  "LOW_SPEED_SUBSCALE_WIND_TUNNEL_APPROX_MACH_0_1_TO_0_2",
  "NO_ALTITUDE_AXIS",
  "NO_PROPULSION",
  "NO_FLIGHT_CONTROL_LAWS",
  "NO_REYNOLDS_OR_AEROELASTIC_CORRECTION",
  "NO_NAMED_AIRCRAFT_OR_PRODUCTION_AUTHORITY",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with exact keys.`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must have exact keys.`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseBoundedJsonArtifact(bytes, maximumBytes, label) {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${label} bytes must be a Uint8Array.`);
  if (bytes.byteLength < 2 || bytes.byteLength > maximumBytes) throw new Error(`${label} byte length is outside its closed bound.`);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} bytes are not exact UTF-8 JSON.`);
  }
}

export function parseTp1538TranscriptionArtifact(bytes) {
  const transcription = parseBoundedJsonArtifact(bytes, MAX_TP1538_TRANSCRIPTION_ARTIFACT_BYTES, "TP-1538 transcription artifact");
  const report = validateTp1538Transcription(transcription);
  return { ...report, rawSha256: sha256(bytes), byteLength: bytes.byteLength };
}

export function parseTp1538CorpusArtifact(bytes, { expectedRawSha256, expectedCorpusSha256 } = {}) {
  if (expectedRawSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(expectedRawSha256)) throw new Error("Expected TP-1538 raw corpus identity is invalid.");
  const rawSha256 = sha256(bytes);
  if (expectedRawSha256 !== undefined && rawSha256 !== expectedRawSha256) throw new Error("TP-1538 raw corpus bytes do not match the compiled identity.");
  const corpus = parseBoundedJsonArtifact(bytes, MAX_TP1538_CORPUS_ARTIFACT_BYTES, "TP-1538 corpus artifact");
  const report = validateTp1538Corpus(corpus, { expectedCorpusSha256 });
  return { ...report, rawSha256, byteLength: bytes.byteLength };
}

function coordinateKey(coordinate) {
  return canonical(coordinate);
}

function coordinateFor(table, indexes) {
  const coordinate = {};
  for (let index = 0; index < table.axes.length; index += 1) {
    const axis = table.axes[index];
    const key = axis === "alphaDeg" ? "alphaDeg"
      : axis === "betaDeg" ? "betaDeg"
      : "stabilatorDeg";
    coordinate[key] = TP1538_AXES[axis][indexes[index]];
  }
  return coordinate;
}

function enumerateCoordinates(table) {
  const coordinates = [];
  const indexes = Array(table.axes.length).fill(0);
  const visit = (depth) => {
    if (depth === indexes.length) {
      coordinates.push(coordinateFor(table, indexes));
      return;
    }
    for (let index = 0; index < TP1538_AXES[table.axes[depth]].length; index += 1) {
      indexes[depth] = index;
      visit(depth + 1);
    }
  };
  visit(0);
  return coordinates;
}

export function createTp1538TranscriptionTemplate({ transcriptionId, entrantId, isolationSessionId }) {
  if (![transcriptionId, entrantId, isolationSessionId].every((value) => typeof value === "string" && value.length > 0)) throw new Error("Transcription identity fields are required.");
  return {
    schemaVersion: "vector.tp1538-manual-transcription.v1",
    transcriptionId,
    entrantId,
    isolationSessionId,
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    sourceManifestSha256: TP1538_SOURCE_MANIFEST_SHA256,
    method: "MANUAL_SOURCE_CROP_ONLY",
    status: "DRAFT",
    tables: TP1538_TABLE_INVENTORY.map((table) => ({
      tableId: table.id,
      cells: enumerateCoordinates(table).map((coordinate) => ({ coordinate, state: "UNENTERED", printedValue: null })),
    })),
    contentSha256: null,
  };
}

export function transcriptionContentSha256(transcription) {
  const candidate = structuredClone(transcription);
  candidate.contentSha256 = null;
  return sha256(canonical(candidate));
}

export function completeTp1538Transcription(transcription) {
  const candidate = structuredClone(transcription);
  candidate.status = "COMPLETE";
  candidate.contentSha256 = null;
  candidate.contentSha256 = transcriptionContentSha256(candidate);
  validateTp1538Transcription(candidate);
  return candidate;
}

export function validateTp1538Transcription(transcription, { allowUnentered = false } = {}) {
  exactKeys(transcription, ROOT_KEYS, "TP-1538 transcription");
  if (transcription.schemaVersion !== "vector.tp1538-manual-transcription.v1" || transcription.subject !== "NASA_GENERIC_F16" || transcription.deploymentClass !== "ENGINE_VERIFICATION_ONLY" || transcription.sourceManifestSha256 !== TP1538_SOURCE_MANIFEST_SHA256) throw new Error("TP-1538 transcription identity is invalid.");
  if (transcription.method !== "MANUAL_SOURCE_CROP_ONLY") throw new Error("TP-1538 values require manual source-crop entry; OCR and imported numeric files are inadmissible.");
  for (const field of ["transcriptionId", "entrantId", "isolationSessionId"]) if (typeof transcription[field] !== "string" || transcription[field].length === 0) throw new Error(`TP-1538 ${field} is required.`);
  if (!Array.isArray(transcription.tables) || transcription.tables.length !== TP1538_TABLE_INVENTORY.length) throw new Error("TP-1538 transcription table inventory is partial or duplicated.");
  let available = 0;
  let unavailable = 0;
  let unentered = 0;
  for (let tableIndex = 0; tableIndex < TP1538_TABLE_INVENTORY.length; tableIndex += 1) {
    const expectedTable = TP1538_TABLE_INVENTORY[tableIndex];
    const table = transcription.tables[tableIndex];
    exactKeys(table, TABLE_KEYS, `TP-1538 transcription table ${tableIndex}`);
    if (table.tableId !== expectedTable.id || !Array.isArray(table.cells) || table.cells.length !== expectedTable.cellCount) throw new Error(`TP-1538 ${expectedTable.id} cell inventory is partial, duplicated, or reordered.`);
    const expectedCoordinates = enumerateCoordinates(expectedTable);
    const seen = new Set();
    for (let cellIndex = 0; cellIndex < table.cells.length; cellIndex += 1) {
      const cell = table.cells[cellIndex];
      exactKeys(cell, CELL_KEYS, `${expectedTable.id} cell ${cellIndex}`);
      exactKeys(cell.coordinate, Object.keys(expectedCoordinates[cellIndex]), `${expectedTable.id} coordinate ${cellIndex}`);
      const key = coordinateKey(cell.coordinate);
      if (seen.has(key) || key !== coordinateKey(expectedCoordinates[cellIndex])) throw new Error(`${expectedTable.id} coordinate is duplicated or violates canonical ordering.`);
      seen.add(key);
      if (!STATES.has(cell.state)) throw new Error(`${expectedTable.id} cell state is invalid.`);
      const outsidePublishedAlpha = cell.coordinate.alphaDeg !== undefined && cell.coordinate.alphaDeg > expectedTable.alphaValidityDeg[1];
      if (cell.state !== "UNENTERED" && outsidePublishedAlpha !== (cell.state === "OUT_OF_DOMAIN")) throw new Error(`${expectedTable.id} cell state violates its published alpha domain.`);
      if (cell.state === "AVAILABLE") {
        if (typeof cell.printedValue !== "string" || !DECIMAL.test(cell.printedValue) || !Number.isFinite(Number(cell.printedValue))) throw new Error(`${expectedTable.id} available value must preserve a finite printed decimal.`);
        available += 1;
      } else {
        if (cell.printedValue !== null) throw new Error(`${expectedTable.id} unavailable cell cannot contain a numeric value.`);
        if (cell.state === "UNENTERED") unentered += 1;
        else unavailable += 1;
      }
    }
  }
  if (!allowUnentered && unentered > 0) throw new Error(`TP-1538 transcription is incomplete: ${unentered} cells remain UNENTERED.`);
  if (transcription.status === "COMPLETE") {
    if (unentered > 0 || !/^[0-9a-f]{64}$/u.test(transcription.contentSha256 ?? "") || transcription.contentSha256 !== transcriptionContentSha256(transcription)) throw new Error("Complete TP-1538 transcription digest or completeness is invalid.");
  } else if (transcription.status !== "DRAFT" || transcription.contentSha256 !== null) {
    throw new Error("Draft TP-1538 transcription must have a null digest.");
  }
  return { transcription, available, unavailable, unentered };
}

function transcriptionStructureMismatches(transcription, side) {
  const mismatches = [];
  if (!transcription || typeof transcription !== "object" || !Array.isArray(transcription.tables)) {
    return [{ kind: `MALFORMED_${side}`, tableId: null, coordinate: null }];
  }
  const expectedIds = new Set(TP1538_TABLE_INVENTORY.map(({ id }) => id));
  for (const candidate of transcription.tables) {
    if (!expectedIds.has(candidate?.tableId)) {
      mismatches.push({ kind: `UNKNOWN_TABLE_${side}`, tableId: candidate?.tableId ?? null, coordinate: null });
    }
  }
  for (const expectedTable of TP1538_TABLE_INVENTORY) {
    const tableMismatchStart = mismatches.length;
    const candidates = transcription.tables.filter((table) => table?.tableId === expectedTable.id);
    if (candidates.length === 0) {
      mismatches.push({ kind: `MISSING_TABLE_${side}`, tableId: expectedTable.id, coordinate: null });
      continue;
    }
    if (candidates.length > 1) mismatches.push({ kind: `DUPLICATE_TABLE_${side}`, tableId: expectedTable.id, coordinate: null });
    const cells = Array.isArray(candidates[0]?.cells) ? candidates[0].cells : [];
    const expectedCoordinates = enumerateCoordinates(expectedTable);
    const expectedKeys = new Set(expectedCoordinates.map(coordinateKey));
    const counts = new Map();
    for (const cell of cells) {
      const key = coordinateKey(cell?.coordinate);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!expectedKeys.has(key)) mismatches.push({ kind: `AXIS_${side}`, tableId: expectedTable.id, coordinate: cell?.coordinate ?? null });
    }
    for (const coordinate of expectedCoordinates) {
      const count = counts.get(coordinateKey(coordinate)) ?? 0;
      if (count === 0) mismatches.push({ kind: `MISSING_${side}`, tableId: expectedTable.id, coordinate });
      else if (count > 1) mismatches.push({ kind: `DUPLICATE_${side}`, tableId: expectedTable.id, coordinate });
    }
    if (mismatches.length === tableMismatchStart && cells.some((cell, index) => coordinateKey(cell.coordinate) !== coordinateKey(expectedCoordinates[index]))) {
      mismatches.push({ kind: `ORDER_${side}`, tableId: expectedTable.id, coordinate: null });
    }
  }
  return mismatches;
}

export function compareTp1538Transcriptions(left, right, options = {}) {
  if (left?.transcriptionId === right?.transcriptionId || left?.entrantId === right?.entrantId || left?.isolationSessionId === right?.isolationSessionId) throw new Error("Transcriptions must have distinct identities, entrants, and independent isolation sessions.");
  const structural = [...transcriptionStructureMismatches(left, "LEFT"), ...transcriptionStructureMismatches(right, "RIGHT")];
  if (structural.length > MAX_TP1538_COMPARISON_MISMATCHES) throw new Error("TP-1538 comparison exceeds its closed mismatch bound.");
  if (structural.length > 0) {
    return {
      schemaVersion: "vector.tp1538-transcription-comparison.v1",
      sourceManifestSha256: TP1538_SOURCE_MANIFEST_SHA256,
      leftTranscriptionId: left?.transcriptionId ?? null,
      rightTranscriptionId: right?.transcriptionId ?? null,
      summary: { totalCells: 14_705, agreements: 0, valueMismatches: 0, stateMismatches: 0, structuralMismatches: structural.length, unenteredBoth: 0, leftAvailable: 0, rightAvailable: 0 },
      mismatches: structural,
    };
  }
  const a = validateTp1538Transcription(left, options);
  const b = validateTp1538Transcription(right, options);
  return compareValidatedTranscriptions(left, right, a, b);
}

function compareValidatedTranscriptions(left, right, a, b) {
  const mismatches = [];
  let agreements = 0;
  let unenteredBoth = 0;
  let valueMismatches = 0;
  let stateMismatches = 0;
  for (let tableIndex = 0; tableIndex < left.tables.length; tableIndex += 1) {
    const leftTable = left.tables[tableIndex];
    const rightTable = right.tables[tableIndex];
    for (let cellIndex = 0; cellIndex < leftTable.cells.length; cellIndex += 1) {
      const leftCell = leftTable.cells[cellIndex];
      const rightCell = rightTable.cells[cellIndex];
      if (leftCell.state === "UNENTERED" && rightCell.state === "UNENTERED") {
        unenteredBoth += 1;
      } else if (leftCell.state !== rightCell.state) {
        stateMismatches += 1;
        mismatches.push({ kind: "STATE", tableId: leftTable.tableId, coordinate: leftCell.coordinate, leftState: leftCell.state, leftPrintedValue: leftCell.printedValue, rightState: rightCell.state, rightPrintedValue: rightCell.printedValue });
      } else if (leftCell.printedValue !== rightCell.printedValue) {
        valueMismatches += 1;
        mismatches.push({ kind: "VALUE", tableId: leftTable.tableId, coordinate: leftCell.coordinate, leftState: leftCell.state, leftPrintedValue: leftCell.printedValue, rightState: rightCell.state, rightPrintedValue: rightCell.printedValue });
      } else {
        agreements += 1;
      }
    }
  }
  if (mismatches.length > MAX_TP1538_COMPARISON_MISMATCHES) throw new Error("TP-1538 comparison exceeds its closed mismatch bound.");
  return {
    schemaVersion: "vector.tp1538-transcription-comparison.v1",
    sourceManifestSha256: TP1538_SOURCE_MANIFEST_SHA256,
    leftTranscriptionId: left.transcriptionId,
    rightTranscriptionId: right.transcriptionId,
    summary: { totalCells: 14_705, agreements, valueMismatches, stateMismatches, structuralMismatches: 0, unenteredBoth, leftAvailable: a.available, rightAvailable: b.available },
    mismatches,
  };
}

function pageDescriptor(pdfPage) {
  const page = sourceManifest.pages.find((candidate) => candidate.pdfPage === pdfPage);
  if (!page) throw new Error(`TP-1538 source manifest omits PDF page ${pdfPage}.`);
  return page;
}

function pdfPageForCell(table, coordinate) {
  if (table.pdfPages.length === 1) return table.pdfPages[0];
  const stabilatorAxis = table.axes.find((axis) => axis.includes("stabilator"));
  const planeIndex = TP1538_AXES[stabilatorAxis].indexOf(coordinate.stabilatorDeg);
  if (planeIndex < 0 || table.pdfPages[planeIndex] === undefined) throw new Error(`${table.id} stabilator plane has no source page.`);
  return table.pdfPages[planeIndex];
}

export function tp1538PdfPageForCoordinate(tableId, coordinate) {
  const table = TP1538_TABLE_INVENTORY.find(({ id }) => id === tableId);
  if (!table) throw new Error("TP-1538 table identity is unknown.");
  const expected = enumerateCoordinates(table).find((candidate) => coordinateKey(candidate) === coordinateKey(coordinate));
  if (!expected) throw new Error("TP-1538 coordinate is outside the table inventory.");
  return pdfPageForCell(table, expected);
}

export function tp1538ComparisonContentSha256(comparison) {
  return sha256(canonical(comparison));
}

function decisionsSha256(decisions) {
  return sha256(canonical(decisions));
}

function decisionKey(tableId, coordinate) {
  return `${tableId}:${coordinateKey(coordinate)}`;
}

function validateDecision(decision, expectedMismatch, expectedPage) {
  const keys = ["adjudicatorId", "chosenPrintedValue", "chosenState", "coordinate", "pdfPage", "rationale", "tableId"];
  exactKeys(decision, keys, "TP-1538 adjudication decision");
  if (decision.tableId !== expectedMismatch.tableId || coordinateKey(decision.coordinate) !== coordinateKey(expectedMismatch.coordinate) || decision.pdfPage !== expectedPage) throw new Error("TP-1538 adjudication decision identity, coordinate, or source page is invalid.");
  if (typeof decision.adjudicatorId !== "string" || decision.adjudicatorId.length === 0 || typeof decision.rationale !== "string" || decision.rationale.length < 16) throw new Error("TP-1538 adjudication requires an identified adjudicator and material page-grounded rationale.");
  if (!STATES.has(decision.chosenState) || decision.chosenState === "UNENTERED") throw new Error("TP-1538 adjudication state is invalid.");
  if (decision.chosenState === "AVAILABLE") {
    if (typeof decision.chosenPrintedValue !== "string" || !DECIMAL.test(decision.chosenPrintedValue)) throw new Error("TP-1538 adjudicated available value must preserve the printed decimal.");
  } else if (decision.chosenPrintedValue !== null) throw new Error("TP-1538 adjudicated unavailable state cannot contain a value.");
}

export function tp1538CorpusContentSha256(corpus) {
  const candidate = structuredClone(corpus);
  candidate.corpusSha256 = null;
  return sha256(canonical(candidate));
}

export function createTp1538AdjudicatedCorpus({ left, right, comparison, decisions }) {
  const expectedComparison = compareTp1538Transcriptions(left, right);
  if (canonical(comparison) !== canonical(expectedComparison)) throw new Error("TP-1538 comparison is stale, partial, reordered, or forged.");
  if (!Array.isArray(decisions)) throw new Error("TP-1538 adjudication decisions must be an array.");
  const mismatchByKey = new Map(comparison.mismatches.map((mismatch) => [decisionKey(mismatch.tableId, mismatch.coordinate), mismatch]));
  const decisionByKey = new Map();
  for (const decision of decisions) {
    const key = decisionKey(decision.tableId, decision.coordinate);
    if (decisionByKey.has(key)) throw new Error("TP-1538 adjudication decision is duplicated.");
    const mismatch = mismatchByKey.get(key);
    if (!mismatch) throw new Error("TP-1538 adjudication decision does not identify a comparator mismatch.");
    const table = TP1538_TABLE_INVENTORY.find(({ id }) => id === decision.tableId);
    validateDecision(decision, mismatch, pdfPageForCell(table, decision.coordinate));
    decisionByKey.set(key, decision);
  }
  if (decisionByKey.size !== mismatchByKey.size) throw new Error(`TP-1538 corpus has ${mismatchByKey.size - decisionByKey.size} missing adjudication decision(s).`);

  const tables = TP1538_TABLE_INVENTORY.map((inventory, tableIndex) => ({
    id: inventory.id,
    coefficient: inventory.coefficient,
    configurationId: inventory.configurationId,
    axes: inventory.axes,
    pdfPages: inventory.pdfPages,
    units: inventory.units,
    interpolation: inventory.interpolation,
    alphaValidityDeg: inventory.alphaValidityDeg,
    cells: left.tables[tableIndex].cells.map((leftCell) => {
      const key = decisionKey(inventory.id, leftCell.coordinate);
      const decision = decisionByKey.get(key);
      const state = decision?.chosenState ?? leftCell.state;
      const printedValue = decision?.chosenPrintedValue ?? leftCell.printedValue;
      const pdfPage = pdfPageForCell(inventory, leftCell.coordinate);
      const page = pageDescriptor(pdfPage);
      return {
        coordinate: leftCell.coordinate,
        state,
        printedValue,
        value: state === "AVAILABLE" ? Number(printedValue) : null,
        lineage: {
          pdfPage,
          reportPage: pdfPage - 6,
          cropPath: `governance/sources/nasa-tp1538/${page.path}`,
          cropSha256: page.sha256,
          leftTranscriptionId: left.transcriptionId,
          rightTranscriptionId: right.transcriptionId,
          resolution: decision ? "SOURCE_ADJUDICATED" : "AGREED_DOUBLE_ENTRY",
        },
      };
    }),
  }));
  const corpus = {
    schemaVersion: "vector.tp1538-aero-corpus.v1",
    corpusId: "nasa-tp1538-generic-f16-aero-corpus.v1",
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    source: {
      manifestSha256: TP1538_SOURCE_MANIFEST_SHA256,
      ...structuredClone(sourceManifest.source),
    },
    cropRecipe: structuredClone(sourceManifest.recipe),
    sourcePages: structuredClone(sourceManifest.pages),
    transcriptions: { left: structuredClone(left), right: structuredClone(right) },
    comparison: {
      report: structuredClone(comparison),
      sha256: tp1538ComparisonContentSha256(comparison),
      mismatchCount: comparison.mismatches.length,
      decisions: structuredClone(decisions),
      decisionSha256: decisionsSha256(decisions),
    },
    axes: TP1538_AXES,
    signs: TP1538_SIGNS,
    referenceData: TP1538_REFERENCE_DATA,
    appendixB: TP1538_APPENDIX_B,
    limitations: TP1538_LIMITATIONS,
    tables,
    corpusSha256: null,
  };
  corpus.corpusSha256 = tp1538CorpusContentSha256(corpus);
  validateTp1538Corpus(corpus, { expectedCorpusSha256: corpus.corpusSha256 });
  return corpus;
}

export function validateTp1538Corpus(corpus, { expectedCorpusSha256 } = {}) {
  exactKeys(corpus, CORPUS_ROOT_KEYS, "TP-1538 corpus");
  if (corpus.schemaVersion !== "vector.tp1538-aero-corpus.v1" || corpus.corpusId !== "nasa-tp1538-generic-f16-aero-corpus.v1" || corpus.subject !== "NASA_GENERIC_F16" || corpus.deploymentClass !== "ENGINE_VERIFICATION_ONLY") throw new Error("TP-1538 corpus identity is invalid.");
  if (expectedCorpusSha256 !== undefined && corpus.corpusSha256 !== expectedCorpusSha256) throw new Error("TP-1538 corpus does not match the compiled corpus identity.");
  if (!/^[0-9a-f]{64}$/u.test(corpus.corpusSha256) || corpus.corpusSha256 !== tp1538CorpusContentSha256(corpus)) throw new Error("TP-1538 corpus content digest is invalid.");
  if (canonical(corpus.axes) !== canonical(TP1538_AXES) || canonical(corpus.signs) !== canonical(TP1538_SIGNS) || canonical(corpus.referenceData) !== canonical(TP1538_REFERENCE_DATA) || canonical(corpus.appendixB) !== canonical(TP1538_APPENDIX_B) || canonical(corpus.limitations) !== canonical(TP1538_LIMITATIONS)) throw new Error("TP-1538 axes, units, signs, Appendix B, reference data, or limitations are invalid.");
  exactKeys(corpus.source, ["bibliographic", "citationUrl", "manifestSha256", "metadataPath", "metadataSha256", "metadataUrl", "pdfPath", "pdfSha256", "pdfUrl", "retrievedOn", "rights"], "TP-1538 corpus source");
  if (canonical(corpus.source) !== canonical({ manifestSha256: TP1538_SOURCE_MANIFEST_SHA256, ...sourceManifest.source })) throw new Error("TP-1538 corpus source or rights identity is invalid.");
  if (canonical(corpus.cropRecipe) !== canonical(sourceManifest.recipe) || canonical(corpus.sourcePages) !== canonical(sourceManifest.pages)) throw new Error("TP-1538 corpus crop recipe or page manifest is invalid.");
  exactKeys(corpus.transcriptions, ["left", "right"], "TP-1538 corpus transcriptions");
  exactKeys(corpus.comparison, ["decisionSha256", "decisions", "mismatchCount", "report", "sha256"], "TP-1538 corpus comparison");
  const leftReport = validateTp1538Transcription(corpus.transcriptions.left);
  const rightReport = validateTp1538Transcription(corpus.transcriptions.right);
  if (corpus.transcriptions.left.transcriptionId === corpus.transcriptions.right.transcriptionId
    || corpus.transcriptions.left.entrantId === corpus.transcriptions.right.entrantId
    || corpus.transcriptions.left.isolationSessionId === corpus.transcriptions.right.isolationSessionId
    || ![corpus.transcriptions.left.contentSha256, corpus.transcriptions.right.contentSha256, corpus.comparison.sha256, corpus.comparison.decisionSha256].every((digest) => /^[0-9a-f]{64}$/u.test(digest))) throw new Error("TP-1538 transcript, comparison, or decision identity is invalid.");
  if (!Number.isSafeInteger(corpus.comparison.mismatchCount) || corpus.comparison.mismatchCount < 0) throw new Error("TP-1538 mismatch count is invalid.");
  const replayedComparison = compareValidatedTranscriptions(corpus.transcriptions.left, corpus.transcriptions.right, leftReport, rightReport);
  if (canonical(corpus.comparison.report) !== canonical(replayedComparison) || corpus.comparison.sha256 !== tp1538ComparisonContentSha256(replayedComparison) || corpus.comparison.mismatchCount !== replayedComparison.mismatches.length || !Array.isArray(corpus.comparison.decisions) || corpus.comparison.decisionSha256 !== decisionsSha256(corpus.comparison.decisions)) throw new Error("TP-1538 embedded comparison or decision identity is invalid.");
  const embeddedDecisionByKey = new Map();
  for (const decision of corpus.comparison.decisions) {
    const key = decisionKey(decision.tableId, decision.coordinate);
    if (embeddedDecisionByKey.has(key)) throw new Error("TP-1538 embedded adjudication decision is duplicated.");
    const mismatch = replayedComparison.mismatches.find((candidate) => decisionKey(candidate.tableId, candidate.coordinate) === key);
    const table = TP1538_TABLE_INVENTORY.find(({ id }) => id === decision.tableId);
    if (!mismatch || !table) throw new Error("TP-1538 embedded adjudication decision does not identify a mismatch.");
    validateDecision(decision, mismatch, pdfPageForCell(table, decision.coordinate));
    embeddedDecisionByKey.set(key, decision);
  }
  if (embeddedDecisionByKey.size !== replayedComparison.mismatches.length) throw new Error("TP-1538 embedded adjudication decisions are incomplete.");
  if (!Array.isArray(corpus.tables) || corpus.tables.length !== TP1538_TABLE_INVENTORY.length) throw new Error("TP-1538 corpus table inventory is partial or duplicated.");
  let totalCells = 0;
  let availableCells = 0;
  for (let tableIndex = 0; tableIndex < TP1538_TABLE_INVENTORY.length; tableIndex += 1) {
    const expected = TP1538_TABLE_INVENTORY[tableIndex];
    const table = corpus.tables[tableIndex];
    exactKeys(table, CORPUS_TABLE_KEYS, `TP-1538 corpus table ${tableIndex}`);
    for (const key of ["id", "coefficient", "configurationId", "axes", "pdfPages", "units", "interpolation", "alphaValidityDeg"]) if (canonical(table[key]) !== canonical(expected[key])) throw new Error(`${expected.id} contract identity is invalid.`);
    if (!Array.isArray(table.cells) || table.cells.length !== expected.cellCount) throw new Error(`${expected.id} cell inventory is partial or duplicated.`);
    const expectedCoordinates = enumerateCoordinates(expected);
    for (let cellIndex = 0; cellIndex < table.cells.length; cellIndex += 1) {
      const cell = table.cells[cellIndex];
      exactKeys(cell, CORPUS_CELL_KEYS, `${expected.id} corpus cell ${cellIndex}`);
      exactKeys(cell.coordinate, Object.keys(expectedCoordinates[cellIndex]), `${expected.id} corpus coordinate ${cellIndex}`);
      if (coordinateKey(cell.coordinate) !== coordinateKey(expectedCoordinates[cellIndex])) throw new Error(`${expected.id} corpus coordinate is missing, duplicated, or reordered.`);
      if (!STATES.has(cell.state) || cell.state === "UNENTERED") throw new Error(`${expected.id} corpus cell state is invalid or incomplete.`);
      const outsidePublishedAlpha = cell.coordinate.alphaDeg !== undefined && cell.coordinate.alphaDeg > expected.alphaValidityDeg[1];
      if (outsidePublishedAlpha !== (cell.state === "OUT_OF_DOMAIN")) throw new Error(`${expected.id} corpus cell state violates its published alpha domain.`);
      if (cell.state === "AVAILABLE") {
        if (typeof cell.printedValue !== "string" || !DECIMAL.test(cell.printedValue) || typeof cell.value !== "number" || !Number.isFinite(cell.value) || !Object.is(cell.value, Number(cell.printedValue))) throw new Error(`${expected.id} available corpus value is invalid.`);
        availableCells += 1;
      } else if (cell.printedValue !== null || cell.value !== null) throw new Error(`${expected.id} unavailable corpus cell contains a value.`);
      const transcriptCell = corpus.transcriptions.left.tables[tableIndex].cells[cellIndex];
      const decision = embeddedDecisionByKey.get(decisionKey(expected.id, cell.coordinate));
      const resolvedState = decision?.chosenState ?? transcriptCell.state;
      const resolvedPrintedValue = decision?.chosenPrintedValue ?? transcriptCell.printedValue;
      if (cell.state !== resolvedState || cell.printedValue !== resolvedPrintedValue) throw new Error(`${expected.id} corpus cell does not match its transcript or adjudication lineage.`);
      exactKeys(cell.lineage, LINEAGE_KEYS, `${expected.id} cell lineage`);
      const pdfPage = pdfPageForCell(expected, cell.coordinate);
      const page = pageDescriptor(pdfPage);
      if (cell.lineage.pdfPage !== pdfPage || cell.lineage.reportPage !== pdfPage - 6 || cell.lineage.cropPath !== `governance/sources/nasa-tp1538/${page.path}` || cell.lineage.cropSha256 !== page.sha256 || cell.lineage.leftTranscriptionId !== corpus.transcriptions.left.transcriptionId || cell.lineage.rightTranscriptionId !== corpus.transcriptions.right.transcriptionId || cell.lineage.resolution !== (decision ? "SOURCE_ADJUDICATED" : "AGREED_DOUBLE_ENTRY")) throw new Error(`${expected.id} cell lineage is invalid.`);
      totalCells += 1;
    }
  }
  return { corpus, totalCells, availableCells };
}

export function verifyTp1538AeroProductionIsolation(repositoryRoot = process.cwd()) {
  const forbidden = ["NASA_GENERIC_F16", "nasa-tp1538-generic-f16-aero-corpus", "tp1538-aero-verification", "tp1538-aero-corpus"];
  const roots = ["app", "components", "lib/engine", "lib/record", "server", "worker", "engine-rust/src", "public", "dist"].map((path) => resolve(repositoryRoot, path));
  let scannedFiles = 0;
  for (const root of roots) {
    try {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        scannedFiles += 1;
        const bytes = readFileSync(path);
        const marker = forbidden.find((needle) => bytes.includes(Buffer.from(needle)));
        if (marker) throw new Error(`Production source or bundle ${relative(repositoryRoot, path)} contains TP-1538 verification authority marker ${marker}.`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return scannedFiles;
}
