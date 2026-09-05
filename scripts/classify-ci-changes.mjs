import { appendFileSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function normalizeRepositoryPath(value, label = "repository path") {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
  invariant(value === value.normalize("NFC"), `${label} must use NFC Unicode normalization.`);
  invariant(!isAbsolute(value), `${label} must be relative.`);
  invariant(!value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value), `${label} must not contain controls and must use normalized POSIX separators.`);
  const parts = value.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".."), `${label} must be a normalized repository path.`);
  return value;
}

export function parseNameStatusZ(raw) {
  const decoded = Buffer.isBuffer(raw) ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : String(raw);
  const fields = decoded.split("\u0000");
  if (fields.at(-1) === "") fields.pop();
  const operations = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    invariant(/^(?:[AMDTUXB]|R\d{1,3}|C\d{1,3})$/u.test(status), `Invalid diff status ${status || "missing"}.`);
    if (status.startsWith("R") || status.startsWith("C")) {
      invariant(index + 1 < fields.length, `Truncated ${status} diff record.`);
      const oldPath = normalizeRepositoryPath(fields[index++], "old diff path");
      const path = normalizeRepositoryPath(fields[index++], "new diff path");
      operations.push({ status, oldPath, path });
    } else {
      invariant(index < fields.length, `Truncated ${status} diff record.`);
      operations.push({ status, oldPath: null, path: normalizeRepositoryPath(fields[index++], "diff path") });
    }
  }
  return operations;
}

