import assert from "node:assert/strict";
import test from "node:test";

import { classifyChanges } from "../scripts/classify-ci-changes.mjs";

const selected = (files) => {
  const jobs = classifyChanges(files);
  delete jobs.files;
  return Object.entries(jobs)
    .filter(([, enabled]) => enabled)
    .map(([job]) => job);
};

test("documentation and project skills use only the stable policy gate", () => {
  assert.deepEqual(
    selected([
      "docs/repository-governance.md",
      ".codex/skills/vector-lab-harness/SKILL.md",
      "tests/persona-skills.test.mjs",
      "governance/runtime-stub-ledger.v1.json",
      "governance/issue-closure-governance.v1.json",
      "scripts/verify-runtime-stub-ledger.mjs",
      "scripts/verify-pr-closure-governance.mjs",
      "tests/runtime-stub-ledger.test.mjs",
      "tests/pr-closure-governance.test.mjs",
    ]),
    ["policy"],
  );
});

test("blog content builds and tests the web product without Rust or PostGIS", () => {
  assert.deepEqual(selected(["content/blog/new-post.md", "public/blog/thumb.webp"]), [
    "policy",
    "quality",
    "web_tests",
  ]);
});

test("frontend code receives quality, security, and web tests", () => {
  assert.deepEqual(selected(["components/SimulationScene.tsx"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
  ]);
});

test("the isolated browser runner selects its built-browser consumer", () => {
  assert.equal(selected(["scripts/run-browser-contracts.mjs"]).includes("browser_tests"), true);
});

test("Rust implementation changes receive parity tests without dependency audit", () => {
  assert.deepEqual(selected(["engine-rust/src/lib.rs"]), [
    "policy",
    "web_tests",
    "rust_tests",
  ]);
});

test("every private 6DOF owning path selects its Rust and dependency owners", () => {
  const webAndRust = ["policy", "quality", "security_js", "web_tests", "rust_tests"];
  const cases = [
    ["rust-toolchain.toml", ["policy", "web_tests", "rust_tests", "rust_audit"]],
    ["verification-rust/sixdof-foundation/src/model.rs", ["policy", "web_tests", "rust_tests"]],
    ["verification-rust/sixdof-foundation/Cargo.toml", ["policy", "web_tests", "rust_tests", "rust_audit"]],
    ["verification-rust/sixdof-foundation/Cargo.lock", ["policy", "web_tests", "rust_tests", "rust_audit"]],
    ["lib/validation/sixdof-foundation.ts", webAndRust],
    ["lib/validation/sixdof-foundation-wasm.ts", webAndRust],
    ["lib/validation/generated/sixdof-foundation-verifier-wasm.ts", webAndRust],
    ["scripts/build-sixdof-foundation-verifier.mjs", webAndRust],
    ["scripts/sixdof-production-isolation.mjs", webAndRust],
    ["scripts/benchmark-sixdof-foundation.ts", webAndRust],
    ["tests/sixdof-foundation.test.mjs", webAndRust],
    [
      "package.json",
      ["policy", "quality", "security_js", "web_tests", "rust_tests", "integration", "container"],
    ],
  ];

  for (const [path, expected] of cases) {
    assert.deepEqual(selected([path]), expected, path);
  }
});

test("runtime and engine changes execute the built Worker browser verifier", () => {
  for (const file of [
    "lib/runtime/simulation.worker.ts",
    "lib/runtime/protocol.ts",
    "lib/runtime/browser-simulation-client.ts",
    "lib/engine/compiler.ts",
    "lib/engine/core.ts",
    "lib/geospatial/environment-sampler.worker.ts",
  ]) {
    assert.equal(
      selected([file]).includes("browser_tests"),
      true,
      `${file} must select the browser Worker contract`,
    );
  }
});

test("actual mission, spatial, recording, and frontend contracts select their consumers", () => {
  for (const file of [
    "lib/mission-admission.ts",
    "lib/scenario-spatial.ts",
    "lib/record/vector-record.ts",
  ]) {
    assert.deepEqual(selected([file]), [
      "policy",
      "quality",
      "security_js",
      "web_tests",
      "browser_tests",
      "rust_tests",
      "integration",
    ]);
  }
  assert.deepEqual(selected(["lib/frontend/selectors.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
  ]);
});

test("runtime security boundaries select the built integration evidence they govern", () => {
  for (const file of [
    "lib/security/saved-run-admission.ts",
    "lib/security/basemap-tiles.ts",
  ]) {
    assert.deepEqual(selected([file]), [
      "policy",
      "quality",
      "security_js",
      "web_tests",
      "integration",
    ]);
  }
  for (const file of [
    "lib/security/admission-policy.ts",
    "lib/security/runtime.ts",
  ]) {
    assert.deepEqual(selected([file]), [
      "policy",
      "quality",
      "security_js",
      "web_tests",
      "integration",
      "container",
    ]);
  }
  assert.deepEqual(selected(["lib/security/browser-response.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
  ]);
});

test("governed environment sources and actual model-pack fixtures select validators", () => {
  assert.deepEqual(
    selected([
      "governance/environment-sources/nasa-power-hourly-20200115/punjab-anchor.raw.json",
    ]),
    ["policy", "quality", "web_tests", "rust_tests", "integration"],
  );
  assert.deepEqual(
    selected(["fixtures/model-packs/vector-scalar-study-v0.8.compiled.json"]),
    [
      "policy",
      "quality",
      "web_tests",
      "browser_tests",
      "rust_tests",
      "integration",
    ],
  );
});

test("public aircraft evidence changes receive web and Rust parity gates", () => {
  assert.deepEqual(
    selected(["fixtures/public-reference/nasa-nesc-2015-f16-case11.json"]),
    ["policy", "quality", "web_tests", "rust_tests"],
  );
});

test("shared Air-runtime contracts select web and Rust parity", () => {
  for (const file of [
    "lib/scenario-draft.ts",
    "lib/scenario-package.ts",
    "lib/simulation.ts",
    "lib/record/vector-record.ts",
  ]) {
    const gates = selected([file]);
    assert.equal(gates.includes("rust_tests"), true, `${file} must select parity`);
    assert.equal(gates.includes("browser_tests"), true, `${file} must select built-browser evidence`);
  }
  assert.deepEqual(selected(["worker/index.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "integration",
    "container",
  ]);
});

test("environment and model fixtures select validation, parity, and integration", () => {
  assert.deepEqual(
    selected(["fixtures/model-packs/vector-scalar-study-v0.8.compiled.json"]),
    [
      "policy",
      "quality",
      "web_tests",
      "browser_tests",
      "rust_tests",
      "integration",
    ],
  );
  assert.deepEqual(selected(["scripts/verify-governed-catalog-data.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "rust_tests",
    "integration",
  ]);
  assert.deepEqual(selected(["lib/study-areas.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "rust_tests",
    "integration",
  ]);
});

test("saved-run admission always selects database and API integration", () => {
  assert.deepEqual(selected(["lib/security/saved-run.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "integration",
  ]);
});

test("combined contracts take the union of their required gates", () => {
  assert.deepEqual(
    selected(["lib/simulation.ts", "db/migrations/009_example.sql"]),
    [
      "policy",
      "quality",
      "security_js",
      "web_tests",
      "browser_tests",
      "rust_tests",
      "integration",
    ],
  );
});

test("Cargo manifest changes add the Rust dependency audit", () => {
  assert.deepEqual(selected(["engine-rust/Cargo.lock"]), [
    "policy",
    "web_tests",
    "rust_tests",
    "rust_audit",
  ]);
});

test("database migrations require the database integration gate", () => {
  assert.deepEqual(selected(["db/migrations/009_example.sql"]), [
    "policy",
    "web_tests",
    "integration",
  ]);
});

test("container changes build the image and exercise integration", () => {
  assert.deepEqual(selected(["Dockerfile"]), [
    "policy",
    "security_js",
    "integration",
    "container",
  ]);
  assert.deepEqual(selected(["scripts/start-production.mjs"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "integration",
    "container",
  ]);
});

test("workflow changes fail closed through every available gate", () => {
  const everyGate = [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
    "rust_tests",
    "rust_audit",
    "integration",
    "container",
  ];
  assert.deepEqual(selected([".github/workflows/ci.yml"]), everyGate);
  assert.deepEqual(selected(["scripts/classify-ci-changes.mjs"]), everyGate);
});

test("unclassified paths fail closed through every available gate", () => {
  assert.deepEqual(selected(["new-runtime/input.bin"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
    "rust_tests",
    "rust_audit",
    "integration",
    "container",
  ]);
});
