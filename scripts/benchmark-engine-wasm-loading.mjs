import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import {
  VECTOR_ENGINE_WASM_BASE64,
  VECTOR_ENGINE_WASM_BYTES,
  VECTOR_ENGINE_WASM_SHA256,
} from "../lib/engine/generated/vector-engine-wasm.ts";
import { resolveBrowserWorkerAssets } from "./browser-worker-assets.ts";
import { ENGINE_WASM_PERFORMANCE_POLICY } from "../lib/engine/performance-policy.ts";

const RUNS = 20;
const BASELINE_COMMIT = ENGINE_WASM_PERFORMANCE_POLICY.baselineCommit;
const BASELINE_WASM_BYTES = ENGINE_WASM_PERFORMANCE_POLICY.baselineOptimizedWasmBytes;
const BASELINE_WORKER_BYTES = {
  raw: 1_624_146,
  gzip: 502_970,
  brotli: 386_584,
};
const LIMITS = {
  wasmRawBytes: ENGINE_WASM_PERFORMANCE_POLICY.maximumOptimizedWasmBytes,
  wasmGzipBytes: ENGINE_WASM_PERFORMANCE_POLICY.maximumGzipWasmBytes,
  wasmBrotliBytes: ENGINE_WASM_PERFORMANCE_POLICY.maximumBrotliWasmBytes,
  workerGrowthFraction: ENGINE_WASM_PERFORMANCE_POLICY.maximumWorkerGrowthFraction,
  initializationP95RegressionFraction:
    ENGINE_WASM_PERFORMANCE_POLICY.maximumBrowserInitializationP95RegressionFraction,
  initializationMaximumMs: ENGINE_WASM_PERFORMANCE_POLICY.maximumBrowserInitializationMs,
  initialMemoryBytes: ENGINE_WASM_PERFORMANCE_POLICY.initialMemoryBytes,
};

function nearestRank(values, percentile) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(percentile * ordered.length) - 1];
}

function compressedSizes(bytes) {
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

function requireBelow(actual, maximum, label) {
  if (actual >= maximum) {
    throw new Error(`${label} is ${actual}; expected fewer than ${maximum}.`);
  }
}

const wasmBytes = Buffer.from(VECTOR_ENGINE_WASM_BASE64, "base64");
if (wasmBytes.byteLength !== VECTOR_ENGINE_WASM_BYTES) {
  throw new Error("Decoded engine WASM length does not match its generated identity.");
}
const wasm = compressedSizes(wasmBytes);
const workerAssets = resolveBrowserWorkerAssets();
const worker = compressedSizes(readFileSync(
  `${workerAssets.assetDirectory}/${workerAssets.simulationWorkerName}`,
));

const baselineSource = execFileSync(
  "git",
  ["show", `${BASELINE_COMMIT}:lib/engine/generated/vector-engine-wasm.ts`],
  { encoding: "utf8", maxBuffer: 2_000_000 },
);
const baselineBase64 = baselineSource.match(
  /VECTOR_ENGINE_WASM_BASE64 = "([A-Za-z0-9+/=]+)"/,
)?.[1];
if (!baselineBase64 || Buffer.from(baselineBase64, "base64").byteLength !== BASELINE_WASM_BYTES) {
  throw new Error("The frozen pre-#196 engine WASM baseline cannot be resolved by exact commit identity.");
}

const browser = await chromium.launch({ headless: true });
const samples = { baseline: [], candidate: [] };
async function measure(base64) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(async (encoded) => {
      const decodeStarted = performance.now();
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
        bytes[byteIndex] = binary.charCodeAt(byteIndex);
      }
      const decodeFinished = performance.now();
      const wasmModule = new WebAssembly.Module(bytes);
      const compileFinished = performance.now();
      const instance = new WebAssembly.Instance(wasmModule, {});
      const instantiateFinished = performance.now();
      const memory = instance.exports.memory;
      return {
        decodeMs: decodeFinished - decodeStarted,
        compileMs: compileFinished - decodeFinished,
        instantiateMs: instantiateFinished - compileFinished,
        totalMs: instantiateFinished - decodeStarted,
        initialMemoryBytes: memory instanceof WebAssembly.Memory
          ? memory.buffer.byteLength
          : null,
      };
    }, base64);
  } finally {
    await context.close();
  }
}
try {
  for (let index = 0; index < RUNS; index += 1) {
    // Alternate order so one artifact does not own all cold-start or thermal bias.
    if (index % 2 === 0) {
      samples.baseline.push(await measure(baselineBase64));
      samples.candidate.push(await measure(VECTOR_ENGINE_WASM_BASE64));
    } else {
      samples.candidate.push(await measure(VECTOR_ENGINE_WASM_BASE64));
      samples.baseline.push(await measure(baselineBase64));
    }
  }
} finally {
  await browser.close();
}

