import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPILED_MODEL_PACK_SCHEMA_VERSION,
  MODEL_PATCH_SCHEMA_VERSION,
  ModelPackValidationError,
  compileModelPack,
  validateScenarioModelInstance,
  validateScenarioModelPatch,
  verifyCompiledModelPackDigest,
} from "../lib/model-pack.ts";
import {
  CURRENT_MODEL_PACK_DIGEST,
  createCurrentModelPackSource,
} from "../lib/reference-model-pack.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/model-packs/vector-scalar-study-v0.6.compiled.json", import.meta.url),
    "utf8",
  ),
);

const cloneSource = () => structuredClone(createCurrentModelPackSource());

test("model source compiles deterministically to the committed immutable SI fixture", async () => {
  const first = await compileModelPack(cloneSource());
  const second = await compileModelPack(cloneSource());
  assert.deepEqual(first, second);
  assert.deepEqual(first, fixture);
  assert.equal(first.pack.schemaVersion, COMPILED_MODEL_PACK_SCHEMA_VERSION);
  assert.equal(first.pack.unitSystem, "SI");
  assert.equal(first.pack.digest, CURRENT_MODEL_PACK_DIGEST);
  assert.equal(await verifyCompiledModelPackDigest(first.pack), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.pack.weapons[0]), true);
  assert.equal(first.pack.aerodynamics[0].coefficientTables[1].axes[0].unit, "rad");
  assert.ok(Math.abs(first.pack.aerodynamics[0].coefficientTables[1].axes[0].values[0] + Math.PI / 18) < 1e-12);
});

test("one physical value changes the digest and invalidates approved evidence", async () => {
  const reviewedSource = cloneSource();
  const draft = await compileModelPack(reviewedSource);
  reviewedSource.credibility.approvalState = "APPROVED_FOR_DECLARED_USE";
  reviewedSource.credibility.cases = reviewedSource.credibility.cases.map((item) => ({
    ...item,
    result: "PASS",
    reviewedModelDigest: draft.pack.digest,
    executedAt: "2026-08-06T00:00:00.000Z",
  }));
  const approved = await compileModelPack(reviewedSource);
  assert.equal(approved.pack.digest, draft.pack.digest);

  reviewedSource.weapons[0].launchMass.value += 1;
  await assert.rejects(
    compileModelPack(reviewedSource),
    (error) =>
      error instanceof ModelPackValidationError &&
      error.message.includes("approved credibility cases must all pass against"),
  );
});

test("source validation rejects missing units, coefficients, evidence, references and cycles", async () => {
  const mutations = [
    (source) => {
      source.aircraft[0].emptyMass.unit = undefined;
    },
    (source) => {
      source.aerodynamics[0].coefficientTables = [];
    },
    (source) => {
      source.weapons[0].evidenceRefIds = ["missing-evidence"];
    },
    (source) => {
      source.aircraft[0].aerodynamicModelId = "missing-aerodynamics";
    },
    (source) => {
      source.aerodynamics[0].dependsOn = [source.aircraft[0].id];
    },
    (source) => {
      source.aerodynamics[0].coefficientTables[0].axes[0].values = [2, 1];
    },
    (source) => {
      source.aerodynamics[0].coefficientTables[0].values.push(0.4);
    },
    (source) => {
      source.propulsion[0].thrustTable.values[0] = Number.NaN;
    },
  ];
  for (const mutate of mutations) {
    const source = cloneSource();
    mutate(source);
    await assert.rejects(compileModelPack(source), ModelPackValidationError);
  }
});

test("aircraft admission rejects a component or table that cannot cover its declared validity envelope", async () => {
  const insufficientAerodynamicEnvelope = cloneSource();
  insufficientAerodynamicEnvelope.aerodynamics[0].validityDomain.mach.maximum = 0.8;
  await assert.rejects(
    compileModelPack(insufficientAerodynamicEnvelope),
    /aerodynamicModel\.validityDomain does not cover its admitted aircraft validity domain/,
  );

  const insufficientTableEnvironment = cloneSource();
  insufficientTableEnvironment.propulsion[0].thrustTable.validityDomain.environments = ["OTHER_ENVIRONMENT"];
  await assert.rejects(
    compileModelPack(insufficientTableEnvironment),
    /thrustTable\.validityDomain does not cover its admitted aircraft validity domain/,
  );
});

