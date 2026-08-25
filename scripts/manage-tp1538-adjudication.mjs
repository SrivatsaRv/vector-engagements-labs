import { createHash } from "node:crypto";
import { chmodSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES,
  MAX_TP1538_COMPARISON_ARTIFACT_BYTES,
  applyTp1538AdjudicationDecision,
  assertTp1538DigestNamedReadOnlyArtifact,
  createTp1538AdjudicationDraft,
  freezeTp1538AdjudicationArtifact,
  parseTp1538AdjudicationArtifact,
  parseTp1538ComparisonArtifact,
  readTp1538BoundedRegularFile,
  validateTp1538AdjudicationArtifact,
} from "./lib/tp1538-aero-corpus.mjs";

const command = process.argv[2];

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required.`);
  return process.argv[index + 1];
}

function readComparison() {
  const filePath = resolve(argument("--comparison"));
  const { bytes, mode } = readTp1538BoundedRegularFile(
    filePath,
    MAX_TP1538_COMPARISON_ARTIFACT_BYTES,
    "TP-1538 immutable comparison artifact",
    { requireReadOnly: true },
  );
  const parsed = parseTp1538ComparisonArtifact(bytes);
  assertTp1538DigestNamedReadOnlyArtifact(filePath, parsed.contentSha256, mode, "TP-1538 immutable comparison artifact");
  return { filePath, ...parsed };
}

function readAdjudicationFile(filePath, comparison, { allowUnresolved = false, requireReadOnly = false } = {}) {
  const { bytes, mode } = readTp1538BoundedRegularFile(
    filePath,
    MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES,
    "TP-1538 adjudication artifact",
    { requireReadOnly },
  );
  const parsed = parseTp1538AdjudicationArtifact(bytes, {
    comparison: comparison.comparison,
    comparisonRawSha256: comparison.rawSha256,
    allowUnresolved,
  });
  if (requireReadOnly) assertTp1538DigestNamedReadOnlyArtifact(filePath, parsed.artifact.contentSha256, mode, "TP-1538 frozen adjudication artifact");
  return { filePath, mode, ...parsed };
}

function readAdjudication(name, comparison, options) {
  return readAdjudicationFile(resolve(argument(name)), comparison, options);
}

function parseDecision() {
  const source = argument("--decision-json");
  if (Buffer.byteLength(source, "utf8") > 16 * 1024) throw new Error("--decision-json exceeds its closed byte bound.");
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("--decision-json must be exact JSON.");
  }
}

function writeDraft(filePath, artifact) {
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  if (bytes.byteLength > MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES) throw new Error("TP-1538 adjudication draft exceeds its closed byte bound.");
  writeFileSync(filePath, bytes, { flag: "wx", mode: 0o600 });
}

if (command === "create") {
  const comparison = readComparison();
  const output = resolve(argument("--output"));
  const artifact = createTp1538AdjudicationDraft({
    comparison: comparison.comparison,
    comparisonRawSha256: comparison.rawSha256,
    adjudicatorId: argument("--adjudicator-id"),
  });
  writeDraft(output, artifact);
  const readback = readAdjudication("--output", comparison, { allowUnresolved: true });
  process.stdout.write(`${JSON.stringify({
    state: "created",
    output,
    comparisonContentSha256: artifact.comparison.contentSha256,
    comparisonRawSha256: artifact.comparison.rawSha256,
    mismatches: artifact.decisions.length,
    resolved: readback.resolved,
    unresolved: readback.unresolved,
  })}\n`);
} else if (command === "apply") {
  const comparison = readComparison();
  const draft = readAdjudication("--draft", comparison, { allowUnresolved: true });
  const artifact = applyTp1538AdjudicationDecision(draft.artifact, parseDecision(), {
    comparison: comparison.comparison,
    comparisonRawSha256: comparison.rawSha256,
  });
  const nextFilePath = `${draft.filePath}.next-${process.pid}`;
  let pending = false;
  try {
    writeDraft(nextFilePath, artifact);
    pending = true;
    renameSync(nextFilePath, draft.filePath);
    pending = false;
  } finally {
    if (pending) unlinkSync(nextFilePath);
  }
  const report = validateTp1538AdjudicationArtifact(artifact, {
    comparison: comparison.comparison,
    comparisonRawSha256: comparison.rawSha256,
    allowUnresolved: true,
  });
  process.stdout.write(`${JSON.stringify({ state: "updated", draft: draft.filePath, resolved: report.resolved, unresolved: report.unresolved })}\n`);
} else if (command === "validate") {
  const comparison = readComparison();
  const report = readAdjudication("--input", comparison);
  process.stdout.write(`${JSON.stringify({ state: "valid", input: report.filePath, resolved: report.resolved, unresolved: report.unresolved })}\n`);
} else if (command === "freeze") {
  const comparison = readComparison();
  const draft = readAdjudication("--input", comparison);
  const artifact = freezeTp1538AdjudicationArtifact(draft.artifact, {
    comparison: comparison.comparison,
    comparisonRawSha256: comparison.rawSha256,
  });
  const output = resolve(argument("--output-directory"), `${artifact.contentSha256}.json`);
  const bytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
  if (bytes.byteLength > MAX_TP1538_ADJUDICATION_ARTIFACT_BYTES) throw new Error("TP-1538 frozen adjudication exceeds its closed byte bound.");
  writeFileSync(output, bytes, { flag: "wx", mode: 0o444 });
  chmodSync(output, 0o444);
  const rawSha256 = createHash("sha256").update(bytes).digest("hex");
  const readback = readAdjudicationFile(output, comparison, { requireReadOnly: true });
  if (readback.filePath !== output || readback.rawSha256 !== rawSha256 || readback.artifact.contentSha256 !== artifact.contentSha256) throw new Error("Frozen TP-1538 adjudication failed exact readback.");
  process.stdout.write(`${JSON.stringify({
    state: "frozen",
    output,
    contentSha256: artifact.contentSha256,
    rawSha256,
    byteLength: bytes.byteLength,
    decisions: artifact.decisions.length,
  })}\n`);
} else {
  throw new Error("Usage: manage-tp1538-adjudication.mjs <create|apply|validate|freeze> with the command-specific required arguments.");
}
