import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES,
  MAX_TP1538_COMPARISON_ARTIFACT_BYTES,
  assertTp1538DigestNamedReadOnlyArtifact,
  createTp1538AdjudicatedCorpus,
  parseTp1538AdjudicationArtifact,
  parseTp1538ComparisonArtifact,
  parseTp1538TranscriptionArtifact,
  readTp1538BoundedRegularFile,
  validateTp1538Corpus,
} from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

function readTranscription(name) {
  const path = resolve(argument(name));
  return { path, value: parseTp1538TranscriptionArtifact(readFileSync(path)).transcription };
}

const left = readTranscription("--left");
const right = readTranscription("--right");
const comparisonPath = resolve(argument("--comparison"));
const comparisonFile = readTp1538BoundedRegularFile(comparisonPath, MAX_TP1538_COMPARISON_ARTIFACT_BYTES, "TP-1538 immutable comparison artifact", { requireReadOnly: true });
const comparison = parseTp1538ComparisonArtifact(comparisonFile.bytes);
assertTp1538DigestNamedReadOnlyArtifact(comparisonPath, comparison.contentSha256, comparisonFile.mode, "TP-1538 immutable comparison artifact");
const decisionsPath = resolve(argument("--decisions"));
const decisionsFile = readTp1538BoundedRegularFile(decisionsPath, MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES, "TP-1538 frozen adjudication artifact", { requireReadOnly: true });
const decisions = parseTp1538AdjudicationArtifact(decisionsFile.bytes, {
  comparison: comparison.comparison,
  comparisonRawSha256: comparison.rawSha256,
});
if (decisions.artifact.status !== "FROZEN") throw new Error("TP-1538 finalization requires a frozen adjudication artifact.");
assertTp1538DigestNamedReadOnlyArtifact(decisionsPath, decisions.artifact.contentSha256, decisionsFile.mode, "TP-1538 frozen adjudication artifact");
const outputDirectory = resolve(argument("--output-directory"));
const corpus = createTp1538AdjudicatedCorpus({
  left: left.value,
  right: right.value,
  comparison: comparison.comparison,
  comparisonRawSha256: comparison.rawSha256,
  adjudication: decisions.artifact,
});
const report = validateTp1538Corpus(corpus, { expectedCorpusSha256: corpus.corpusSha256 });
const output = resolve(outputDirectory, `${corpus.corpusSha256}.json`);
const bytes = Buffer.from(`${JSON.stringify(corpus)}\n`);
writeFileSync(output, bytes, { flag: "wx", mode: 0o444 });
const readback = validateTp1538Corpus(JSON.parse(readFileSync(output, "utf8")), { expectedCorpusSha256: corpus.corpusSha256 });
if (readback.totalCells !== report.totalCells || readback.availableCells !== report.availableCells) throw new Error("Frozen TP-1538 corpus failed exact readback.");
process.stdout.write(`${JSON.stringify({
  state: "created",
  output,
  corpusSha256: corpus.corpusSha256,
  rawSha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.byteLength,
  tables: corpus.tables.length,
  totalCells: report.totalCells,
  availableCells: report.availableCells,
  mismatches: corpus.comparison.mismatchCount,
})}\n`);
