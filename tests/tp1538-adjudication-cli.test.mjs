import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_TP1538_COMPARISON_ARTIFACT_BYTES,
  TP1538_TABLE_INVENTORY,
  applyTp1538AdjudicationDecision,
  completeTp1538Transcription,
  createTp1538AdjudicationDraft,
  createTp1538TranscriptionTemplate,
  freezeTp1538AdjudicationArtifact,
  parseTp1538AdjudicationArtifact,
  parseTp1538ComparisonArtifact,
  tp1538ComparisonContentSha256,
  validateTp1538AdjudicationArtifact,
} from "../scripts/lib/tp1538-aero-corpus.mjs";

const CLI = "scripts/manage-tp1538-adjudication.mjs";
const SYNTHETIC_ADJUDICATOR = "TEST_ONLY_SYNTHETIC_ADJUDICATOR";
const VALUE_DECISION = {
  tableId: "CX_BASE",
  coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -25 },
  pdfPage: 51,
  decision: "SOURCE_READ",
  chosenState: "AVAILABLE",
  chosenPrintedValue: "1.250",
  rationale: "TEST_ONLY_SYNTHETIC source-page reread selected the left spelling.",
};
const STATE_DECISION = {
  tableId: "CX_BASE",
  coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: -10 },
  pdfPage: 52,
  decision: "SOURCE_READ",
  chosenState: "PRINTED_BLANK",
  chosenPrintedValue: null,
  rationale: "TEST_ONLY_SYNTHETIC source-page reread found an intentionally blank cell.",
};

function completeSyntheticTranscription(identity) {
  const draft = createTp1538TranscriptionTemplate(identity);
  for (const table of draft.tables) {
    const inventory = TP1538_TABLE_INVENTORY.find(({ id }) => id === table.tableId);
    for (const cell of table.cells) cell.state = cell.coordinate.alphaDeg > inventory.alphaValidityDeg[1] ? "OUT_OF_DOMAIN" : "PRINTED_BLANK";
  }
  return draft;
}

function setupSyntheticComparison() {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-adjudication-TEST_ONLY_SYNTHETIC-"));
  const leftDraft = completeSyntheticTranscription({
    transcriptionId: "TP1538_TEST_ONLY_SYNTHETIC_A",
    entrantId: "TEST_ONLY_SYNTHETIC_ENTRANT_A",
    isolationSessionId: "TEST_ONLY_SYNTHETIC_SESSION_A",
  });
  const rightDraft = completeSyntheticTranscription({
    transcriptionId: "TP1538_TEST_ONLY_SYNTHETIC_B",
    entrantId: "TEST_ONLY_SYNTHETIC_ENTRANT_B",
    isolationSessionId: "TEST_ONLY_SYNTHETIC_SESSION_B",
  });
  leftDraft.tables[0].cells[0] = { ...leftDraft.tables[0].cells[0], state: "AVAILABLE", printedValue: "1.250" };
  rightDraft.tables[0].cells[0] = { ...rightDraft.tables[0].cells[0], state: "AVAILABLE", printedValue: "1.500" };
  rightDraft.tables[0].cells[1] = { ...rightDraft.tables[0].cells[1], state: "ILLEGIBLE", printedValue: null };
  const left = completeTp1538Transcription(leftDraft);
  const right = completeTp1538Transcription(rightDraft);
  const leftPath = join(scratch, `${left.contentSha256}.json`);
  const rightPath = join(scratch, `${right.contentSha256}.json`);
  writeFileSync(leftPath, `${JSON.stringify(left)}\n`, { mode: 0o444 });
  writeFileSync(rightPath, `${JSON.stringify(right)}\n`, { mode: 0o444 });
  const comparisonReport = JSON.parse(execFileSync(process.execPath, [
    "scripts/compare-tp1538-transcriptions.mjs",
    "--left", leftPath,
    "--right", rightPath,
    "--output-directory", scratch,
  ], { encoding: "utf8" }));
  const comparisonBytes = readFileSync(comparisonReport.output);
  const comparison = parseTp1538ComparisonArtifact(comparisonBytes);
  assert.equal(comparison.comparison.mismatches.length, 2);
  return { scratch, left, right, leftPath, rightPath, comparisonPath: comparisonReport.output, comparison };
}

function runCli(arguments_) {
  return JSON.parse(execFileSync(process.execPath, [CLI, ...arguments_], { encoding: "utf8" }));
}

function createDraft(setup, adjudicatorId = SYNTHETIC_ADJUDICATOR) {
  const draftPath = join(setup.scratch, `draft-${adjudicatorId}.json`);
  const report = runCli([
    "create",
    "--comparison", setup.comparisonPath,
    "--output", draftPath,
    "--adjudicator-id", adjudicatorId,
  ]);
  return { draftPath, report };
}

