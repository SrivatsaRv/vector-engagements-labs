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
  { key: "rust-tests", selected: "RUST_TESTS_SELECTED", result: "RUST_TESTS_RESULT" },
  { key: "rust-audit", selected: "RUST_AUDIT_SELECTED", result: "RUST_AUDIT_RESULT" },
  { key: "integration", selected: "INTEGRATION_SELECTED", result: "INTEGRATION_RESULT" },
  { key: "container", selected: "CONTAINER_SELECTED", result: "CONTAINER_RESULT" },
];

function requireResult(environment, name) {
  const result = environment[name];
  if (!result) throw new Error(`Required result ${name} is missing.`);
  return result;
}

export function verifyRequiredGates(environment) {
  if (requireResult(environment, "CLASSIFY_RESULT") !== "success") {
    throw new Error(`Classifier ended as ${environment.CLASSIFY_RESULT}.`);
  }
  if (requireResult(environment, "POLICY_RESULT") !== "success") {
    throw new Error(`Repository policy ended as ${environment.POLICY_RESULT}.`);
  }

  for (const gate of REQUIRED_GATES) {
    const selected = environment[gate.selected];
    const result = requireResult(environment, gate.result);
    if (selected !== "true" && selected !== "false") {
      throw new Error(`Selection ${gate.selected} must be true or false; received ${selected ?? "missing"}.`);
    }
    if (selected === "true" && result !== "success") {
      throw new Error(`Selected gate ${gate.key} ended as ${result}.`);
    }
    if (selected === "false" && result !== "skipped") {
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
