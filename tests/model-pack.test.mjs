import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import {
  COMPILED_MODEL_PACK_V2_SCHEMA_VERSION,
  COMPILED_MODEL_PACK_SCHEMA_VERSION,
  GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION,
  InMemoryModelPackRepository,
  AircraftPerformanceAdmissionError,
  MODEL_PATCH_SCHEMA_VERSION,
  ModelPackValidationError,
  compileGovernedModelPack,
  compileModelPack,
  preflightGovernedModelPackTables,
  readLegacyCompiledModelPack,
  rebuildAircraftDerivative,
  sha256ArtifactBytes,
  requireNamedAircraftPerformanceAdmission,
  validateScenarioModelInstance,
  validateScenarioModelPatch,
  validateCompiledModelPackV2,
  verifyCompiledModelPackDigest,
} from "../lib/model-pack.ts";
import {
  CURRENT_MODEL_PACK_DIGEST,
  createCurrentModelPackSource,
} from "../lib/reference-model-pack.ts";
import { resolveCompiledWeaponAdmission } from "../lib/engine/weapon-admission.ts";
import { assertGovernedAircraftEvidenceAdmissionForRegistry } from "../lib/aircraft-evidence-registry.ts";
import { createAnonymousGovernedPublication } from "../scripts/lib/anonymous-model-pack-foundation.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/model-packs/vector-scalar-study-v0.9.compiled.json", import.meta.url),
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
  assert.deepEqual(first.pack.weapons[0].termination, {
    schemaVersion: "vector.weapon-termination-model.v1",
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    criterion: "GEOMETRIC_CLOSEST_APPROACH",
    interceptRadiusM: 25,
    maximumFlightTimeS: 180,
  });
  assert.ok(first.pack.aircraft.every((aircraft) => aircraft.performanceAdmission.state === "UNSUPPORTED"));
});

