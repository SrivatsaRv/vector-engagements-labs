import type { Affiliation, EntityKind } from "./engine/contracts.ts";
import type { EngagementDomain } from "./simulation.ts";
import type { ScenarioModelPatch } from "./model-pack.ts";
import {
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "./reference-model-pack.ts";

export const SCENARIO_DRAFT_SCHEMA_VERSION = "vector.scenario-draft.v1";

export type GeographicPoint = {
  longitude: number;
  latitude: number;
  altitudeM: number;
};

export type DraftWaypoint = GeographicPoint & {
  id: string;
  speedMps: number;
};

export type DraftEntity = {
  id: string;
  affiliation: Affiliation;
  kind: EntityKind;
  catalogObjectId: string;
  modelId: string;
  designation: string;
  position: GeographicPoint;
  headingDeg: number;
  speedMps: number;
  route: DraftWaypoint[];
  loadout: Array<{ weaponId: string; quantity: number }>;
  targetEntityId?: string;
  launchPlatformId?: string;
};

export type ScenarioDraft = {
  schemaVersion: typeof SCENARIO_DRAFT_SCHEMA_VERSION;
  id: string;
  revision: number;
  name: string;
  objective: string;
  domain: EngagementDomain;
  studyAreaId: string;
  weatherPresetId: string;
  intendedUse: { id: string; version: string };
  modelPack: { id: string; version: string; digest: string };
  modelPatches: ScenarioModelPatch[];
  entities: DraftEntity[];
};

export function createBlankScenarioDraft(input: {
  id: string;
  domain: EngagementDomain;
  studyAreaId: string;
  weatherPresetId: string;
  intendedUse?: { id: string; version: string };
  modelPack?: { id: string; version: string; digest: string };
}): ScenarioDraft {
  return {
    schemaVersion: SCENARIO_DRAFT_SCHEMA_VERSION,
    id: input.id,
    revision: 0,
    name: "Untitled scenario",
    objective: "",
    domain: input.domain,
    studyAreaId: input.studyAreaId,
    weatherPresetId: input.weatherPresetId,
    intendedUse: input.intendedUse ?? {
      id: CURRENT_INTENDED_USE_ID,
      version: CURRENT_INTENDED_USE_VERSION,
    },
    modelPack: input.modelPack ?? {
      id: CURRENT_MODEL_PACK_ID,
      version: CURRENT_MODEL_PACK_VERSION,
      digest: CURRENT_MODEL_PACK_DIGEST,
    },
    modelPatches: [],
    entities: [],
  };
}

function nextRevision(draft: ScenarioDraft, entities = draft.entities) {
  return { ...draft, revision: draft.revision + 1, entities };
}

export function addDraftEntity(draft: ScenarioDraft, entity: DraftEntity) {
  if (draft.entities.some((candidate) => candidate.id === entity.id)) {
    throw new Error(`duplicate entity id: ${entity.id}`);
  }
  return nextRevision(draft, [...draft.entities, entity]);
}

export function duplicateDraftEntity(
  draft: ScenarioDraft,
  sourceId: string,
  newId: string,
) {
  const source = draft.entities.find((entity) => entity.id === sourceId);
  if (!source) throw new Error(`entity not found: ${sourceId}`);
  return addDraftEntity(draft, {
    ...structuredClone(source),
    id: newId,
    designation: `${source.designation} copy`,
    targetEntityId: undefined,
    launchPlatformId: undefined,
    route: source.route.map((waypoint, index) => ({
      ...waypoint,
      id: `${newId}-waypoint-${index + 1}`,
    })),
  });
}

export function referencesToEntity(draft: ScenarioDraft, entityId: string) {
  return draft.entities.flatMap((entity) => {
    const references: Array<{ ownerId: string; field: string }> = [];
    if (entity.targetEntityId === entityId) {
      references.push({ ownerId: entity.id, field: "targetEntityId" });
    }
    if (entity.launchPlatformId === entityId) {
      references.push({ ownerId: entity.id, field: "launchPlatformId" });
    }
    return references;
  });
}

export function removeDraftEntity(draft: ScenarioDraft, entityId: string) {
  if (!draft.entities.some((entity) => entity.id === entityId)) {
    throw new Error(`entity not found: ${entityId}`);
  }
  const references = referencesToEntity(draft, entityId);
  if (references.length > 0) {
    throw new Error(
      `entity ${entityId} is referenced by ${references.map((reference) => `${reference.ownerId}.${reference.field}`).join(", ")}`,
    );
  }
  return nextRevision(
    draft,
    draft.entities.filter((entity) => entity.id !== entityId),
  );
}

export function updateDraftEntity(
  draft: ScenarioDraft,
  entityId: string,
  patch: Partial<Omit<DraftEntity, "id">>,
) {
  let found = false;
  const entities = draft.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    found = true;
    return { ...entity, ...patch, id: entity.id };
  });
  if (!found) throw new Error(`entity not found: ${entityId}`);
  return nextRevision(draft, entities);
}

