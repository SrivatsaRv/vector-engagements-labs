import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  completeTp1538Transcription,
  parseTp1538TranscriptionArtifact,
} from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

const input = resolve(argument("--input"));
const outputDirectory = resolve(argument("--output-directory"));
const draft = parseTp1538TranscriptionArtifact(readFileSync(input)).transcription;
if (draft.status !== "DRAFT" || draft.contentSha256 !== null) throw new Error("TP-1538 transcription freeze requires an unfrozen complete draft.");
const transcription = completeTp1538Transcription(draft);
const output = resolve(outputDirectory, `${transcription.contentSha256}.json`);
const bytes = Buffer.from(`${JSON.stringify(transcription)}\n`);
writeFileSync(output, bytes, { flag: "wx", mode: 0o444 });
const readback = parseTp1538TranscriptionArtifact(readFileSync(output));
if (readback.transcription.contentSha256 !== transcription.contentSha256) throw new Error("Frozen TP-1538 transcription failed exact readback.");
process.stdout.write(`${JSON.stringify({
  state: "frozen",
  output,
  contentSha256: transcription.contentSha256,
  rawSha256: readback.rawSha256,
  byteLength: readback.byteLength,
  available: readback.available,
  unavailable: readback.unavailable,
})}\n`);