test("instances enforce catalog identity, station capacity and compatibility", async () => {
  const { pack } = await compileModelPack(cloneSource());
  const aircraft = pack.aircraft[0];
  const loadout = pack.loadouts[aircraft.loadoutModelIndex];
  const station = loadout.stations[0];
  const store = pack.weapons[station.compatibleStoreModelIndexes[0]];
  const valid = {
    id: "scenario-blue-1",
    catalogObjectId: aircraft.catalogObjectId,
    modelId: aircraft.id,
    modelPackDigest: pack.digest,
    loadout: [{ stationId: station.id, storeModelId: store.id, quantity: 1 }],
    patches: [],
  };
  assert.doesNotThrow(() => validateScenarioModelInstance(pack, valid));
  assert.throws(
    () => validateScenarioModelInstance(pack, {
      ...valid,
      loadout: [{ ...valid.loadout[0], quantity: 2 }],
    }),
    /exceeds station capacity/,
  );
  assert.throws(
    () => validateScenarioModelInstance(pack, {
      ...valid,
      loadout: [{ ...valid.loadout[0], storeModelId: pack.weapons.at(-1).id }],
    }),
    /incompatible|no supported compatibility rule/,
  );
  assert.throws(
    () => validateScenarioModelInstance(pack, { ...valid, catalogObjectId: "wrong-object" }),
    /catalog identity does not match/,
  );
});

test("scenario-local patches retain old/new/unit/reason/provenance and fail closed", async () => {
  const { pack } = await compileModelPack(cloneSource());
  const aircraft = pack.aircraft[0];
  const patch = {
    schemaVersion: MODEL_PATCH_SCHEMA_VERSION,
    id: "scenario-blue-1-empty-mass-patch",
    modelPackDigest: pack.digest,
    modelId: aircraft.id,
    fieldPath: "/emptyMassKg",
    oldValue: aircraft.emptyMassKg,
    newValue: aircraft.emptyMassKg + 100,
    unit: "kg",
    reason: "Controlled sensitivity case",
    provenance: {
      authorId: "analyst-1",
      authoredAt: "2026-08-06T00:00:00.000Z",
      evidenceRefIds: [pack.evidence[0].id],
    },
  };
  assert.doesNotThrow(() => validateScenarioModelPatch(pack, structuredClone(patch)));
  assert.deepEqual(JSON.parse(JSON.stringify(patch)), patch);
  assert.throws(
    () => validateScenarioModelPatch(pack, { ...patch, oldValue: patch.oldValue + 1 }),
    /oldValue must equal compiled value/,
  );
  assert.throws(
    () => validateScenarioModelPatch(pack, { ...patch, unit: "m" }),
    /patch.unit must be kg/,
  );
  assert.throws(
    () => validateScenarioModelPatch(pack, { ...patch, fieldPath: "/coefficientTables/0" }),
    /not patchable/,
  );
});

test("one loaded pack instantiates and validates 1, 10, 100 and 500 objects without reparsing", async (context) => {
  const { pack } = await compileModelPack(cloneSource());
  const aircraft = pack.aircraft[0];
  const measurements = [];
  for (const count of [1, 10, 100, 500]) {
    const started = performance.now();
    for (let index = 0; index < count; index += 1) {
      validateScenarioModelInstance(pack, {
        id: `instance-${count}-${index}`,
        catalogObjectId: aircraft.catalogObjectId,
        modelId: aircraft.id,
        modelPackDigest: pack.digest,
        loadout: [],
        patches: [],
      });
    }
    measurements.push({ count, elapsedMs: performance.now() - started });
  }
  context.diagnostic(`model-pack instantiation: ${JSON.stringify(measurements)}`);
  assert.ok(measurements.at(-1).elapsedMs < 1_000);
});
