import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  tp1538PdfPageForCoordinate,
  validateTp1538Transcription,
} from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

const transcriptPath = resolve(argument("--transcript"));
const pdfPage = Number(argument("--pdf-page"));
const entries = JSON.parse(argument("--entries-json"));
if (!Number.isInteger(pdfPage) || !Array.isArray(entries) || entries.length < 1 || entries.length > 2_000) throw new Error("Manual-entry page and 1 through 2,000 entries are required.");
const transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
validateTp1538Transcription(transcript, { allowUnentered: true });
const seen = new Set();
for (const entry of entries) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(["coordinate", "printedValue", "state", "tableId"])) throw new Error("Manual TP-1538 entry must have exact keys.");
  if (tp1538PdfPageForCoordinate(entry.tableId, entry.coordinate) !== pdfPage) throw new Error("Manual TP-1538 entry does not belong to the declared source page.");
  const key = `${entry.tableId}:${JSON.stringify(entry.coordinate)}`;
  if (seen.has(key)) throw new Error("Manual TP-1538 entry is duplicated in the page batch.");
  seen.add(key);
  const table = transcript.tables.find(({ tableId }) => tableId === entry.tableId);
  const cell = table?.cells.find(({ coordinate }) => JSON.stringify(coordinate) === JSON.stringify(entry.coordinate));
  if (!cell) throw new Error("Manual TP-1538 entry coordinate is missing from the transcript.");
  if (cell.state !== "UNENTERED" && (cell.state !== entry.state || cell.printedValue !== entry.printedValue)) throw new Error("Manual TP-1538 entry would overwrite a different existing decision.");
  cell.state = entry.state;
  cell.printedValue = entry.printedValue;
}
const report = validateTp1538Transcription(transcript, { allowUnentered: true });
const temporaryPath = `${transcriptPath}.next`;
writeFileSync(temporaryPath, `${JSON.stringify(transcript, null, 2)}\n`, { flag: "wx", mode: 0o600 });
renameSync(temporaryPath, transcriptPath);
process.stdout.write(`${JSON.stringify({ state: "updated", transcript: transcriptPath, pdfPage, entries: entries.length, available: report.available, unavailable: report.unavailable, unentered: report.unentered })}\n`);
