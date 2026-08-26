import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Worker } from "node:worker_threads";

import {
  verifyTp1538AeroProductionIsolation,
} from "../scripts/lib/tp1538-aero-corpus.mjs";
import {
  assembleTp1538Coefficients,
  createTp1538Evaluator,
  createTp1538VerificationRecord,
  encodeTp1538VerificationRecord,
  readTp1538VerificationRecord,
} from "../lib/validation/tp1538-aero-verification.ts";
import {
  runRustWasmTp1538AeroBatch,
  TP1538_AERO_VERIFIER_ARTIFACT,
} from "../lib/validation/tp1538-aero-verification-wasm.ts";
import {
  admitTp1538AeroPerformanceWorkload,
  tp1538AeroPerformanceResultSha256,
} from "../scripts/lib/tp1538-aero-performance-evidence.mjs";

const CORPUS_CONTENT_SHA256 = "24833d23b6ba542cdda4152e9f0eeac4a5936e827c9c4367d25eb70e11a724d2";
const CORPUS_RAW_SHA256 = "bb2eb9d6ad8d35bc9b2f189fd222e31efb0b574146fc8fcf6e4ffe1ac0c71c0b";
const WORKLOAD_RAW_SHA256 = "7161fefc557b3b724d75bb967bc9ceb71888a052b1476ac7e8720e08c73846e1";
const corpusBytes = readFileSync(new URL("../governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json", import.meta.url));
const corpus = JSON.parse(corpusBytes);
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tp1538-aero/workload.v1.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
const evaluator = createTp1538Evaluator(corpus, CORPUS_CONTENT_SHA256);

function rawSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lookup(tableId, coordinates) {
  return evaluator.lookup({ schemaVersion: "vector.tp1538-aero-lookup.v1", tableId, angleUnit: "DEG", coordinates });
}

function findCell(tableId, coordinates) {
  return corpus.tables.find(({ id }) => id === tableId).cells.find((cell) => JSON.stringify(cell.coordinate) === JSON.stringify(coordinates));
}

test("the complete TP-1538 corpus retains its immutable evidence chain", () => {
  assert.equal(corpusBytes.byteLength, 10_613_359);
  assert.equal(rawSha256(corpusBytes), CORPUS_RAW_SHA256);
  assert.equal(corpus.corpusSha256, CORPUS_CONTENT_SHA256);
  assert.equal(corpus.source.manifestSha256, "d4736dae888054e502c34912374b8c032dd52f84414bc7e9137b9953acbe4e6b");
  assert.equal(corpus.transcriptions.left.contentSha256, "b081618e2667fb2a4032c5795fde7a59ecd5a3d762a8cf8dffc90ce8afd049a3");
  assert.equal(corpus.transcriptions.right.contentSha256, "c4818c918c3ab71e23108e7368664f5c0f8db39e0eb148994e8b93e5052e6de8");
  assert.equal(corpus.comparison.sha256, "49ee3b022da4d6b0bd570a02fda181b24ac22a28e03d4a5221986ada89299ccf");
  assert.equal(corpus.comparison.rawSha256, "2f0e3083e554a80646c3e2c1ba1230aa777637ab1933bc4ea5f77273bf44ae60");
  assert.equal(corpus.comparison.adjudication.contentSha256, "6cdd364686b1eb28c082878157e504e628718fc34ee821510501dea4e2a145a7");
  assert.equal(corpus.comparison.mismatchCount, 1_311);
  assert.equal(corpus.tables.length, 48);
  const cells = corpus.tables.flatMap(({ cells: tableCells }) => tableCells);
  assert.equal(cells.length, 14_705);
  assert.deepEqual(Object.fromEntries(["AVAILABLE", "PRINTED_BLANK", "ILLEGIBLE", "OUT_OF_DOMAIN"].map((state) => [state, cells.filter((cell) => cell.state === state).length])), {
    AVAILABLE: 13_587,
    PRINTED_BLANK: 37,
    ILLEGIBLE: 1,
    OUT_OF_DOMAIN: 1_080,
  });
  assert.ok(cells.every(({ lineage }) => lineage.cropPath.startsWith("governance/sources/nasa-tp1538/crops/")));
});

