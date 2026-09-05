import { pathToFileURL } from "node:url";

export const REQUIRED_GATES = [
  { key: "quality", selected: "QUALITY_SELECTED", result: "QUALITY_RESULT" },
  {
    key: "security-js",
    selected: "SECURITY_JS_SELECTED",
    result: "SECURITY_JS_RESULT",
  },
  { key: "web-tests", selected: "WEB_TESTS_SELECTED", result: "WEB_TESTS_RESULT" },
  {
    key: "browser-tests",
    selected: "BROWSER_TESTS_SELECTED",
    result: "BROWSER_TESTS_RESULT",
  },
  {
    key: "source-evidence",
    selected: "SOURCE_EVIDENCE_SELECTED",
    result: "SOURCE_EVIDENCE_RESULT",
  },
  { key: "rust-tests", selected: "RUST_TESTS_SELECTED", result: "RUST_TESTS_RESULT" },
  { key: "rust-audit", selected: "RUST_AUDIT_SELECTED", result: "RUST_AUDIT_RESULT" },
  { key: "integration", selected: "INTEGRATION_SELECTED", result: "INTEGRATION_RESULT" },
  { key: "container", selected: "CONTAINER_SELECTED", result: "CONTAINER_RESULT" },
];

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export const REQUIRED_GATE_CONTRACT = deepFreeze({
  schemaVersion: "vector.required-pr-gate-decision.v1",
  mandatorySuccessResults: [
    { field: "CLASSIFY_RESULT", label: "Classifier" },
    { field: "POLICY_RESULT", label: "Repository policy" },
  ],
  reviewKinds: ["slice", "completion-review", "not-applicable"],
  selectionValues: ["true", "false"],
  selectedTerminalResult: "success",
  unselectedTerminalResult: "skipped",
  gates: REQUIRED_GATES,
});

export function verifyRequiredGates(environment) {
  const requireResult = (name) => {
    const result = environment[name];
    if (!result) throw new Error(`Required result ${name} is missing.`);
    return result;
  };
  for (const { field, label } of REQUIRED_GATE_CONTRACT.mandatorySuccessResults) {
    if (requireResult(field) !== REQUIRED_GATE_CONTRACT.selectedTerminalResult) {
      throw new Error(`${label} ended as ${environment[field]}.`);
    }
  }
  const reviewKind = requireResult("PR_REVIEW_KIND");
  if (!REQUIRED_GATE_CONTRACT.reviewKinds.includes(reviewKind)) {
    throw new Error(`PR review kind must be slice, completion-review, or not-applicable; received ${reviewKind}.`);
  }

  for (const gate of REQUIRED_GATE_CONTRACT.gates) {
    const selected = environment[gate.selected];
    const result = requireResult(gate.result);
    if (!REQUIRED_GATE_CONTRACT.selectionValues.includes(selected)) {
      throw new Error(`Selection ${gate.selected} must be true or false; received ${selected ?? "missing"}.`);
    }
    if (selected === "true" && result !== REQUIRED_GATE_CONTRACT.selectedTerminalResult) {
      throw new Error(`Selected gate ${gate.key} ended as ${result}.`);
    }
    if (selected === "false" && result !== REQUIRED_GATE_CONTRACT.unselectedTerminalResult) {
      throw new Error(`Unselected gate ${gate.key} ended as ${result}; expected skipped.`);
    }
  }
}

function run() {
  try {
    verifyRequiredGates(process.env);
    process.stdout.write("All selected gates passed and all unselected gates were skipped.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