const patternInventory = (...patterns) => patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags }));
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export const CLASSIFIER_DECISION_CONTRACT = deepFreeze({
  schemaVersion: "vector.ci-change-classifier-decision.v1",
  resultDefaults: {
    policy: true,
    quality: false,
    security_js: false,
    web_tests: false,
    browser_tests: false,
    source_evidence: false,
    rust_tests: false,
    rust_audit: false,
    integration: false,
    container: false,
  },
  groups: [
    {
      id: "POLICY_ONLY",
      effect: "POLICY_ONLY_SHORT_CIRCUIT",
      patterns: patternInventory(
        /^\.codex\//,
        /^docs\//,
        /^(?:AGENTS|CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|GOVERNANCE|NOTICE|README|SECURITY)\.md$/,
        /^(?:LICENSE|NOTICE)$/,
        /^\.github\/(?:CODEOWNERS|pull_request_template\.md)$/,
        /^governance\/runtime-stub-ledger\.v1\.json$/,
        /^governance\/issue-closure-governance\.v1\.json$/,
        /^scripts\/verify-runtime-stub-ledger\.mjs$/,
        /^scripts\/verify-pr-closure-governance\.mjs$/,
        /^tests\/(?:ci-change-classifier|deployment-config|harness-execution|persona-skills|pr-closure-governance|required-pr-gate|runtime-stub-ledger|security-config)\.test\.mjs$/,
      ),
    },
    {
      id: "WORKFLOW_CONTROL",
      effect: "ALL_GATES_SHORT_CIRCUIT",
      patterns: patternInventory(
        /^\.github\/workflows\//,
        /^\.github\/dependabot\.yml$/,
        /^\.node-version$/,
        /^Makefile$/,
        /^(?:package|package-lock)\.json$/,
        /^governance\/contract-doc-ownership\.v1\.json$/,
        /^scripts\/classify-ci-changes\.mjs$/,
        /^scripts\/contract-doc-probes\//,
        /^scripts\/lib\/contract-doc-impact\.mjs$/,
        /^scripts\/lib\/git-name-status\.mjs$/,
        /^scripts\/lib\/toolchain-authority\.mjs$/,
        /^scripts\/run-managed-server\.mjs$/,
        /^scripts\/verify-contract-doc-impact\.mjs$/,
        /^scripts\/verify-toolchain\.mjs$/,
        /^tests\/contract-doc-impact\.test\.mjs$/,
        /^tests\/toolchain-authority\.test\.mjs$/,
      ),
    },
    {
      id: "SOURCE_EVIDENCE_RENDERING",
      effect: ["source_evidence"],
      patterns: patternInventory(
        /^governance\/generic-sensor-verification-sources\//,
        /^governance\/nasa-historical-f16-store-source\//,
        /^scripts\/(?:generate-generic-sensor-source-manifest|generate-nasa-f16-store-source-evidence|install-pinned-poppler-ubuntu|verify-generic-sensor-source-bundle|verify-nasa-f16-store-source)\.mjs$/,
        /^scripts\/(?:pinned-pdftoppm-wrapper\.sh\.in|pinned-poppler-ubuntu\.Dockerfile)$/,
        /^scripts\/lib\/generic-sensor-source-verifier\.mjs$/,
        /^tests\/(?:generic-sensor-source-bundle|nasa-f16-store-source)\.test\.mjs$/,
      ),
    },
    {
      id: "WEB_SOURCE",
      effect: ["quality", "web_tests"],
      patterns: patternInventory(
        /^config\/deployment-capabilities\.json$/,
        /^(?:app|components|content|lib|public|scripts|tests|worker)\//,
        /^fixtures\/public-reference\//,
        /^(?:blog-content\.d\.ts|cloudflare-env\.d\.ts|drizzle\.config\.ts|eslint\.config\.mjs|next\.config\.ts|postcss\.config\.mjs|vite-env\.d\.ts|vite\.config\.ts)$/,
        /^(?:package|package-lock)\.json$/,
        /^tsconfig\.json$/,
      ),
    },
    {
      id: "BROWSER_SURFACE",
      effect: ["browser_tests"],
      patterns: patternInventory(
        /^config\/deployment-capabilities\.json$/,
        /^fixtures\/model-packs\//,
        /^(?:app|components)\//,
        /^lib\/engine\//,
        /^lib\/frontend\//,
        /^lib\/record\//,
        /^lib\/runtime\//,
        /^lib\/geospatial\/(?:contracts|digest|environment-pack|environment-sampler\.worker|geodesy|synthetic-environment|terrain|vertical-datums)\.ts$/,
        /^lib\/(?:canonical-json|information-state|installations|map-layer-contracts|mission-admission|object-catalog|scenario-draft|scenario-package|scenario-spatial|scenario-validation|scenarios|simulation|study-areas|tactical-symbol-contract|tactical-symbol-library|tactical-symbol-markup|vector-map)\.ts$/,
        /^lib\/security\/browser-response\.ts$/,
        /^scripts\/(?:browser-worker-assets|build-runtime-bundles|verify-browser-worker)\.(?:c|m)?tsx?$/,
        /^scripts\/prepare-maplibre-assets\.mjs$/,
        /^scripts\/run-browser-contracts\.mjs$/,
        /^tests\/(?:browser-runtime|browser-worker-assets)\.test\.(?:c|m)?tsx?$/,
        /^tests\/(?:browser|component)\//,
        /^(?:playwright|vitest)\.config\.ts$/,
      ),
    },
    {
      id: "JAVASCRIPT_SECURITY",
      effect: ["security_js"],
      patterns: patternInventory(
        /\.(?:c|m)?js$/,
        /\.(?:c|m)?tsx?$/,
        /^(?:package|package-lock)\.json$/,
        /^Dockerfile$/,
        /^\.github\//,
      ),
    },
    {
      id: "RUST_CONTRACT",
      effect: ["rust_tests", "web_tests"],
      patterns: patternInventory(
        /^engine-rust\//,
        /^fixtures\/public-reference\//,
        /^verification-rust\/generic-aam\//,
        /^verification-rust\/tp1538-aero\//,
        /^governance\/nasa-tp1538-generic-f16-aero-verification-corpus\.v1\.json$/,
        /^lib\/canonical-json\.ts$/,
        /^lib\/engine\//,
        /^lib\/validation\/(?:public-aircraft-reference|generic-aam-verification|generic-aam-verification-wasm|generated\/generic-aam-verifier-wasm|tp1538-aero-verification|tp1538-aero-verification-wasm|generated\/tp1538-aero-verifier-wasm)\.ts$/,
        /^lib\/(?:model-pack|reference-model-pack|simulation-models)\.ts$/,
        /^scripts\/(?:benchmark-generic-aam|benchmark-tp1538-aero|build-generic-aam-verifier|build-rust-engine|build-tp1538-aero-verifier|generate-model-pack-fixture|generate-nasa-generic-aam-workload|generate-tp1538-aero-workload|lib\/verification-wasm-optimizer|verify-nasa-generic-aam-reference|verify-public-aircraft-reference)\.(?:mjs|ts)$/,
        /^tests\/(?:generic-aam-oracles|generic-aam-verification|rust-engine-wasm-freshness|tp1538-aero-reference)\.test\.mjs$/,
      ),
    },
    {
      id: "RUST_MANIFEST",
      effect: ["rust_audit"],
      patterns: patternInventory(
        /^engine-rust\/(?:Cargo\.toml|Cargo\.lock)$/,
        /^verification-rust\/generic-aam\/(?:Cargo\.toml|Cargo\.lock)$/,
        /^verification-rust\/tp1538-aero\/(?:Cargo\.toml|Cargo\.lock)$/,
      ),
    },
    {
      id: "VSR_PERSISTENCE_CONTRACT",
      effect: ["browser_tests", "integration", "rust_tests", "web_tests"],
      patterns: patternInventory(
        /^lib\/runtime\/digest\.ts$/,
        /^lib\/engine\/simulation-events\.ts$/,
        /^engine-rust\/src\/simulation_events\.rs$/,
      ),
    },
    {
      id: "SIMULATION_PHYSICS_CONTRACT",
      effect: ["browser_tests", "rust_tests", "web_tests"],
      patterns: patternInventory(
        /^lib\/engine\/(?:atmosphere|contracts|core|primitives|track-store|vector|weapon-admission)\.ts$/,
        /^engine-rust\/src\/(?:lib|validation)\.rs$/,
      ),
    },
    {
      id: "MODEL_PACK_CONTRACT",
      effect: ["browser_tests", "integration", "rust_tests", "web_tests"],
      patterns: patternInventory(
        /^app\/api\/catalog\/route\.ts$/,
        /^lib\/catalog-admission\.ts$/,
        /^lib\/(?:model-pack|reference-model-pack|simulation-models)\.ts$/,
        /^engine-rust\/src\/model_pack\.rs$/,
      ),
    },
    {
      id: "GENERIC_AAM_VERIFICATION_CORPUS",
      effect: ["quality", "rust_tests", "web_tests"],
      patterns: patternInventory(
        /^governance\/nasa-tm-109057-generic-aam-verification-corpus\.v[1-5]\.json$/,
        /^fixtures\/public-reference\/nasa-tm-109057\//,
      ),
    },
    {
      id: "TP1538_AERO_VERIFICATION_CORPUS",
      effect: ["quality", "rust_tests", "web_tests"],
      patterns: patternInventory(
        /^governance\/nasa-tp1538-generic-f16-aero-verification-corpus\.v1\.json$/,
        /^fixtures\/public-reference\/nasa-tp1538-aero\//,
      ),
    },
    {
      id: "SHARED_SIMULATION_CONTRACT",
      effect: ["quality", "web_tests", "rust_tests"],
      patterns: patternInventory(
        /^fixtures\/(?:environment|model-packs|scenario|simulation|vector-record)\//,
        /^lib\/record\//,
        /^lib\/(?:information-state|mission-admission|model-pack|object-catalog|reference-model-pack|scenario-draft|scenario-package|scenario-spatial|scenario-validation|scenarios|simulation|simulation-models|study-areas)\.ts$/,
      ),
    },
    {
      id: "ENVIRONMENT_OR_MODEL_DATA",
      effect: ["quality", "web_tests", "rust_tests", "integration"],
      patterns: patternInventory(
        /^governance\/environment-sources\//,
        /^db\/(?:seeds|fixtures)\/(?:environment|installation|model|runway)/,
        /^fixtures\/(?:environment|model-packs)\//,
        /^lib\/(?:geospatial\/.*|study-areas\.ts)$/,
        /^scripts\/(?:generate-model-pack-fixture|verify-environment-source-assets|verify-governed-catalog-data|verify-public-aircraft-reference)\.(?:c|m)?tsx?$/,
      ),
    },
    {
      id: "DATABASE_OR_API",
      effect: ["integration", "web_tests"],
      patterns: patternInventory(
        /^db\//,
        /^drizzle\//,
        /^drizzle\.config\.ts$/,
        /^app\/api\//,
        /^lib\/canonical-json\.ts$/,
        /^lib\/record\//,
        /^lib\/catalog-admission\.ts$/,
        /^lib\/security\/(?:admission-policy|basemap-tiles|public-api|runtime|saved-run-admission|saved-run)\.ts$/,
        /^lib\/(?:mission-admission|report-export|scenario-package|scenario-spatial|scenario-validation|scenarios)\.ts$/,
        /^scripts\/(?:migrate-db|verify-aircraft-evidence-db-upgrade|verify-app|verify-credibility-catalog|verify-db|verify-db-migration-ledger)\.mjs$/,
        /^scripts\/lib\/migration-ledger\.mjs$/,
        /^scripts\/seed-db\.ts$/,
        /^tests\/migration-ledger-preflight\.test\.mjs$/,
        /^tests\/runtime-admission-db\.test\.ts$/,
      ),
    },
    {
      id: "CONTAINER_OR_RUNTIME",
      effect: ["container", "integration"],
      patterns: patternInventory(
        /^config\/deployment-capabilities\.json$/,
        /^(?:Dockerfile|compose\.ya?ml|\.dockerignore)$/,
        /^observability\//,
        /^lib\/security\/(?:admission-policy|runtime)\.ts$/,
        /^(?:package|package-lock)\.json$/,
        /^scripts\/(?:build-runtime-bundles|node-postgres-adapter|start-production|verify-container-image)\.mjs$/,
        /^(?:vite\.config\.ts|worker\/)/,
      ),
    },
  ],
  unmatchedEffect: "ALL_GATES",
  inputModes: ["ARGV", "STDIN0", "NAME_STATUS0"],
  nameStatusClasses: ["A", "B", "C", "D", "M", "R", "T", "U", "X"],
});

