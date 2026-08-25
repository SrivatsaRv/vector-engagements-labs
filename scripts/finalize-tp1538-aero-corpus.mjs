import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createTp1538AdjudicatedCorpus,
  parseTp1538TranscriptionArtifact,
  validateTp1538Corpus,
} from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

function readJson(name) {
  const path = resolve(argument(name));
  const bytes = readFileSync(path);
  if (bytes.byteLength < 2 || bytes.byteLength > 8 * 1024 * 1024) throw new Error(`${name} artifact byte length is outside its closed bound.`);
  try {
    return { path, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    throw new Error(`${name} artifact is not exact UTF-8 JSON.`);
  }
}

function readTranscription(name) {
  const path = resolve(argument(name));
  return { path, value: parseTp1538TranscriptionArtifact(readFileSync(path)).transcription };
}

const left = readTranscription("--left");
const right = readTranscription("--right");
const comparison = readJson("--comparison");
const decisions = readJson("--decisions");
const outputDirectory = resolve(argument("--output-directory"));
const corpus = createTp1538AdjudicatedCorpus({
  left: left.value,
  right: right.value,
  comparison: comparison.value,
  decisions: decisions.value,
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
