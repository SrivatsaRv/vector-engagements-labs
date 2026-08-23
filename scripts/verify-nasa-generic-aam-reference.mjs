import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  genericAamCorpusView,
  assertGenericAamVerificationRun,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpus,
  verifyGenericAamWorkload,
} from "../lib/validation/generic-aam-verification.ts";

const root = new URL("../", import.meta.url);
const corpus = genericAamCorpusView();
const source = readFileSync(new URL(corpus.artifact.localPath, root));
const report = verifyGenericAamCorpus(corpus, source);
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v3.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
verifyGenericAamWorkload(workload, workloadBytes);
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
const results = workload.cases.map((entry) => {
  const base = genericAamVerificationInput({
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
  if (base.caseRole === "TABLE_THRUST_CONFLICT_SENSITIVITY") {
    base.constants.motorThrustN = 690 * 4.4482216152605;
  }
  const typescript = runGenericAamVerification(base);
  const rust = runRustWasmGenericAamVerification(base);
  assertGenericAamVerificationRun(typescript, base, "typescript");
  assertGenericAamVerificationRun(rust, base, "rust-wasm");
  return {
    id: entry.id,
    expectedTerminal: typescript.terminal.state,
    expectedTick: typescript.terminal.tick,
    typescriptRunSha256: runDigest(typescript),
    rustWasmRunSha256: runDigest(rust),
  };
});
const batchSha256 = digest([...results].sort((left, right) => left.id.localeCompare(right.id)));
for (const [index, actual] of results.entries()) {
  const expected = workload.cases[index];
  for (const key of ["expectedTerminal", "expectedTick", "typescriptRunSha256", "rustWasmRunSha256"]) {
    if (expected[key] !== actual[key]) throw new Error(`${actual.id} ${key} mismatch: expected ${expected[key]}, received ${actual[key]}`);
  }
}
if (workload.expectedBatchSha256 !== batchSha256) throw new Error(`Workload batch digest mismatch: expected ${workload.expectedBatchSha256}, received ${batchSha256}`);
process.stdout.write(`${JSON.stringify({ ...report, workloadId: workload.id, cases: results.length, batchSha256 })}\n`);
