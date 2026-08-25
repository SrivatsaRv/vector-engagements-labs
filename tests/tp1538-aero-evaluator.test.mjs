import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import {
  completeTp1538Transcription,
  compareTp1538Transcriptions,
  createTp1538AdjudicatedCorpus,
  createTp1538TranscriptionTemplate,
  TP1538_TABLE_INVENTORY,
} from "../scripts/lib/tp1538-aero-corpus.mjs";
import {
  assembleTp1538Coefficients,
  createTp1538Evaluator,
  createTp1538EvaluatorBatch,
  createTp1538VerificationRecord,
  encodeTp1538VerificationRecord,
  lookupTp1538Table,
  readTp1538VerificationRecord,
  tp1538VerificationRecordContentSha256,
  validateTp1538EvaluatorBatchResult,
  validateTp1538VerificationRecord,
} from "../lib/validation/tp1538-aero-verification.ts";
import {
  runRustWasmTp1538AeroBatch,
  TP1538_AERO_VERIFIER_ARTIFACT,
} from "../lib/validation/tp1538-aero-verification-wasm.ts";

function markUnavailableCells(draft) {
  for (const table of draft.tables) {
    const inventory = TP1538_TABLE_INVENTORY.find(({ id }) => id === table.tableId);
    for (const cell of table.cells) cell.state = cell.coordinate.alphaDeg > inventory.alphaValidityDeg[1] ? "OUT_OF_DOMAIN" : "PRINTED_BLANK";
  }
}

function fixtureCorpus() {
  const identities = [
    { transcriptionId: "TP1538_A_EVALUATOR", entrantId: "A", isolationSessionId: "a" },
    { transcriptionId: "TP1538_B_EVALUATOR", entrantId: "B", isolationSessionId: "b" },
  ];
  const transcripts = identities.map((identity) => {
    const draft = createTp1538TranscriptionTemplate(identity);
    markUnavailableCells(draft);
    const cy = draft.tables.find(({ tableId }) => tableId === "CY_BASE");
    const values = new Map([
      ['{"alphaDeg":-20,"betaDeg":-30}', "0.00000"],
      ['{"alphaDeg":-20,"betaDeg":-25}', "0.10000"],
      ['{"alphaDeg":-15,"betaDeg":-30}', "0.20000"],
      ['{"alphaDeg":-15,"betaDeg":-25}', "0.30000"],
    ]);
    for (const cell of cy.cells) {
      const value = values.get(JSON.stringify(cell.coordinate));
      if (value !== undefined) {
        cell.state = "AVAILABLE";
        cell.printedValue = value;
      }
    }
    return completeTp1538Transcription(draft);
  });
  const comparison = compareTp1538Transcriptions(transcripts[0], transcripts[1]);
  return createTp1538AdjudicatedCorpus({ left: transcripts[0], right: transcripts[1], comparison, decisions: [] });
}

function fixtureAssemblyCorpus() {
  const identities = [
    { transcriptionId: "TP1538_A_ASSEMBLY", entrantId: "A", isolationSessionId: "a" },
    { transcriptionId: "TP1538_B_ASSEMBLY", entrantId: "B", isolationSessionId: "b" },
  ];
  const valueByTable = new Map([
    ["CX_BASE", "1.00000"], ["CX_LEF", "3.00000"], ["CX_SPEEDBRAKE_INCREMENT", "0.20000"], ["CX_Q", "0.40000"], ["CX_Q_LEF_INCREMENT", "0.60000"],
    ["CM_STABILATOR_EFFECTIVENESS", "1.00000"],
  ]);
  const transcripts = identities.map((identity) => {
    const draft = createTp1538TranscriptionTemplate(identity);
    markUnavailableCells(draft);
    for (const table of draft.tables) {
      const target = table.cells.find(({ coordinate }) => Object.values(coordinate).every((value) => value === 0));
      if (!target) continue;
      target.state = "AVAILABLE";
      target.printedValue = valueByTable.get(table.tableId) ?? "0.00000";
    }
    return completeTp1538Transcription(draft);
  });
  const comparison = compareTp1538Transcriptions(transcripts[0], transcripts[1]);
  return createTp1538AdjudicatedCorpus({ left: transcripts[0], right: transcripts[1], comparison, decisions: [] });
}