export function classifyChanges(inputFiles) {
  const assertDeeplyFrozen = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Object.isFrozen(value)) throw new Error("Classifier decision contract must remain deeply frozen.");
    for (const child of Object.values(value)) assertDeeplyFrozen(child);
  };
  const matches = (file, patterns) => patterns.some(({ source, flags }) => new RegExp(source, flags).test(file));
  const files = [...new Set(inputFiles.filter((file) => file.length > 0))].sort();
  const result = { ...CLASSIFIER_DECISION_CONTRACT.resultDefaults };
  const applyEffect = (effect, groupId) => {
    if (effect === "POLICY_ONLY_SHORT_CIRCUIT") return "SHORT_CIRCUIT";
    if (effect === "ALL_GATES_SHORT_CIRCUIT" || effect === "ALL_GATES") {
      for (const key of Object.keys(result)) result[key] = true;
      return "SHORT_CIRCUIT";
    }
    if (!Array.isArray(effect)) throw new Error(`Unknown classifier effect for ${groupId}.`);
    for (const gate of effect) {
      if (!Object.hasOwn(result, gate)) throw new Error(`Unknown classifier gate ${gate}.`);
      result[gate] = true;
    }
    return "CONTINUE";
  };
  assertDeeplyFrozen(CLASSIFIER_DECISION_CONTRACT);

  for (const file of files) {
    let classified = false;
    for (const group of CLASSIFIER_DECISION_CONTRACT.groups) {
      if (!matches(file, group.patterns)) continue;
      classified = true;
      if (applyEffect(group.effect, group.id) === "SHORT_CIRCUIT") break;
    }

    if (!classified) applyEffect(CLASSIFIER_DECISION_CONTRACT.unmatchedEffect, "UNMATCHED");
  }

  return { files, ...result };
}

export function runClassifierCli() {
  const useNullDelimitedStdin = process.argv.includes("--stdin0");
  const useNameStatusStdin = process.argv.includes("--name-status0");
  if (useNullDelimitedStdin && useNameStatusStdin) throw new Error("Choose one null-delimited input mode.");
  const raw = useNullDelimitedStdin || useNameStatusStdin ? readFileSync(0) : null;
  const files = useNameStatusStdin
    ? parseNameStatusZ(raw).flatMap(({ oldPath, path }) => [oldPath, path].filter(Boolean))
    : useNullDelimitedStdin
      ? raw.toString("utf8").split("\0")
      : process.argv.slice(2);
  const result = classifyChanges(files);

  if (process.env.GITHUB_OUTPUT) {
    const output = Object.entries(result)
      .filter(([key]) => key !== "files")
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runClassifierCli();
