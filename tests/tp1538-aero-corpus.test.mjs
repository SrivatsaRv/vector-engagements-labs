import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TP1538_AXES,
  TP1538_APPENDIX_B,
  TP1538_REFERENCE_DATA,
  TP1538_SIGNS,
  TP1538_TABLE_INVENTORY,
  MAX_TP1538_COMPARISON_MISMATCHES,
  MAX_TP1538_CORPUS_ARTIFACT_BYTES,
  MAX_TP1538_TRANSCRIPTION_ARTIFACT_BYTES,
  completeTp1538Transcription,
  compareTp1538Transcriptions,
  createTp1538AdjudicatedCorpus,
  createTp1538TranscriptionTemplate,
  parseTp1538CorpusArtifact,
  parseTp1538TranscriptionArtifact,
  tp1538CorpusContentSha256,
  validateTp1538Corpus,
  validateTp1538Transcription,
  verifyTp1538AeroProductionIsolation,
} from "../scripts/lib/tp1538-aero-corpus.mjs";

test("the complete TP-1538 Table III inventory ends on PDF page 97", () => {
  assert.equal(TP1538_TABLE_INVENTORY.length, 48);
  assert.equal(TP1538_TABLE_INVENTORY[0].id, "CX_BASE");
  assert.equal(TP1538_TABLE_INVENTORY.at(-1).id, "CL_P_LEF_INCREMENT");
  assert.deepEqual([...new Set(TP1538_TABLE_INVENTORY.flatMap(({ pdfPages }) => pdfPages))],
    Array.from({ length: 47 }, (_, index) => index + 51));
  assert.equal(TP1538_TABLE_INVENTORY.reduce((sum, table) => sum + table.cellCount, 0), 14_705);
  assert.deepEqual(TP1538_AXES.alphaDeg, [-20,-15,-10,-5,0,5,10,15,20,25,30,35,40,45,50,55,60,70,80,90]);
  assert.deepEqual(TP1538_AXES.betaDeg, [-30,-25,-20,-15,-10,-8,-6,-4,-2,0,2,4,6,8,10,15,20,25,30]);
  assert.deepEqual(TP1538_AXES.stabilatorBaseLongitudinalDeg, [-25,-10,0,10,25]);
  assert.deepEqual(TP1538_AXES.stabilatorBaseLateralDeg, [-25,0,25]);
});

test("Table I, body signs and Appendix B order retain the printed contracts", () => {
  assert.deepEqual(TP1538_REFERENCE_DATA.weight, { si: { value: 91188, unit: "N" }, customary: { value: 20500, unit: "lb" } });
  assert.deepEqual(TP1538_REFERENCE_DATA.wing, {
    span: { si: { value: 9.144, unit: "m" }, customary: { value: 30, unit: "ft" } },
    area: { si: { value: 27.87, unit: "m^2" }, customary: { value: 300, unit: "ft^2" } },
    meanAerodynamicChord: { si: { value: 3.45, unit: "m" }, customary: { value: 11.32, unit: "ft" } },
  });
  assert.equal(TP1538_REFERENCE_DATA.referenceCgChordFraction, 0.35);
  assert.deepEqual(TP1538_SIGNS, {
    bodyAxes: "X_FORWARD_Y_RIGHT_Z_DOWN",
    positiveStabilator: "NOSE_DOWN",
    positiveAileronDifferentialTail: "LEFT_ROLL",
    positiveRudder: "LEFT_YAW",
    positiveLeadingEdgeFlap: "DOWN",
  });
  assert.deepEqual(TP1538_APPENDIX_B.coefficientOrder, ["CX_TOTAL", "CZ_TOTAL", "CM_TOTAL", "CY_TOTAL", "CN_TOTAL", "CL_TOTAL"]);
  assert.deepEqual(TP1538_APPENDIX_B.sourcePdfPages, [42,43,44,45,46]);
  assert.deepEqual(TP1538_APPENDIX_B.printedTablesNotReferencedByTotalCoefficientEquations, [{
    tableId: "CN_AILERON_INCREMENT",
    tablePdfPage: 87,
    equationPdfPage: 45,
    decision: "LOOKUP_ONLY_WITHHELD_FROM_ASSEMBLY",
    rationale: "Table III prints delta-Cn-delta-a(alpha), but the Appendix B Cn total equation and definitions do not reference that one-dimensional table.",
  }]);
});

