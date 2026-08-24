import { readFileSync, writeFileSync } from "node:fs";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  assertGenericAamFullFrameParity,
  genericAamSemanticBatchSha256,
  genericAamSemanticOutcome,
  genericAamSemanticOutcomeSha256,
  genericAamVerificationInput,
  runGenericAamVerification,
} from "../lib/validation/generic-aam-verification.ts";

if (!process.argv.includes("--write")) {
  throw new Error("Refusing to rewrite the governed workload without --write.");
}

const previousWorkloadUrl = new URL("../fixtures/public-reference/nasa-tm-109057/workload.v4.json", import.meta.url);
const workloadUrl = new URL("../fixtures/public-reference/nasa-tm-109057/workload.v5.json", import.meta.url);
const previous = JSON.parse(readFileSync(previousWorkloadUrl, "utf8"));
const workload = {
  ...previous,
  schemaVersion: "vector.generic-aam-verification-workload.v5",
  id: "nasa-tm-109057-appendix-b-bounded-sweep.v5",
  cases: previous.cases.map((entry) => Object.fromEntries(
    Object.entries(entry).filter(([key]) => !["typescriptRunSha256", "rustWasmRunSha256"].includes(key)),
  )),
};

const normalizedResults = workload.cases.map((entry) => {
  const input = genericAamVerificationInput({
    tickRateHz: entry.tickRateHz,
    maxTicks: entry.maxTicks,
    seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
    seekerHalfAngleRad: entry.seekerHalfAngleRad,
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
  const typescript = runGenericAamVerification(input);
  const rust = runRustWasmGenericAamVerification(input);
  assertGenericAamFullFrameParity(typescript, rust);
  entry.expectedTerminal = typescript.terminal.state;
  entry.expectedTick = typescript.terminal.tick;
  entry.expectedCause = typescript.terminal.cause;
  entry.expectedFrameCount = typescript.frames.length;
  entry.semanticOutcomeSha256 = genericAamSemanticOutcomeSha256(entry, typescript);
  const typescriptOutcome = genericAamSemanticOutcome(entry, typescript);
  const rustOutcome = genericAamSemanticOutcome(entry, rust);
  if (JSON.stringify(typescriptOutcome) !== JSON.stringify(rustOutcome)) {
    throw new Error(`${entry.id} TypeScript/Rust semantic outcome mismatch.`);
  }
  return typescriptOutcome;
});

workload.expectedBatchSha256 = genericAamSemanticBatchSha256(normalizedResults);
writeFileSync(workloadUrl, `${JSON.stringify(workload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  workloadId: workload.id,
  cases: workload.caseCount,
  expectedBatchSha256: workload.expectedBatchSha256,
  environment: { runtime: process.version, platform: process.platform, architecture: process.arch },
})}\n`);
