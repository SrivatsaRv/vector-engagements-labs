import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import {
  createTp1538Evaluator,
} from "../lib/validation/tp1538-aero-verification.ts";
import {
  prepareRustWasmTp1538AeroBatch,
  TP1538_AERO_VERIFIER_ARTIFACT,
} from "../lib/validation/tp1538-aero-verification-wasm.ts";
import {
  admitTp1538AeroPerformanceRepository,
  admitTp1538AeroPerformanceWorkload,
  evaluateTp1538AeroPerformanceResults,
  measureTp1538AeroPerformanceBackends,
  resolveTp1538AeroPerformanceProfile,
  tp1538AeroPerformanceResultSha256,
} from "./lib/tp1538-aero-performance-evidence.mjs";

const CORPUS_CONTENT_SHA256 = "24833d23b6ba542cdda4152e9f0eeac4a5936e827c9c4367d25eb70e11a724d2";
const CORPUS_RAW_SHA256 = "bb2eb9d6ad8d35bc9b2f189fd222e31efb0b574146fc8fcf6e4ffe1ac0c71c0b";
const WORKLOAD_RAW_SHA256 = "7161fefc557b3b724d75bb967bc9ceb71888a052b1476ac7e8720e08c73846e1";
const corpusBytes = readFileSync(new URL("../governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json", import.meta.url));
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tp1538-aero/workload.v1.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputPath) throw new Error("--output requires a path.");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function percentile(samples, fraction) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function normalized(result) {
  return { lookupResults: result.lookupResults, assemblyResults: result.assemblyResults };
}

function workerRequest(worker, message) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { worker.off("message", onMessage); reject(error); };
    const onMessage = (response) => {
      if (response.requestId !== message.requestId) return;
      worker.off("error", onError);
      worker.off("message", onMessage);
      if (response.schemaVersion === "vector.tp1538-aero-worker-error.v1") reject(new Error(response.message));
      else resolve(response);
    };
    worker.on("error", onError);
    worker.on("message", onMessage);
    worker.postMessage(message);
  });
}

const environment = {
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: os.cpus()[0].model,
  logicalCores: os.cpus().length,
  memoryBytes: os.totalmem(),
};
const profile = resolveTp1538AeroPerformanceProfile("APPLE_M5_NODE24", environment);
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const porcelainStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
const repository = admitTp1538AeroPerformanceRepository(commitSha, porcelainStatus);
assert.equal(sha256(corpusBytes), CORPUS_RAW_SHA256);
const corpus = JSON.parse(corpusBytes);
assert.equal(corpus.corpusSha256, CORPUS_CONTENT_SHA256);

const evaluator = createTp1538Evaluator(corpus, CORPUS_CONTENT_SHA256);
const admittedWorkload = admitTp1538AeroPerformanceWorkload(workload, workloadBytes, WORKLOAD_RAW_SHA256, (lookups, assemblies, expectedResultSha256) => {
  const result = { lookupResults: lookups.map((request) => evaluator.lookup(request)), assemblyResults: assemblies.map((request) => evaluator.assemble(request)) };
  assert.equal(tp1538AeroPerformanceResultSha256(result), expectedResultSha256);
});

const admissionSamplesMs = Array.from({ length: 5 }, () => {
  const started = performance.now();
  const candidate = JSON.parse(corpusBytes);
  createTp1538Evaluator(candidate, CORPUS_CONTENT_SHA256);
  return Number((performance.now() - started).toFixed(3));
});
const admissionP95Ms = Number(percentile(admissionSamplesMs, 0.95).toFixed(3));

const preparedWasm = prepareRustWasmTp1538AeroBatch(corpus, CORPUS_CONTENT_SHA256, workload.lookupRequests, workload.assemblyRequests);
const admittedRust = preparedWasm.validateCandidate(preparedWasm.executeCandidate());
assert.equal(tp1538AeroPerformanceResultSha256(normalized(admittedRust)), workload.expectedResultSha256);
const backendResults = measureTp1538AeroPerformanceBackends({
  runners: {
    typescript: () => ({
      lookupResults: workload.lookupRequests.map((request) => evaluator.lookup(request)),
      assemblyResults: workload.assemblyRequests.map((request) => evaluator.assemble(request)),
    }),
    "rust-wasm": () => normalized(preparedWasm.executeCandidate()),
  },
  profile,
  expectedResultSha256: workload.expectedResultSha256,
  now: () => performance.now(),
  memoryUsage: () => process.memoryUsage(),
  serialize: JSON.stringify,
});