test("the transcription template enumerates every coordinate once without values", () => {
  const template = createTp1538TranscriptionTemplate({
    transcriptionId: "TP1538_A_TEST",
    entrantId: "ISOLATED_TEST",
    isolationSessionId: "session-a",
  });
  assert.equal(template.tables.length, 48);
  assert.equal(template.tables.reduce((sum, table) => sum + table.cells.length, 0), 14_705);
  assert.equal(template.tables[0].cells[0].state, "UNENTERED");
  assert.equal(template.tables[0].cells[0].printedValue, null);
  assert.deepEqual(template.tables[0].cells[0].coordinate, { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -25 });
  assert.deepEqual(template.tables.at(-1).cells.at(-1).coordinate, { alphaDeg: 90 });
});

test("the template CLI creates isolated value-free A/B artifacts", () => {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-template-"));
  const paths = [join(scratch, "a.json"), join(scratch, "b.json")];
  for (const [index, output] of paths.entries()) execFileSync(process.execPath, [
    "scripts/create-tp1538-transcription.mjs",
    "--output", output,
    "--transcription-id", `TP1538_${index === 0 ? "A" : "B"}_EMPTY_TEST`,
    "--entrant-id", `ISOLATED_${index === 0 ? "A" : "B"}`,
    "--isolation-session-id", `isolated-${index === 0 ? "a" : "b"}`,
  ]);
  const [a, b] = paths.map((path) => JSON.parse(readFileSync(path, "utf8")));
  assert.notEqual(a.transcriptionId, b.transcriptionId);
  assert.notEqual(a.entrantId, b.entrantId);
  assert.notEqual(a.isolationSessionId, b.isolationSessionId);
  for (const transcript of [a, b]) {
    assert.equal(transcript.tables.reduce((sum, table) => sum + table.cells.length, 0), 14_705);
    assert.ok(transcript.tables.every((table) => table.cells.every((cell) => cell.state === "UNENTERED" && cell.printedValue === null)));
  }
});

test("transcription artifact admission bounds bytes before JSON materialization", () => {
  assert.throws(
    () => parseTp1538TranscriptionArtifact(new Uint8Array(MAX_TP1538_TRANSCRIPTION_ARTIFACT_BYTES + 1)),
    /byte length/i,
  );
  assert.throws(() => parseTp1538TranscriptionArtifact(Buffer.from("{\"invalid\":")), /UTF-8 JSON/i);
});

test("the manual-entry CLI binds each decision to its declared source page and preserves printed spelling", () => {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-entry-"));
  const transcriptPath = join(scratch, "transcript.json");
  writeFileSync(transcriptPath, `${JSON.stringify(createTp1538TranscriptionTemplate({
    transcriptionId: "TP1538_ENTRY_TEST",
    entrantId: "ENTRY_TEST",
    isolationSessionId: "entry-test",
  }), null, 2)}\n`);
  const entry = JSON.stringify([{ tableId: "CX_BASE", coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -25 }, state: "AVAILABLE", printedValue: "31415.92650" }]);
  execFileSync(process.execPath, ["scripts/apply-tp1538-manual-entries.mjs", "--transcript", transcriptPath, "--pdf-page", "51", "--entries-json", entry]);
  assert.equal(JSON.parse(readFileSync(transcriptPath, "utf8")).tables[0].cells[0].printedValue, "31415.92650");
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/apply-tp1538-manual-entries.mjs", "--transcript", transcriptPath, "--pdf-page", "52", "--entries-json", entry]),
    /status|source page|declared/i,
  );
});

