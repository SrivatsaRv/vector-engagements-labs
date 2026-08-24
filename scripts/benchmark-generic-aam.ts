import { readFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  emitGenericAamPerformanceReport,
  measureGenericAamPerformanceBackends,
  resolveGenericAamPerformanceProfile,
} from "./lib/generic-aam-performance-policy.mjs";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  genericAamVerificationInput,
  runGenericAamVerification,
} from "../lib/validation/generic-aam-verification.ts";

type WorkloadCase = {
  tickRateHz: 32 | 64 | 128;
  maxTicks: number;
  seekerHalfAngleDeg: 15 | 20 | 30;
  caseRole?: "TABLE_THRUST_CONFLICT_SENSITIVITY";
  targetPositionM: { x: number; y: number; z: number };
};

const workload = JSON.parse(
  readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v5.json", import.meta.url), "utf8"),
) as { id: string; cases: WorkloadCase[] };
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

const runners = {
  typescript: runGenericAamVerification,
  "rust-wasm": runRustWasmGenericAamVerification,
} as const;
const environment = {
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCores: cpus().length,
  memoryBytes: totalmem(),
  githubActions: process.env.GITHUB_ACTIONS === "true",
  runnerOs: process.env.RUNNER_OS ?? null,
  runnerArch: process.env.RUNNER_ARCH ?? null,
  imageOs: process.env.ImageOS ?? null,
};
const arguments_ = process.argv.slice(2);
if (arguments_.length !== 1 || !arguments_[0].startsWith("--profile=")) {
  throw new Error("Exactly one explicit --profile=<id> argument is required.");
}
const profile = resolveGenericAamPerformanceProfile(arguments_[0].slice("--profile=".length), environment);
const results = measureGenericAamPerformanceBackends({
  runners,
  inputs,
  thresholdsP95Ms: profile.thresholdsP95Ms,
  now: () => performance.now(),
  memoryUsage: () => process.memoryUsage(),
  serialize: (result: ReturnType<typeof runGenericAamVerification>) => JSON.stringify(result),
});

process.exitCode = emitGenericAamPerformanceReport({
  report: {
    schemaVersion: "vector.generic-aam-verification-performance.v2",
    workloadId: workload.id,
    profileId: profile.id,
    environment,
    results,
    nonclaims: ["Node-hosted evaluator only", "No browser Worker capacity claim", "No production entity-capacity claim"],
  },
  writeOutput: (value: string) => process.stdout.write(value),
  writeError: (value: string) => process.stderr.write(value),
});
