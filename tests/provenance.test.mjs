import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256Hex } from "../lib/canonical-json.ts";
import {
  isScenarioDefinition,
  isStoredScenarioPackage,
  SCENARIO_PACKAGE_SCHEMA_VERSION,
} from "../lib/scenario-package.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";

test("canonical scenario hashes are order-independent and content-sensitive", async () => {
  const left = { b: [3, { z: true, a: "x" }], a: 1 };
  const right = { a: 1, b: [3, { a: "x", z: true }] };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(await sha256Hex(left), await sha256Hex(right));
  assert.notEqual(await sha256Hex(left), await sha256Hex({ ...right, a: 2 }));
});

test("stored scenario validation binds database identity to package identity", async () => {
  const definition = SCENARIO_LIBRARY[0];
  const valid = {
    id: definition.id,
    version: definition.version,
    domain: definition.domain,
    title: definition.title,
    status: "VALIDATED",
    package: definition,
    schema_version: SCENARIO_PACKAGE_SCHEMA_VERSION,
    content_hash: await sha256Hex(definition),
    engine_version: ENGINE_VERSION,
  };
  assert.equal(isScenarioDefinition(definition), true);
  assert.equal(isStoredScenarioPackage(valid), true);
  assert.equal(isStoredScenarioPackage({ ...valid, version: "9.9.9" }), false);
  assert.equal(isStoredScenarioPackage({ ...valid, content_hash: "bad" }), false);
  assert.equal(
    isStoredScenarioPackage({ ...valid, schema_version: "vector.scenario.v0" }),
    false,
  );
  assert.equal(
    isStoredScenarioPackage({
      ...valid,
      package: { ...definition, scenario: { ...definition.scenario, seed: NaN } },
    }),
    false,
  );
});

test("the eight development templates have unique immutable identities", async () => {
  assert.equal(SCENARIO_LIBRARY.length, 8);
  const identities = SCENARIO_LIBRARY.map(
    (definition) => `${definition.id}@${definition.version}`,
  );
  assert.equal(new Set(identities).size, identities.length);
  const hashes = await Promise.all(SCENARIO_LIBRARY.map(sha256Hex));
  assert.equal(new Set(hashes).size, hashes.length);
  assert.ok(SCENARIO_LIBRARY.every(isScenarioDefinition));
});
