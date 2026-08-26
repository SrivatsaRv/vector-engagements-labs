import { canonicalJson } from "./canonical-json.ts";
import { sha256Utf8HexSync } from "./geospatial/digest.ts";
import type { Scenario } from "./simulation.ts";

export const SCENARIO_CONTROL_AUTHORITY_SCHEMA_VERSION =
  "vector.scenario-control-authority.v1" as const;
export const MAX_AUTHORED_SCALAR_FRACTION_DIGITS = 3;
export const MAX_WGS84_FRACTION_DIGITS = 15;

export type ScenarioControlCategory =
  | "USER_AUTHORED"
  | "VISIBLE_DEFAULT"
  | "PRESET"
  | "DERIVED"
  | "MODEL_PACK"
  | "DEPLOYMENT"
  | "UNAVAILABLE";

export type ScenarioControlState =
  | "EDITABLE"
  | "TEMPLATE_OWNED"
  | "READ_ONLY"
  | "HIDDEN_PROHIBITED";

export type ScenarioCausalState =
  | "ENGINE_CONSUMED"
  | "COMPILE_ONLY"
  | "CONDITIONAL"
  | "NO_RUNTIME_EFFECT"
  | "DUPLICATE_AUTHORITY"
  | "UNAVAILABLE";

export type NumericAuthority = {
  kind: "NUMBER";
  minimum: number;
  maximum: number;
  integer: boolean;
  nullable: boolean;
  precision: number;
  unit: string;
};

export type ScenarioFieldAuthority = {
  category: ScenarioControlCategory;
  controlState: ScenarioControlState;
  causalState: ScenarioCausalState;
  draftPath: `$.${string}`;
  compiledPath: string | null;
  runtimeConsumer: string | null;
  recordProjection: string | null;
  validationOwner: string;
  numeric: NumericAuthority | null;
  disposition: string;
};

const number = (
  minimum: number,
  maximum: number,
  unit: string,
  precision: number,
  integer = false,
  nullable = false,
): NumericAuthority => ({
  kind: "NUMBER",
  minimum,
  maximum,
  integer,
  nullable,
  precision,
  unit,
});

const row = (
  value: Omit<ScenarioFieldAuthority, "draftPath">,
  field: keyof Scenario,
): ScenarioFieldAuthority => ({ ...value, draftPath: `$.${field}` });

const authored = (
  field: keyof Scenario,
  causalState: ScenarioCausalState,
  compiledPath: string | null,
  runtimeConsumer: string | null,
  numeric: NumericAuthority | null = null,
  disposition = "MIGRATE_TO_CANONICAL_DRAFT",
) => row({
  category: "USER_AUTHORED",
  controlState: "EDITABLE",
  causalState,
  compiledPath,
  runtimeConsumer,
  recordProjection: "vector-record/scenario.json",
  validationOwner: "vector.pre-engine-admission.v1",
  numeric,
  disposition,
}, field);

const hidden = (
  field: keyof Scenario,
  category: ScenarioControlCategory,
  causalState: ScenarioCausalState,
  compiledPath: string | null,
  runtimeConsumer: string | null,
  disposition: string,
  numeric: NumericAuthority | null = null,
) => row({
  category,
  controlState: "HIDDEN_PROHIBITED",
  causalState,
  compiledPath,
  runtimeConsumer,
  recordProjection: "vector-record/scenario.json",
  validationOwner: "vector.pre-engine-admission.v1",
  numeric,
  disposition,
}, field);

/**
 * Current-state authority inventory for the legacy Scenario intake. The object
 * is intentionally keyed by `keyof Scenario`: adding or removing a legacy
 * field is a compile failure until its authority row is adjudicated.
 */
