import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parseNameStatusZ } from "./lib/contract-doc-impact.mjs";

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
        /^Makefile$/,
        /^(?:package|package-lock)\.json$/,
        /^governance\/contract-doc-ownership\.v1\.json$/,
        /^scripts\/classify-ci-changes\.mjs$/,
        /^scripts\/contract-doc-probes\//,
        /^scripts\/lib\/contract-doc-impact\.mjs$/,
        /^scripts\/run-managed-server\.mjs$/,
        /^scripts\/verify-contract-doc-impact\.mjs$/,
        /^tests\/contract-doc-impact\.test\.mjs$/,
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
        /^lib\/geospatial\/(?:environment-pack|environment-sampler\.worker)\.ts$/,
        /^lib\/(?:information-state|map-layer-contracts|mission-admission|scenario-draft|scenario-package|scenario-spatial|scenario-validation|scenarios|simulation|tactical-symbol-contract|tactical-symbol-library|tactical-symbol-markup)\.ts$/,
        /^lib\/security\/browser-response\.ts$/,
        /^scripts\/(?:browser-worker-assets|build-runtime-bundles|verify-browser-worker)\.(?:c|m)?tsx?$/,
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
        /^lib\/engine\//,
        /^lib\/validation\/public-aircraft-reference\.ts$/,
        /^lib\/(?:model-pack|reference-model-pack|simulation-models)\.ts$/,
        /^scripts\/(?:build-rust-engine|generate-model-pack-fixture|verify-public-aircraft-reference)\.mjs$/,
      ),
    },
    {
      id: "RUST_MANIFEST",
      effect: ["rust_audit"],
      patterns: patternInventory(/^engine-rust\/(?:Cargo\.toml|Cargo\.lock)$/),
    },
    {
      id: "SHARED_SIMULATION_CONTRACT",
      effect: ["quality", "web_tests", "rust_tests"],
      patterns: patternInventory(
        /^fixtures\/(?:environment|model-packs|scenario|simulation|vector-record)\//,
        /^lib\/record\//,
        /^lib\/(?:information-state|mission-admission|model-pack|reference-model-pack|scenario-draft|scenario-package|scenario-spatial|scenario-validation|scenarios|simulation|simulation-models|study-areas)\.ts$/,
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
        /^lib\/record\//,
        /^lib\/security\/(?:admission-policy|basemap-tiles|public-api|runtime|saved-run-admission|saved-run)\.ts$/,
        /^lib\/(?:mission-admission|report-export|scenario-package|scenario-spatial|scenario-validation|scenarios)\.ts$/,
        /^scripts\/(?:migrate-db|seed-db|verify-app|verify-db)\.mjs$/,
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