export function appendDraftWaypoint(
  draft: ScenarioDraft,
  entityId: string,
  waypoint: DraftWaypoint,
) {
  const entity = draft.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`entity not found: ${entityId}`);
  if (entity.route.some((candidate) => candidate.id === waypoint.id)) {
    throw new Error(`duplicate waypoint id: ${waypoint.id}`);
  }
  return updateDraftEntity(draft, entityId, {
    route: [...entity.route, waypoint],
  });
}

export function appendScenarioModelPatch(
  draft: ScenarioDraft,
  patch: ScenarioModelPatch,
) {
  if (draft.modelPatches.some((candidate) => candidate.id === patch.id)) {
    throw new Error(`duplicate model patch id: ${patch.id}`);
  }
  if (patch.modelPackDigest !== draft.modelPack.digest) {
    throw new Error("model patch digest does not match the draft model pack");
  }
  return {
    ...draft,
    revision: draft.revision + 1,
    modelPatches: [...draft.modelPatches, structuredClone(patch)],
  };
}

export function validateScenarioDraft(draft: ScenarioDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Scenario name is required.");
  if (!draft.objective.trim()) errors.push("Run purpose is required.");
  if (!draft.studyAreaId) errors.push("Study area is required.");
  if (!draft.weatherPresetId) errors.push("Weather preset is required.");
  if (!draft.intendedUse.id || !draft.intendedUse.version) {
    errors.push("Intended use is required.");
  }
  if (!draft.modelPack.id || !draft.modelPack.version || !draft.modelPack.digest.match(/^[0-9a-f]{64}$/)) {
    errors.push("A valid compiled model pack is required.");
  }
  if (!draft.entities.some((entity) => entity.affiliation === "BLUE")) {
    errors.push("Add at least one Blue Team entity.");
  }
  if (!draft.entities.some((entity) => entity.affiliation === "RED")) {
    errors.push("Add at least one Red Team entity.");
  }
  const ids = new Set(draft.entities.map((entity) => entity.id));
  if (ids.size !== draft.entities.length) {
    errors.push("Entity IDs must be unique and stable.");
  }
  for (const entity of draft.entities) {
    if (!entity.id.match(/^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/)) {
      errors.push(`${entity.designation} has an invalid stable entity ID.`);
    }
    if (!entity.catalogObjectId || !entity.modelId) {
      errors.push(`${entity.designation} requires catalog and model identities.`);
    }
    if (entity.targetEntityId && !ids.has(entity.targetEntityId)) {
      errors.push(`${entity.designation} references a missing target.`);
    }
    if (entity.launchPlatformId && !ids.has(entity.launchPlatformId)) {
      errors.push(`${entity.designation} references a missing launch platform.`);
    }
    if (!Number.isFinite(entity.position.longitude) || entity.position.longitude < -180 || entity.position.longitude > 180) {
      errors.push(`${entity.designation} has an invalid longitude.`);
    }
    if (!Number.isFinite(entity.position.latitude) || entity.position.latitude < -90 || entity.position.latitude > 90) {
      errors.push(`${entity.designation} has an invalid latitude.`);
    }
    if (entity.headingDeg < 0 || entity.headingDeg >= 360) {
      errors.push(`${entity.designation} heading must be between 0 and 359 degrees.`);
    }
  }
  for (const patch of draft.modelPatches) {
    if (patch.modelPackDigest !== draft.modelPack.digest) {
      errors.push(`Model patch ${patch.id} references a different model pack.`);
    }
  }
  return errors;
}
