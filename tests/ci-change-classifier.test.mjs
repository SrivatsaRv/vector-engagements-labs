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
  ]);
});

test("Rust implementation changes receive parity tests without dependency audit", () => {
  assert.deepEqual(selected(["engine-rust/src/lib.rs"]), [
    "policy",
    "web_tests",
    "rust_tests",
  ]);
});

test("public aircraft evidence changes receive web and Rust parity gates", () => {
  assert.deepEqual(
    selected(["fixtures/public-reference/nasa-nesc-2015-f16-case11.json"]),
    ["policy", "web_tests", "rust_tests"],
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
    "rust_tests",
    "rust_audit",
    "integration",
    "container",
  ]);
});