test("the governed CLI creates, applies, validates and freezes exact synthetic mismatch decisions", () => {
  const setup = setupSyntheticComparison();
  const { draftPath, report: created } = createDraft(setup);
  assert.deepEqual({ mismatches: created.mismatches, resolved: created.resolved, unresolved: created.unresolved }, { mismatches: 2, resolved: 0, unresolved: 2 });
  const empty = JSON.parse(readFileSync(draftPath, "utf8"));
  assert.ok(empty.decisions.every((slot) => slot.decision === "UNDECIDED" && slot.chosenState === null && slot.chosenPrintedValue === null && slot.rationale === null));

  assert.deepEqual(runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(VALUE_DECISION)]), {
    state: "updated", draft: draftPath, resolved: 1, unresolved: 1,
  });
  assert.deepEqual(runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(STATE_DECISION)]), {
    state: "updated", draft: draftPath, resolved: 2, unresolved: 0,
  });
  assert.deepEqual(runCli(["validate", "--comparison", setup.comparisonPath, "--input", draftPath]), {
    state: "valid", input: draftPath, resolved: 2, unresolved: 0,
  });
  const draftBytes = readFileSync(draftPath, "utf8");
  const frozen = runCli(["freeze", "--comparison", setup.comparisonPath, "--input", draftPath, "--output-directory", setup.scratch]);
  assert.equal(statSync(frozen.output).mode & 0o777, 0o444);
  assert.equal(readFileSync(draftPath, "utf8"), draftBytes);
  assert.equal(frozen.output, join(setup.scratch, `${frozen.contentSha256}.json`));
  const readback = parseTp1538AdjudicationArtifact(readFileSync(frozen.output), {
    comparison: setup.comparison.comparison,
    comparisonRawSha256: setup.comparison.rawSha256,
    expectedContentSha256: frozen.contentSha256,
    expectedRawSha256: frozen.rawSha256,
  });
  assert.deepEqual({ resolved: readback.resolved, unresolved: readback.unresolved }, { resolved: 2, unresolved: 0 });
  assert.throws(() => runCli(["freeze", "--comparison", setup.comparisonPath, "--input", draftPath, "--output-directory", setup.scratch]), /exist|EEXIST/i);

});

test("the finalizer accepts the frozen synthetic decision artifact and rejects an entrant adjudicator", () => {
  const setup = setupSyntheticComparison();
  const { draftPath } = createDraft(setup);
  for (const decision of [VALUE_DECISION, STATE_DECISION]) runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(decision)]);
  const frozen = runCli(["freeze", "--comparison", setup.comparisonPath, "--input", draftPath, "--output-directory", setup.scratch]);
  const finalized = JSON.parse(execFileSync(process.execPath, [
    "scripts/finalize-tp1538-aero-corpus.mjs",
    "--left", setup.leftPath,
    "--right", setup.rightPath,
    "--comparison", setup.comparisonPath,
    "--decisions", frozen.output,
    "--output-directory", setup.scratch,
  ], { encoding: "utf8" }));
  assert.equal(finalized.mismatches, 2);
  assert.equal(statSync(finalized.output).mode & 0o777, 0o444);

  const entrantDraft = createTp1538AdjudicationDraft({
    comparison: setup.comparison.comparison,
    comparisonRawSha256: setup.comparison.rawSha256,
    adjudicatorId: setup.left.entrantId,
  });
  let entrantArtifact = applyTp1538AdjudicationDecision(entrantDraft, VALUE_DECISION, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256 });
  entrantArtifact = applyTp1538AdjudicationDecision(entrantArtifact, STATE_DECISION, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256 });
  entrantArtifact = freezeTp1538AdjudicationArtifact(entrantArtifact, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256 });
  const entrantPath = join(setup.scratch, `${entrantArtifact.contentSha256}.json`);
  writeFileSync(entrantPath, `${JSON.stringify(entrantArtifact)}\n`, { mode: 0o444 });
  assert.throws(() => execFileSync(process.execPath, [
    "scripts/finalize-tp1538-aero-corpus.mjs",
    "--left", setup.leftPath,
    "--right", setup.rightPath,
    "--comparison", setup.comparisonPath,
    "--decisions", entrantPath,
    "--output-directory", setup.scratch,
  ]), /distinct identified adjudicator/i);
});