test("the freeze CLI writes one immutable digest-named complete transcript without mutating its draft", () => {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-freeze-"));
  const draftPath = join(scratch, "draft.json");
  const draft = createTp1538TranscriptionTemplate({
    transcriptionId: "TP1538_FREEZE_TEST",
    entrantId: "ISOLATED_FREEZE_TEST",
    isolationSessionId: "freeze-test",
  });
  for (const table of draft.tables) {
    const inventory = TP1538_TABLE_INVENTORY.find(({ id }) => id === table.tableId);
    for (const cell of table.cells) cell.state = cell.coordinate.alphaDeg > inventory.alphaValidityDeg[1] ? "OUT_OF_DOMAIN" : "PRINTED_BLANK";
  }
  const draftBytes = `${JSON.stringify(draft)}\n`;
  writeFileSync(draftPath, draftBytes);
  const report = JSON.parse(execFileSync(process.execPath, [
    "scripts/freeze-tp1538-transcription.mjs",
    "--input", draftPath,
    "--output-directory", scratch,
  ], { encoding: "utf8" }));
  assert.match(report.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.output, join(scratch, `${report.contentSha256}.json`));
  assert.equal(statSync(report.output).mode & 0o777, 0o444);
  assert.equal(readFileSync(draftPath, "utf8"), draftBytes);
  const frozen = parseTp1538TranscriptionArtifact(readFileSync(report.output));
  assert.equal(frozen.transcription.status, "COMPLETE");
  assert.equal(frozen.transcription.contentSha256, report.contentSha256);
  assert.throws(() => execFileSync(process.execPath, [
    "scripts/freeze-tp1538-transcription.mjs",
    "--input", draftPath,
    "--output-directory", scratch,
  ]), /status|exist/i);
});

test("transcription admission rejects unknown fields, duplicate coordinates and non-source methods", () => {
  const valid = createTp1538TranscriptionTemplate({
    transcriptionId: "TP1538_A_TEST",
    entrantId: "ISOLATED_TEST",
    isolationSessionId: "session-a",
  });
  valid.tables[0].cells[0] = {
    ...valid.tables[0].cells[0],
    state: "AVAILABLE",
    printedValue: "31415.92650",
  };

  const unknown = structuredClone(valid);
  unknown.tables[0].cells[0].note = "not governed";
  assert.throws(() => validateTp1538Transcription(unknown, { allowUnentered: true }), /exact keys/);

  const duplicate = structuredClone(valid);
  duplicate.tables[0].cells[1].coordinate = structuredClone(duplicate.tables[0].cells[0].coordinate);
  assert.throws(() => validateTp1538Transcription(duplicate, { allowUnentered: true }), /coordinate|ordering/);

  const ocr = structuredClone(valid);
  ocr.method = "OCR";
  assert.throws(() => validateTp1538Transcription(ocr, { allowUnentered: true }), /manual source-crop/);

  for (const malformedValue of ["1", "1e-3", ".", "NaN"]) {
    const malformed = structuredClone(valid);
    malformed.tables[0].cells[0].printedValue = malformedValue;
    assert.throws(() => validateTp1538Transcription(malformed, { allowUnentered: true }), /printed decimal/);
  }
});