test("exact-knot and independent bilinear interior lookup are closed and deterministic", () => {
  const corpus = fixtureCorpus();
  const exact = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -20, betaDeg: -25 },
  }, corpus.corpusSha256);
  assert.deepEqual(exact, {
    schemaVersion: "vector.tp1538-aero-lookup-result.v1",
    corpusSha256: corpus.corpusSha256,
    tableId: "CY_BASE",
    state: "AVAILABLE",
    diagnostic: "EXACT_KNOT",
    value: 0.1,
    missingCorners: [],
  });

  const interior = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -17.5, betaDeg: -27.5 },
  }, corpus.corpusSha256);
  assert.equal(interior.state, "AVAILABLE");
  assert.equal(interior.diagnostic, "INTERPOLATED");
  assert.ok(Math.abs(interior.value - 0.15) <= 1e-15);
});

test("lookup never extrapolates or interpolates through a printed blank", () => {
  const corpus = fixtureCorpus();
  const outside = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -20.01, betaDeg: -30 },
  }, corpus.corpusSha256);
  assert.equal(outside.state, "OUT_OF_DOMAIN");
  assert.equal(outside.value, null);

  const missing = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -12.5, betaDeg: -27.5 },
  }, corpus.corpusSha256);
  assert.equal(missing.state, "PRINTED_BLANK");
  assert.equal(missing.diagnostic, "UNAVAILABLE_INTERPOLATION_CORNER");
  assert.ok(missing.missingCorners.length > 0);

  assert.throws(() => lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "RAD",
    coordinates: { alphaDeg: -20, betaDeg: -30 },
  }, corpus.corpusSha256), /angle unit/);
});

test("the evaluator never invents an unpublished beta-symmetry transform", () => {
  const corpus = fixtureCorpus();
  const negative = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -20, betaDeg: -25 },
  }, corpus.corpusSha256);
  const positive = lookupTp1538Table(corpus, {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -20, betaDeg: 25 },
  }, corpus.corpusSha256);
  assert.equal(negative.value, 0.1);
  assert.equal(positive.state, "PRINTED_BLANK");
  assert.equal(positive.value, null);
});

test("the generated Rust/WASM resolver executes one admitted corpus projection with full-state parity", () => {
  const corpus = fixtureCorpus();
  const requests = [
    {
      schemaVersion: "vector.tp1538-aero-lookup.v1",
      tableId: "CY_BASE",
      angleUnit: "DEG",
      coordinates: { alphaDeg: -20, betaDeg: -25 },
    },
    {
      schemaVersion: "vector.tp1538-aero-lookup.v1",
      tableId: "CY_BASE",
      angleUnit: "DEG",
      coordinates: { alphaDeg: -17.5, betaDeg: -27.5 },
    },
    {
      schemaVersion: "vector.tp1538-aero-lookup.v1",
      tableId: "CY_BASE",
      angleUnit: "DEG",
      coordinates: { alphaDeg: -12.5, betaDeg: -27.5 },
    },
    {
      schemaVersion: "vector.tp1538-aero-lookup.v1",
      tableId: "CY_BASE",
      angleUnit: "DEG",
      coordinates: { alphaDeg: -20.01, betaDeg: -30 },
    },
  ];
  const batch = createTp1538EvaluatorBatch(corpus, corpus.corpusSha256, requests, []);
  assert.equal(batch.resolverTables.length, 48);
  assert.equal(batch.resolverTables.reduce((sum, table) => sum + table.cells.length, 0), 14_705);
  assert.deepEqual(batch.resolverTables[0].cells[0], { state: "PRINTED_BLANK", value: null });
  assert.ok(TP1538_AERO_VERIFIER_ARTIFACT.bytes < 500_000);
  assert.match(TP1538_AERO_VERIFIER_ARTIFACT.sha256, /^[0-9a-f]{64}$/);
  const result = runRustWasmTp1538AeroBatch(corpus, corpus.corpusSha256, requests, []);
  assert.deepEqual(result.lookupResults, requests.map((request) => lookupTp1538Table(corpus, request, corpus.corpusSha256)));
  assert.deepEqual(result.lookupResults.map(({ diagnostic }) => diagnostic), [
    "EXACT_KNOT",
    "INTERPOLATED",
    "UNAVAILABLE_INTERPOLATION_CORNER",
    "OUT_OF_DOMAIN",
  ]);
  const forged = structuredClone(result);
  forged.lookupResults[1].value = 0.16;
  assert.throws(() => validateTp1538EvaluatorBatchResult(corpus, batch, forged, corpus.corpusSha256), /complete TypeScript replay parity/);
});

