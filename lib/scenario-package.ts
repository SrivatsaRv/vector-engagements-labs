import {
  AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION,
  type AuthoredRouteProfile,
  type ScenarioDefinition,
} from "./scenarios.ts";

export const SCENARIO_PACKAGE_SCHEMA_VERSION = "vector.scenario.v4";

export type StoredScenarioPackage = {
  id: string;
  version: string;
  domain: string;
  title: string;
  status: "VALIDATED";
  package: ScenarioDefinition;
  schema_version: string;
  content_hash: string;
  engine_version: string;
  intended_use_id: string;
  intended_use_version: string;
  model_pack_id: string;
  model_pack_version: string;
  model_pack_digest: string;
};

const PROFILE_IDS = new Set([
  "bvr-offset-and-support",
  "wvr-one-circle-defensive-break",
  "beam-drag-extend-recommit",
]);
const LEG_INTENTS = new Set([
  "MERGE", "OFFSET", "SUPPORT", "BEAM", "DRAG", "DEFENSIVE_BREAK",
  "ONE_CIRCLE", "EXTEND", "INTERCEPT", "RECOMMIT",
]);

function exactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function isAuthoredRouteProfile(value: unknown): value is AuthoredRouteProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<AuthoredRouteProfile>;
  if (!exactKeys(profile, ["schemaVersion", "id", "label", "authority", "blue", "red", "limitations"])) return false;
  if (
    profile.schemaVersion !== AUTHORED_ROUTE_PROFILE_SCHEMA_VERSION
    || !PROFILE_IDS.has(profile.id ?? "")
    || typeof profile.label !== "string"
    || profile.label.trim().length === 0
    || profile.authority !== "AUTHORED_ROUTE"
    || !Array.isArray(profile.limitations)
    || profile.limitations.length === 0
    || profile.limitations.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) return false;
  for (const side of [profile.blue, profile.red]) {
    if (!side || typeof side !== "object" || Array.isArray(side) || !exactKeys(side, ["legs"])) return false;
    if (!Array.isArray(side.legs) || side.legs.length !== 3 || side.legs.some((leg) => !LEG_INTENTS.has(leg))) return false;
  }
  return true;
}

export function isScenarioDefinition(value: unknown): value is ScenarioDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScenarioDefinition>;
  return Boolean(
    candidate.id &&
      candidate.version &&
      candidate.intendedUse?.id &&
      candidate.intendedUse?.version &&
      candidate.modelPack?.id &&
      candidate.modelPack?.version &&
      candidate.modelPack?.digest?.match(/^[0-9a-f]{64}$/) &&
      candidate.domain &&
      candidate.title &&
      candidate.summary &&
      candidate.blue &&
      candidate.red &&
      Array.isArray(candidate.tags) &&
      Array.isArray(candidate.focusOptions) &&
      candidate.runVariants?.length === 3 &&
      candidate.scenario &&
      candidate.scenario.domain === candidate.domain &&
      candidate.scenario.name &&
      candidate.scenario.objective &&
      candidate.scenario.studyAreaId &&
      candidate.scenario.weatherPresetId &&
      Number.isFinite(candidate.scenario.seed) &&
      (candidate.authoredProfile === undefined || isAuthoredRouteProfile(candidate.authoredProfile)) &&
      (candidate.scenario.domain !== "A2A" || candidate.scenario.airMission?.schemaVersion === "vector.air-mission.v1"),
  );
}

export function isStoredScenarioPackage(
  value: unknown,
): value is StoredScenarioPackage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredScenarioPackage>;
  return Boolean(
    candidate.id &&
      candidate.version &&
      candidate.status === "VALIDATED" &&
      candidate.schema_version === SCENARIO_PACKAGE_SCHEMA_VERSION &&
      candidate.engine_version &&
      candidate.intended_use_id === candidate.package?.intendedUse?.id &&
      candidate.intended_use_version === candidate.package?.intendedUse?.version &&
      candidate.model_pack_id === candidate.package?.modelPack?.id &&
      candidate.model_pack_version === candidate.package?.modelPack?.version &&
      candidate.model_pack_digest === candidate.package?.modelPack?.digest &&
      candidate.content_hash?.match(/^[0-9a-f]{64}$/) &&
      isScenarioDefinition(candidate.package) &&
      candidate.package.id === candidate.id &&
      candidate.package.version === candidate.version &&
      candidate.package.domain === candidate.domain &&
      candidate.package.title === candidate.title,
  );
}
