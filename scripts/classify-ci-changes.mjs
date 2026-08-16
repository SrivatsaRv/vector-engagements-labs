import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const POLICY_ONLY = [
  /^\.codex\//,
  /^docs\//,
  /^(?:AGENTS|CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|GOVERNANCE|NOTICE|README|SECURITY)\.md$/,
  /^(?:LICENSE|NOTICE)$/,
  /^\.github\/(?:CODEOWNERS|pull_request_template\.md)$/,
  /^tests\/(?:ci-change-classifier|deployment-config|persona-skills|security-config)\.test\.mjs$/,
];

const WORKFLOW_CONTROL = [
  /^\.github\/workflows\//,
  /^\.github\/dependabot\.yml$/,
  /^Makefile$/,
  /^scripts\/classify-ci-changes\.mjs$/,
];

const WEB_SOURCE = [
  /^(?:app|components|content|lib|public|scripts|tests|worker)\//,
  /^(?:blog-content\.d\.ts|cloudflare-env\.d\.ts|drizzle\.config\.ts|eslint\.config\.mjs|next\.config\.ts|postcss\.config\.mjs|vite-env\.d\.ts|vite\.config\.ts)$/,
  /^(?:package|package-lock)\.json$/,
  /^tsconfig\.json$/,
];

const JAVASCRIPT_SECURITY = [
  /\.(?:c|m)?js$/,
  /\.(?:c|m)?tsx?$/,
  /^(?:package|package-lock)\.json$/,
  /^Dockerfile$/,
  /^\.github\//,
];

const RUST_CONTRACT = [
  /^engine-rust\//,
  /^fixtures\/public-reference\//,
  /^lib\/engine\//,
  /^lib\/validation\/public-aircraft-reference\.ts$/,
  /^lib\/(?:model-pack|reference-model-pack|simulation-models)\.ts$/,
  /^scripts\/(?:build-rust-engine|generate-model-pack-fixture|verify-public-aircraft-reference)\.mjs$/,
];

const RUST_MANIFEST = [/^engine-rust\/(?:Cargo\.toml|Cargo\.lock)$/];

const SHARED_SIMULATION_CONTRACT = [
  /^fixtures\/(?:environment|model-pack|scenario|simulation|vector-record)/,
  /^lib\/(?:environment-pack|model-pack|reference-model-pack|scenario-contract|scenario-draft|scenario-package|scenarios|simulation-contract|simulation-models|vector-record)\.ts$/,
  /^worker\/(?:protocol|simulation-worker)\.(?:c|m)?tsx?$/,
];

const ENVIRONMENT_OR_MODEL_DATA = [
  /^db\/(?:seeds|fixtures)\/(?:environment|installation|model|runway)/,
  /^fixtures\/(?:environment|model-pack)/,
  /^scripts\/(?:generate-model-pack-fixture|verify-governed-catalog-data|verify-public-aircraft-reference)\.(?:c|m)?tsx?$/,
];

const DATABASE_OR_API = [
  /^db\//,
  /^drizzle\//,
  /^drizzle\.config\.ts$/,
  /^app\/api\//,
  /^lib\/(?:report-export|scenario-package|scenarios)\.ts$/,
  /^scripts\/(?:migrate-db|seed-db|verify-app|verify-db)\.mjs$/,
];

const CONTAINER_OR_RUNTIME = [
  /^(?:Dockerfile|compose\.ya?ml|\.dockerignore)$/,
  /^observability\//,
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
