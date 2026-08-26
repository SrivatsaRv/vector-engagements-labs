import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_SCENARIO_CONTROL_AUTHORITY,
  LEGACY_SCENARIO_FIELD_NAMES,
  SCENARIO_CONTROL_AUTHORITY_IDENTITY,
  SCENARIO_CONTROL_AUTHORITY_SCHEMA_VERSION,
  ScenarioControlAdmissionError,
  admitRawScenarioNumber,
  admitStructuredNumber,
  assertStructuredScenarioNumbers,
  validateStructuredScenarioNumbers,
} from "../lib/scenario-control-authority.ts";
import { validateSavedScenario } from "../lib/security/saved-run.ts";
import { DEFAULT_SCENARIO_DEFINITION } from "../lib/scenarios.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import { validateScenario } from "../lib/scenario-validation.ts";

const malformedNumbers = [
  " ", "\t", "+", "-", ".", "1e", "1e+", "NaN", "Infinity", "-Infinity",
  "1,5", "１", "12 m", "0x10", "1_000", "--1", "+-1",
];

test("legacy-scenario-authority-complete: every legacy scenario field has one immutable authority row", () => {
  assert.equal(SCENARIO_CONTROL_AUTHORITY_SCHEMA_VERSION, "vector.scenario-control-authority.v1");
  assert.match(SCENARIO_CONTROL_AUTHORITY_IDENTITY.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(LEGACY_SCENARIO_FIELD_NAMES.length, 40);
  assert.equal(new Set(LEGACY_SCENARIO_FIELD_NAMES).size, 40);
  for (const field of LEGACY_SCENARIO_FIELD_NAMES) {
    const row = LEGACY_SCENARIO_CONTROL_AUTHORITY[field];
    assert.equal(row.draftPath, `$.${field}`);
    assert.ok(row.validationOwner);
    assert.ok(row.disposition);
    if (row.controlState === "HIDDEN_PROHIBITED") {
      assert.notEqual(row.category, "USER_AUTHORED");
    }
    if (row.causalState === "ENGINE_CONSUMED") {
      assert.ok(row.compiledPath);
      assert.ok(row.runtimeConsumer);
    }
  }
});

test("legacy-hidden-authority-poison-inventory: every hidden value is classified before migration", () => {
  const hidden = Object.entries(LEGACY_SCENARIO_CONTROL_AUTHORITY)
    .filter(([, row]) => row.controlState === "HIDDEN_PROHIBITED")
    .map(([field]) => field)
    .sort();
  assert.deepEqual(hidden, [
    "blueDatalink",
    "blueJammer",
    "blueRadarMode",
    "blueTrackSource",
    "humidityPercent",
    "lossIncreaseAmount",
    "lossIncreaseAt",
    "profile",
    "redDatalink",
    "redJammer",
    "redRadarMode",
    "redTrackSource",
    "seed",
    "visibilityKm",
    "windNorth",
  ]);
  for (const field of hidden) {
    assert.match(
      LEGACY_SCENARIO_CONTROL_AUTHORITY[field].disposition,
      /REMOVE|MIGRATE|DERIVE|SHOW/,
      `${field} needs an explicit retirement disposition`,
    );
  }
});

test("numeric-authoring-malformed-corpus: every numeric authority rejects malformed raw text before Number coercion", () => {
  const numericFields = Object.entries(LEGACY_SCENARIO_CONTROL_AUTHORITY)
    .filter(([, row]) => row.numeric)
    .map(([field]) => field);
  assert.equal(numericFields.length, 19);
  for (const field of numericFields) {
    for (const raw of malformedNumbers) {
      const result = admitRawScenarioNumber(field, raw);
      assert.equal(result.ok, false, `${field} admitted ${JSON.stringify(raw)}`);
      assert.match(result.code, /^CONTROL_NUMBER_/);
    }
  }
});

test("numeric-authoring-boundaries: every numeric authority admits exact bounds and rejects adjacent values", () => {
  for (const [field, row] of Object.entries(LEGACY_SCENARIO_CONTROL_AUTHORITY)) {
    const authority = row.numeric;
    if (!authority) continue;
    assert.deepEqual(admitRawScenarioNumber(field, String(authority.minimum)), {
      ok: true,
      value: authority.minimum,
    });
    assert.deepEqual(admitRawScenarioNumber(field, String(authority.maximum)), {
      ok: true,
      value: authority.maximum,
    });
    const epsilon = authority.integer ? 1 : 10 ** -authority.precision;
    assert.equal(admitRawScenarioNumber(field, String(authority.minimum - epsilon)).ok, false);
    assert.equal(admitRawScenarioNumber(field, String(authority.maximum + epsilon)).ok, false);
    if (authority.integer) {
      const fractional = Math.min(authority.maximum, authority.minimum + 0.5);
      if (!Number.isInteger(fractional)) {
        assert.deepEqual(admitRawScenarioNumber(field, String(fractional)), {
          ok: false,
          code: "CONTROL_NUMBER_INTEGER",
        });
      }
    }
    const empty = admitRawScenarioNumber(field, "");
    assert.equal(empty.ok, authority.nullable, `${field} nullability mismatch`);
  }
});

test("numeric-authoring-precision: authored precision is enforced independently of range", () => {
  assert.deepEqual(admitRawScenarioNumber("temperatureOffset", "1.0"), { ok: true, value: 1 });
  assert.deepEqual(admitRawScenarioNumber("temperatureOffset", "1.01"), {
    ok: false,
    code: "CONTROL_NUMBER_PRECISION",
  });
  assert.deepEqual(admitRawScenarioNumber("lossIncreaseAt", ""), { ok: true, value: null });
  assert.deepEqual(admitRawScenarioNumber("blueWeaponQuantity", "2.5"), {
    ok: false,
    code: "CONTROL_NUMBER_INTEGER",
  });
  assert.deepEqual(admitRawScenarioNumber("range", "4.999e3"), {
    ok: false,
    code: "CONTROL_NUMBER_RANGE",
  });
});

test("numeric-authoring-no-silent-zero: blank, whitespace and negative zero remain distinct", () => {
  assert.deepEqual(admitRawScenarioNumber("blueFuelPercent", ""), {
    ok: false,
    code: "CONTROL_NUMBER_EMPTY",
  });
  assert.deepEqual(admitRawScenarioNumber("blueWeaponQuantity", " "), {
    ok: false,
    code: "CONTROL_NUMBER_SYNTAX",
  });
  assert.deepEqual(admitRawScenarioNumber("blueWeaponQuantity", "-0"), {
    ok: true,
    value: -0,
  });
  assert.equal(Object.is(Number(" "), 0), true, "regression falsifier documents the legacy coercion hazard");
});

test("structured-number-admission: type, finite, precision and range checks repeat after UI parsing", () => {
  const authority = LEGACY_SCENARIO_CONTROL_AUTHORITY.windNorth.numeric;
  assert.ok(authority);
  assert.deepEqual(admitStructuredNumber("1.234", authority), {
    ok: false,
    code: "CONTROL_NUMBER_TYPE",
  });
  assert.deepEqual(admitStructuredNumber(Number.NaN, authority), {
    ok: false,
    code: "CONTROL_NUMBER_NONFINITE",
  });
  assert.deepEqual(admitStructuredNumber(1.234, authority), {
    ok: true,
    value: 1.234,
  });
  assert.deepEqual(admitStructuredNumber(1.2345, authority), {
    ok: false,
    code: "CONTROL_NUMBER_PRECISION",
  });
  assert.deepEqual(admitStructuredNumber(151, authority), {
    ok: false,
    code: "CONTROL_NUMBER_RANGE",
  });
});

test("structured-scenario-admission: browser, server and final compiler boundary reject the same over-precision field", () => {
  const scenario = structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario);
  scenario.windNorth = 1.2345;
  assert.deepEqual(validateStructuredScenarioNumbers(scenario), [{
    fieldPath: "$.windNorth",
    code: "CONTROL_NUMBER_PRECISION",
  }]);
  assert.throws(
    () => assertStructuredScenarioNumbers(scenario),
    (error) => error instanceof ScenarioControlAdmissionError
      && error.code === "CONTROL_NUMBER_PRECISION"
      && error.fieldPath === "$.windNorth",
  );
  assert.deepEqual(validateScenario(DEFAULT_SCENARIO_DEFINITION, scenario)[0], {
      id: "structured-number-admission",
      label: "A numeric input failed structured admission",
      detail: "CONTROL_NUMBER_PRECISION at $.windNorth",
      state: "error",
    });
  assert.throws(
    () => validateSavedScenario(scenario, DEFAULT_SCENARIO_DEFINITION),
    (error) => error.code === "CONTROL_NUMBER_PRECISION"
      && error.fieldPath === "$.windNorth",
  );
  assert.throws(
    () => prepareSimulation(scenario),
    (error) => error instanceof ScenarioControlAdmissionError
      && error.code === "CONTROL_NUMBER_PRECISION"
      && error.fieldPath === "$.windNorth",
  );
});
