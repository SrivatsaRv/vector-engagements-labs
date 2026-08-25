import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPILED_MODEL_PACK_SCHEMA_VERSION,
  AircraftPerformanceAdmissionError,
  MODEL_PATCH_SCHEMA_VERSION,
  ModelPackValidationError,
  compileModelPack,
  requireNamedAircraftPerformanceAdmission,
  validateScenarioModelInstance,
  validateScenarioModelPatch,
  verifyCompiledModelPackDigest,
} from "../lib/model-pack.ts";
import {
  CURRENT_MODEL_PACK_DIGEST,
  createCurrentModelPackSource,
} from "../lib/reference-model-pack.ts";
import { resolveCompiledWeaponAdmission } from "../lib/engine/weapon-admission.ts";
import { assertGovernedAircraftEvidenceAdmissionForRegistry } from "../lib/aircraft-evidence-registry.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json", import.meta.url),
    "utf8",
  ),
);
const aircraftEvidenceRegistry = JSON.parse(
  await readFile(new URL("../governance/aircraft-evidence-registry.v2.json", import.meta.url), "utf8"),
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
  assert.equal(first.pack.weapons[0].seekerMode, "UNAVAILABLE");
  assert.equal(first.pack.weapons[0].supportRequirement, "UNAVAILABLE");
  assert.equal(first.pack.weapons[0].launchAuthorization, "SCHEDULED_TEST_ONLY");
  assert.ok(first.pack.aircraft.every((aircraft) => aircraft.performanceAdmission.state === "UNSUPPORTED"));
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
    (source) => {
      source.weapons[0].seekerMode = undefined;
    },
    (source) => {
      source.weapons[0].supportRequirement = "TYPO_SUPPORT";
    },
  ];
  for (const mutate of mutations) {
    const source = cloneSource();
    mutate(source);
    await assert.rejects(compileModelPack(source), ModelPackValidationError);
  }
});

test("positive sensor admission requires separate immutable evidence and every declared measurement bound", async () => {
  const source = cloneSource();
  source.evidence.push(
    {
      id: "sensor-source-artifact",
      kind: "SOURCE",
      title: "Synthetic source artifact used only to exercise sensor-admission validation",
      uri: "urn:vector:test:sensor-source-artifact",
      contentSha256: "c".repeat(64),
      accessedAt: "2026-08-21",
    },
    {
      id: "sensor-validation-artifact",
      kind: "VALIDATION",
      title: "Synthetic independent validation artifact used only to exercise sensor-admission validation",
      uri: "urn:vector:test:sensor-validation-artifact",
      contentSha256: "d".repeat(64),
      accessedAt: "2026-08-21",
    },
  );
  const sensor = source.sensors[0];
  sensor.sensorKind = "RADAR";
  sensor.evidenceRefIds = ["sensor-source-artifact", "sensor-validation-artifact"];
  sensor.evidenceAdmission = {
    schemaVersion: "vector.sensor-evidence-admission.v1",
    sourceEvidenceRefIds: ["sensor-source-artifact"],
    validationEvidenceRefIds: ["sensor-validation-artifact"],
    coverage: {
      detectionRange: "VALIDATED",
      minimumRange: "VALIDATED",
      scanPeriod: "VALIDATED",
      azimuthFieldOfView: "VALIDATED",
      elevationFieldOfView: "VALIDATED",
      measurementUncertainty: "VALIDATED",
      targetApplicability: "VALIDATED",
    },
  };
  const admitted = await compileModelPack(source);
  assert.equal(admitted.pack.sensors[0].evidenceAdmission.coverage.minimumRange, "VALIDATED");

  const unknownMinimum = structuredClone(source);
  unknownMinimum.sensors[0].evidenceAdmission.coverage.minimumRange = "UNKNOWN";
  await assert.rejects(
    compileModelPack(unknownMinimum),
    /evidenceAdmission\.coverage\.minimumRange must be VALIDATED for a positive sensor/,
  );
  const oneArtifact = structuredClone(source);
  oneArtifact.sensors[0].evidenceAdmission.validationEvidenceRefIds = ["sensor-source-artifact"];
  await assert.rejects(
    compileModelPack(oneArtifact),
    /validationEvidenceRefIds evidence sensor-source-artifact must be VALIDATION|must not use one artifact/,
  );
  const unhashed = structuredClone(source);
  delete unhashed.evidence.find((item) => item.id === "sensor-validation-artifact").contentSha256;
  await assert.rejects(
    compileModelPack(unhashed),
    /validationEvidenceRefIds evidence sensor-validation-artifact must carry an immutable SHA-256 artifact digest/,
  );

  const production = await compileModelPack(cloneSource());
  assert.equal(production.pack.sensors[0].sensorKind, "DECLARED_ENVELOPE");
  assert.equal(production.pack.sensors[0].evidenceAdmission, undefined);
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

test("named-aircraft performance is unavailable until every capability has separately governed source and validation evidence", async () => {
  const unsupported = await compileModelPack(cloneSource());
  assert.throws(
    () => requireNamedAircraftPerformanceAdmission(unsupported.pack, unsupported.pack.aircraft[0].catalogObjectId),
    (error) => error instanceof AircraftPerformanceAdmissionError && /scalar regression assumptions/.test(error.message),
  );

  const source = cloneSource();
  source.evidence.push(
    {
      id: "public-aircraft-source",
      kind: "SOURCE",
      title: "Immutable public aircraft evidence fixture",
      uri: "urn:vector:test:public-aircraft-source",
      contentSha256: "a".repeat(64),
      accessedAt: "2026-08-21",
    },
    {
      id: "independent-aircraft-validation",
      kind: "VALIDATION",
      title: "Independent public aircraft validation fixture",
      uri: "urn:vector:test:independent-aircraft-validation",
      contentSha256: "b".repeat(64),
      accessedAt: "2026-08-21",
    },
  );
  source.aircraft[0].performanceAdmission = {
    state: "ADMITTED",
    capabilities: ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS", "MASS_AND_STORES", "SENSORS"].map((capability) => ({
      capability,
      sourceEvidenceRefIds: ["public-aircraft-source"],
      validationEvidenceRefIds: ["independent-aircraft-validation"],
    })),
  };
  await assert.rejects(
    compileModelPack(source),
    /unsupported by the governed evidence registry/,
  );

  const missingCapability = structuredClone(source);
  missingCapability.aircraft[0].performanceAdmission.capabilities.pop();
  await assert.rejects(
    compileModelPack(missingCapability),
    /performanceAdmission\.capabilities is missing SENSORS/,
  );
  const assumptionAsSource = structuredClone(source);
  assumptionAsSource.aircraft[0].performanceAdmission.capabilities[0].sourceEvidenceRefIds = [
    "current-scalar-model-assumptions",
  ];
  await assert.rejects(
    compileModelPack(assumptionAsSource),
    /must be SOURCE/,
  );
  const unhashedValidation = structuredClone(source);
  delete unhashedValidation.evidence.find((item) => item.id === "independent-aircraft-validation").contentSha256;
  await assert.rejects(
    compileModelPack(unhashedValidation),
    /must carry an immutable SHA-256 artifact digest/,
  );
});