const workerUrl = new URL("./workers/tp1538-aero-verification.worker.ts", import.meta.url);
const workerStarted = performance.now();
const worker = new Worker(workerUrl);
await workerRequest(worker, { schemaVersion: "vector.tp1538-aero-worker-init.v1", requestId: "benchmark-init", corpus, expectedCorpusSha256: CORPUS_CONTENT_SHA256 });
const workerInitializationMs = Number((performance.now() - workerStarted).toFixed(3));
for (let index = 0; index < profile.warmupBatches; index += 1) {
  const result = await workerRequest(worker, { schemaVersion: "vector.tp1538-aero-worker-evaluate.v1", requestId: `warmup-${index}`, lookupRequests: workload.lookupRequests, assemblyRequests: workload.assemblyRequests });
  assert.equal(tp1538AeroPerformanceResultSha256(normalized(result)), workload.expectedResultSha256);
}
const workerSamplesMs = [];
for (let index = 0; index < profile.measuredBatches; index += 1) {
  const started = performance.now();
  const result = await workerRequest(worker, { schemaVersion: "vector.tp1538-aero-worker-evaluate.v1", requestId: `measured-${index}`, lookupRequests: workload.lookupRequests, assemblyRequests: workload.assemblyRequests });
  workerSamplesMs.push(Number((performance.now() - started).toFixed(3)));
  assert.equal(tp1538AeroPerformanceResultSha256(normalized(result)), workload.expectedResultSha256);
}
await worker.terminate();
const workerRoundTripP95Ms = Number(percentile(workerSamplesMs, 0.95).toFixed(3));

const failures = [
  ...(admissionP95Ms > profile.thresholds.admissionP95Ms ? [{ metric: "admissionP95Ms", actual: admissionP95Ms, threshold: profile.thresholds.admissionP95Ms }] : []),
  ...evaluateTp1538AeroPerformanceResults(backendResults),
  ...(workerInitializationMs > profile.thresholds.workerInitializationMs ? [{ metric: "workerInitializationMs", actual: workerInitializationMs, threshold: profile.thresholds.workerInitializationMs }] : []),
  ...(workerRoundTripP95Ms > profile.thresholds.workerRoundTripP95Ms ? [{ metric: "workerRoundTripP95Ms", actual: workerRoundTripP95Ms, threshold: profile.thresholds.workerRoundTripP95Ms }] : []),
  ...(TP1538_AERO_VERIFIER_ARTIFACT.bytes >= profile.thresholds.wasmBytes ? [{ metric: "wasmBytes", actual: TP1538_AERO_VERIFIER_ARTIFACT.bytes, threshold: profile.thresholds.wasmBytes }] : []),
];
const evidence = {
  schemaVersion: "vector.tp1538-aero-performance-evidence.v1",
  state: failures.length === 0 ? "PASS" : "FAIL",
  repository,
  environment,
  profileId: profile.id,
  corpus: { contentSha256: CORPUS_CONTENT_SHA256, rawSha256: CORPUS_RAW_SHA256, bytes: corpusBytes.byteLength },
  workload: { contentSha256: admittedWorkload.identity.contentSha256, rawSha256: admittedWorkload.identity.rawSha256, bytes: admittedWorkload.identity.byteLength, expectedResultSha256: workload.expectedResultSha256, operations: workload.operationCount, configurationMix: workload.configurationMix },
  admission: { samplesMs: admissionSamplesMs, p95Ms: admissionP95Ms, thresholdP95Ms: profile.thresholds.admissionP95Ms },
  backends: backendResults,
  worker: { initializationMs: workerInitializationMs, thresholdInitializationMs: profile.thresholds.workerInitializationMs, samplesMs: workerSamplesMs, roundTripP95Ms: workerRoundTripP95Ms, thresholdRoundTripP95Ms: profile.thresholds.workerRoundTripP95Ms },
  wasm: { ...TP1538_AERO_VERIFIER_ARTIFACT, thresholdBytes: profile.thresholds.wasmBytes, preparedInputBytes: preparedWasm.encodedBytes },
  failures,
};
const encoded = `${JSON.stringify(evidence, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, encoded);
process.stdout.write(encoded);
if (failures.length > 0) process.exitCode = 1;
