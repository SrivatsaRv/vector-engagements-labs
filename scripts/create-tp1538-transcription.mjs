import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTp1538TranscriptionTemplate } from "./lib/tp1538-aero-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

const output = resolve(argument("--output"));
const template = createTp1538TranscriptionTemplate({
  transcriptionId: argument("--transcription-id"),
  entrantId: argument("--entrant-id"),
  isolationSessionId: argument("--isolation-session-id"),
});
writeFileSync(output, `${JSON.stringify(template, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ state: "created", output, tables: template.tables.length, cells: template.tables.reduce((sum, table) => sum + table.cells.length, 0) })}\n`);