test("page-grounded knots, unavailable marks, and independent interpolation oracles agree", () => {
  const pageOracles = [
    ["CY_BASE", { alphaDeg: -20, betaDeg: -30 }, ".36770", 74],
    ["CY_BASE", { alphaDeg: -20, betaDeg: -25 }, ".30700", 74],
    ["CY_BASE", { alphaDeg: -15, betaDeg: -30 }, ".40190", 74],
    ["CY_BASE", { alphaDeg: -15, betaDeg: -25 }, ".32200", 74],
    ["CX_BASE", { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -25 }, "-.18370", 51],
    ["CX_BASE", { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -10 }, "-.13620", 52],
    ["CX_BASE", { alphaDeg: -20, betaDeg: -25, stabilatorDeg: -25 }, "-.19530", 51],
    ["CX_BASE", { alphaDeg: -20, betaDeg: -25, stabilatorDeg: -10 }, "-.13510", 52],
    ["CX_BASE", { alphaDeg: -15, betaDeg: -30, stabilatorDeg: -25 }, "-.17140", 51],
    ["CX_BASE", { alphaDeg: -15, betaDeg: -30, stabilatorDeg: -10 }, "-.12160", 52],
    ["CX_BASE", { alphaDeg: -15, betaDeg: -25, stabilatorDeg: -25 }, "-.17650", 51],
    ["CX_BASE", { alphaDeg: -15, betaDeg: -25, stabilatorDeg: -10 }, "-.12450", 52],
  ];
  for (const [tableId, coordinates, printedValue, pdfPage] of pageOracles) {
    const cell = findCell(tableId, coordinates);
    assert.equal(cell.printedValue, printedValue);
    assert.equal(cell.lineage.pdfPage, pdfPage);
    assert.equal(lookup(tableId, coordinates).value, Number(printedValue));
  }
  assert.ok(Math.abs(lookup("CY_BASE", { alphaDeg: -17.5, betaDeg: -27.5 }).value - 0.34965) <= 1e-15);
  assert.ok(Math.abs(lookup("CX_BASE", { alphaDeg: -17.5, betaDeg: -27.5, stabilatorDeg: -17.5 }).value - (-0.1555375)) <= 1e-15);
  const betaDerivative = (lookup("CY_BASE", { alphaDeg: -20, betaDeg: -25 }).value - lookup("CY_BASE", { alphaDeg: -20, betaDeg: -30 }).value) / 5;
  assert.ok(Math.abs(betaDerivative - (-0.01214)) <= 1e-15);
  assert.deepEqual({ state: findCell("CY_P", { alphaDeg: 45 }).state, printedValue: findCell("CY_P", { alphaDeg: 45 }).printedValue, pdfPage: findCell("CY_P", { alphaDeg: 45 }).lineage.pdfPage }, { state: "ILLEGIBLE", printedValue: null, pdfPage: 79 });
  assert.equal(lookup("CL_BASE", { alphaDeg: 90, betaDeg: -8, stabilatorDeg: -25 }).state, "PRINTED_BLANK");
  assert.equal(lookup("CY_BASE", { alphaDeg: -20.01, betaDeg: -30 }).state, "OUT_OF_DOMAIN");
});