test("the deterministic comparator reports value, state, omission and identity conflicts", () => {
  const a = createTp1538TranscriptionTemplate({ transcriptionId: "TP1538_A_TEST", entrantId: "A", isolationSessionId: "a" });
  const b = createTp1538TranscriptionTemplate({ transcriptionId: "TP1538_B_TEST", entrantId: "B", isolationSessionId: "b" });
  a.tables[0].cells[0] = { ...a.tables[0].cells[0], state: "AVAILABLE", printedValue: "31415.92650" };
  b.tables[0].cells[0] = { ...b.tables[0].cells[0], state: "AVAILABLE", printedValue: "31415.9265" };
  a.tables[0].cells[1] = { ...a.tables[0].cells[1], state: "PRINTED_BLANK" };
  b.tables[0].cells[1] = { ...b.tables[0].cells[1], state: "ILLEGIBLE" };
  const report = compareTp1538Transcriptions(a, b, { allowUnentered: true });
  assert.equal(report.summary.valueMismatches, 1);
  assert.equal(report.summary.stateMismatches, 1);
  assert.equal(report.summary.unenteredBoth, 14_703);
  assert.deepEqual(report.mismatches.map(({ kind }) => kind), ["VALUE", "STATE"]);

  const partial = structuredClone(b);
  partial.tables[0].cells.splice(2, 1);
  const structural = compareTp1538Transcriptions(a, partial, { allowUnentered: true });
  assert.equal(structural.summary.structuralMismatches, 1);
  assert.deepEqual(structural.mismatches[0], {
    kind: "MISSING_RIGHT",
    tableId: "CX_BASE",
    coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: 0 },
  });

  const reorderedAfterEarlierMismatch = structuredClone(b);
  reorderedAfterEarlierMismatch.tables[0].cells.splice(2, 1);
  [reorderedAfterEarlierMismatch.tables[1].cells[0], reorderedAfterEarlierMismatch.tables[1].cells[1]] =
    [reorderedAfterEarlierMismatch.tables[1].cells[1], reorderedAfterEarlierMismatch.tables[1].cells[0]];
  const multiStructural = compareTp1538Transcriptions(a, reorderedAfterEarlierMismatch, { allowUnentered: true });
  assert.deepEqual(
    multiStructural.mismatches.map(({ kind }) => kind),
    ["MISSING_RIGHT", "ORDER_RIGHT"],
  );

  const unknownTable = structuredClone(b);
  unknownTable.tables.at(-1).tableId = "UNREVIEWED_TABLE";
  const unknownStructural = compareTp1538Transcriptions(a, unknownTable, { allowUnentered: true });
  assert.deepEqual(
    unknownStructural.mismatches.map(({ kind }) => kind),
    ["UNKNOWN_TABLE_RIGHT", "MISSING_TABLE_RIGHT"],
  );

  const sameSession = structuredClone(b);
  sameSession.isolationSessionId = a.isolationSessionId;
  assert.throws(() => compareTp1538Transcriptions(a, sameSession, { allowUnentered: true }), /independent isolation sessions/);

  const pathological = structuredClone(a);
  pathological.tables = Array.from({ length: MAX_TP1538_COMPARISON_MISMATCHES + 1 }, (_, index) => ({ tableId: `UNKNOWN_${index}`, cells: [] }));
  assert.throws(
    () => compareTp1538Transcriptions(pathological, b, { allowUnentered: true }),
    /closed mismatch bound/i,
  );
});

function blankComplete(identity) {
  const draft = createTp1538TranscriptionTemplate(identity);
  for (const table of draft.tables) {
    const inventory = TP1538_TABLE_INVENTORY.find(({ id }) => id === table.tableId);
    for (const cell of table.cells) cell.state = cell.coordinate.alphaDeg > inventory.alphaValidityDeg[1] ? "OUT_OF_DOMAIN" : "PRINTED_BLANK";
  }
  return completeTp1538Transcription(draft);
}

