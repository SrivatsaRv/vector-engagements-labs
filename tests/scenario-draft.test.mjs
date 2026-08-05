import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraftEntity,
  appendScenarioModelPatch,
  appendDraftWaypoint,
  createBlankScenarioDraft,
  duplicateDraftEntity,
  referencesToEntity,
  removeDraftEntity,
  updateDraftEntity,
  validateScenarioDraft,
} from "../lib/scenario-draft.ts";

const point = { longitude: 74.5, latitude: 31.2, altitudeM: 8500 };
const entity = (id, affiliation, kind = "AIRCRAFT") => ({
  id,
  affiliation,
  kind,
  catalogObjectId: `${id}-catalog`,
  modelId: `${id}-model`,
  designation: id,
  position: point,
  headingDeg: 90,
  speedMps: 250,
  route: [],
  loadout: [],
});

test("blank scenario begins empty and teaches the required first actions", () => {
  const draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  assert.equal(draft.entities.length, 0);
  assert.deepEqual(validateScenarioDraft(draft), [
    "Run purpose is required.",
    "Add at least one Blue Team entity.",
    "Add at least one Red Team entity.",
  ]);
});

test("add, update, duplicate and waypoint operations preserve stable identities and revisions", () => {
  let draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  draft = addDraftEntity(draft, entity("blue-1", "BLUE"));
  draft = updateDraftEntity(draft, "blue-1", { headingDeg: 145 });
  draft = appendDraftWaypoint(draft, "blue-1", {
    id: "blue-1-waypoint-1",
    longitude: 74.7,
    latitude: 31.3,
    altitudeM: 9000,
    speedMps: 270,
  });
  draft = duplicateDraftEntity(draft, "blue-1", "blue-2");
  assert.equal(draft.revision, 4);
  assert.equal(draft.entities[0].id, "blue-1");
  assert.equal(draft.entities[0].headingDeg, 145);
  assert.equal(draft.entities[1].id, "blue-2");
  assert.equal(draft.entities[1].route[0].id, "blue-2-waypoint-1");
});

test("remove rejects referenced entities and succeeds after dependency resolution", () => {
  let draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  draft = addDraftEntity(draft, entity("blue-1", "BLUE"));
  draft = addDraftEntity(draft, {
    ...entity("weapon-1", "BLUE", "GUIDED_WEAPON"),
    launchPlatformId: "blue-1",
    targetEntityId: "red-1",
  });
  draft = addDraftEntity(draft, entity("red-1", "RED"));
  assert.deepEqual(referencesToEntity(draft, "blue-1"), [
    { ownerId: "weapon-1", field: "launchPlatformId" },
  ]);
  assert.throws(() => removeDraftEntity(draft, "blue-1"), /referenced by weapon-1\.launchPlatformId/);
  draft = updateDraftEntity(draft, "weapon-1", { launchPlatformId: undefined });
  draft = removeDraftEntity(draft, "blue-1");
  assert.equal(draft.entities.some((item) => item.id === "blue-1"), false);
});

test("validation rejects missing references and invalid geographic authoring state", () => {
  let draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  draft = { ...draft, name: "Study", objective: "Compare placement" };
  draft = addDraftEntity(draft, {
    ...entity("blue-1", "BLUE"),
    headingDeg: 360,
    position: { ...point, longitude: 181 },
    targetEntityId: "missing",
  });
  draft = addDraftEntity(draft, entity("red-1", "RED"));
  assert.deepEqual(validateScenarioDraft(draft), [
    "blue-1 references a missing target.",
    "blue-1 has an invalid longitude.",
    "blue-1 heading must be between 0 and 359 degrees.",
  ]);
});

test("scenario patches are revisioned, digest-bound and preserve their audit record", () => {
  let draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  const patch = {
    schemaVersion: "vector.model-patch.v1",
    id: "blue-1-mass-sensitivity",
    modelPackDigest: draft.modelPack.digest,
    modelId: "su-30mki-aircraft-study-v05",
    fieldPath: "/emptyMassKg",
    oldValue: 18400,
    newValue: 18500,
    unit: "kg",
    reason: "Sensitivity case",
    provenance: {
      authorId: "analyst-1",
      authoredAt: "2026-08-06T00:00:00.000Z",
      evidenceRefIds: ["current-scalar-model-assumptions"],
    },
  };
  draft = appendScenarioModelPatch(draft, patch);
  assert.equal(draft.revision, 1);
  assert.deepEqual(draft.modelPatches[0], patch);
  assert.throws(() => appendScenarioModelPatch(draft, patch), /duplicate model patch id/);
  assert.throws(
    () => appendScenarioModelPatch(draft, { ...patch, id: "other", modelPackDigest: "0".repeat(64) }),
    /digest does not match/,
  );
});

test("imported drafts reject duplicate or unstable entity IDs", () => {
  let draft = createBlankScenarioDraft({
    id: "draft-1",
    domain: "A2A",
    studyAreaId: "north-punjab",
    weatherPresetId: "north-punjab-clear",
  });
  draft = { ...draft, name: "Study", objective: "Check identity" };
  const blue = entity("Blue Entity", "BLUE");
  const red = entity("red-1", "RED");
  draft = { ...draft, entities: [blue, { ...red, id: blue.id }] };
  assert.deepEqual(validateScenarioDraft(draft), [
    "Entity IDs must be unique and stable.",
    "Blue Entity has an invalid stable entity ID.",
    "red-1 has an invalid stable entity ID.",
  ]);
});