test("admitted evaluator snapshots are recursively frozen against caller mutation", () => {
  const corpus = fixtureCorpus();
  const evaluator = createTp1538Evaluator(corpus, corpus.corpusSha256);
  corpus.tables.find(({ id }) => id === "CY_BASE").cells[0].value = 99;
  const result = evaluator.lookup({
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -20, betaDeg: -30 },
  });
  assert.equal(result.value, 0);
  assert.throws(() => { evaluator.corpusSha256 = "0".repeat(64); }, /read only|Cannot assign/);
});

test("Appendix B assembly applies increments in the published order", () => {
  const corpus = fixtureAssemblyCorpus();
  const result = assembleTp1538Coefficients(corpus, {
    schemaVersion: "vector.tp1538-aero-assembly-input.v1",
    angleUnit: "DEG",
    alphaDeg: 0,
    betaDeg: 0,
    stabilatorDeg: 0,
    leadingEdgeFlapDeg: 0,
    speedBrakeDeg: 30,
    aileronDeg: 0,
    rudderDeg: 0,
    rollRateRadS: 0,
    pitchRateRadS: 0.1,
    yawRateRadS: 0,
    trueAirspeedMps: 100,
    cgChordFraction: 0.35,
  }, corpus.corpusSha256);
  assert.equal(result.state, "AVAILABLE");
  assert.ok(Math.abs(result.coefficients.cx - 3.101725) <= 1e-12);
  assert.deepEqual(result.contributionOrder.cx, ["BASE", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING"]);
  assert.deepEqual(result.coefficients, { cx: result.coefficients.cx, cz: 0, cm: 0, cy: 0, cn: 0, cl: 0 });
});

test("the generated Rust/WASM evaluator independently matches Appendix B assembly state", () => {
  const corpus = fixtureAssemblyCorpus();
  const input = {
    schemaVersion: "vector.tp1538-aero-assembly-input.v1",
    angleUnit: "DEG",
    alphaDeg: 0,
    betaDeg: 0,
    stabilatorDeg: 0,
    leadingEdgeFlapDeg: 0,
    speedBrakeDeg: 30,
    aileronDeg: 0,
    rudderDeg: 0,
    rollRateRadS: 0,
    pitchRateRadS: 0.1,
    yawRateRadS: 0,
    trueAirspeedMps: 100,
    cgChordFraction: 0.35,
  };
  const result = runRustWasmTp1538AeroBatch(corpus, corpus.corpusSha256, [], [input]);
  assert.deepEqual(result.assemblyResults, [assembleTp1538Coefficients(corpus, input, corpus.corpusSha256)]);
});

test("zero-weight Appendix B terms do not invent a dependency on unavailable high-alpha cells", () => {
  const identities = [
    { transcriptionId: "TP1538_A_HIGH_ALPHA", entrantId: "A", isolationSessionId: "a" },
    { transcriptionId: "TP1538_B_HIGH_ALPHA", entrantId: "B", isolationSessionId: "b" },
  ];
  const requiredTables = new Set(["CX_BASE", "CZ_BASE", "CM_BASE", "CM_STABILATOR_EFFECTIVENESS", "CM_ALPHA_INCREMENT", "CM_DEEP_STALL_INCREMENT", "CY_BASE", "CN_BASE", "CL_BASE"]);
  const transcripts = identities.map((identity) => {
    const draft = createTp1538TranscriptionTemplate(identity);
    markUnavailableCells(draft);
    for (const table of draft.tables) {
      if (!requiredTables.has(table.tableId)) continue;
      const target = table.cells.find(({ coordinate }) => Object.entries(coordinate).every(([key, value]) => key === "alphaDeg" ? value === 90 : value === 0));
      if (!target) continue;
      target.state = "AVAILABLE";
      target.printedValue = table.tableId === "CM_STABILATOR_EFFECTIVENESS" ? "1.00000" : "0.00000";
    }
    return completeTp1538Transcription(draft);
  });
  const comparison = compareTp1538Transcriptions(transcripts[0], transcripts[1]);
  const corpus = createTp1538AdjudicatedCorpus({ left: transcripts[0], right: transcripts[1], comparison, decisions: [] });
  const result = assembleTp1538Coefficients(corpus, {
    schemaVersion: "vector.tp1538-aero-assembly-input.v1",
    angleUnit: "DEG",
    alphaDeg: 90,
    betaDeg: 0,
    stabilatorDeg: 0,
    leadingEdgeFlapDeg: 25,
    speedBrakeDeg: 0,
    aileronDeg: 0,
    rudderDeg: 0,
    rollRateRadS: 0,
    pitchRateRadS: 0,
    yawRateRadS: 0,
    trueAirspeedMps: 100,
    cgChordFraction: 0.35,
  }, corpus.corpusSha256);
  assert.deepEqual(result.coefficients, { cx: 0, cz: 0, cm: 0, cy: 0, cn: 0, cl: 0 });
});

test("recorded verification evidence binds corpus/model-pack identity and rejects forged-valid output", () => {
  const corpus = fixtureCorpus();
  const input = {
    schemaVersion: "vector.tp1538-aero-lookup.v1",
    tableId: "CY_BASE",
    angleUnit: "DEG",
    coordinates: { alphaDeg: -17.5, betaDeg: -27.5 },
  };
  const record = createTp1538VerificationRecord(corpus, [input], corpus.corpusSha256, "typescript");
  assert.equal(validateTp1538VerificationRecord(corpus, record, corpus.corpusSha256).lookupCount, 1);
  assert.equal(record.corpusSha256, corpus.corpusSha256);
  assert.match(record.modelPack.digest, /^[0-9a-f]{64}$/);
  const persisted = encodeTp1538VerificationRecord(record);
  const readback = readTp1538VerificationRecord(corpus, persisted, corpus.corpusSha256);
  assert.equal(readback.record.contentSha256, record.contentSha256);
  assert.equal(readback.byteLength, persisted.byteLength);

  const forged = structuredClone(record);
  forged.lookups[0].result.value = 0.9;
  forged.contentSha256 = tp1538VerificationRecordContentSha256(forged);
  assert.throws(() => validateTp1538VerificationRecord(corpus, forged, corpus.corpusSha256), /replay|result/);
  assert.throws(() => readTp1538VerificationRecord(corpus, new Uint8Array(8 * 1024 * 1024 + 1), corpus.corpusSha256), /byte length/);
});

function workerRequest(worker, message) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { worker.off("message", onMessage); reject(error); };
    const onMessage = (response) => {
      if (response.requestId !== message.requestId) return;
      worker.off("error", onError);
      worker.off("message", onMessage);
      resolve(response);
    };
    worker.on("error", onError);
    worker.on("message", onMessage);
    worker.postMessage(message);
  });
}

