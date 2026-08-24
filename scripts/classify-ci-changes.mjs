import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const POLICY_ONLY = [
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
];

const WORKFLOW_CONTROL = [
  /^\.github\/workflows\//,
  /^\.github\/dependabot\.yml$/,
  /^Makefile$/,
  /^scripts\/classify-ci-changes\.mjs$/,
  /^scripts\/run-managed-server\.mjs$/,
];

const WEB_SOURCE = [
  /^config\/deployment-capabilities\.json$/,
  /^(?:app|components|content|lib|public|scripts|tests|worker)\//,
  /^fixtures\/public-reference\//,
  /^(?:blog-content\.d\.ts|cloudflare-env\.d\.ts|drizzle\.config\.ts|eslint\.config\.mjs|next\.config\.ts|postcss\.config\.mjs|vite-env\.d\.ts|vite\.config\.ts)$/,
  /^(?:package|package-lock)\.json$/,
  /^tsconfig\.json$/,
];

const BROWSER_SURFACE = [
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
];

const JAVASCRIPT_SECURITY = [
  /\.(?:c|m)?js$/,
  /\.(?:c|m)?tsx?$/,
  /^(?:package|package-lock)\.json$/,
  /^Dockerfile$/,
  /^\.github\//,
];

const RUST_CONTRACT = [
  /^rust-toolchain\.toml$/,
  /^engine-rust\//,
  /^verification-rust\/generic-aam\//,
  /^verification-rust\/sixdof-foundation\//,
  /^fixtures\/public-reference\//,
  /^lib\/engine\//,
  /^lib\/validation\/(?:sixdof-foundation(?:-wasm)?|generated\/sixdof-foundation-verifier-wasm)\.ts$/,
  /^lib\/validation\/(?:generic-aam-verification(?:-wasm)?|generated\/generic-aam-verifier-wasm)\.ts$/,
  /^lib\/validation\/public-aircraft-reference\.ts$/,
  /^lib\/(?:model-pack|reference-model-pack|simulation-models)\.ts$/,
  /^package\.json$/,
  /^scripts\/(?:benchmark-sixdof-foundation\.ts|build-sixdof-foundation-verifier\.mjs|sixdof-production-isolation\.mjs)$/,
  /^scripts\/(?:benchmark-generic-aam\.ts|build-generic-aam-verifier\.mjs|generate-nasa-generic-aam-workload\.mjs|verify-nasa-generic-aam-reference\.mjs)$/,
  /^scripts\/lib\/canonical-rust-wasm-builder\.mjs$/,
  /^scripts\/(?:build-rust-engine|generate-model-pack-fixture|verify-public-aircraft-reference)\.mjs$/,
  /^tests\/sixdof-foundation\.test\.mjs$/,
  /^tests\/generic-aam-(?:oracles|verification)\.test\.mjs$/,
  /^tests\/canonical-rust-wasm-builder\.test\.mjs$/,
];

const RUST_MANIFEST = [
  /^rust-toolchain\.toml$/,
  /^engine-rust\/(?:Cargo\.toml|Cargo\.lock)$/,
  /^verification-rust\/generic-aam\/(?:Cargo\.toml|Cargo\.lock)$/,
  /^verification-rust\/sixdof-foundation\/(?:Cargo\.toml|Cargo\.lock)$/,
];

const SHARED_SIMULATION_CONTRACT = [
  /^fixtures\/(?:environment|model-packs|scenario|simulation|vector-record)\//,
  /^lib\/record\//,
  /^lib\/(?:information-state|mission-admission|model-pack|reference-model-pack|scenario-draft|scenario-package|scenario-spatial|scenario-validation|scenarios|simulation|simulation-models|study-areas)\.ts$/,
];

const ENVIRONMENT_OR_MODEL_DATA = [
  /^governance\/environment-sources\//,
  /^db\/(?:seeds|fixtures)\/(?:environment|installation|model|runway)/,
  /^fixtures\/(?:environment|model-packs)\//,
  /^lib\/(?:geospatial\/.*|study-areas\.ts)$/,
  /^scripts\/(?:generate-model-pack-fixture|verify-environment-source-assets|verify-governed-catalog-data|verify-public-aircraft-reference)\.(?:c|m)?tsx?$/,
];

const DATABASE_OR_API = [
  /^db\//,
  /^drizzle\//,
  /^drizzle\.config\.ts$/,
  /^app\/api\//,
  /^lib\/record\//,
  /^lib\/security\/(?:admission-policy|basemap-tiles|public-api|runtime|saved-run-admission|saved-run)\.ts$/,
  /^lib\/(?:mission-admission|report-export|scenario-package|scenario-spatial|scenario-validation|scenarios)\.ts$/,
  /^scripts\/(?:migrate-db|seed-db|verify-app|verify-db)\.mjs$/,
];

const CONTAINER_OR_RUNTIME = [
  /^config\/deployment-capabilities\.json$/,
  /^(?:Dockerfile|compose\.ya?ml|\.dockerignore)$/,
  /^observability\//,
  /^lib\/security\/(?:admission-policy|runtime)\.ts$/,
  /^(?:package|package-lock)\.json$/,
  /^scripts\/(?:build-runtime-bundles|node-postgres-adapter|start-production|verify-container-image)\.mjs$/,
  /^(?:vite\.config\.ts|worker\/)/,
];

const matches = (file, patterns) => patterns.some((pattern) => pattern.test(file));

export function classifyChanges(inputFiles) {
  const files = [...new Set(inputFiles.map((file) => file.trim()).filter(Boolean))].sort();
  const result = {
    policy: true,
    quality: false,
    security_js: false,
    web_tests: false,
    browser_tests: false,
    rust_tests: false,
    rust_audit: false,
    integration: false,
    container: false,
  };

  for (const file of files) {
    if (matches(file, POLICY_ONLY)) continue;

    if (matches(file, WORKFLOW_CONTROL)) {
      for (const key of Object.keys(result)) result[key] = true;
      continue;
    }

    let classified = false;

    if (matches(file, WEB_SOURCE)) {
      result.quality = true;
      result.web_tests = true;
      classified = true;
    }
    if (matches(file, BROWSER_SURFACE)) {
      result.browser_tests = true;
      classified = true;
    }
    if (matches(file, JAVASCRIPT_SECURITY)) {
      result.security_js = true;
      classified = true;
    }
    if (matches(file, RUST_CONTRACT)) {
      result.rust_tests = true;
      result.web_tests = true;
      classified = true;
    }
    if (matches(file, RUST_MANIFEST)) {
      result.rust_audit = true;
      classified = true;
    }
    if (matches(file, SHARED_SIMULATION_CONTRACT)) {
      result.quality = true;
      result.web_tests = true;
      result.rust_tests = true;
      classified = true;
    }
    if (matches(file, ENVIRONMENT_OR_MODEL_DATA)) {
      result.quality = true;
      result.web_tests = true;
      result.rust_tests = true;
      result.integration = true;
      classified = true;
    }
    if (matches(file, DATABASE_OR_API)) {
      result.integration = true;
      result.web_tests = true;
      classified = true;
    }
    if (matches(file, CONTAINER_OR_RUNTIME)) {
      result.container = true;
      result.integration = true;
      classified = true;
    }

    if (!classified) {
      for (const key of Object.keys(result)) result[key] = true;
    }
  }

  return { files, ...result };
}

function run() {
  const useNullDelimitedStdin = process.argv.includes("--stdin0");
  const files = useNullDelimitedStdin
    ? readFileSync(0, "utf8").split("\0")
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
