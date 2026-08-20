import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";

const POLICY_PATH = new URL("../governance/issue-closure-governance.v1.json", import.meta.url);
const CHECKLIST_PATTERN = /<!--\s*vector-completion-review\s*\n([\s\S]*?)\n\s*-->/i;
const CLOSING_REFERENCE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*(?:https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/)?#?(\d+)\b/gi;

export const closurePolicy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
const parentsByNumber = new Map(closurePolicy.governedParents.map((parent) => [parent.number, parent]));

const invariant = (value, message) => assert.ok(value, message);

function requiredValues(values, field, parentIssue) {
  invariant(Array.isArray(values) && values.length > 0, `Completion checklist for #${parentIssue} requires ${field}.`);
  const names = values.map((value) => value?.name ?? value?.id);
  invariant(names.every((name) => typeof name === "string" && name.length > 0), `Completion checklist for #${parentIssue} has an invalid ${field} entry.`);
  invariant(new Set(names).size === names.length, `Completion checklist for #${parentIssue} repeats a ${field} entry.`);
  return names;
}

function parseChecklist(body, parentIssue) {
  const match = body.match(CHECKLIST_PATTERN);
  invariant(match, `Closing governed parent issue #${parentIssue} requires a machine-readable completion checklist.`);
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`Completion checklist for #${parentIssue} must contain valid JSON.`);
  }
}

function verifyCompletionChecklist(body, parent) {
  const checklist = parseChecklist(body, parent.number);
  invariant(checklist.parentIssue === parent.number, `Completion checklist parentIssue must be #${parent.number}.`);
  const criteria = requiredValues(checklist.acceptanceCriteria, "acceptanceCriteria", parent.number);
  for (const criterion of checklist.acceptanceCriteria) {
    invariant(typeof criterion.evidence === "string" && criterion.evidence.trim(), `Completion checklist criterion ${criterion.id} for #${parent.number} requires evidence.`);
  }
  const missingCriteria = parent.requiredAcceptanceCriteria.filter((criterion) => !criteria.includes(criterion));
  invariant(!missingCriteria.length, `Completion checklist for #${parent.number} is missing required acceptance criteria: ${missingCriteria.join(", ")}.`);
  const layers = requiredValues(checklist.testLayers, "testLayers", parent.number);
  for (const layer of checklist.testLayers) {
    invariant(layer.result === "passed", `Completion checklist test layer ${layer.name} for #${parent.number} must have result passed.`);
    invariant(typeof layer.evidence === "string" && layer.evidence.trim(), `Completion checklist test layer ${layer.name} for #${parent.number} requires evidence.`);
  }
  const missingLayers = parent.requiredTestLayers.filter((layer) => !layers.includes(layer));
  invariant(!missingLayers.length, `Completion checklist for #${parent.number} is missing required test layers: ${missingLayers.join(", ")}.`);
  invariant(Array.isArray(checklist.omittedLayers), `Completion checklist for #${parent.number} must declare omittedLayers.`);
  invariant(!checklist.omittedLayers.length, `Completion review for #${parent.number} cannot omit required test layers.`);
}

function proseWithoutCode(body) {
  return body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

export function classifyPullRequestClosure(event) {
  if (!event?.pull_request) return { kind: "not-applicable", governedParentIssues: [] };
  const body = event.pull_request.body ?? "";
  const labels = new Set((event.pull_request.labels ?? []).map((label) => label.name));
  const uniqueParents = [...new Set([...proseWithoutCode(body).matchAll(CLOSING_REFERENCE)].map((match) => Number(match[1])).filter((issue) => parentsByNumber.has(issue)))].sort((left, right) => left - right);
  if (!uniqueParents.length) return { kind: "slice", governedParentIssues: [] };
  invariant(labels.has(closurePolicy.completionReviewLabel), `Feature slice PR cannot close governed parent issue #${uniqueParents[0]}; use Refs #${uniqueParents[0]} and leave the parent open. Only a ${closurePolicy.completionReviewLabel} PR may close it.`);
  invariant(uniqueParents.length === 1, "A completion-review PR may close exactly one governed parent issue.");
  verifyCompletionChecklist(body, parentsByNumber.get(uniqueParents[0]));
  return { kind: "completion-review", governedParentIssues: uniqueParents };
}

function run() {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const result = classifyPullRequestClosure(event);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `kind=${result.kind}\ngoverned_parent_issues=${result.governedParentIssues.join(",")}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) run();