test("weapon termination authority is complete, typed, finite, and positive at model-pack compilation", async () => {
  const cases = [
    ["missing", (source) => { delete source.weapons[0].termination; }],
    ["schema", (source) => { source.weapons[0].termination.schemaVersion = "vector.weapon-termination-model.v0"; }],
    ["intended use", (source) => { source.weapons[0].termination.intendedUse = "OPERATIONAL"; }],
    ["criterion", (source) => { source.weapons[0].termination.criterion = "RENDERER_DISTANCE"; }],
    ["radius", (source) => { source.weapons[0].termination.interceptRadius.value = Number.NaN; }],
    ["flight time", (source) => { source.weapons[0].termination.maximumFlightTime.value = 0; }],
  ];
  for (const [name, mutate] of cases) {
    const source = cloneSource();
    mutate(source);
    await assert.rejects(() => compileModelPack(source), ModelPackValidationError, name);
  }
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

test("two anonymous governed packs use one compiler and exact resolver without singleton authority", async () => {
  const alphaInput = await createAnonymousGovernedPublication("anonymous-pack-alpha", 0);
  const bravoInput = await createAnonymousGovernedPublication("anonymous-pack-bravo", 25);
  const alpha = await compileGovernedModelPack(alphaInput);
  const bravo = await compileGovernedModelPack(bravoInput);
  assert.equal(alpha.pack.schemaVersion, COMPILED_MODEL_PACK_V2_SCHEMA_VERSION);
  assert.equal(bravo.pack.schemaVersion, COMPILED_MODEL_PACK_V2_SCHEMA_VERSION);
  assert.notEqual(alpha.pack.digest, bravo.pack.digest);
  assert.equal(alpha.pack.requirementCompleteness.complete, true);
  assert.equal(bravo.pack.requirementCompleteness.complete, true);
  assert.deepEqual(await validateCompiledModelPackV2(structuredClone(alpha.pack)), alpha.pack);

  const unknownCompiledKey = structuredClone(alpha.pack);
  unknownCompiledKey.inventedAuthority = true;
  await assert.rejects(
    validateCompiledModelPackV2(unknownCompiledKey),
    /\[MODEL_PACK_V2_SCHEMA\] pack has unsupported field inventedAuthority/,
  );

  const lastByteTamper = structuredClone(alpha.pack);
  lastByteTamper.evidenceLineage.at(-1).gapReason = "last-byte tamper";
  await assert.rejects(
    validateCompiledModelPackV2(lastByteTamper),
    /\[MODEL_PACK_V2_SCHEMA\].*gapReason|\[MODEL_PACK_V2_IDENTITY\]/,
  );

  const repository = new InMemoryModelPackRepository();
  await repository.publishBatch([
    { ...alphaInput, bundle: alpha },
    { ...bravoInput, bundle: bravo },
  ]);
  const resolved = await repository.resolveExact({
    id: bravo.pack.id,
    version: bravo.pack.version,
    digest: bravo.pack.digest,
  });
  assert.deepEqual(resolved, bravo);
  await assert.rejects(
    repository.resolveExact({ id: resolved.pack.id, version: resolved.pack.version, digest: alpha.pack.digest }),
    /exact compiled model pack was not found/,
  );
});

test("two serialized anonymous packs import through the identical compiler and explain configuration contrasts", async () => {
  const archives = await Promise.all(["alpha", "bravo"].map(async (suffix) => JSON.parse(await readFile(
    new URL(`../fixtures/model-packs/anonymous-pack-${suffix}.governed.v2.json`, import.meta.url),
    "utf8",
  ))));
  const repository = new InMemoryModelPackRepository();
  for (const archive of archives) await repository.importResearch(archive);
  const bundles = [];
  for (const archive of archives) {
    const pack = archive.publications[0].bundle.pack;
    bundles.push(await repository.resolveExact({ id: pack.id, version: pack.version, digest: pack.digest }));
  }
  const [alpha, bravo] = bundles;
  assert.equal(alpha.pack.propulsion[0].thrustTable.axes.length, 2);
  assert.deepEqual(alpha.pack.propulsion[0].thrustTable.validityDomain.configurations, [
    "CONFIGURATION_ALPHA", "CONFIGURATION_BRAVO",
  ]);
  assert.equal(bravo.pack.loadouts[0].stations[0].maximumQuantity, alpha.pack.loadouts[0].stations[0].maximumQuantity + 1);
  assert.notEqual(bravo.pack.propulsion[0].thrustTable.values[0], alpha.pack.propulsion[0].thrustTable.values[0]);
  assert.notEqual(bravo.pack.digest, alpha.pack.digest);
  assert.doesNotMatch(JSON.stringify(archives), /"(?:su-30|f-16|mirage|jf-17|astra|aim-120)/i);

  const alphaPublication = archives[0].publications[0];
  const unchangedLineageMutation = {
    source: structuredClone(alphaPublication.source),
    rawArtifactBytes: alphaPublication.rawArtifactBytes.map((item) => ({
      digest: item.digest,
      bytes: Uint8Array.from(item.bytes),
    })),
    derivativeBytes: alphaPublication.derivativeBytes.map((item) => ({
      digest: item.digest,
      bytes: Uint8Array.from(item.bytes),
    })),
  };
  const weapon = unchangedLineageMutation.source.weapons[0];
  const supportLineage = unchangedLineageMutation.source.governance.fieldLineage.filter((item) =>
    item.componentId === weapon.id && item.selector === "/supportRequirement"
  );
  assert.deepEqual(supportLineage.map((item) => item.evidenceRole).sort(), ["SOURCE", "SOURCE", "VALIDATION", "VALIDATION"]);
  assert.equal(new Set(supportLineage.map((item) => item.rawArtifactDigest)).size, 4);
  assert.equal(new Set(supportLineage.map((item) => item.derivativeDigest)).size, 4);
  assert.equal(weapon.supportRequirement, "UNAVAILABLE");
  weapon.supportRequirement = "NONE";
  await assert.rejects(
    compileGovernedModelPack(unchangedLineageMutation),
    /valueDigest does not match the authored scalar value/,
  );
});

test("governed raw, derivative, source, and compiled identities fail closed and publish atomically", async () => {
  const validInput = await createAnonymousGovernedPublication("anonymous-pack-lineage");
  const compiled = await compileGovernedModelPack(validInput);
  const changedRaw = structuredClone(validInput);
  changedRaw.rawArtifactBytes[0].bytes[0] ^= 1;
  await assert.rejects(compileGovernedModelPack(changedRaw), /raw artifact bytes do not match/);

  const missingDerivative = structuredClone(validInput);
  missingDerivative.derivativeBytes.shift();
  await assert.rejects(compileGovernedModelPack(missingDerivative), /missing derivative bytes/);

  const changedLocator = structuredClone(validInput);
  changedLocator.source.governance.fieldLineage[0].sourceLocator = "urn:vector:anonymous:changed";
  await assert.rejects(compileGovernedModelPack(changedLocator), /sourceLocator does not match/);

  const changedRecord = structuredClone(validInput);
  changedRecord.source.governance.fieldLineage[0].sourceRecord = "different-record";
  await assert.rejects(compileGovernedModelPack(changedRecord), /sourceRecord does not match/);

  const unknownKey = structuredClone(validInput);
  unknownKey.source.governance.rawSourceArtifacts[0].inventedAuthority = true;
  await assert.rejects(compileGovernedModelPack(unknownKey), /unsupported field inventedAuthority/);

  const ineligibleEvidence = structuredClone(validInput);
  ineligibleEvidence.source.governance.rawSourceArtifacts[0].eligibility.state = "INELIGIBLE";
  await assert.rejects(compileGovernedModelPack(ineligibleEvidence), /is not eligible for executable lineage/);

  const unrelatedTransformation = structuredClone(validInput);
  unrelatedTransformation.source.governance.derivatives[0].transformations[0].selector = "/invented/authority";
  await assert.rejects(compileGovernedModelPack(unrelatedTransformation), /does not transform its governed selector/);

  const missingSelector = structuredClone(validInput);
  missingSelector.source.governance.fieldLineage[0].selector = "/aerodynamics/0/invented/value";
  missingSelector.source.governance.derivatives[0].transformations[0].selector = "/aerodynamics/0/invented/value";
  await assert.rejects(compileGovernedModelPack(missingSelector), /does not resolve to an authored scalar field/);

  const crossCapability = structuredClone(validInput);
  crossCapability.source.governance.fieldLineage[0].dataFamily = "PROPULSION";
  await assert.rejects(compileGovernedModelPack(crossCapability), /componentId cannot establish PROPULSION authority/);

  const foreignBytes = new TextEncoder().encode("foreign-subject raw bytes");
  const foreignDigest = await sha256ArtifactBytes(foreignBytes);
  const crossSubjectDerivative = structuredClone(validInput);
  crossSubjectDerivative.source.governance.rawSourceArtifacts.push({
    ...structuredClone(crossSubjectDerivative.source.governance.rawSourceArtifacts[0]),
    id: "foreign-subject-raw",
    subject: { id: "foreign-subject", configurationId: "CLEAN" },
    locator: {
      uri: "urn:vector:anonymous:foreign-subject",
      retrievedAt: "2026-08-25T00:00:00.000Z",
      record: "foreign-record",
    },
    byteLength: foreignBytes.byteLength,
    contentDigest: foreignDigest,
  });
  crossSubjectDerivative.rawArtifactBytes.push({ digest: foreignDigest, bytes: foreignBytes });
  crossSubjectDerivative.source.governance.derivatives[0].orderedInputDigests.push(foreignDigest);
  await assert.rejects(compileGovernedModelPack(crossSubjectDerivative), /launders input subject or configuration identity/);

  const ambiguousDerivative = structuredClone(validInput);
  ambiguousDerivative.source.governance.derivatives.push({
    ...structuredClone(ambiguousDerivative.source.governance.derivatives[0]),
    id: "ambiguous-derivative-record",
  });
  await assert.rejects(compileGovernedModelPack(ambiguousDerivative), /duplicate output contentDigest/);

  const ambiguousTransformation = structuredClone(validInput);
  ambiguousTransformation.source.governance.derivatives[0].transformations.push(
    structuredClone(ambiguousTransformation.source.governance.derivatives[0].transformations[0]),
  );
  await assert.rejects(compileGovernedModelPack(ambiguousTransformation), /transformations must not contain duplicates/);

  const repository = new InMemoryModelPackRepository();
  const corrupted = structuredClone(validInput);
  corrupted.derivativeBytes[0].bytes[0] ^= 1;
  await assert.rejects(
    repository.publishBatch([
      { ...validInput, bundle: compiled },
      { ...corrupted, bundle: compiled },
    ]),
    /derivative bytes do not match/,
  );
  assert.equal(repository.size, 0);

  await assert.rejects(
    new InMemoryModelPackRepository().publishBatch([{
      ...validInput,
      bundle: compiled,
      inventedAuthority: true,
    }]),
    /publication\[0\] has unsupported field inventedAuthority/,
  );
});

test("append-only storage binds every independently versioned governed subrecord", async () => {
  const baselineInput = await createAnonymousGovernedPublication("anonymous-pack-storage-baseline");
  const baseline = { ...baselineInput, bundle: await compileGovernedModelPack(baselineInput) };

  const sharedInput = await createAnonymousGovernedPublication("anonymous-pack-storage-shared");
  sharedInput.source.governance = structuredClone(baselineInput.source.governance);
  sharedInput.rawArtifactBytes = baselineInput.rawArtifactBytes.map((entry) => ({
    digest: entry.digest,
    bytes: entry.bytes.slice(),
  }));
  sharedInput.derivativeBytes = baselineInput.derivativeBytes.map((entry) => ({
    digest: entry.digest,
    bytes: entry.bytes.slice(),
  }));
  const shared = { ...sharedInput, bundle: await compileGovernedModelPack(sharedInput) };
  const sharingRepository = new InMemoryModelPackRepository();
  await sharingRepository.publishBatch([baseline, shared]);
  assert.equal(sharingRepository.size, 2, "unchanged governed subrecords may be shared by distinct packs");

  const profileConflictInput = await createAnonymousGovernedPublication("anonymous-pack-storage-profile-conflict");
  profileConflictInput.source.governance.requirementProfile.id =
    baselineInput.source.governance.requirementProfile.id;
  profileConflictInput.source.governance.requirementProfile.version =
    baselineInput.source.governance.requirementProfile.version;
  profileConflictInput.source.governance.requirementProfile.requirements[0].id += "-changed";
  const profileConflict = {
    ...profileConflictInput,
    bundle: await compileGovernedModelPack(profileConflictInput),
  };
  const sameBatchRepository = new InMemoryModelPackRepository();
  await assert.rejects(
    sameBatchRepository.publishBatch([baseline, profileConflict]),
    /\[MODEL_PACK_STORAGE_IDENTITY_CONFLICT\].*requirement profile/,
  );
  assert.equal(sameBatchRepository.size, 0, "same-batch identity conflict must publish nothing");

  const intendedUseConflictInput = await createAnonymousGovernedPublication("anonymous-pack-storage-intended-use-conflict");
  intendedUseConflictInput.source.intendedUses.find((item) =>
    item.id === "vector.intended-use.engine-verification"
  ).question = "Changed question under the same intended-use identity";
  const intendedUseConflict = {
    ...intendedUseConflictInput,
    bundle: await compileGovernedModelPack(intendedUseConflictInput),
  };
  const intendedUseRepository = new InMemoryModelPackRepository();
  await intendedUseRepository.publishBatch([baseline]);
  await assert.rejects(
    intendedUseRepository.publishBatch([intendedUseConflict]),
    /\[MODEL_PACK_STORAGE_IDENTITY_CONFLICT\].*intended-use contract/,
  );
  assert.equal(intendedUseRepository.size, 1);

  const rawConflictInput = await createAnonymousGovernedPublication("anonymous-pack-storage-raw-conflict");
  rawConflictInput.source.governance.rawSourceArtifacts[0].id =
    baselineInput.source.governance.rawSourceArtifacts[0].id;
  rawConflictInput.source.governance.rawSourceArtifacts[0].version =
    baselineInput.source.governance.rawSourceArtifacts[0].version;
  const rawConflict = { ...rawConflictInput, bundle: await compileGovernedModelPack(rawConflictInput) };
  const rawRepository = new InMemoryModelPackRepository();
  await rawRepository.publishBatch([baseline]);
  await assert.rejects(
    rawRepository.publishBatch([rawConflict]),
    /\[MODEL_PACK_STORAGE_IDENTITY_CONFLICT\].*raw source artifact/,
  );
  assert.equal(rawRepository.size, 1, "later raw-record conflict must preserve the prior publication");

  const derivativeConflictInput = await createAnonymousGovernedPublication("anonymous-pack-storage-derivative-conflict");
  derivativeConflictInput.source.governance.derivatives[0].id =
    baselineInput.source.governance.derivatives[0].id;
  derivativeConflictInput.source.governance.derivatives[0].version =
    baselineInput.source.governance.derivatives[0].version;
  const changedDerivative = derivativeConflictInput.source.governance.derivatives[0];
  const previousDerivativeDigest = changedDerivative.output.contentDigest;
  const rebuiltDerivativeBytes = await rebuildAircraftDerivative(
    changedDerivative,
    changedDerivative.orderedInputDigests.map((digest) => ({
      digest,
      bytes: derivativeConflictInput.rawArtifactBytes.find((entry) => entry.digest === digest).bytes,
    })),
  );
  const changedDerivativeDigest = await sha256ArtifactBytes(rebuiltDerivativeBytes);
  changedDerivative.output.byteLength = rebuiltDerivativeBytes.byteLength;
  changedDerivative.output.contentDigest = changedDerivativeDigest;
  const changedDerivativeByteRecord = derivativeConflictInput.derivativeBytes.find((entry) =>
    entry.digest === previousDerivativeDigest
  );
  changedDerivativeByteRecord.digest = changedDerivativeDigest;
  changedDerivativeByteRecord.bytes = rebuiltDerivativeBytes;
  for (const lineage of derivativeConflictInput.source.governance.fieldLineage) {
    if (lineage.derivativeDigest === previousDerivativeDigest) lineage.derivativeDigest = changedDerivativeDigest;
  }
  const derivativeConflict = {
    ...derivativeConflictInput,
    bundle: await compileGovernedModelPack(derivativeConflictInput),
  };
  const derivativeRepository = new InMemoryModelPackRepository();
  await derivativeRepository.publishBatch([baseline]);
  await assert.rejects(
    derivativeRepository.publishBatch([derivativeConflict]),
    /\[MODEL_PACK_STORAGE_IDENTITY_CONFLICT\].*derivative/,
  );
  assert.equal(derivativeRepository.size, 1, "later derivative conflict must preserve the prior publication");

  const credibilityConflictInput = await createAnonymousGovernedPublication("anonymous-pack-storage-credibility-conflict");
  credibilityConflictInput.source.credibility.id = baselineInput.source.credibility.id;
  credibilityConflictInput.source.credibility.version = baselineInput.source.credibility.version;
  const credibilityConflict = {
    ...credibilityConflictInput,
    bundle: await compileGovernedModelPack(credibilityConflictInput),
  };
  const credibilityRepository = new InMemoryModelPackRepository();
  await credibilityRepository.publishBatch([baseline]);
  await assert.rejects(
    credibilityRepository.publishBatch([credibilityConflict]),
    /\[MODEL_PACK_STORAGE_IDENTITY_CONFLICT\].*credibility manifest/,
  );
  assert.equal(credibilityRepository.size, 1);
});

test("multi-stage derivatives preserve exact transitive raw ancestry", async () => {
  const input = await createAnonymousGovernedPublication("anonymous-pack-multi-stage-derivative");
  const finalDerivative = input.source.governance.derivatives[0];
  const rawDigest = finalDerivative.orderedInputDigests[0];
  const rawBytes = input.rawArtifactBytes.find((item) => item.digest === rawDigest).bytes;
  const intermediate = {
    ...structuredClone(finalDerivative),
    id: "anonymous-intermediate-derivative",
    orderedInputDigests: [rawDigest],
    output: {
      mediaType: "application/json",
      byteLength: 0,
      contentDigest: "0".repeat(64),
    },
  };
  const intermediateBytes = await rebuildAircraftDerivative(intermediate, [{ digest: rawDigest, bytes: rawBytes }]);
  const intermediateDigest = await sha256ArtifactBytes(intermediateBytes);
  intermediate.output.byteLength = intermediateBytes.byteLength;
  intermediate.output.contentDigest = intermediateDigest;
  input.source.governance.derivatives.push(intermediate);
  input.derivativeBytes.push({ digest: intermediateDigest, bytes: intermediateBytes });
  finalDerivative.orderedInputDigests = [intermediateDigest];
  const finalBytes = await rebuildAircraftDerivative(finalDerivative, [{ digest: intermediateDigest, bytes: intermediateBytes }]);
  const finalDigest = await sha256ArtifactBytes(finalBytes);
  const oldFinalDigest = finalDerivative.output.contentDigest;
  finalDerivative.output.byteLength = finalBytes.byteLength;
  finalDerivative.output.contentDigest = finalDigest;
  const finalByteRecord = input.derivativeBytes.find((item) => item.digest === oldFinalDigest);
  finalByteRecord.digest = finalDigest;
  finalByteRecord.bytes = finalBytes;
  for (const lineage of input.source.governance.fieldLineage.filter((item) => item.derivativeDigest === oldFinalDigest)) {
    lineage.derivativeDigest = finalDigest;
  }
  const compiled = await compileGovernedModelPack(input);
  assert.equal(compiled.pack.admissionState, "COMPLETE_FOUNDATION_NON_PROMOTABLE");
});

test("governed export/import/readback preserves exact bytes and production export excludes corpora", async () => {
  const input = await createAnonymousGovernedPublication("anonymous-pack-export");
  const bundle = await compileGovernedModelPack(input);
  const sourceRepository = new InMemoryModelPackRepository();
  await sourceRepository.publishBatch([{ ...input, bundle }]);
  const reference = { id: bundle.pack.id, version: bundle.pack.version, digest: bundle.pack.digest };
  await assert.rejects(sourceRepository.exportResearch([]), /reference list must not be empty/);
  await assert.rejects(sourceRepository.exportResearch([reference, reference]), /duplicate exact reference/);
  const researchExport = await sourceRepository.exportResearch([reference]);
  assert.equal(researchExport.schemaVersion, GOVERNED_MODEL_PACK_EXPORT_SCHEMA_VERSION);

  const restored = new InMemoryModelPackRepository();
  await restored.importResearch(researchExport);
  assert.deepEqual(await restored.resolveExact(reference), bundle);
  assert.deepEqual(await restored.exportResearch([reference]), researchExport);

  const corrupted = structuredClone(researchExport);
  corrupted.publications[0].rawArtifactBytes[0].bytes[0] ^= 1;
  const empty = new InMemoryModelPackRepository();
  await assert.rejects(empty.importResearch(corrupted), /raw artifact bytes do not match/);
  assert.equal(empty.size, 0);

  const unknownArchiveByteField = structuredClone(researchExport);
  unknownArchiveByteField.publications[0].rawArtifactBytes[0].inventedAuthority = true;
  await assert.rejects(
    new InMemoryModelPackRepository().importResearch(unknownArchiveByteField),
    /unsupported field inventedAuthority/,
  );

  const indexedReads = [];
  const lengthOnlyBytes = (length) => {
    const target = [];
    target.length = length;
    return new Proxy(target, {
      get(array, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads.push(property);
        return Reflect.get(array, property, receiver);
      },
    });
  };
  const oversizedArchive = structuredClone(researchExport);
  oversizedArchive.publications[0].rawArtifactBytes[0].bytes = lengthOnlyBytes(32 * 1024 * 1024 + 1);
  await assert.rejects(
    new InMemoryModelPackRepository().importResearch(oversizedArchive),
    /\[MODEL_PACK_ARCHIVE_ARTIFACT_BOUNDS\].*rawArtifactBytes\[0\]\.bytes/,
  );
  assert.equal(indexedReads.length, 0, "oversized archive bytes must reject before scanning or copying");

  const cumulativeArchive = structuredClone(researchExport);
  cumulativeArchive.publications[0].derivativeBytes = [
    { digest: "1".repeat(64), bytes: lengthOnlyBytes(32 * 1024 * 1024) },
    { digest: "2".repeat(64), bytes: lengthOnlyBytes(32 * 1024 * 1024) },
    { digest: "3".repeat(64), bytes: lengthOnlyBytes(1) },
  ];
  await assert.rejects(
    new InMemoryModelPackRepository().importResearch(cumulativeArchive),
    /\[MODEL_PACK_ARCHIVE_CORPUS_BOUNDS\].*derivativeBytes/,
  );
  assert.equal(indexedReads.length, 0, "cumulative archive bounds must reject before indexed reads");

  const excessiveEntriesArchive = structuredClone(researchExport);
  excessiveEntriesArchive.publications[0].rawArtifactBytes = new Array(2_049);
  await assert.rejects(
    new InMemoryModelPackRepository().importResearch(excessiveEntriesArchive),
    /\[MODEL_PACK_ARCHIVE_ENTRY_COUNT\].*rawArtifactBytes/,
  );

  const malformedLengthArchive = structuredClone(researchExport);
  const malformedLength = new Proxy([], {
    get(array, property, receiver) {
      if (property === "length") return 1.5;
      if (typeof property === "string" && /^\d+$/.test(property)) indexedReads.push(property);
      return Reflect.get(array, property, receiver);
    },
  });
  malformedLengthArchive.publications[0].rawArtifactBytes[0].bytes = malformedLength;
  await assert.rejects(
    new InMemoryModelPackRepository().importResearch(malformedLengthArchive),
    /\[MODEL_PACK_ARCHIVE_BYTE_LENGTH\].*rawArtifactBytes\[0\]\.bytes/,
  );
  assert.equal(indexedReads.length, 0, "malformed archive lengths must reject without indexed reads");

  const productionExport = await sourceRepository.exportCompiled([reference]);
  const productionBytes = JSON.stringify(productionExport);
  assert.doesNotMatch(productionBytes, /governed raw bytes|lawful normalized derivative|orderedInputDigests|rawSourceArtifacts/);
  assert.match(productionBytes, new RegExp(bundle.pack.digest));
});

test("v1 remains readable but non-promotable and v2 deployment resolution fails closed", async () => {
  const legacy = await readLegacyCompiledModelPack(structuredClone(fixture.pack));
  assert.equal(legacy.promotable, false);
  assert.equal(legacy.pack.schemaVersion, COMPILED_MODEL_PACK_SCHEMA_VERSION);
  await assert.rejects(
    readLegacyCompiledModelPack({ ...structuredClone(fixture.pack), digest: "0".repeat(64) }),
    /unreadable or corrupt/,
  );

  const input = await createAnonymousGovernedPublication("anonymous-pack-nonpromotable");
  const bundle = await compileGovernedModelPack(input);
  const repository = new InMemoryModelPackRepository();
  await repository.publishBatch([{ ...input, bundle }]);
  await assert.rejects(
    repository.resolveForDeployment({ id: bundle.pack.id, version: bundle.pack.version, digest: bundle.pack.digest }),
    /non-promotable until runtime admission lands/,
  );
});

test("non-semantic lineage insertion order preserves canonical compiled identity", async () => {
  const firstInput = await createAnonymousGovernedPublication("anonymous-pack-canonical");
  const permutedInput = structuredClone(firstInput);
  permutedInput.source.governance.requirementProfile.requirements.reverse();
  for (const requirement of permutedInput.source.governance.requirementProfile.requirements) {
    requirement.applicability.componentIds.reverse();
    requirement.applicability.configurations.reverse();
    requirement.fieldSelectors.reverse();
    requirement.requiredEvidenceRoles.reverse();
  }
  permutedInput.source.governance.rawSourceArtifacts.reverse();
  for (const artifact of permutedInput.source.governance.rawSourceArtifacts) artifact.eligibility.nonclaims.reverse();
  permutedInput.source.governance.derivatives.reverse();
  for (const derivative of permutedInput.source.governance.derivatives) derivative.transformations.reverse();
  permutedInput.source.governance.fieldLineage.reverse();
  permutedInput.rawArtifactBytes.reverse();
  permutedInput.derivativeBytes.reverse();
  const first = await compileGovernedModelPack(firstInput);
  const permuted = await compileGovernedModelPack(permutedInput);
  assert.deepEqual(permuted, first);
});

test("component insertion order and stable component-relative selectors preserve canonical meaning", async () => {
  const firstInput = await createAnonymousGovernedPublication("anonymous-pack-component-order");
  const permutedInput = structuredClone(firstInput);
  for (const collection of [
    "aerodynamics", "propulsion", "sensors", "aircraft", "weapons", "loadouts", "compatibility",
  ]) permutedInput.source[collection].reverse();
  permutedInput.source.catalogIdentities.reverse();
  permutedInput.source.evidence.reverse();
  permutedInput.source.intendedUses.reverse();
  const first = await compileGovernedModelPack(firstInput);
  const permuted = await compileGovernedModelPack(permutedInput);
  assert.deepEqual(permuted, first);
});

test("configuration applicability cannot be laundered outside component validity", async () => {
  const input = await createAnonymousGovernedPublication("anonymous-pack-configuration-laundering");
  input.source.governance.requirementProfile.requirements[0].applicability.configurations = ["INVENTED_VARIANT"];
  const lineage = input.source.governance.fieldLineage.filter((item) => item.dataFamily === "AERODYNAMICS");
  for (const item of lineage) item.configurationId = "INVENTED_VARIANT";
  for (const artifact of input.source.governance.rawSourceArtifacts.filter((item) =>
    lineage.some((entry) => entry.rawArtifactDigest === item.contentDigest)
  )) artifact.subject.configurationId = "INVENTED_VARIANT";
  for (const derivative of input.source.governance.derivatives.filter((item) =>
    lineage.some((entry) => entry.derivativeDigest === item.output.contentDigest)
  )) derivative.subject.configurationId = "INVENTED_VARIANT";
  await assert.rejects(
    compileGovernedModelPack(input),
    /configuration .* is outside component validity/,
  );
});

test("every authored physical scalar and table cell requires component and configuration lineage", async () => {
  const input = await createAnonymousGovernedPublication("anonymous-pack-complete-field-coverage");
  input.source.aerodynamics[0].referenceChord.value += 0.01;
  await assert.rejects(
    compileGovernedModelPack(input),
    /valueDigest does not match the authored scalar value/,
  );
});

test("every executable categorical aircraft authority is bound to unchanged source and validation lineage", async () => {
  const mutations = [
    {
      label: "sensor kind",
      mutate: (source) => { source.sensors[0].sensorKind = "RADAR"; },
    },
    {
      label: "weapon seeker mode",
      mutate: (source) => { source.weapons[0].seekerMode = "ACTIVE_RADAR"; },
    },
    {
      label: "weapon support requirement",
      mutate: (source) => { source.weapons[0].supportRequirement = "NONE"; },
    },
    {
      label: "weapon launch authorization",
      mutate: (source) => { source.weapons[0].launchAuthorization = "TRACK_REQUIRED"; },
    },
    {
      label: "station group",
      mutate: (source) => { source.loadouts[0].stations[0].stationGroup = "INVENTED_GROUP"; },
    },
    {
      label: "station compatible-store membership",
      mutate: (source) => { source.loadouts[0].stations[0].compatibleStoreModelIds = []; },
    },
    {
      label: "compatibility status",
      mutate: (source) => { source.compatibility[0].status = "UNSUPPORTED"; },
    },
    {
      label: "compatibility capacity",
      mutate: (source) => { source.compatibility[0].maximumQuantity += 1; },
    },
  ];

  for (const { label, mutate } of mutations) {
    const input = await createAnonymousGovernedPublication(`anonymous-pack-categorical-${label.replaceAll(" ", "-")}`);
    mutate(input.source);
    await assert.rejects(
      compileGovernedModelPack(input),
      /valueDigest does not match|selector does not resolve|absent from the closed requirement profile/,
      `${label} changed while all raw, derivative, requirement, and lineage records remained unchanged`,
    );
  }
});

test("changing one raw artifact invalidates every downstream identity until rebuilt", async () => {
  const originalInput = await createAnonymousGovernedPublication("anonymous-pack-rebuild");
  const original = await compileGovernedModelPack(originalInput);
  const rebuiltInput = structuredClone(originalInput);
  rebuiltInput.rawArtifactBytes[0].bytes[0] ^= 1;
  const oldRawDigest = rebuiltInput.rawArtifactBytes[0].digest;
  const newRawDigest = await sha256ArtifactBytes(rebuiltInput.rawArtifactBytes[0].bytes);
  rebuiltInput.rawArtifactBytes[0].digest = newRawDigest;
  const rawRecord = rebuiltInput.source.governance.rawSourceArtifacts.find((item) => item.contentDigest === oldRawDigest);
  rawRecord.contentDigest = newRawDigest;
  const derivative = rebuiltInput.source.governance.derivatives.find((item) => item.orderedInputDigests.includes(oldRawDigest));
  derivative.orderedInputDigests = derivative.orderedInputDigests.map((digest) => digest === oldRawDigest ? newRawDigest : digest);
  const oldDerivativeDigest = derivative.output.contentDigest;
  const rebuiltDerivativeBytes = await rebuildAircraftDerivative(derivative, [{
    digest: newRawDigest,
    bytes: rebuiltInput.rawArtifactBytes[0].bytes,
  }]);
  const newDerivativeDigest = await sha256ArtifactBytes(rebuiltDerivativeBytes);
  derivative.output.byteLength = rebuiltDerivativeBytes.byteLength;
  derivative.output.contentDigest = newDerivativeDigest;
  const derivativeBytes = rebuiltInput.derivativeBytes.find((item) => item.digest === oldDerivativeDigest);
  derivativeBytes.digest = newDerivativeDigest;
  derivativeBytes.bytes = rebuiltDerivativeBytes;
  for (const lineage of rebuiltInput.source.governance.fieldLineage.filter((item) => item.rawArtifactDigest === oldRawDigest)) {
    lineage.rawArtifactDigest = newRawDigest;
    if (lineage.derivativeDigest === oldDerivativeDigest) lineage.derivativeDigest = newDerivativeDigest;
  }
  const rebuilt = await compileGovernedModelPack(rebuiltInput);
  assert.notEqual(rebuilt.pack.sourceDigest, original.pack.sourceDigest);
  assert.notEqual(rebuilt.pack.lineageDigest, original.pack.lineageDigest);
  assert.notEqual(rebuilt.pack.digest, original.pack.digest);
});

test("governed source bounds and incomplete closed requirements fail without allocation or promotion", async () => {
  const oversized = await createAnonymousGovernedPublication("anonymous-pack-bounded");
  oversized.source.governance.rawSourceArtifacts[0].byteLength = 32 * 1024 * 1024 + 1;
  await assert.rejects(compileGovernedModelPack(oversized), /byteLength is outside the governed bound/);

  const incomplete = await createAnonymousGovernedPublication("anonymous-pack-incomplete");
  incomplete.source.governance.fieldLineage = incomplete.source.governance.fieldLineage.filter(
    (item) => !(item.dataFamily === "SENSORS" && item.evidenceRole === "VALIDATION"),
  );
  const compiled = await compileGovernedModelPack(incomplete);
  assert.equal(compiled.pack.requirementCompleteness.complete, false);
  assert.equal(compiled.pack.admissionState, "INCOMPLETE");
  const repository = new InMemoryModelPackRepository();
  await repository.publishBatch([{ ...incomplete, bundle: compiled }]);
  await assert.rejects(
    repository.resolveExact({ id: compiled.pack.id, version: compiled.pack.version, digest: compiled.pack.digest }),
    /compiled model pack is incomplete/,
  );
  const incompleteReference = { id: compiled.pack.id, version: compiled.pack.version, digest: compiled.pack.digest };
  const incompleteArchive = await repository.exportResearch([incompleteReference]);
  const restoredIncomplete = new InMemoryModelPackRepository();
  await restoredIncomplete.importResearch(incompleteArchive);
  assert.deepEqual(await restoredIncomplete.exportResearch([incompleteReference]), incompleteArchive);
  await assert.rejects(restoredIncomplete.resolveExact(incompleteReference), /compiled model pack is incomplete/);

  const invalidUnit = await createAnonymousGovernedPublication("anonymous-pack-invalid-lineage-unit");
  invalidUnit.source.governance.fieldLineage[0].unit = "bananas";
  await assert.rejects(compileGovernedModelPack(invalidUnit), /unit is unsupported/);

  const hiddenLineage = await createAnonymousGovernedPublication("anonymous-pack-hidden-lineage");
  const hidden = hiddenLineage.source.governance.fieldLineage[0];
  hidden.valueState = "UNKNOWN";
  hidden.gapReason = "The governed value is not available.";
  delete hidden.rawArtifactDigest;
  delete hidden.derivativeDigest;
  await assert.rejects(compileGovernedModelPack(hiddenLineage), /cannot attach executable lineage to UNKNOWN/);

  const unknownRights = await createAnonymousGovernedPublication("anonymous-pack-unknown-rights");
  const unknownArtifact = unknownRights.source.governance.rawSourceArtifacts[0];
  unknownArtifact.rights.exportDisposition = "UNKNOWN";
  unknownArtifact.eligibility.state = "REFERENCE_ONLY";
  unknownRights.source.governance.fieldLineage = unknownRights.source.governance.fieldLineage.filter(
    (item) => item.rawArtifactDigest !== unknownArtifact.contentDigest,
  );
  const unknownRightsBundle = await compileGovernedModelPack(unknownRights);
  assert.equal(unknownRightsBundle.pack.admissionState, "INCOMPLETE");

  const nonIndependent = await createAnonymousGovernedPublication("anonymous-pack-non-independent-validation");
  const sourceLineage = nonIndependent.source.governance.fieldLineage.find(
    (item) => item.dataFamily === "AERODYNAMICS" && item.evidenceRole === "SOURCE",
  );
  const validationLineage = nonIndependent.source.governance.fieldLineage.find(
    (item) => item.dataFamily === "AERODYNAMICS" && item.evidenceRole === "VALIDATION",
  );
  validationLineage.rawArtifactDigest = sourceLineage.rawArtifactDigest;
  validationLineage.derivativeDigest = sourceLineage.derivativeDigest;
  validationLineage.sourceLocator = sourceLineage.sourceLocator;
  validationLineage.sourceRecord = sourceLineage.sourceRecord;
  const nonIndependentBundle = await compileGovernedModelPack(nonIndependent);
  assert.equal(nonIndependentBundle.pack.requirementCompleteness.complete, false);
  assert.match(
    nonIndependentBundle.pack.requirementCompleteness.results
      .find((item) => item.requirementId.startsWith("aerodynamics-coverage-")).gapReasons.join("\n"),
    /VALIDATION\/INDEPENDENT/,
  );
});

test("governed table preflight rejects pathological shapes before value materialization", async () => {
  const lengthOnlyArray = (length) => {
    let indexedReads = 0;
    const values = new Proxy([], {
      get(target, property, receiver) {
        if (property === "length") return length;
        if (typeof property === "string" && /^(?:0|[1-9][0-9]*)$/.test(property)) {
          indexedReads += 1;
          throw new Error("table values were materialized before bounded preflight");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    return { values, indexedReads: () => indexedReads };
  };

  const oversized = await createAnonymousGovernedPublication("anonymous-pack-oversized-table");
  const oversizedAxis = lengthOnlyArray(2_000_001);
  const oversizedValues = lengthOnlyArray(2_000_001);
  oversized.source.aerodynamics[0].coefficientTables[0].axes = [{
    semantic: "MACH",
    unit: "1",
    values: oversizedAxis.values,
  }];
  oversized.source.aerodynamics[0].coefficientTables[0].values = oversizedValues.values;
  await assert.rejects(
    compileGovernedModelPack(oversized),
    /\[MODEL_PACK_TABLE_BOUNDS\] source\.aerodynamics\[0\]\.coefficientTables\[0\] exceeds 2000000 total governed table cells/,
  );
  assert.equal(oversizedAxis.indexedReads(), 0);
  assert.equal(oversizedValues.indexedReads(), 0);

  const cumulative = await createAnonymousGovernedPublication("anonymous-pack-cumulative-table-bound");
  const cumulativeAxisA = lengthOnlyArray(1_000_000);
  const cumulativeValuesA = lengthOnlyArray(1_000_000);
  const cumulativeAxisB = lengthOnlyArray(1_000_001);
  const cumulativeValuesB = lengthOnlyArray(1_000_001);
  cumulative.source.aerodynamics[0].coefficientTables[0].axes = [{
    semantic: "MACH", unit: "1", values: cumulativeAxisA.values,
  }];
  cumulative.source.aerodynamics[0].coefficientTables[0].values = cumulativeValuesA.values;
  cumulative.source.aerodynamics[0].coefficientTables[1].axes = [{
    semantic: "ANGLE_OF_ATTACK", unit: "rad", values: cumulativeAxisB.values,
  }];
  cumulative.source.aerodynamics[0].coefficientTables[1].values = cumulativeValuesB.values;
  assert.throws(
    () => preflightGovernedModelPackTables(cumulative.source),
    /\[MODEL_PACK_TABLE_BOUNDS\] source\.aerodynamics\[0\]\.coefficientTables\[1\] exceeds 2000000 total governed table cells/,
  );
  assert.deepEqual([
    cumulativeAxisA.indexedReads(), cumulativeValuesA.indexedReads(),
    cumulativeAxisB.indexedReads(), cumulativeValuesB.indexedReads(),
  ], [0, 0, 0, 0]);

  const mismatched = await createAnonymousGovernedPublication("anonymous-pack-mismatched-table");
  mismatched.source.aerodynamics[0].coefficientTables[0].axes[0].values = [0, 1];
  mismatched.source.aerodynamics[0].coefficientTables[0].values = [0, 1, 2];
  assert.throws(
    () => preflightGovernedModelPackTables(mismatched.source),
    /\[MODEL_PACK_TABLE_SHAPE\] source\.aerodynamics\[0\]\.coefficientTables\[0\]\.values length 3 does not match axis cardinality product 2/,
  );

  const unsafeValueCardinality = await createAnonymousGovernedPublication("anonymous-pack-unsafe-value-cardinality");
  const unsafeValues = lengthOnlyArray(Number.MAX_SAFE_INTEGER + 1);
  unsafeValueCardinality.source.aerodynamics[0].coefficientTables[0].axes[0].values = [0];
  unsafeValueCardinality.source.aerodynamics[0].coefficientTables[0].values = unsafeValues.values;
  assert.throws(
    () => preflightGovernedModelPackTables(unsafeValueCardinality.source),
    /\[MODEL_PACK_TABLE_SHAPE\] source\.aerodynamics\[0\]\.coefficientTables\[0\]\.values must have a non-negative safe-integer length/,
  );
  assert.equal(unsafeValues.indexedReads(), 0);

  const overflow = await createAnonymousGovernedPublication("anonymous-pack-overflow-table");
  const hugeAxisA = lengthOnlyArray(100_000_000);
  const hugeAxisB = lengthOnlyArray(100_000_000);
  overflow.source.propulsion[0].thrustTable.axes = [
    { semantic: "THROTTLE", unit: "1", values: hugeAxisA.values },
    { semantic: "ALTITUDE", unit: "m", values: hugeAxisB.values },
  ];
  overflow.source.propulsion[0].thrustTable.values = [];
  assert.throws(
    () => preflightGovernedModelPackTables(overflow.source),
    /\[MODEL_PACK_TABLE_SHAPE\] source\.propulsion\[0\]\.thrustTable axis cardinality product exceeds Number\.MAX_SAFE_INTEGER/,
  );
  assert.equal(hugeAxisA.indexedReads(), 0);
  assert.equal(hugeAxisB.indexedReads(), 0);
});

test("explicit missing states remain distinct, zero remains available, and optional gaps are not admitted", async () => {
  const zeroInput = await createAnonymousGovernedPublication("anonymous-pack-zero-is-data");
  const zeroLineage = zeroInput.source.governance.fieldLineage.find((item) =>
    item.selector.includes("/axes/ALTITUDE/values/0") && item.evidenceRole === "SOURCE"
  );
  assert.ok(zeroLineage?.valueDigest, "zero-valued table axis must retain executable lineage");
  assert.equal((await compileGovernedModelPack(zeroInput)).pack.requirementCompleteness.complete, true);

  for (const valueState of [
    "UNKNOWN", "UNAVAILABLE", "ASSUMPTION", "REFERENCE_ONLY", "UNSUPPORTED", "NOT_APPLICABLE",
  ]) {
    const input = await createAnonymousGovernedPublication(`anonymous-pack-gap-${valueState.toLowerCase().replaceAll("_", "-")}`);
    const requirement = input.source.governance.requirementProfile.requirements[0];
    const selector = requirement.fieldSelectors[0];
    const affected = input.source.governance.fieldLineage.filter((item) =>
      item.componentId === requirement.applicability.componentIds[0] && item.selector === selector
    );
    for (const lineage of affected) {
      lineage.valueState = valueState;
      lineage.gapReason = `Governed ${valueState} gap.`;
      delete lineage.valueDigest;
      delete lineage.rawArtifactDigest;
      delete lineage.derivativeDigest;
      delete lineage.sourceLocator;
      delete lineage.sourceRecord;
    }
    if (valueState === "NOT_APPLICABLE") requirement.required = false;
    const compiled = await compileGovernedModelPack(input);
    assert.equal(
      compiled.pack.admissionState,
      valueState === "NOT_APPLICABLE" ? "COMPLETE_FOUNDATION_NON_PROMOTABLE" : "INCOMPLETE",
    );
    const result = compiled.pack.requirementCompleteness.results.find((item) => item.requirementId === requirement.id);
    assert.equal(result.state, valueState === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "INCOMPLETE");
  }
});

test("unsupported recipe/schema versions and invalid evidence validity domains fail closed", async () => {
  const recipe = await createAnonymousGovernedPublication("anonymous-pack-recipe-version");
  recipe.source.governance.derivatives[0].recipe.version = "2.0.0";
  await assert.rejects(compileGovernedModelPack(recipe), /\[MODEL_PACK_DERIVATIVE_RECIPE\]/);

  const sourceSchema = await createAnonymousGovernedPublication("anonymous-pack-source-schema-version");
  sourceSchema.source.schemaVersion = "vector.model-pack-source.v999";
  await assert.rejects(compileGovernedModelPack(sourceSchema), /schemaVersion must be vector\.model-pack-source\.v2/);

  const validity = await createAnonymousGovernedPublication("anonymous-pack-invalid-evidence-validity");
  validity.source.governance.fieldLineage[0].validityDomain.altitude.maximum -= 1;
  await assert.rejects(
    compileGovernedModelPack(validity),
    /validityDomain does not cover the owning component validity domain/,
  );
});

test("the production scenario compiler and Worker bundles exclude research corpora and v2 byte-storage authority", async () => {
  const results = await Promise.all([
    new URL("../lib/engine/compiler.ts", import.meta.url).pathname,
    new URL("../lib/runtime/simulation.worker.ts", import.meta.url).pathname,
  ].map((entryPoint) => build({
    entryPoints: [entryPoint], bundle: true, write: false, platform: "browser",
    format: "esm", logLevel: "silent", treeShaking: true,
  })));
  const bundled = results.flatMap((result) => result.outputFiles).map((file) => file.text).join("\n");
  assert.doesNotMatch(bundled, /vector\.aircraft-raw-source-artifact|vector\.aircraft-derivative/);
  assert.doesNotMatch(bundled, /governed raw bytes|lawful normalized derivative|rawArtifactBytes|derivativeBytes/);
  assert.doesNotMatch(bundled, /governance\/sources|tests\/model-pack/);
});