function summarize(measurements) {
  const totals = measurements.map((sample) => sample.totalMs);
  return {
    samples: measurements,
    initializationP95Ms: nearestRank(totals, 0.95),
    initializationMaximumMs: Math.max(...totals),
    initialMemoryBytes: [...new Set(measurements.map((sample) => sample.initialMemoryBytes))],
  };
}
const baselineBrowser = summarize(samples.baseline);
const candidateBrowser = summarize(samples.candidate);
const evidence = {
  schemaVersion: "vector.engine-wasm-load-evidence.v1",
  artifact: {
    sha256: VECTOR_ENGINE_WASM_SHA256,
    ...wasm,
    baselineRawBytes: BASELINE_WASM_BYTES,
    rawGrowthFraction: (wasm.raw - BASELINE_WASM_BYTES) / BASELINE_WASM_BYTES,
  },
  worker: {
    name: workerAssets.simulationWorkerName,
    ...worker,
    growthFraction: {
      raw: (worker.raw - BASELINE_WORKER_BYTES.raw) / BASELINE_WORKER_BYTES.raw,
      gzip: (worker.gzip - BASELINE_WORKER_BYTES.gzip) / BASELINE_WORKER_BYTES.gzip,
      brotli: (worker.brotli - BASELINE_WORKER_BYTES.brotli) / BASELINE_WORKER_BYTES.brotli,
    },
  },
  browser: {
    engine: "Chromium",
    freshContexts: RUNS,
    baselineCommit: BASELINE_COMMIT,
    baseline: baselineBrowser,
    candidate: candidateBrowser,
    initializationP95GrowthFraction:
      (candidateBrowser.initializationP95Ms - baselineBrowser.initializationP95Ms) /
      baselineBrowser.initializationP95Ms,
  },
  limits: LIMITS,
};

process.stdout.write(`${JSON.stringify(evidence)}\n`);

requireBelow(wasm.raw, LIMITS.wasmRawBytes, "Optimized engine WASM");
requireBelow(wasm.gzip, LIMITS.wasmGzipBytes, "gzip engine WASM");
requireBelow(wasm.brotli, LIMITS.wasmBrotliBytes, "Brotli engine WASM");
for (const format of ["raw", "gzip", "brotli"]) {
  if (evidence.worker.growthFraction[format] > LIMITS.workerGrowthFraction) {
    throw new Error(
      `Production Worker ${format} growth ${evidence.worker.growthFraction[format]} exceeds ${LIMITS.workerGrowthFraction}.`,
    );
  }
}
requireBelow(
  evidence.browser.initializationP95GrowthFraction,
  LIMITS.initializationP95RegressionFraction,
  "Chromium WASM initialization p95 regression fraction",
);
requireBelow(
  candidateBrowser.initializationMaximumMs,
  LIMITS.initializationMaximumMs,
  "Chromium WASM initialization maximum ms",
);
if (candidateBrowser.initialMemoryBytes.length !== 1 ||
    candidateBrowser.initialMemoryBytes[0] !== LIMITS.initialMemoryBytes ||
    baselineBrowser.initialMemoryBytes.length !== 1 ||
    baselineBrowser.initialMemoryBytes[0] !== LIMITS.initialMemoryBytes) {
  throw new Error(
    `Initial WASM memory changed: ${JSON.stringify({ baseline: baselineBrowser.initialMemoryBytes, candidate: candidateBrowser.initialMemoryBytes })}.`,
  );
}