test("governed named-aircraft admission binds model-pack evidence identity, digest, subject, and capability", () => {
  const governed = structuredClone(aircraftEvidenceRegistry);
  const claim = governed.claims.find((item) => item.id === "su-30mki-performance");
  const capabilities = ["AERODYNAMICS", "PROPULSION", "FLIGHT_CONTROLS", "MASS_AND_STORES", "SENSORS"];
  const sourceArtifact = {
    id: "su30-exact-source",
    kind: "SOURCE",
    sha256: "a".repeat(64),
    hashReviewState: "VERIFIED",
    licenseReviewState: "REVIEWED",
    admissionUse: "NAMED_PERFORMANCE_SOURCE",
    subjectClaimIds: [claim.id],
    eligibleClaimIds: [claim.id],
    capabilityCoverage: capabilities,
  };
  const validationArtifact = {
    ...sourceArtifact,
    id: "su30-exact-validation",
    kind: "VALIDATION",
    sha256: "b".repeat(64),
    admissionUse: "NAMED_PERFORMANCE_VALIDATION",
  };
  governed.artifacts.push(sourceArtifact, validationArtifact);
  claim.state = "ADMITTED";
  claim.capabilities = capabilities.map((capability) => ({
    capability,
    sourceArtifactIds: [sourceArtifact.id],
    validationArtifactIds: [validationArtifact.id],
  }));
  const admission = {
    state: "ADMITTED",
    capabilities: capabilities.map((capability) => ({
      capability,
      sourceEvidenceRefIds: [sourceArtifact.id],
      validationEvidenceRefIds: [validationArtifact.id],
    })),
  };
  const evidence = new Map([
    [sourceArtifact.id, { id: sourceArtifact.id, kind: "SOURCE", contentSha256: sourceArtifact.sha256 }],
    [validationArtifact.id, { id: validationArtifact.id, kind: "VALIDATION", contentSha256: validationArtifact.sha256 }],
  ]);
  assert.doesNotThrow(() =>
    assertGovernedAircraftEvidenceAdmissionForRegistry(governed, "su-30mki", admission, evidence),
  );

  const wrongDigest = new Map(evidence);
  wrongDigest.set(sourceArtifact.id, { ...wrongDigest.get(sourceArtifact.id), contentSha256: "c".repeat(64) });
  assert.throws(
    () => assertGovernedAircraftEvidenceAdmissionForRegistry(governed, "su-30mki", admission, wrongDigest),
    /identity or SHA-256/,
  );

  sourceArtifact.subjectClaimIds = ["f-16c-block52-paf-performance"];
  sourceArtifact.eligibleClaimIds = ["f-16c-block52-paf-performance"];
  assert.throws(
    () => assertGovernedAircraftEvidenceAdmissionForRegistry(governed, "su-30mki", admission, evidence),
    /different subject or claim/,
  );
  sourceArtifact.subjectClaimIds = [claim.id];
  sourceArtifact.eligibleClaimIds = [claim.id];
  sourceArtifact.capabilityCoverage = ["PROPULSION"];
  assert.throws(
    () => assertGovernedAircraftEvidenceAdmissionForRegistry(governed, "su-30mki", admission, evidence),
    /capability coverage/,
  );
});

test("weapon admission is resolved only from compiled identity, station, and compatibility", () => {
  const pack = structuredClone(fixture.pack);
  const weapon = pack.weapons[0];
  const platform = pack.compatibility.find((item) => item.storeModelIndex === 0)?.platformCatalogObjectId;
  assert.ok(platform);
  const admitted = resolveCompiledWeaponAdmission(pack, platform, weapon.catalogObjectId);
  assert.equal(admitted.admission.modelPackDigest, pack.digest);
  assert.equal(admitted.admission.weaponModelId, weapon.id);
  assert.throws(
    () => resolveCompiledWeaponAdmission(pack, platform, "unknown-weapon"),
    /Missing compiled weapon model/,
  );
  pack.compatibility = pack.compatibility.filter((item) => item.storeModelIndex !== 0);
  assert.throws(
    () => resolveCompiledWeaponAdmission(pack, platform, weapon.catalogObjectId),
    /Incompatible loadout/,
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
      loadout: [{ ...valid.loadout[0], quantity: station.maximumQuantity + 1 }],
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