test("the isolated verification Worker recovers after rejection and process replacement", async () => {
  const corpus = fixtureCorpus();
  const workerUrl = new URL("../scripts/workers/tp1538-aero-verification.worker.ts", import.meta.url);
  const first = new Worker(workerUrl);
  const rejected = await workerRequest(first, {
    schemaVersion: "vector.tp1538-aero-worker-init.v1",
    requestId: "bad-init",
    corpus,
    expectedCorpusSha256: "0".repeat(64),
  });
  assert.equal(rejected.code, "TP1538_WORKER_REJECTED");
  const ready = await workerRequest(first, {
    schemaVersion: "vector.tp1538-aero-worker-init.v1",
    requestId: "good-init",
    corpus,
    expectedCorpusSha256: corpus.corpusSha256,
  });
  assert.equal(ready.corpusSha256, corpus.corpusSha256);
  await first.terminate();

  const replacement = new Worker(workerUrl);
  try {
    await workerRequest(replacement, {
      schemaVersion: "vector.tp1538-aero-worker-init.v1",
      requestId: "replacement-init",
      corpus,
      expectedCorpusSha256: corpus.corpusSha256,
    });
    const response = await workerRequest(replacement, {
      schemaVersion: "vector.tp1538-aero-worker-evaluate.v1",
      requestId: "replacement-evaluate",
      lookupRequests: [{
        schemaVersion: "vector.tp1538-aero-lookup.v1",
        tableId: "CY_BASE",
        angleUnit: "DEG",
        coordinates: { alphaDeg: -17.5, betaDeg: -27.5 },
      }],
      assemblyRequests: [],
    });
    assert.equal(response.schemaVersion, "vector.tp1538-aero-worker-result.v1");
    assert.ok(Math.abs(response.lookupResults[0].value - 0.15) <= 1e-15);
  } finally {
    await replacement.terminate();
  }
});
