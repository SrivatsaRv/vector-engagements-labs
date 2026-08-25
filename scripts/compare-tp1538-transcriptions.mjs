import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareTp1538Transcriptions,
  parseTp1538TranscriptionArtifact,
  tp1538ComparisonContentSha256,
} from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

const leftPath = resolve(argument("--left"));
const rightPath = resolve(argument("--right"));
const outputDirectory = resolve(argument("--output-directory"));
const report = compareTp1538Transcriptions(
  parseTp1538TranscriptionArtifact(readFileSync(leftPath)).transcription,
  parseTp1538TranscriptionArtifact(readFileSync(rightPath)).transcription,
);
const contentSha256 = tp1538ComparisonContentSha256(report);
const output = resolve(outputDirectory, `${contentSha256}.json`);
const bytes = Buffer.from(`${JSON.stringify(report)}\n`);
writeFileSync(output, bytes, { flag: "wx", mode: 0o444 });
const readback = JSON.parse(readFileSync(output, "utf8"));
if (tp1538ComparisonContentSha256(readback) !== contentSha256) throw new Error("Frozen TP-1538 comparison failed exact readback.");
process.stdout.write(`${JSON.stringify({
  state: "compared",
  output,
  contentSha256,
  rawSha256: createHash("sha256").update(bytes).digest("hex"),
  byteLength: bytes.byteLength,
  ...report.summary,
})}\n`);