test("adjudication binds every cell to exact page/crop and transcript identities", () => {
  const a = blankComplete({ transcriptionId: "TP1538_A_TEST", entrantId: "A", isolationSessionId: "a" });
  const b = blankComplete({ transcriptionId: "TP1538_B_TEST", entrantId: "B", isolationSessionId: "b" });
  a.tables[0].cells[0].state = b.tables[0].cells[0].state = "AVAILABLE";
  a.tables[0].cells[0].printedValue = b.tables[0].cells[0].printedValue = "31415.92650";
  const frozenA = completeTp1538Transcription({ ...a, status: "DRAFT", contentSha256: null });
  const frozenB = completeTp1538Transcription({ ...b, status: "DRAFT", contentSha256: null });
  const comparison = compareTp1538Transcriptions(frozenA, frozenB);
  const corpus = createTp1538AdjudicatedCorpus({ left: frozenA, right: frozenB, comparison, decisions: [] });
  const admitted = validateTp1538Corpus(corpus, { expectedCorpusSha256: corpus.corpusSha256 });
  assert.equal(admitted.totalCells, 14_705);
  assert.equal(corpus.tables[0].cells[0].lineage.pdfPage, 51);
  assert.match(corpus.tables[0].cells[0].lineage.cropSha256, /^[0-9a-f]{64}$/);
  assert.equal(corpus.tables[0].cells[0].lineage.resolution, "AGREED_DOUBLE_ENTRY");

  const bytes = Buffer.from(`${JSON.stringify(corpus)}\n`);
  const rawSha256 = createHash("sha256").update(bytes).digest("hex");
  const readback = parseTp1538CorpusArtifact(bytes, { expectedRawSha256: rawSha256, expectedCorpusSha256: corpus.corpusSha256 });
  assert.equal(readback.totalCells, 14_705);
  assert.equal(readback.byteLength, bytes.byteLength);
  assert.throws(
    () => parseTp1538CorpusArtifact(Buffer.from(`${JSON.stringify(corpus, null, 2)}\n`), { expectedRawSha256: rawSha256, expectedCorpusSha256: corpus.corpusSha256 }),
    /raw corpus bytes/i,
  );
  assert.throws(
    () => parseTp1538CorpusArtifact(new Uint8Array(MAX_TP1538_CORPUS_ARTIFACT_BYTES + 1)),
    /byte length/i,
  );

  const forged = structuredClone(corpus);
  forged.tables[0].cells[0].value = 27_182.818;
  forged.corpusSha256 = tp1538CorpusContentSha256(forged);
  assert.throws(() => validateTp1538Corpus(forged, { expectedCorpusSha256: corpus.corpusSha256 }), /compiled corpus identity/);

  for (const mutate of [
    (candidate) => { candidate.source.rights.distribution = "RESTRICTED"; },
    (candidate) => { candidate.sourcePages.pop(); },
    (candidate) => { [candidate.sourcePages[0], candidate.sourcePages[1]] = [candidate.sourcePages[1], candidate.sourcePages[0]]; },
    (candidate) => { [candidate.axes.alphaDeg[0], candidate.axes.alphaDeg[1]] = [candidate.axes.alphaDeg[1], candidate.axes.alphaDeg[0]]; },
    (candidate) => { candidate.tables.pop(); },
    (candidate) => { candidate.tables[0].cells.pop(); },
    (candidate) => {
      candidate.tables[0].cells[0].printedValue = "27182.81800";
      candidate.tables[0].cells[0].value = 27_182.818;
    },
    (candidate) => { candidate.tables[0].cells[0].lineage.cropSha256 = "f".repeat(64); },
    (candidate) => { candidate.tables[0].configurationId = "PAF_BLOCK_52"; },
  ]) {
    const hostile = structuredClone(corpus);
    mutate(hostile);
    hostile.corpusSha256 = tp1538CorpusContentSha256(hostile);
    assert.throws(
      () => validateTp1538Corpus(hostile, { expectedCorpusSha256: hostile.corpusSha256 }),
      /source|rights|page manifest|axes|partial|coordinate|lineage|contract identity/i,
    );
  }
});