test("a page-grounded neutral configuration assembles in Appendix B order", () => {
  const input = {
    schemaVersion: "vector.tp1538-aero-assembly-input.v1",
    angleUnit: "DEG",
    alphaDeg: 0,
    betaDeg: 0,
    stabilatorDeg: 0,
    leadingEdgeFlapDeg: 25,
    speedBrakeDeg: 0,
    aileronDeg: 0,
    rudderDeg: 0,
    rollRateRadS: 0,
    pitchRateRadS: 0,
    yawRateRadS: 0,
    trueAirspeedMps: 150,
    cgChordFraction: 0.35,
  };
  assert.deepEqual([
    ["CX_BASE", findCell("CX_BASE", { alphaDeg: 0, betaDeg: 0, stabilatorDeg: 0 }).printedValue, 53],
    ["CZ_BASE", findCell("CZ_BASE", { alphaDeg: 0, betaDeg: 0, stabilatorDeg: 0 }).printedValue, 60],
    ["CM_BASE", findCell("CM_BASE", { alphaDeg: 0, betaDeg: 0, stabilatorDeg: 0 }).printedValue, 67],
    ["CM_STABILATOR_EFFECTIVENESS", findCell("CM_STABILATOR_EFFECTIVENESS", { stabilatorDeg: 0 }).printedValue, 71],
    ["CM_ALPHA_INCREMENT", findCell("CM_ALPHA_INCREMENT", { alphaDeg: 0 }).printedValue, 71],
    ["CM_DEEP_STALL_INCREMENT", findCell("CM_DEEP_STALL_INCREMENT", { alphaDeg: 0, stabilatorDeg: 0 }).printedValue, 73],
  ], [
    ["CX_BASE", "-.04890", 53],
    ["CZ_BASE", "-.02500", 60],
    ["CM_BASE", "-.05980", 67],
    ["CM_STABILATOR_EFFECTIVENESS", "1.00", 71],
    ["CM_ALPHA_INCREMENT", ".019", 71],
    ["CM_DEEP_STALL_INCREMENT", "0.00000", 73],
  ]);
  const result = assembleTp1538Coefficients(corpus, input, CORPUS_CONTENT_SHA256);
  assert.deepEqual(result.coefficients, { cx: -0.0489, cz: -0.025, cm: -0.0408, cy: 0, cn: 0, cl: 0 });
  assert.deepEqual(result.contributionOrder.cm, ["BASE_TIMES_STABILATOR_EFFECTIVENESS", "CZ_CG_TRANSFER", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING", "ALPHA_INCREMENT", "DEEP_STALL_INCREMENT"]);
  const stabilatorContrast = assembleTp1538Coefficients(corpus, { ...input, stabilatorDeg: 10 }, CORPUS_CONTENT_SHA256);
  assert.deepEqual(stabilatorContrast.coefficients, { cx: -0.0606, cz: -0.114, cm: -0.14200000000000002, cy: 0, cn: 0, cl: 0 });
  assert.notDeepEqual(stabilatorContrast.coefficients, result.coefficients);
});

test("the governed 4,096-operation workload has complete TypeScript/Rust-WASM parity", () => {
  assert.equal(rawSha256(workloadBytes), WORKLOAD_RAW_SHA256);
  const admitted = admitTp1538AeroPerformanceWorkload(workload, workloadBytes, WORKLOAD_RAW_SHA256, (lookups, assemblies, expectedResultSha256) => {
    assert.equal(workload.corpusSha256, CORPUS_CONTENT_SHA256);
    const typescript = {
      lookupResults: lookups.map((request) => evaluator.lookup(request)),
      assemblyResults: assemblies.map((request) => evaluator.assemble(request)),
    };
    assert.equal(tp1538AeroPerformanceResultSha256(typescript), expectedResultSha256);
  });
  assert.equal(admitted.workload.operationCount, 4_096);
  const rust = runRustWasmTp1538AeroBatch(corpus, CORPUS_CONTENT_SHA256, workload.lookupRequests, workload.assemblyRequests);
  assert.equal(tp1538AeroPerformanceResultSha256({ lookupResults: rust.lookupResults, assemblyResults: rust.assemblyResults }), workload.expectedResultSha256);
  assert.ok(TP1538_AERO_VERIFIER_ARTIFACT.bytes < 500_000);
});

test("real-corpus verification records survive bounded immutable readback", () => {
  const inputs = workload.lookupRequests.slice(0, 16);
  const record = createTp1538VerificationRecord(corpus, inputs, CORPUS_CONTENT_SHA256, "rust-wasm");
  const bytes = encodeTp1538VerificationRecord(record);
  const readback = readTp1538VerificationRecord(corpus, bytes, CORPUS_CONTENT_SHA256);
  assert.equal(readback.lookupCount, 16);
  assert.equal(readback.record.contentSha256, record.contentSha256);
  assert.equal(readback.record.modelPack.id, "nasa-tp1538-generic-f16-aero-verification");
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

test("the real corpus recovers in a replacement verification Worker", async () => {
  const workerUrl = new URL("../scripts/workers/tp1538-aero-verification.worker.ts", import.meta.url);
  const first = new Worker(workerUrl);
  const initialized = await workerRequest(first, { schemaVersion: "vector.tp1538-aero-worker-init.v1", requestId: "real-init", corpus, expectedCorpusSha256: CORPUS_CONTENT_SHA256 });
  assert.equal(initialized.corpusSha256, CORPUS_CONTENT_SHA256);
  await first.terminate();
  const replacement = new Worker(workerUrl);
  try {
    await workerRequest(replacement, { schemaVersion: "vector.tp1538-aero-worker-init.v1", requestId: "replacement-init", corpus, expectedCorpusSha256: CORPUS_CONTENT_SHA256 });
    const result = await workerRequest(replacement, { schemaVersion: "vector.tp1538-aero-worker-evaluate.v1", requestId: "replacement-run", lookupRequests: workload.lookupRequests, assemblyRequests: workload.assemblyRequests });
    assert.equal(tp1538AeroPerformanceResultSha256({ lookupResults: result.lookupResults, assemblyResults: result.assemblyResults }), workload.expectedResultSha256);
  } finally {
    await replacement.terminate();
  }
});

test("the admitted verification corpus remains isolated from production bundles", () => {
  assert.ok(verifyTp1538AeroProductionIsolation() > 0);
});