test("hostile coordinates, pages, decision fields and coverage fail closed", () => {
  const setup = setupSyntheticComparison();
  const { draftPath } = createDraft(setup);
  const hostile = [
    [{ ...VALUE_DECISION, pdfPage: 52 }, /source page/i],
    [{ ...VALUE_DECISION, coordinate: { alphaDeg: -20, betaDeg: -30, stabilatorDeg: 0 }, pdfPage: 53 }, /comparator mismatch/i],
    [{ ...VALUE_DECISION, decision: "PREFER_LEFT" }, /decision type/i],
    [{ ...VALUE_DECISION, chosenState: "APPROVED" }, /state/i],
    [{ ...VALUE_DECISION, chosenPrintedValue: null }, /printed decimal|available value/i],
    [{ ...VALUE_DECISION, rationale: "too short" }, /rationale/i],
  ];
  for (const [decision, expected] of hostile) {
    assert.throws(() => runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(decision)]), expected);
  }
  runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(VALUE_DECISION)]);
  assert.throws(() => runCli(["apply", "--comparison", setup.comparisonPath, "--draft", draftPath, "--decision-json", JSON.stringify(VALUE_DECISION)]), /append-only|overwrite/i);
  assert.throws(() => runCli(["validate", "--comparison", setup.comparisonPath, "--input", draftPath]), /unresolved/i);

  const draft = createTp1538AdjudicationDraft({ comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256, adjudicatorId: SYNTHETIC_ADJUDICATOR });
  const missing = structuredClone(draft);
  missing.decisions.pop();
  assert.throws(() => validateTp1538AdjudicationArtifact(missing, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256, allowUnresolved: true }), /missing or extra/i);
  const extra = structuredClone(draft);
  extra.decisions.push(structuredClone(extra.decisions[0]));
  assert.throws(() => validateTp1538AdjudicationArtifact(extra, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256, allowUnresolved: true }), /missing or extra/i);
  const duplicate = structuredClone(draft);
  duplicate.decisions[1] = structuredClone(duplicate.decisions[0]);
  assert.throws(() => validateTp1538AdjudicationArtifact(duplicate, { comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256, allowUnresolved: true }), /duplicated/i);
  assert.throws(() => createTp1538AdjudicationDraft({ comparison: setup.comparison.comparison, comparisonRawSha256: setup.comparison.rawSha256, adjudicatorId: "invalid adjudicator" }), /adjudicator identity/i);
});

test("stale, symlinked, oversized and raw or canonical tampering is rejected", () => {
  const setup = setupSyntheticComparison();
  const { draftPath } = createDraft(setup);
  const comparisonLink = join(setup.scratch, "comparison-link.json");
  symlinkSync(setup.comparisonPath, comparisonLink);
  assert.throws(() => execFileSync(process.execPath, [CLI, "validate", "--comparison", comparisonLink, "--input", draftPath]), /symbolic-link/i);

  const oversized = join(setup.scratch, "oversized.json");
  writeFileSync(oversized, Buffer.alloc(MAX_TP1538_COMPARISON_ARTIFACT_BYTES + 1));
  chmodSync(oversized, 0o444);
  assert.throws(() => execFileSync(process.execPath, [CLI, "validate", "--comparison", oversized, "--input", draftPath]), /byte length/i);

  const staleComparison = structuredClone(setup.comparison.comparison);
  staleComparison.rightTranscriptionId = "TP1538_TEST_ONLY_SYNTHETIC_STALE";
  const staleDigest = tp1538ComparisonContentSha256(staleComparison);
  const stalePath = join(setup.scratch, `${staleDigest}.json`);
  writeFileSync(stalePath, `${JSON.stringify(staleComparison)}\n`, { mode: 0o444 });
  assert.throws(() => execFileSync(process.execPath, [CLI, "validate", "--comparison", stalePath, "--input", draftPath]), /stale|tampered/i);

  chmodSync(setup.comparisonPath, 0o644);
  writeFileSync(setup.comparisonPath, `${JSON.stringify(setup.comparison.comparison, null, 2)}\n`);
  chmodSync(setup.comparisonPath, 0o444);
  assert.throws(() => execFileSync(process.execPath, [CLI, "validate", "--comparison", setup.comparisonPath, "--input", draftPath]), /stale|tampered/i);

  const originalComparisonBytes = Buffer.from(`${JSON.stringify(setup.comparison.comparison)}\n`);
  const parsedComparison = parseTp1538ComparisonArtifact(originalComparisonBytes);
  let artifact = createTp1538AdjudicationDraft({ comparison: parsedComparison.comparison, comparisonRawSha256: parsedComparison.rawSha256, adjudicatorId: SYNTHETIC_ADJUDICATOR });
  artifact = applyTp1538AdjudicationDecision(artifact, VALUE_DECISION, { comparison: parsedComparison.comparison, comparisonRawSha256: parsedComparison.rawSha256 });
  artifact = applyTp1538AdjudicationDecision(artifact, STATE_DECISION, { comparison: parsedComparison.comparison, comparisonRawSha256: parsedComparison.rawSha256 });
  artifact = freezeTp1538AdjudicationArtifact(artifact, { comparison: parsedComparison.comparison, comparisonRawSha256: parsedComparison.rawSha256 });
  const frozenBytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
  const frozenRawSha256 = createHash("sha256").update(frozenBytes).digest("hex");
  assert.throws(() => parseTp1538AdjudicationArtifact(Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`), {
    comparison: parsedComparison.comparison,
    comparisonRawSha256: parsedComparison.rawSha256,
    expectedRawSha256: frozenRawSha256,
  }), /raw-byte identity/i);
  const canonicallyTampered = structuredClone(artifact);
  canonicallyTampered.decisions[0].rationale = "TEST_ONLY_SYNTHETIC canonical tamper must not retain the old digest.";
  assert.throws(() => parseTp1538AdjudicationArtifact(Buffer.from(`${JSON.stringify(canonicallyTampered)}\n`), {
    comparison: parsedComparison.comparison,
    comparisonRawSha256: parsedComparison.rawSha256,
  }), /digest/i);
});