test("comparison and final-corpus CLIs persist digest-named read-only artifacts with exact readback", () => {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-finalize-"));
  const left = blankComplete({ transcriptionId: "TP1538_A_CLI", entrantId: "A", isolationSessionId: "cli-a" });
  const right = blankComplete({ transcriptionId: "TP1538_B_CLI", entrantId: "B", isolationSessionId: "cli-b" });
  const leftPath = join(scratch, `${left.contentSha256}.json`);
  const rightPath = join(scratch, `${right.contentSha256}.json`);
  const decisionsDraftPath = join(scratch, "TEST_ONLY_SYNTHETIC-empty-decisions-draft.json");
  writeFileSync(leftPath, `${JSON.stringify(left)}\n`);
  writeFileSync(rightPath, `${JSON.stringify(right)}\n`);
  const comparison = JSON.parse(execFileSync(process.execPath, [
    "scripts/compare-tp1538-transcriptions.mjs",
    "--left", leftPath,
    "--right", rightPath,
    "--output-directory", scratch,
  ], { encoding: "utf8" }));
  assert.equal(comparison.output, join(scratch, `${comparison.contentSha256}.json`));
  assert.equal(statSync(comparison.output).mode & 0o777, 0o444);
  execFileSync(process.execPath, [
    "scripts/manage-tp1538-adjudication.mjs", "create",
    "--comparison", comparison.output,
    "--output", decisionsDraftPath,
    "--adjudicator-id", "TEST_ONLY_SYNTHETIC_ADJUDICATOR",
  ]);
  const decisions = JSON.parse(execFileSync(process.execPath, [
    "scripts/manage-tp1538-adjudication.mjs", "freeze",
    "--comparison", comparison.output,
    "--input", decisionsDraftPath,
    "--output-directory", scratch,
  ], { encoding: "utf8" }));
  const finalized = JSON.parse(execFileSync(process.execPath, [
    "scripts/finalize-tp1538-aero-corpus.mjs",
    "--left", leftPath,
    "--right", rightPath,
    "--comparison", comparison.output,
    "--decisions", decisions.output,
    "--output-directory", scratch,
  ], { encoding: "utf8" }));
  assert.equal(finalized.output, join(scratch, `${finalized.corpusSha256}.json`));
  assert.equal(statSync(finalized.output).mode & 0o777, 0o444);
  const readback = parseTp1538CorpusArtifact(readFileSync(finalized.output), {
    expectedRawSha256: finalized.rawSha256,
    expectedCorpusSha256: finalized.corpusSha256,
  });
  assert.equal(readback.totalCells, 14_705);
});

test("every mismatch requires one exact page-grounded adjudication decision", () => {
  const a = blankComplete({ transcriptionId: "TP1538_A_TEST", entrantId: "A", isolationSessionId: "a" });
  const b = blankComplete({ transcriptionId: "TP1538_B_TEST", entrantId: "B", isolationSessionId: "b" });
  a.tables[0].cells[0].state = "AVAILABLE";
  a.tables[0].cells[0].printedValue = "31415.92650";
  b.tables[0].cells[0].state = "AVAILABLE";
  b.tables[0].cells[0].printedValue = "31415.9265";
  const frozenA = completeTp1538Transcription({ ...a, status: "DRAFT", contentSha256: null });
  const frozenB = completeTp1538Transcription({ ...b, status: "DRAFT", contentSha256: null });
  const comparison = compareTp1538Transcriptions(frozenA, frozenB);
  assert.throws(() => createTp1538AdjudicatedCorpus({ left: frozenA, right: frozenB, comparison, decisions: [] }), /missing adjudication/);
  const corpus = createTp1538AdjudicatedCorpus({
    left: frozenA,
    right: frozenB,
    comparison,
    decisions: [{
      tableId: "CX_BASE",
      coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -25 },
      chosenState: "AVAILABLE",
      chosenPrintedValue: "31415.92650",
      adjudicatorId: "C",
      pdfPage: 51,
      rationale: "Re-read the printed cell in the frozen lossless crop.",
    }],
  });
  assert.equal(corpus.tables[0].cells[0].lineage.resolution, "SOURCE_ADJUDICATED");
  assert.equal(corpus.tables[0].cells[0].value, 31_415.9265);
});

test("verification-only corpus authority is absent from production source and bundles", () => {
  assert.ok(verifyTp1538AeroProductionIsolation() > 0);
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-aero-isolation-"));
  mkdirSync(join(scratch, "dist/client"), { recursive: true });
  writeFileSync(join(scratch, "dist/client/forged.js"), 'const subject = "NASA_GENERIC_F16";');
  assert.throws(() => verifyTp1538AeroProductionIsolation(scratch), /Production.*TP-1538/);
});
