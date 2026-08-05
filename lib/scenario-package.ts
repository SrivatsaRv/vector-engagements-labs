import type { ScenarioDefinition } from "./scenarios.ts";

export const SCENARIO_PACKAGE_SCHEMA_VERSION = "vector.scenario.v3";

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
      candidate.preparedEvent &&
      candidate.scenario &&
      candidate.scenario.domain === candidate.domain &&
      candidate.scenario.name &&
      candidate.scenario.objective &&
      candidate.scenario.studyAreaId &&
      candidate.scenario.weatherPresetId &&
      Number.isFinite(candidate.scenario.seed),
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