export const LEGACY_SCENARIO_CONTROL_AUTHORITY = {
  domain: row({
    category: "VISIBLE_DEFAULT", controlState: "TEMPLATE_OWNED", causalState: "ENGINE_CONSUMED",
    compiledPath: "$.domain", runtimeConsumer: "engine/compiler", recordProjection: "vector-record/scenario.json",
    validationOwner: "scenario-package", numeric: null, disposition: "MIGRATE_TO_KERNEL_CAPABILITY_REFERENCE",
  }, "domain"),
  name: authored("name", "NO_RUNTIME_EFFECT", "$.name", null),
  objective: authored("objective", "NO_RUNTIME_EFFECT", null, null),
  bluePlatformId: authored("bluePlatformId", "ENGINE_CONSUMED", "$.entities[BLUE].sourceObjectId", "engine/entity-spawn"),
  blueSystemId: authored("blueSystemId", "ENGINE_CONSUMED", "$.entities[BLUE_STORE].sourceObjectId", "engine/store-spawn"),
  redObjectId: authored("redObjectId", "ENGINE_CONSUMED", "$.entities[RED].sourceObjectId", "engine/entity-spawn"),
  redSystemId: authored("redSystemId", "ENGINE_CONSUMED", "$.entities[RED_STORE].sourceObjectId", "engine/store-spawn"),
  studyAreaId: authored("studyAreaId", "ENGINE_CONSUMED", "$.environment.studyArea.id", "environment-sampler"),
  weatherPresetId: authored("weatherPresetId", "COMPILE_ONLY", "$.environment.atmosphere.presetId", null),
  blueWeaponQuantity: authored("blueWeaponQuantity", "ENGINE_CONSUMED", "$.entities[BLUE].stores", "engine/store-spawn", number(0, 6, "1", 0, true)),
  redWeaponQuantity: authored("redWeaponQuantity", "ENGINE_CONSUMED", "$.entities[RED].stores", "engine/store-spawn", number(0, 6, "1", 0, true)),
  blueFuelPercent: authored("blueFuelPercent", "ENGINE_CONSUMED", "$.entities[BLUE].initialFuelKg", "engine/aircraft-dynamics", number(20, 100, "%", MAX_AUTHORED_SCALAR_FRACTION_DIGITS)),
  redFuelPercent: authored("redFuelPercent", "ENGINE_CONSUMED", "$.entities[RED].initialFuelKg", "engine/aircraft-dynamics", number(20, 100, "%", MAX_AUTHORED_SCALAR_FRACTION_DIGITS)),
  blueRadarMode: hidden("blueRadarMode", "UNAVAILABLE", "CONDITIONAL", "$.entities[BLUE].sensors[*].mode", "information-state", "REMOVE_OR_MIGRATE_TO_ADMITTED_EMISSION_POLICY"),
  redRadarMode: hidden("redRadarMode", "UNAVAILABLE", "CONDITIONAL", "$.entities[RED].sensors[*].mode", "information-state", "REMOVE_OR_MIGRATE_TO_ADMITTED_EMISSION_POLICY"),
  blueTrackSource: hidden("blueTrackSource", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_FALSE_INFORMATION_PATH_CLAIM"),
  redTrackSource: hidden("redTrackSource", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_FALSE_INFORMATION_PATH_CLAIM"),
  blueDatalink: hidden("blueDatalink", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_UNADMITTED_CAPABILITY_DEFAULT"),
  redDatalink: hidden("redDatalink", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_UNADMITTED_CAPABILITY_DEFAULT"),
  blueJammer: hidden("blueJammer", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_UNADMITTED_CAPABILITY_DEFAULT"),
  redJammer: hidden("redJammer", "UNAVAILABLE", "NO_RUNTIME_EFFECT", null, null, "REMOVE_UNADMITTED_CAPABILITY_DEFAULT"),
  profile: hidden("profile", "MODEL_PACK", "DUPLICATE_AUTHORITY", "$.model.profile", "engine/legacy-profile", "DERIVE_FROM_SELECTED_MODEL_PACK"),
  guidance: authored("guidance", "ENGINE_CONSUMED", "$.guidance.mode", "engine/guidance", null, "MIGRATE_TO_EXPLICIT_VERIFICATION_ASSUMPTION"),
  altitude: authored("altitude", "DUPLICATE_AUTHORITY", "$.entities[BLUE].initialState.position", "engine/entity-spawn", number(0, 15_000, "m_MSL", 0), "DERIVE_FROM_SPATIAL_START"),
  cruiseAltitude: authored("cruiseAltitude", "CONDITIONAL", "$.guidance.cruiseAltitudeM", "engine/guidance", number(30, 15_000, "m_MSL", MAX_AUTHORED_SCALAR_FRACTION_DIGITS)),
  targetDelta: authored("targetDelta", "DUPLICATE_AUTHORITY", "$.entities[RED].initialState.position", "engine/entity-spawn", number(-12_000, 12_000, "m", 0), "DERIVE_FROM_SPATIAL_STARTS"),
  range: authored("range", "DUPLICATE_AUTHORITY", "$.entities[*].initialState.position", "engine/entity-spawn", number(5_000, 170_000, "m", 0), "DERIVE_FROM_SPATIAL_STARTS"),
  aspect: authored("aspect", "DUPLICATE_AUTHORITY", "$.entities[*].initialState.heading", "engine/entity-spawn", number(0, 180, "deg", 0), "DERIVE_FROM_SPATIAL_STARTS"),
  launcherSpeed: authored("launcherSpeed", "DUPLICATE_AUTHORITY", "$.entities[BLUE].initialState.velocity", "engine/entity-spawn", number(0, 450, "m/s", 0), "MIGRATE_TO_ENTITY_START_CONSTRAINT"),
  targetSpeed: authored("targetSpeed", "DUPLICATE_AUTHORITY", "$.entities[RED].initialState.velocity", "engine/entity-spawn", number(0, 450, "m/s", 0), "MIGRATE_TO_ENTITY_START_CONSTRAINT"),
  wind: authored("wind", "ENGINE_CONSUMED", "$.environment.atmosphere.windEastMps", "engine/aerodynamics", number(-40, 40, "m/s", MAX_AUTHORED_SCALAR_FRACTION_DIGITS), "MIGRATE_TO_PRESET_OVERRIDE_WITH_ANCESTRY"),
  windNorth: hidden("windNorth", "PRESET", "ENGINE_CONSUMED", "$.environment.atmosphere.windNorthMps", "engine/aerodynamics", "SHOW_PRESET_VALUE_OR_AUTHORIZED_OVERRIDE", number(-150, 150, "m/s", 3)),
  visibilityKm: hidden("visibilityKm", "PRESET", "CONDITIONAL", "$.environment.atmosphere.visibilityKm", "information-state", "SHOW_NO_SENSOR_EFFECT_UNTIL_VISUAL_MODEL_EXISTS", number(0.1, 300, "km", 3)),
  humidityPercent: hidden("humidityPercent", "PRESET", "NO_RUNTIME_EFFECT", "$.environment.atmosphere.humidityPercent", null, "SHOW_RECORDED_CONTEXT_WITH_NO_RUNTIME_EFFECT", number(0, 100, "%", 3)),
  temperatureOffset: authored("temperatureOffset", "ENGINE_CONSUMED", "$.environment.atmosphere.temperatureOffsetC", "engine/atmosphere", number(-20, 20, "degC", 1), "MIGRATE_TO_PRESET_OVERRIDE_WITH_ANCESTRY"),
  spatialPlan: authored("spatialPlan", "ENGINE_CONSUMED", "$.entities[*].initialState|route", "engine/route-runtime"),
  airMission: authored("airMission", "ENGINE_CONSUMED", "$.airMission", "engine/mission-adapter"),
  lossIncreaseAt: hidden("lossIncreaseAt", "UNAVAILABLE", "CONDITIONAL", "$.environment.events[*].time", "engine/environment-events", "REMOVE_UNVERSIONED_HIDDEN_WIND_SHIFT", number(0, 300, "s", 3, false, true)),
  lossIncreaseAmount: hidden("lossIncreaseAmount", "UNAVAILABLE", "CONDITIONAL", "$.environment.events[*].windShiftEastMps", "engine/environment-events", "REMOVE_UNVERSIONED_HIDDEN_WIND_SHIFT", number(-150, 150, "m/s", 3)),
  seed: hidden("seed", "DEPLOYMENT", "COMPILE_ONLY", "$.seed", null, "SHOW_READ_ONLY_OR_VERIFICATION_ONLY_AUTHORITY", number(0, 2_147_483_647, "1", 0, true)),
} satisfies Record<keyof Scenario, ScenarioFieldAuthority>;

export const LEGACY_SCENARIO_FIELD_NAMES = Object.freeze(
  Object.keys(LEGACY_SCENARIO_CONTROL_AUTHORITY).sort() as Array<keyof Scenario>,
);

const authorityContent = {
  schemaVersion: SCENARIO_CONTROL_AUTHORITY_SCHEMA_VERSION,
  fields: LEGACY_SCENARIO_CONTROL_AUTHORITY,
};

export const SCENARIO_CONTROL_AUTHORITY_IDENTITY = Object.freeze({
  id: "vector.legacy-scenario-control-authority",
  version: "1.0.0",
  digest: `sha256:${sha256Utf8HexSync(canonicalJson(authorityContent))}`,
});

export type RawNumberAdmission =
  | { ok: true; value: number | null }
  | { ok: false; code: ScenarioNumberAdmissionCode };

export type ScenarioNumberAdmissionCode =
  | "CONTROL_NUMBER_EMPTY"
  | "CONTROL_NUMBER_TYPE"
  | "CONTROL_NUMBER_SYNTAX"
  | "CONTROL_NUMBER_NONFINITE"
  | "CONTROL_NUMBER_RANGE"
  | "CONTROL_NUMBER_PRECISION"
  | "CONTROL_NUMBER_INTEGER";

export class ScenarioControlAdmissionError extends Error {
  readonly code: ScenarioNumberAdmissionCode;
  readonly fieldPath: string;
  readonly stage = "STRUCTURED_FIELD" as const;

  constructor(code: ScenarioNumberAdmissionCode, fieldPath: string) {
    super(`${code} at ${fieldPath}.`);
    this.name = "ScenarioControlAdmissionError";
    this.code = code;
    this.fieldPath = fieldPath;
  }
}

const FINITE_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function decimalPlaces(raw: string): number {
  const [coefficient, exponentText] = raw.toLowerCase().split("e");
  const fraction = coefficient.split(".")[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  return Math.max(0, fraction - exponent);
}

/** Preserves raw authoring semantics; unlike Number(), blank/whitespace never becomes zero. */
export function admitRawNumber(raw: string, authority: NumericAuthority): RawNumberAdmission {
  if (raw.length === 0) {
    return authority.nullable ? { ok: true, value: null } : { ok: false, code: "CONTROL_NUMBER_EMPTY" };
  }
  if (raw.trim() !== raw || !FINITE_DECIMAL.test(raw)) {
    return { ok: false, code: "CONTROL_NUMBER_SYNTAX" };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, code: "CONTROL_NUMBER_NONFINITE" };
  if (value < authority.minimum || value > authority.maximum) {
    return { ok: false, code: "CONTROL_NUMBER_RANGE" };
  }
  if (authority.integer && !Number.isInteger(value)) {
    return { ok: false, code: "CONTROL_NUMBER_INTEGER" };
  }
  if (decimalPlaces(raw) > authority.precision) {
    return { ok: false, code: "CONTROL_NUMBER_PRECISION" };
  }
  return { ok: true, value };
}

export function hasDeclaredPrecision(value: number, precision: number): boolean {
  const scale = 10 ** precision;
  const scaled = value * scale;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

function admitStructuredNumberDomain(
  value: unknown,
  authority: NumericAuthority,
): RawNumberAdmission {
  if (value === null) {
    return authority.nullable
      ? { ok: true, value: null }
      : { ok: false, code: "CONTROL_NUMBER_EMPTY" };
  }
  if (typeof value !== "number") {
    return { ok: false, code: "CONTROL_NUMBER_TYPE" };
  }
  if (!Number.isFinite(value)) {
    return { ok: false, code: "CONTROL_NUMBER_NONFINITE" };
  }
  if (value < authority.minimum || value > authority.maximum) {
    return { ok: false, code: "CONTROL_NUMBER_RANGE" };
  }
  if (authority.integer && !Number.isInteger(value)) {
    return { ok: false, code: "CONTROL_NUMBER_INTEGER" };
  }
  return { ok: true, value };
}

/** Shared structured-value gate used after UI parsing and at server/engine boundaries. */
export function admitStructuredNumber(
  value: unknown,
  authority: NumericAuthority,
): RawNumberAdmission {
  const domain = admitStructuredNumberDomain(value, authority);
  if (!domain.ok || domain.value === null) return domain;
  const admittedValue = domain.value;
  if (!hasDeclaredPrecision(admittedValue, authority.precision)) {
    return { ok: false, code: "CONTROL_NUMBER_PRECISION" };
  }
  return domain;
}

export function validateStructuredScenarioNumbers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{
      fieldPath: "$",
      code: "CONTROL_NUMBER_TYPE" as const,
    }];
  }
  const input = value as Record<string, unknown>;
  const errors: Array<{ fieldPath: string; code: ScenarioNumberAdmissionCode }> = [];
  for (const [field, row] of Object.entries(LEGACY_SCENARIO_CONTROL_AUTHORITY)) {
    if (!row.numeric) continue;
    // Duplicate legacy projections may contain higher-precision computed
    // values, but they remain untrusted input until #154 removes them. Skip
    // only authored precision; type, nullability, finiteness, range and integer
    // constraints still fail closed before compilation.
    const result = row.causalState === "DUPLICATE_AUTHORITY"
      ? admitStructuredNumberDomain(input[field], row.numeric)
      : admitStructuredNumber(input[field], row.numeric);
    if (!result.ok) errors.push({ fieldPath: `$.${field}`, code: result.code });
  }
  return errors;
}

export function assertStructuredScenarioNumbers(value: unknown): void {
  const error = validateStructuredScenarioNumbers(value)[0];
  if (error) throw new ScenarioControlAdmissionError(error.code, error.fieldPath);
}

export function admitRawScenarioNumber(field: keyof Scenario, raw: string): RawNumberAdmission {
  const authority = LEGACY_SCENARIO_CONTROL_AUTHORITY[field].numeric;
  if (!authority) throw new TypeError(`Scenario field ${field} is not numeric.`);
  return admitRawNumber(raw, authority);
}
