import assert from "node:assert/strict";
import test from "node:test";

import {
  collectIndicatorObservations,
  findSourceLessPublicReferences,
  validateIndicatorInventory,
  verifyRuntimeStubLedger,
} from "../scripts/verify-runtime-stub-ledger.mjs";
import ledger from "../governance/runtime-stub-ledger.v1.json" with { type: "json" };

test("the runtime stub ledger is complete, ordered, source-backed, and executable", () => {
  const result = verifyRuntimeStubLedger();
  assert.equal(result.entries, 27);
  assert.equal(result.releaseBlocking, 27);
  assert.ok(result.indicatorLines > 0);
  assert.equal(result.sourceLessPublicReferences, 9);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
});

test("source-less public references are inventoried instead of silently admitted", () => {
  const source = [
    '{ id: "known", dataState: "PUBLIC_REFERENCE", sourceIds: ["source"] },',
    '{ id: "unknown", dataState: "PUBLIC_REFERENCE" },',
    '{ id: "user", dataState: "USER_DEFINED" },',
  ].join("\n");
  assert.deepEqual(findSourceLessPublicReferences(source), [{ line: 2 }]);
});

test("report examples have no production fallback allowance", () => {
  assert.equal(
    ledger.indicatorPolicy.allowances.some(
      (allowance) => allowance.path === "app/report/page.tsx",
    ),
    false,
  );
  assert.equal(
    ledger.entries.find((entry) => entry.id === "STUB-09")?.classification,
    "fixture_only",
  );
});

test("a new production fallback fails without an owning ledger entry", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  observations.push({ path: "lib/new-causal-runtime.ts", indicator: "fallback", line: 10 });
  assert.throws(
    () => validateIndicatorInventory(observations, ledger),
    /Unclassified fallback at lib\/new-causal-runtime\.ts:10/,
  );
});

test("a new production approximation indicator fails without an owning ledger entry", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  observations.push({ path: "lib/new-causal-runtime.ts", indicator: "model-assumption", line: 10 });
  assert.throws(
    () => validateIndicatorInventory(observations, ledger),
    /Unclassified model-assumption at lib\/new-causal-runtime\.ts:10/,
  );
});

test("deleting or suppressing a classified indicator requires a ledger update", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  const reduced = observations.filter(
    (item, index) =>
      index !== observations.findIndex(
        (candidate) =>
          candidate.path === "engine-rust/src/lib.rs" && candidate.indicator === "fallback",
      ),
  );
  assert.throws(
    () => validateIndicatorInventory(reduced, ledger),
    /engine-rust\/src\/lib\.rs \(fallback\) has 1 classified lines; ledger expects 2/,
  );
});

test("allowances cannot cite a missing owning issue entry", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  const tampered = structuredClone(ledger);
  tampered.indicatorPolicy.allowances[0].entryIds = ["STUB-93"];
  assert.throws(
    () => validateIndicatorInventory(observations, tampered),
    /references unknown STUB-93/,
  );
});

test("a zero-match control cannot suppress a classified production indicator", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  const tampered = structuredClone(ledger);
  tampered.indicatorPolicy.allowances[0].expectedLines = 0;
  assert.throws(
    () => validateIndicatorInventory(observations, tampered),
    /zero-match controls hide indicators instead of governing them/,
  );
});

test("an exemption cannot hide an indicator without accountable issue ownership", () => {
  const observations = collectIndicatorObservations(process.cwd(), ledger.indicatorPolicy);
  const tampered = structuredClone(ledger);
  delete tampered.indicatorPolicy.exemptions[0].owners;
  assert.throws(
    () => validateIndicatorInventory(observations, tampered),
    /Exemption lib\/engine\/contracts\.ts requires an owning GitHub issue/,
  );
});
