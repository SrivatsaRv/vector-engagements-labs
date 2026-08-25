import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  admitGenericAamPerformanceWorkload,
  evaluateGenericAamPerformanceResults,
  measureGenericAamPerformanceBackends,
  resolveGenericAamPerformanceProfile,
} from "./lib/generic-aam-performance-evidence.mjs";
import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  GENERIC_AAM_CORPUS_SHA256,
  GENERIC_AAM_DECISION_SHA256,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamWorkload,
} from "../lib/validation/generic-aam-verification.ts";

type WorkloadCase = {
  tickRateHz: 32 | 64 | 128;
  maxTicks: number;
  seekerHalfAngleDeg: 15 | 20 | 30;
  caseRole?: "TABLE_THRUST_CONFLICT_SENSITIVITY";
  targetPositionM: { x: number; y: number; z: number };
  expectedFrameCount: number;
};

type Workload = {
  id: string;
  sourceSha256: string;
  expectedBatchSha256: string;
  caseCount: number;
  cases: WorkloadCase[];
};

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0]?.startsWith("--profile=")) {
  throw new Error("Exactly one explicit --profile=<id> argument is required.");
}
const environment = {
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCores: cpus().length,
  memoryBytes: totalmem(),
};
const profile = resolveGenericAamPerformanceProfile(args[0].slice("--profile=".length), environment);
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v5.json", import.meta.url));
const workload = JSON.parse(workloadBytes.toString("utf8")) as Workload;
const admitted = admitGenericAamPerformanceWorkload(workload, workloadBytes, verifyGenericAamWorkload);
const inputs = workload.cases.map((entry) => {
  const input = genericAamVerificationInput({
    tickRateHz: entry.tickRateHz,
    maxTicks: entry.maxTicks,
    seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
    caseRole: entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION",
    target: {
      previousPositionM: entry.targetPositionM,
      positionM: entry.targetPositionM,
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  if (input.caseRole === "TABLE_THRUST_CONFLICT_SENSITIVITY") {
    input.constants.motorThrustN = 690 * 4.4482216152605;
  }
  return input;
});

const results = measureGenericAamPerformanceBackends({
  runners: {
    typescript: runGenericAamVerification,
    "rust-wasm": runRustWasmGenericAamVerification,
  },
  inputs,
  profile,
  now: () => performance.now(),
  memoryUsage: () => process.memoryUsage(),
  serialize: (result: ReturnType<typeof runGenericAamVerification>) => JSON.stringify(result),
});
const repository = {
  commitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  worktreeClean: execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim() === "",
};
const report = {
  schemaVersion: "vector.generic-aam-verification-performance.v2",
  repository,
  profile: { id: profile.id, environment: profile.environment },
  workload: {
    id: workload.id,
    sha256: admitted.identity.sha256,
    byteLength: admitted.identity.byteLength,
    sourceSha256: workload.sourceSha256,
    corpusSha256: GENERIC_AAM_CORPUS_SHA256,
    decisionSha256: GENERIC_AAM_DECISION_SHA256,
    expectedBatchSha256: workload.expectedBatchSha256,
    cases: workload.caseCount,
    expectedFrames: workload.cases.reduce((sum, entry) => sum + entry.expectedFrameCount, 0),
    tickRatesHz: [...new Set(workload.cases.map(({ tickRateHz }) => tickRateHz))].sort((a, b) => a - b),
    seekerHalfAnglesDeg: [...new Set(workload.cases.map(({ seekerHalfAngleDeg }) => seekerHalfAngleDeg))].sort((a, b) => a - b),
  },
  results,
  nonclaims: [
    "Node-hosted verification evaluator only",
    "No browser Worker capacity claim",
    "No production entity-capacity claim",
    "No named weapon or platform performance claim",
  ],
};
process.stdout.write(`${JSON.stringify(report)}\n`);
const violations = evaluateGenericAamPerformanceResults(results);
if (violations.length > 0) {
  process.stderr.write(`${violations.map(({ message }: { message: string }) => message).join(" ")}\n`);
  process.exitCode = 1;
}
