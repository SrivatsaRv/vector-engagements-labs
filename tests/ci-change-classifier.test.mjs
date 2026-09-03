import assert from "node:assert/strict";
import test from "node:test";

import { classifyChanges } from "../scripts/classify-ci-changes.mjs";
import { parseNameStatusZ } from "../scripts/lib/git-name-status.mjs";

const selected = (files) => {
  const jobs = classifyChanges(files);
  delete jobs.files;
  return Object.entries(jobs)
    .filter(([, enabled]) => enabled)
    .map(([job]) => job);
};

test("rename and copy classification preserves both endpoints without trimming legal names", () => {
  const operations = parseNameStatusZ("R100\u0000docs/old.md\u0000lib/new.ts\u0000C100\u0000 leading.ts\u0000components/copied.tsx\u0000");
  const files = operations.flatMap(({ oldPath, path }) => [oldPath, path].filter(Boolean));
  assert.deepEqual(files, ["docs/old.md", "lib/new.ts", " leading.ts", "components/copied.tsx"]);
  assert.equal(classifyChanges(files).files.includes(" leading.ts"), true);
  assert.equal(selected(files).includes("browser_tests"), true);
});

test("contract-documentation policy surfaces fail closed across every hosted gate", () => {
  for (const path of [
    "governance/contract-doc-ownership.v1.json",
    "scripts/contract-doc-probes/classifier-decision-identity.v1.mjs",
    "scripts/contract-doc-probes/required-gate-invariants.v1.mjs",
    "scripts/lib/contract-doc-impact.mjs",
    "scripts/lib/git-name-status.mjs",
    "scripts/verify-contract-doc-impact.mjs",
    "tests/contract-doc-impact.test.mjs",
    "scripts/lib/toolchain-authority.mjs",
    "scripts/verify-toolchain.mjs",
    "tests/toolchain-authority.test.mjs",
    ".node-version",
    "package.json",
  ]) {
    assert.deepEqual(selected([path]), [
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
  }
});

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

test("Rust physics implementation changes receive parity and built-browser tests without dependency audit", () => {
  assert.deepEqual(selected(["engine-rust/src/lib.rs"]), [
    "policy",
    "web_tests",
    "browser_tests",
    "rust_tests",
  ]);
});

test("engine freshness tests select the Rust contract", () => {
  assert.deepEqual(selected(["tests/rust-engine-wasm-freshness.test.mjs"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "rust_tests",
  ]);
});

test("migration ledger preflight changes select database integration", () => {
  for (const path of [
    "scripts/lib/migration-ledger.mjs",
    "scripts/verify-db-migration-ledger.mjs",
    "tests/migration-ledger-preflight.test.mjs",
  ]) {
    const gates = selected([path]);
    assert.equal(gates.includes("integration"), true, `${path} must select database integration`);
    assert.equal(gates.includes("web_tests"), true, `${path} must select contract tests`);
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

test("shared Air-runtime contracts select web, Rust parity, and built-browser evidence", () => {
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
});

test("the Cloudflare application Worker selects delivery integration, not simulation Worker ownership", () => {
  assert.deepEqual(selected(["worker/index.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "integration",
    "container",
  ]);
});

test("shared canonical identity changes select every model-pack and VSR consumer", () => {
  assert.deepEqual(selected(["lib/canonical-json.ts"]), [
    "policy",
    "quality",
    "security_js",
    "web_tests",
    "browser_tests",
    "rust_tests",
    "integration",
  ]);
});

test("persisted VSR digest and event authorities select every replay consumer", () => {
  for (const path of [
    "lib/runtime/digest.ts",
    "lib/engine/simulation-events.ts",
    "engine-rust/src/simulation_events.rs",
  ]) {
    const gates = selected([path]);
    for (const gate of ["web_tests", "browser_tests", "rust_tests", "integration"]) {
      assert.equal(gates.includes(gate), true, `${path} must select ${gate}`);
    }
  }
});

test("real TypeScript and Rust physics producers select parity and built-browser evidence", () => {
  for (const path of [
    "lib/engine/atmosphere.ts",
    "lib/engine/contracts.ts",
    "lib/engine/core.ts",
    "lib/engine/primitives.ts",
    "lib/engine/track-store.ts",
    "lib/engine/vector.ts",
    "lib/engine/weapon-admission.ts",
    "engine-rust/src/lib.rs",
    "engine-rust/src/validation.rs",
  ]) {
    const gates = selected([path]);
    for (const gate of ["web_tests", "browser_tests", "rust_tests"]) {
      assert.equal(gates.includes(gate), true, `${path} must select ${gate}`);
    }
  }
});

test("model-pack source, reference, schema, and Rust admission select every real consumer", () => {
  for (const path of [
    "lib/model-pack.ts",
    "lib/reference-model-pack.ts",
    "lib/simulation-models.ts",
    "engine-rust/src/model_pack.rs",
  ]) {
    const gates = selected([path]);
    for (const gate of ["web_tests", "browser_tests", "rust_tests", "integration"]) {
      assert.equal(gates.includes(gate), true, `${path} must select ${gate}`);
    }
  }
});

test("generic AAM corpus and workload identities select quality and Rust verification without product browser claims", () => {
  for (const path of [
    "governance/nasa-tm-109057-generic-aam-verification-corpus.v5.json",
    "fixtures/public-reference/nasa-tm-109057/workload.v5.json",
  ]) {
    const gates = selected([path]);
    assert.equal(gates.includes("quality"), true, `${path} must select quality verification`);
    assert.equal(gates.includes("rust_tests"), true, `${path} must select Rust verification`);
    assert.equal(gates.includes("browser_tests"), false, `${path} must not claim product browser behavior`);
  }
});

test("generic AAM validation and generated verifier paths select Rust ownership", () => {
  for (const path of [
    "lib/validation/generic-aam-verification.ts",
    "lib/validation/generic-aam-verification-wasm.ts",
    "lib/validation/generated/generic-aam-verifier-wasm.ts",
    "scripts/build-generic-aam-verifier.mjs",
    "scripts/lib/verification-wasm-optimizer.mjs",
    "verification-rust/generic-aam/src/model.rs",
  ]) {
    assert.equal(selected([path]).includes("rust_tests"), true, `${path} must select the Rust verifier owner`);
  }
});

test("TP-1538 corpus, workload, and verifier paths select quality and Rust verification", () => {
  for (const path of [
    "governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json",
    "fixtures/public-reference/nasa-tp1538-aero/workload.v1.json",
  ]) {
    const gates = selected([path]);
    assert.equal(gates.includes("quality"), true, `${path} must select quality verification`);
    assert.equal(gates.includes("rust_tests"), true, `${path} must select Rust verification`);
  }
  for (const path of [
    "lib/validation/tp1538-aero-verification-wasm.ts",
    "scripts/benchmark-tp1538-aero.mjs",
    "verification-rust/tp1538-aero/src/model.rs",
  ]) {
    assert.equal(selected([path]).includes("rust_tests"), true, `${path} must select Rust verification`);
  }
});

test("every registered persistence executable selects database integration", () => {
  for (const path of [
    "scripts/seed-db.ts",
    "scripts/verify-aircraft-evidence-db-upgrade.mjs",
    "scripts/verify-credibility-catalog.mjs",
    "tests/runtime-admission-db.test.ts",
  ]) {
    assert.equal(selected([path]).includes("integration"), true, `${path} must select database integration`);
  }
});

test("catalog credibility admission selects model-pack, database, Rust, and browser consumers", () => {
  for (const path of ["lib/catalog-admission.ts", "app/api/catalog/route.ts"]) {
    const gates = selected([path]);
    for (const gate of ["browser_tests", "integration", "rust_tests", "web_tests"]) {
      assert.equal(gates.includes(gate), true, `${path} must select ${gate}`);
    }
  }
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
    "browser_tests",
    "rust_tests",
    "integration",
  ]);
});

test("browser-consumed geospatial and catalog authorities select the built-browser gate", () => {
  for (const path of [
    "lib/geospatial/contracts.ts",
    "lib/geospatial/digest.ts",
    "lib/geospatial/geodesy.ts",
    "lib/geospatial/vertical-datums.ts",
    "lib/geospatial/synthetic-environment.ts",
    "lib/geospatial/terrain.ts",
    "lib/installations.ts",
    "lib/study-areas.ts",
    "lib/vector-map.ts",
    "lib/object-catalog.ts",
    "scripts/prepare-maplibre-assets.mjs",
  ]) {
    assert.equal(selected([path]).includes("browser_tests"), true, `${path} must select built-browser verification`);
  }
  assert.equal(selected(["lib/object-catalog.ts"]).includes("rust_tests"), true, "object catalog changes must select the compiler/Rust parity owner");
  assert.equal(selected(["lib/geospatial/environment-source-admission.ts"]).includes("browser_tests"), false);
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
  assert.deepEqual(selected(["rust-toolchain.toml"]), everyGate);
  assert.deepEqual(selected(["scripts/classify-ci-changes.mjs"]), everyGate);
  assert.deepEqual(selected(["governance/contract-doc-ownership.v1.json"]), everyGate);
  assert.deepEqual(selected(["scripts/lib/contract-doc-impact.mjs"]), everyGate);
  assert.deepEqual(selected(["scripts/lib/git-name-status.mjs"]), everyGate);
  assert.deepEqual(selected(["scripts/verify-contract-doc-impact.mjs"]), everyGate);
  assert.deepEqual(selected(["tests/contract-doc-impact.test.mjs"]), everyGate);
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
