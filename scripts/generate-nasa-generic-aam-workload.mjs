import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { runRustWasmGenericAamVerification } from "../lib/engine/backend.ts";
import {
  genericAamVerificationInput,
  runGenericAamVerification,
} from "../lib/validation/generic-aam-verification.ts";

if (!process.argv.includes("--write")) {
  throw new Error("Refusing to rewrite the governed workload without --write.");
}

const workloadUrl = new URL("../fixtures/public-reference/nasa-tm-109057/workload.v2.json", import.meta.url);
const workload = JSON.parse(readFileSync(workloadUrl, "utf8"));
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const runDigest = (run) => digest({
  schemaVersion: run.schemaVersion,
  subjectId: run.subjectId,
  intendedUse: run.intendedUse,
  semantics: run.semantics,
  backend: run.backend,
  caseRole: run.caseRole,
  frames: run.frames,
  terminal: run.terminal,
  limitations: run.limitations,
});

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
  entry.expectedTerminal = typescript.terminal.state;
  entry.expectedTick = typescript.terminal.tick;
  entry.typescriptRunSha256 = runDigest(typescript);
  entry.rustWasmRunSha256 = runDigest(rust);
  return {
    id: entry.id,
    expectedTerminal: entry.expectedTerminal,
    expectedTick: entry.expectedTick,
    typescriptRunSha256: entry.typescriptRunSha256,
    rustWasmRunSha256: entry.rustWasmRunSha256,
  };
});

workload.expectedBatchSha256 = digest(
  [...normalizedResults].sort((left, right) => left.id.localeCompare(right.id)),
);
writeFileSync(workloadUrl, `${JSON.stringify(workload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ workloadId: workload.id, cases: workload.caseCount, expectedBatchSha256: workload.expectedBatchSha256 })}\n`);
