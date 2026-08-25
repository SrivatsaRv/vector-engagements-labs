import { readFileSync } from "node:fs";

import { runRustWasmGenericAamVerification } from "../lib/validation/generic-aam-verification-wasm.ts";
import {
  assertGenericAamFullFrameParity,
  assertGenericAamVerificationRun,
  genericAamSemanticBatchSha256,
  genericAamSemanticOutcome,
  genericAamSemanticOutcomeSha256,
  genericAamVerificationInput,
  runGenericAamVerification,
  verifyGenericAamCorpusArtifact,
  verifyGenericAamWorkload,
} from "../lib/validation/generic-aam-verification.ts";

const root = new URL("../", import.meta.url);
const corpusBytes = readFileSync(new URL("../governance/nasa-tm-109057-generic-aam-verification-corpus.v5.json", import.meta.url));
const corpus = JSON.parse(corpusBytes);
const source = readFileSync(new URL(corpus.artifact.localPath, root));
const report = verifyGenericAamCorpusArtifact(corpus, corpusBytes, source);
const workloadBytes = readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v5.json", import.meta.url));
const workload = JSON.parse(workloadBytes);
verifyGenericAamWorkload(workload, workloadBytes);
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
  const parity = assertGenericAamFullFrameParity(typescript, rust);
  const typescriptOutcome = genericAamSemanticOutcome(entry, typescript);
  const rustOutcome = genericAamSemanticOutcome(entry, rust);
  if (JSON.stringify(typescriptOutcome) !== JSON.stringify(rustOutcome)) {
    throw new Error(`${entry.id} TypeScript/Rust semantic outcome mismatch.`);
  }
  return {
    outcome: typescriptOutcome,
    sha256: genericAamSemanticOutcomeSha256(entry, typescript),
    parity,
  };
});
const batchSha256 = genericAamSemanticBatchSha256(results.map(({ outcome }) => outcome));
for (const [index, actual] of results.entries()) {
  const expected = workload.cases[index];
  if (expected.expectedTerminal !== actual.outcome.terminalState
    || expected.expectedTick !== actual.outcome.terminalTick
    || expected.expectedCause !== actual.outcome.terminalCause
    || expected.expectedFrameCount !== actual.outcome.frameCount
    || expected.semanticOutcomeSha256 !== actual.sha256) {
    throw new Error(`${actual.outcome.id} stable semantic outcome mismatch.`);
  }
}
if (workload.expectedBatchSha256 !== batchSha256) throw new Error(`Workload batch digest mismatch: expected ${workload.expectedBatchSha256}, received ${batchSha256}`);
process.stdout.write(`${JSON.stringify({
  ...report,
  workloadId: workload.id,
  cases: results.length,
  batchSha256,
  parity: {
    policyId: corpus.evaluator.parityPolicy.id,
    framesCompared: results.reduce((total, result) => total + result.parity.framesCompared, 0),
    numericComparisons: results.reduce((total, result) => total + result.parity.numericComparisons, 0),
  },
  environment: { runtime: process.version, platform: process.platform, architecture: process.arch },
})}\n`);
