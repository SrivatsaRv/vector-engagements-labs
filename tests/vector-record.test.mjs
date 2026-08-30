import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createVectorSimulationRecord,
  decodeColumnarFrames,
  encodeColumnarFrames,
  LEGACY_VECTOR_EVENT_SCHEMA,
  LEGACY_VECTOR_FRAME_SCHEMA,
  OLDER_VECTOR_FRAME_SCHEMA,
  LEGACY_VECTOR_PICTURE_SCHEMA,
  openVectorSimulationRecord,
  serializeVectorRecord,
  VECTOR_EVENT_SCHEMA,
  VECTOR_FRAME_SCHEMA,
  VECTOR_PICTURE_SCHEMA,
} from "../lib/record/vector-record.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import { sha256Bytes } from "../lib/runtime/digest.ts";
import {
  buildSimulationResult,
  prepareSimulation,
  simulate,
  simulateWithCapabilitiesForVerification,
} from "../lib/simulation.ts";
import { runEngineBackend } from "../lib/engine/backend.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import {
  bindVerificationTrackModelPack,
  createVerificationTrackModelPackSource,
  ENGINE_VERIFICATION_INTENDED_USE,
  GENERIC_VERIFICATION_SENSOR_ID,
} from "../lib/engine/verification-track-fixture.ts";
import {
  assertEnvironmentPack,
  environmentPackBinding,
} from "../lib/geospatial/environment-pack.ts";
import {
  compileAirMissionDefinition,
  synchronizeScenarioAirMission,
} from "../lib/air-mission.ts";
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "../lib/engine/runtime-model-pack.ts";
import { compileModelPack } from "../lib/model-pack.ts";
import { resolveRetainedCompiledModelPack } from "../lib/engine/retained-model-packs.ts";
import historicalModelPackBundle from "../fixtures/model-packs/vector-scalar-study-v0.8.compiled.json" with { type: "json" };
import { closestApproachOnRelativeSegment } from "../lib/engine/weapon-termination.ts";
import { projectObserverStates } from "../lib/information-state.ts";
import { createGenericTakeoffPerformanceScenario } from "../lib/validation/generic-takeoff-performance.ts";

function governWeaponTermination(scenario, weapon, changes) {
  const pack = resolveRetainedCompiledModelPack(scenario.modelPack);
  const compiledWeapon = pack.weapons.find(
    (candidate) => candidate.id === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(compiledWeapon?.termination);
  const fields = {
    interceptRadiusM: ["/termination/interceptRadiusM", "m", "interceptRadiusM"],
    maximumFlightTimeSeconds: ["/termination/maximumFlightTimeS", "s", "maximumFlightTimeS"],
  };
  const patches = Object.entries(changes).map(([field, newValue]) => ({
    schemaVersion: "vector.model-patch.v1",
    id: `test-${compiledWeapon.id}-${field.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}`,
    modelPackDigest: pack.digest,
    modelId: compiledWeapon.id,
    fieldPath: fields[field][0],
    oldValue: compiledWeapon.termination[fields[field][2]],
    newValue,
    unit: fields[field][1],
    reason: "Deterministic boundary regression fixture",
    provenance: {
      authorId: "vector-test-suite",
      authoredAt: "2026-08-27T00:00:00.000Z",
      evidenceRefIds: [compiledWeapon.evidenceRefIds[0]],
    },
  }));
  Object.assign(weapon.weapon.termination, changes);
  const projection = structuredClone(scenario.modelPack);
  delete projection.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest({
    ...projection,
    weaponTerminations: runtimeWeaponTerminations(pack, patches),
    scenarioPatches: patches,
  });
}

const createdAt = "2026-08-06T00:00:00.000Z";
const textEncoder = new TextEncoder();
const jsonBytes = (value) => textEncoder.encode(canonicalJson(value));

function resealCompiledPack(pack) {
  const payload = structuredClone(pack);
  delete payload.digest;
  const normalize = (value) => {
    if (typeof value === "number") {
      return `#number:${value.toExponential(12).replace("e+", "e")}`;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };
  pack.digest = createHash("sha256")
    .update(JSON.stringify(normalize(payload)))
    .digest("hex");
  return pack;
}

async function replaceRecordMember(record, path, schemaVersion, bytes) {
  const replacedSchemaVersion = record.members.find((member) => member.path === path)?.schemaVersion;
  const replacement = {
    ...record.members.find((member) => member.path === path),
    schemaVersion,
    bytes,
    sha256: await sha256Bytes(bytes),
  };
  const nonManifest = record.members
    .filter((member) => member.path !== "manifest.json")
    .map((member) => member.path === path ? replacement : member);
  const members = record.manifest.members.map((member) => {
    const source = nonManifest.find((candidate) => candidate.path === member.path);
    return {
      path: source.path,
      schemaVersion: source.schemaVersion,
      mediaType: source.mediaType,
      required: source.required,
      byteLength: source.bytes.byteLength,
      sha256: source.sha256,
    };
  });
  const recordId = await sha256Bytes(
    jsonBytes(nonManifest.map(({ path: memberPath, sha256 }) => ({ path: memberPath, sha256 }))),
  );
  const priorManifest = { ...record.manifest };
  delete priorManifest.contentDigest;
  const manifestWithoutDigest = {
    ...priorManifest,
    recordId,
    requiredViewerFeatures: priorManifest.requiredViewerFeatures.map((feature) =>
      feature === replacedSchemaVersion ? schemaVersion : feature,
    ),
    members,
  };
  const manifest = {
    ...manifestWithoutDigest,
    contentDigest: await sha256Bytes(jsonBytes(manifestWithoutDigest)),
  };
  const manifestBytes = jsonBytes(manifest);
  const priorManifestMember = record.members.find((member) => member.path === "manifest.json");
  const manifestMember = {
    ...priorManifestMember,
    bytes: manifestBytes,
    sha256: await sha256Bytes(manifestBytes),
  };
  return { manifest, members: [manifestMember, ...nonManifest] };
}

test("columnar frame transport round-trips exact engine frames", () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const bytes = encodeColumnarFrames(result.engineRun.frames);
  assert.deepEqual(decodeColumnarFrames(bytes), result.engineRun.frames);
  assert.ok(
    decodeColumnarFrames(bytes)
      .flatMap((frame) => frame.entities)
      .some((entity) => entity.weaponFlightState === "BOOST"),
    "weapon lifecycle evidence must survive VSR encoding",
  );
  const control = decodeColumnarFrames(bytes)
    .flatMap((frame) => frame.entities)
    .find((entity) => entity.aircraftControl)?.aircraftControl;
  assert.ok(control, "aircraft control evidence must survive VSR encoding");
  assert.ok(
    Number.isFinite(control.requestedSteeringAccelerationMps2.x),
    "the requested steering acceleration must be replayable, not reconstructed",
  );
  assert.ok(bytes.byteLength > 0);
});

for (const backend of ["typescript", "rust-wasm"]) {
  test(`VSR replays without physics and preserves ${backend} provenance`, async () => {
    const scenario = SCENARIO_LIBRARY[0].scenario;
    const capabilities = createVerificationDeploymentCapabilities(backend);
    const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
    const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
    const record = await createVectorSimulationRecord(prepared, result, createdAt);
    const serialized = serializeVectorRecord(record);
    const opened = await openVectorSimulationRecord(
      serialized.buffer,
      serialized.byteLength,
    );

    assert.equal(opened.manifest.backend.selected, backend);
    assert.equal(
      opened.manifest.deploymentCapabilities.digest,
      capabilities.digest,
    );
    assert.equal(
      opened.manifest.deploymentCapabilities.schemaVersion,
      "vector.deployment-capabilities.v1",
    );
    assert.equal(opened.result.engineRun.diagnostics.backend, backend);
    const recordedPack = opened.result.engineRun.scenario.geospatial.environmentPack;
    assertEnvironmentPack(recordedPack);
    assert.deepEqual(
      opened.result.engineRun.scenario.environment.environmentPack,
      environmentPackBinding(recordedPack),
      "replay must retain the exact admitted environment-pack binding instead of re-resolving a catalog selection",
    );
    const supersedingPreparation = prepareSimulation({
      ...scenario,
      wind: scenario.wind + 1,
    }, scenario.profile, capabilities);
    assert.notEqual(
      supersedingPreparation.engineScenario.geospatial.environmentPack.identity.digest,
      recordedPack.identity.digest,
      "a later authored pack is a distinct immutable version",
    );
    assert.equal(
      opened.result.engineRun.scenario.geospatial.environmentPack.identity.digest,
      recordedPack.identity.digest,
      "archived replay must not resolve against a later pack",
    );
    assert.deepEqual(
      opened.result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      result.engineRun.scenario.entities.find((entity) => entity.id === "red-object-1")?.routePlan,
      "VSR must retain the compiled fly-by route constraint for replay audit",
    );
    assert.deepEqual(opened.result.frames, result.frames);
    assert.deepEqual(opened.result.envelopes, result.envelopes);
    assert.equal(opened.result.reason, result.reason);
    assert.equal(opened.events.state, "AVAILABLE");
    assert.ok(opened.events.items.length > 0);
    assert.deepEqual(opened.events, result.engineRun.events);
    assert.match(
      opened.report.limitations.join(" "),
      /named-aircraft performance remains unsupported.*no catalog association supplies runtime authority/i,
    );
    assert.ok(opened.pictures.length > 0, "tick-owned observer state must be recorded");
    assert.deepEqual(
      opened.result.pictures,
      opened.pictures,
      "replay must expose the immutable recorded observer pictures, not rebuild them",
    );
    assert.ok(opened.pictures.every((picture) => picture.trackState === "UNSUPPORTED"));
    assert.ok(
      opened.pictures.every((picture) =>
        opened.result.frames.some((frame) => frame.t === picture.modelTimeSeconds),
      ),
      "each observer-picture sample must identify its recorded frame",
    );
    assert.ok(opened.pictures.every((picture) => !("truthPosition" in picture) && !("position" in picture) && !("observedEntityId" in picture)));
    assert.match(opened.manifest.recordId, /^[a-f0-9]{64}$/);
  });
}

test("VSR recompiles an archived Air mission against its exact retained model pack", async () => {
  const currentScenario = SCENARIO_LIBRARY[0].scenario;
  const historicalModelPack = historicalModelPackBundle.pack;
  const scenario = synchronizeScenarioAirMission(
    structuredClone(currentScenario),
    historicalModelPack,
  );
  const prepared = prepareSimulation(currentScenario);
  const environmentPack = prepared.engineScenario.geospatial.environmentPack;
  const archivedMission = compileAirMissionDefinition(scenario.airMission, {
    scenario,
    modelPack: historicalModelPack,
    environmentPackDigest: environmentPack.identity.digest,
    environmentPack,
    fixedStepSeconds: prepared.engineScenario.fixedStepSeconds,
    durationSeconds: prepared.engineScenario.durationSeconds,
  });
  prepared.scenario = scenario;
  prepared.engineScenario.airMission = archivedMission;
  prepared.engineScenario.modelPack = {
    schemaVersion: historicalModelPack.schemaVersion,
    id: historicalModelPack.id,
    version: historicalModelPack.version,
    digest: historicalModelPack.digest,
    intendedUse: { ...historicalModelPack.intendedUses[0] },
    observerSensors: historicalModelPack.sensors.map((sensor) => ({
      modelId: sensor.id,
      modelVersion: sensor.version,
      evidenceRefIds: [...sensor.evidenceRefIds],
      sensorKind: sensor.sensorKind,
      detectionRangeM: sensor.detectionRangeM,
      minimumRangeM: sensor.minimumRangeM,
      scanPeriodS: sensor.scanPeriodS,
      azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
      elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
      ...(sensor.verificationTrackModel
        ? { verificationTrackModel: structuredClone(sensor.verificationTrackModel) }
        : {}),
    })),
    scenarioPatches: [],
    runtimeDigest: "7bf22e26981fa0be7c28c755b8bffd1b6cc450461d4792a3db6d088a14f33dff",
  };
  for (const entity of prepared.engineScenario.entities) {
    entity.provenance.modelPackDigest = historicalModelPack.digest;
    if (entity.weapon) {
      entity.weapon.admission.modelPackDigest = historicalModelPack.digest;
      delete entity.weapon.termination;
    }
  }

  const result = simulate(currentScenario);
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    LEGACY_VECTOR_EVENT_SCHEMA,
    textEncoder.encode(canonicalJson({
      schemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
      id: "event-000000",
      sequence: 0,
      t: 0,
      type: "ENTITY_ACTIVATED",
      entityId: "blue-aircraft-1",
      detail: "ACTIVE",
    })),
  );
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);

  assert.equal(opened.result.engineRun.scenario.modelPack.version, "0.8.0");
  assert.equal(opened.result.engineRun.scenario.modelPack.digest, historicalModelPack.digest);
  assert.deepEqual(opened.result.engineRun.scenario.airMission, archivedMission);
});

test("VSR recompiles an archived Air mission against its authenticated supplied verification pack", async () => {
  const currentScenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(currentScenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const scenario = synchronizeScenarioAirMission(
    structuredClone(currentScenario),
    binding.pack,
  );
  const environmentPack = binding.scenario.geospatial.environmentPack;
  const archivedMission = compileAirMissionDefinition(scenario.airMission, {
    scenario,
    modelPack: binding.pack,
    environmentPackDigest: environmentPack.identity.digest,
    environmentPack,
    fixedStepSeconds: binding.scenario.fixedStepSeconds,
    durationSeconds: binding.scenario.durationSeconds,
  });
  binding.scenario.airMission = archivedMission;
  const capabilityManifest = createVerificationDeploymentCapabilities(
    "typescript",
    ["A2A"],
    [binding.pack.digest],
  );
  const prepared = {
    ...base,
    scenario,
    engineScenario: binding.scenario,
    capabilityManifest,
  };
  const engineRun = runEngineBackend(binding.scenario, "typescript", binding.pack);
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);

  const opened = await openVectorSimulationRecord(
    serialized.buffer,
    serialized.byteLength,
    { compiledModelPack: binding.pack },
  );

  assert.equal(opened.result.engineRun.scenario.modelPack.id, binding.pack.id);
  assert.equal(opened.result.engineRun.scenario.modelPack.digest, binding.pack.digest);
  assert.deepEqual(opened.result.engineRun.scenario.airMission, archivedMission);
});

test("VSR rejects unqualified or malformed supplied packs before no-release Air mission recompilation", async () => {
  const source = createVerificationTrackModelPackSource();
  source.id = "vector-air-record-authority-verification";
  source.sensors = source.sensors.filter(
    (sensor) => sensor.id !== GENERIC_VERIFICATION_SENSOR_ID,
  );
  for (const aircraft of source.aircraft) {
    aircraft.sensorModelIds = aircraft.sensorModelIds.filter(
      (sensorId) => sensorId !== GENERIC_VERIFICATION_SENSOR_ID,
    );
  }
  const validPack = (await compileModelPack(source)).pack;
  const unqualifiedSource = structuredClone(source);
  unqualifiedSource.intendedUses = unqualifiedSource.intendedUses.filter(
    (use) => use.id !== ENGINE_VERIFICATION_INTENDED_USE,
  );
  unqualifiedSource.credibility.intendedUseRefs =
    unqualifiedSource.credibility.intendedUseRefs.filter(
      (use) => use.id !== ENGINE_VERIFICATION_INTENDED_USE,
    );
  const unqualifiedPack = (await compileModelPack(unqualifiedSource)).pack;
  assert.ok(
    !unqualifiedPack.intendedUses.some(
      (use) => use.id === ENGINE_VERIFICATION_INTENDED_USE,
    ),
    "the falsifier must have a valid content digest but no engine-verification intended use",
  );

  const currentScenario = createGenericTakeoffPerformanceScenario();
  const base = prepareSimulation(currentScenario);
  const bindPack = (pack) => {
    const scenario = structuredClone(base.engineScenario);
    scenario.modelPack = bindRuntimeModelPackDigest({
      schemaVersion: pack.schemaVersion,
      id: pack.id,
      version: pack.version,
      digest: pack.digest,
      intendedUse: { id: ENGINE_VERIFICATION_INTENDED_USE, version: "1.0.0" },
      observerSensors: pack.sensors.map((sensor) => ({
        modelId: sensor.id,
        modelVersion: sensor.version,
        evidenceRefIds: [...sensor.evidenceRefIds],
        sensorKind: sensor.sensorKind,
        detectionRangeM: sensor.detectionRangeM,
        minimumRangeM: sensor.minimumRangeM,
        scanPeriodS: sensor.scanPeriodS,
        azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
        elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
      })),
      weaponTerminations: runtimeWeaponTerminations(pack, []),
      scenarioPatches: [],
    });
    for (const entity of scenario.entities) {
      entity.provenance.modelPackDigest = pack.digest;
      if (entity.observerSensor) entity.observerSensor.modelPackDigest = pack.digest;
      if (entity.weapon) {
        entity.weapon.admission.modelPackDigest = pack.digest;
      }
    }
    return scenario;
  };
  const compileMission = (scenario, engineScenario, pack) => {
    const authored = synchronizeScenarioAirMission(structuredClone(scenario), pack);
    engineScenario.airMission = compileAirMissionDefinition(authored.airMission, {
      scenario: authored,
      modelPack: pack,
      environmentPackDigest: engineScenario.geospatial.environmentPack.identity.digest,
      environmentPack: engineScenario.geospatial.environmentPack,
      fixedStepSeconds: engineScenario.fixedStepSeconds,
      durationSeconds: engineScenario.durationSeconds,
    });
    const launcher = engineScenario.entities.find(
      (entity) => entity.id === "blue-platform-1",
    );
    if (launcher?.groundOperation) {
      launcher.groundOperation.missionDigest = engineScenario.airMission.compiledDigest;
      engineScenario.airMissionRuntime = structuredClone(launcher.groundOperation);
    }
    return authored;
  };

  const validEngineScenario = bindPack(validPack);
  compileMission(currentScenario, validEngineScenario, validPack);
  const engineRun = runEngineBackend(validEngineScenario, "typescript", validPack);
  assert.equal(engineRun.termination, "time_limit");
  assert.ok(
    !engineRun.events.items.some((event) => event.payload.kind === "WEAPON_TERMINATED"),
    "the falsifier must avoid the replay path by retaining an implicit ground-start store",
  );

  const unqualifiedEngineScenario = bindPack(unqualifiedPack);
  const unqualifiedScenario = compileMission(
    currentScenario,
    unqualifiedEngineScenario,
    unqualifiedPack,
  );
  engineRun.scenario = unqualifiedEngineScenario;
  const capabilityManifest = createVerificationDeploymentCapabilities(
    "typescript",
    ["A2A"],
    [unqualifiedPack.digest],
  );
  const prepared = {
    ...base,
    scenario: unqualifiedScenario,
    engineScenario: unqualifiedEngineScenario,
    capabilityManifest,
  };
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);

  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, {
      compiledModelPack: unqualifiedPack,
    }),
    /does not match the exact scenario identity and intended use/,
  );

  const malformedPack = structuredClone(validPack);
  malformedPack.weapons[0].launchMassKg = "170";
  resealCompiledPack(malformedPack);
  assert.equal(
    malformedPack.weapons[0].launchMassKg,
    "170",
    "the falsifier must be digest-valid while violating the compiled weapon numeric contract",
  );
  const malformedEngineScenario = bindPack(malformedPack);
  const malformedScenario = compileMission(
    currentScenario,
    malformedEngineScenario,
    malformedPack,
  );
  const malformedEngineRun = structuredClone(engineRun);
  malformedEngineRun.scenario = malformedEngineScenario;
  const malformedPrepared = {
    ...base,
    scenario: malformedScenario,
    engineScenario: malformedEngineScenario,
    capabilityManifest: createVerificationDeploymentCapabilities(
      "typescript",
      ["A2A"],
      [malformedPack.digest],
    ),
  };
  const malformedResult = buildSimulationResult(malformedPrepared, malformedEngineRun);
  const malformedRecord = await createVectorSimulationRecord(
    malformedPrepared,
    malformedResult,
    createdAt,
  );
  const malformedSerialized = serializeVectorRecord(malformedRecord);

  await assert.rejects(
    openVectorSimulationRecord(
      malformedSerialized.buffer,
      malformedSerialized.byteLength,
      { compiledModelPack: malformedPack },
    ),
    /weapons\[0\].launchMassKg is structurally invalid/,
  );

  const malformedAircraftPack = structuredClone(validPack);
  malformedAircraftPack.aircraft[0].fuelCapacityKg = "9400";
  resealCompiledPack(malformedAircraftPack);
  assert.equal(
    malformedAircraftPack.aircraft[0].fuelCapacityKg,
    "9400",
    "the falsifier must be digest-valid while violating the compiled aircraft numeric contract",
  );
  const malformedAircraftEngineScenario = bindPack(malformedAircraftPack);
  const malformedAircraftScenario = compileMission(
    currentScenario,
    malformedAircraftEngineScenario,
    malformedAircraftPack,
  );
  const malformedAircraftEngineRun = structuredClone(engineRun);
  malformedAircraftEngineRun.scenario = malformedAircraftEngineScenario;
  const malformedAircraftPrepared = {
    ...base,
    scenario: malformedAircraftScenario,
    engineScenario: malformedAircraftEngineScenario,
    capabilityManifest: createVerificationDeploymentCapabilities(
      "typescript",
      ["A2A"],
      [malformedAircraftPack.digest],
    ),
  };
  const malformedAircraftResult = buildSimulationResult(
    malformedAircraftPrepared,
    malformedAircraftEngineRun,
  );
  const malformedAircraftRecord = await createVectorSimulationRecord(
    malformedAircraftPrepared,
    malformedAircraftResult,
    createdAt,
  );
  const malformedAircraftSerialized = serializeVectorRecord(malformedAircraftRecord);

  await assert.rejects(
    openVectorSimulationRecord(
      malformedAircraftSerialized.buffer,
      malformedAircraftSerialized.byteLength,
      { compiledModelPack: malformedAircraftPack },
    ),
    /aircraft\[0\].fuelCapacityKg is structurally invalid/,
  );
});

test("archived model-pack resolution rejects every partial identity match", () => {
  const pack = historicalModelPackBundle.pack;
  for (const identity of [
    { id: `${pack.id}-other`, version: pack.version, digest: pack.digest },
    { id: pack.id, version: "0.8.1", digest: pack.digest },
    { id: pack.id, version: pack.version, digest: "0".repeat(64) },
  ]) {
    assert.throws(
      () => resolveRetainedCompiledModelPack(identity),
      /No retained compiled model pack matches/,
    );
  }
});

test("VSR admits an off-grid scheduled launch at its first fixed-step boundary", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find((entity) =>
    entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === 0
  );
  assert.ok(weapon?.weapon);
  weapon.weapon.launchTimeSeconds = 2.03;
  prepared.engineScenario.durationSeconds = 3;
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.equal(opened.events.state, "AVAILABLE");
  const entry = opened.events.items.find((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id
  );
  assert.ok(entry);
  assert.equal(entry.tick, 41);
  assert.equal(entry.modelTimeSeconds, 2.05);
  assert.equal(opened.result.engineRun.frames[entry.frameIndex].t, 2.05);
});

test("VSR rejects a hash-resealed expiry time that contradicts the achieved launch boundary", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find((entity) =>
    entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === 0
  );
  assert.ok(weapon?.weapon);
  governWeaponTermination(prepared.engineScenario, weapon, {
    interceptRadiusM: 0.1,
    maximumFlightTimeSeconds: 0.075,
  });
  prepared.engineScenario.durationSeconds = 1;
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  assert.equal(result.termination, "weapon_expired");
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  assert.equal(terminal.payload.occurrenceTimeSeconds, 0.075);
  terminal.payload.occurrenceTimeSeconds = 0.06;
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match the exact admitted expiry time/,
  );
});

test("VSR rejects a hash-resealed boundary-cause occurrence time", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2g-emitter-corridor",
  ).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2G"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  assert.equal(result.engineRun.termination, "weapon_failed");
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  assert.equal(terminal.payload.cause, "TERRAIN_IMPACT");
  assert.equal(terminal.payload.occurrenceTimeSeconds, terminal.modelTimeSeconds);
  terminal.payload.occurrenceTimeSeconds = Number((
    terminal.modelTimeSeconds - prepared.engineScenario.fixedStepSeconds / 2
  ).toFixed(6));
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact terminal boundary time/,
  );
});

test("VSR content identity and stable event ordering are deterministic", async () => {
  const scenario = SCENARIO_LIBRARY[1].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const first = await createVectorSimulationRecord(prepared, result, createdAt);
  const second = await createVectorSimulationRecord(prepared, result, createdAt);

  assert.equal(first.manifest.recordId, second.manifest.recordId);
  assert.equal(first.manifest.contentDigest, second.manifest.contentDigest);
  assert.deepEqual(
    first.members.map((item) => [item.path, item.sha256]),
    second.members.map((item) => [item.path, item.sha256]),
  );
  const allocated = serializeVectorRecord(first);
  const reused = serializeVectorRecord(second, allocated.buffer);
  assert.equal(reused.buffer, allocated.buffer);
  assert.equal(reused.byteLength, allocated.byteLength);
});

test("VSR retains read-only compatibility with the last observer frame and picture schemas", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepareSimulation(scenario), result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(frameMember && pictureMember);
  const legacyFrameBytes = frameMember.bytes.slice();
  const currentSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = legacyFrameBytes.findIndex((_, index) =>
    currentSchema.every((value, inner) => legacyFrameBytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  legacyFrameBytes[offset + currentSchema.length - 1] = "5".charCodeAt(0);
  let legacy = await replaceRecordMember(
    record,
    "frames.arrow",
    LEGACY_VECTOR_FRAME_SCHEMA,
    legacyFrameBytes,
  );
  const serialized = serializeVectorRecord(legacy);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);
  assert.deepEqual(opened.result.frames, result.frames);
  assert.ok(opened.pictures.every((picture) => picture.schemaVersion === "vector.observer-state.v2"));

  const olderFrameBytes = frameMember.bytes.slice();
  olderFrameBytes[offset + currentSchema.length - 1] = "4".charCodeAt(0);
  let older = await replaceRecordMember(
    record,
    "frames.arrow",
    OLDER_VECTOR_FRAME_SCHEMA,
    olderFrameBytes,
  );
  older = await replaceRecordMember(
    older,
    "pictures.jsonl",
    LEGACY_VECTOR_PICTURE_SCHEMA,
    pictureMember.bytes,
  );
  const olderSerialized = serializeVectorRecord(older);
  const olderOpened = await openVectorSimulationRecord(
    olderSerialized.buffer,
    olderSerialized.byteLength,
  );
  assert.deepEqual(olderOpened.result.frames, result.frames);
  assert.ok(olderOpened.pictures.every((picture) => picture.schemaVersion === "vector.observer-state.v2"));
});

test("VSR rejects tampered side-owned track state and track-event history", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(scenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const openOptions = { compiledModelPack: binding.pack };
  const capabilityManifest = createVerificationDeploymentCapabilities("typescript", ["A2A"], [binding.pack.digest]);
  const prepared = { ...base, engineScenario: binding.scenario, capabilityManifest };
  const engineRun = runEngineBackend(binding.scenario, "typescript", binding.pack);
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);

  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(pictureMember);
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n").map(JSON.parse);
  const tracked = pictures.find((picture) => picture.schemaVersion === "vector.observer-state.v3" && picture.tracks.length > 0);
  assert.ok(tracked);
  tracked.tracks[0].truthEntityId = "red-object-1";
  let corrupt = await replaceRecordMember(
    record,
    "pictures.jsonl",
    VECTOR_PICTURE_SCHEMA,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );
  let serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /unsupported or missing|truth/i,
  );

  const eventMember = record.members.find((member) => member.path === "events.jsonl");
  assert.ok(eventMember);
  const events = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  const transition = events.find((event) => event.payload.kind === "TRACK_STATE_CHANGED");
  assert.ok(transition);
  transition.payload.sourceSequence += 1;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /ownership|frame state|transition/i,
  );

  const observationEvents = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  const observationTransition = observationEvents.find((event) =>
    event.payload.kind === "TRACK_STATE_CHANGED" && event.payload.observationId !== null
  );
  assert.ok(observationTransition);
  observationTransition.payload.observationId = `${observationTransition.payload.perspective}-OBS-9999-99999999`;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(observationEvents.map((event) => canonicalJson(event)).join("\n")),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /observation cause/i,
  );
});

test("VSR authenticates supplied replay-pack content before using its authority", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(scenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const capabilityManifest = createVerificationDeploymentCapabilities(
    "typescript",
    ["A2A"],
    [binding.pack.digest],
  );
  const prepared = { ...base, engineScenario: binding.scenario, capabilityManifest };
  const engineRun = runEngineBackend(binding.scenario, "typescript", binding.pack);
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const serialized = serializeVectorRecord(record);
  const forgedPack = structuredClone(binding.pack);
  forgedPack.evidence[0].title += " tampered after compilation";

  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, {
      compiledModelPack: forgedPack,
    }),
    /compiled model pack digest does not match its canonical content/i,
  );
});

test("VSR rejects consistently forged track sources beside the admitted pack digest", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const base = prepareSimulation(scenario);
  const binding = await bindVerificationTrackModelPack(base.engineScenario);
  const openOptions = { compiledModelPack: binding.pack };
  const capabilityManifest = createVerificationDeploymentCapabilities("typescript", ["A2A"], [binding.pack.digest]);
  const prepared = { ...base, engineScenario: binding.scenario, capabilityManifest };
  const engineRun = runEngineBackend(binding.scenario, "typescript", binding.pack);
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const forgedModelId = "forged-valid-digest-model";

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  const frames = decodeColumnarFrames(frameMember.bytes);
  for (const frame of frames) for (const state of frame.observerStates) {
    if (state.schemaVersion !== "vector.observer-state.v3") continue;
    state.sensorModelId = forgedModelId;
    for (const value of [...state.observations, ...state.tracks]) value.source.sensorModelId = forgedModelId;
  }
  let corrupt = await replaceRecordMember(record, "frames.arrow", VECTOR_FRAME_SCHEMA, encodeColumnarFrames(frames));

  const pictureMember = corrupt.members.find((member) => member.path === "pictures.jsonl");
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n").map(JSON.parse);
  for (const state of pictures) {
    if (state.schemaVersion !== "vector.observer-state.v3") continue;
    state.sensorModelId = forgedModelId;
    state.source = forgedModelId;
    for (const value of [...state.observations, ...state.tracks]) value.source.sensorModelId = forgedModelId;
  }
  corrupt = await replaceRecordMember(
    corrupt,
    "pictures.jsonl",
    VECTOR_PICTURE_SCHEMA,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );

  const eventMember = corrupt.members.find((member) => member.path === "events.jsonl");
  const events = new TextDecoder().decode(eventMember.bytes).trim().split("\n").map(JSON.parse);
  for (const event of events) if (event.payload.kind === "TRACK_STATE_CHANGED") event.payload.sensorModelId = forgedModelId;
  corrupt = await replaceRecordMember(
    corrupt,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, openOptions),
    /compiled scenario|admitted scenario|canonical tick state/i,
  );
});

test("VSR rejects corruption before exposing replay data", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const serialized = serializeVectorRecord(record);
  const bytes = new Uint8Array(serialized.buffer);
  bytes[serialized.byteLength - 1] ^= 0xff;
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /failed SHA-256 verification/,
  );

  const missing = serializeVectorRecord({
    ...record,
    members: record.members.filter((item) => item.path !== "events.jsonl"),
  });
  await assert.rejects(
    openVectorSimulationRecord(missing.buffer, missing.byteLength),
    /events\.jsonl.*does not match its manifest/,
  );
});

test("VSR rejects an observer-picture member with an unadmitted schema", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const unsupportedPictures = {
    ...record,
    members: record.members.map((member) =>
      member.path === "pictures.jsonl"
        ? { ...member, schemaVersion: "vector.pictures.v5" }
        : member,
    ),
  };
  const serialized = serializeVectorRecord(unsupportedPictures);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit the required observer-picture schema/,
  );
});

test("VSR admits only the governed frame/picture schema pairs", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(prepareSimulation(scenario), simulate(scenario), createdAt);
  for (const [frameSchema, pictureSchema] of [
    [VECTOR_FRAME_SCHEMA, LEGACY_VECTOR_PICTURE_SCHEMA],
    [LEGACY_VECTOR_FRAME_SCHEMA, LEGACY_VECTOR_PICTURE_SCHEMA],
    [OLDER_VECTOR_FRAME_SCHEMA, VECTOR_PICTURE_SCHEMA],
  ]) {
    let corrupt = await replaceRecordMember(record, "frames.arrow", frameSchema, record.members.find((member) => member.path === "frames.arrow").bytes);
    corrupt = await replaceRecordMember(corrupt, "pictures.jsonl", pictureSchema, record.members.find((member) => member.path === "pictures.jsonl").bytes);
    const serialized = serializeVectorRecord(corrupt);
    await assert.rejects(openVectorSimulationRecord(serialized.buffer, serialized.byteLength), /frame.*picture|schema pair/i);
  }
});

test("VSR rejects legacy v1 events when the record carries termination authority", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    simulate(scenario),
    createdAt,
  );
  const legacyBytes = textEncoder.encode(canonicalJson({
    schemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
    id: "event-000000",
    sequence: 0,
    t: 0,
    type: "ENTITY_ACTIVATED",
    entityId: "blue-aircraft-1",
    detail: "ACTIVE",
  }));
  const legacyRecord = await replaceRecordMember(
    record,
    "events.jsonl",
    LEGACY_VECTOR_EVENT_SCHEMA,
    legacyBytes,
  );
  const serialized = serializeVectorRecord(legacyRecord);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /weapon-termination authority require the typed v2 simulation-event stream/,
  );
});

test("VSR opens an unretained legacy record only when termination authority is absent", async () => {
  const scenario = SCENARIO_LIBRARY.find((entry) => entry.scenario.airMission === undefined).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", [scenario.domain]);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario, scenario.profile, capabilities),
    simulateWithCapabilitiesForVerification(scenario, capabilities),
    createdAt,
  );
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const unretainedDigest = "8".repeat(64);
  compiled.engineScenario.modelPack.id = "unretained-legacy-no-termination";
  compiled.engineScenario.modelPack.version = "1.0.0";
  compiled.engineScenario.modelPack.digest = unretainedDigest;
  compiled.engineScenario.modelPack.weaponTerminations = [];
  compiled.engineScenario.modelPack.scenarioPatches = [];
  delete compiled.engineScenario.modelPack.runtimeDigest;
  for (const entity of compiled.engineScenario.entities) {
    entity.provenance.modelPackDigest = unretainedDigest;
    if (entity.weapon) {
      entity.weapon.admission.modelPackDigest = unretainedDigest;
      delete entity.weapon.termination;
    }
  }
  let legacyRecord = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  legacyRecord = await replaceRecordMember(
    legacyRecord,
    "events.jsonl",
    LEGACY_VECTOR_EVENT_SCHEMA,
    textEncoder.encode(canonicalJson({
      schemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
      id: "event-000000",
      sequence: 0,
      t: 0,
      type: "ENTITY_ACTIVATED",
      entityId: "blue-aircraft-1",
      detail: "ACTIVE",
    })),
  );
  const serialized = serializeVectorRecord(legacyRecord);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);

  assert.equal(opened.result.engineRun.scenario.modelPack.id, "unretained-legacy-no-termination");
  assert.equal(opened.events.state, "UNAVAILABLE");
});

test("VSR verifies and opens the exact pre-termination v2 runtime projection", async () => {
  const scenario = SCENARIO_LIBRARY.find((entry) => entry.scenario.airMission === undefined).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", [scenario.domain]);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario, scenario.profile, capabilities),
    simulateWithCapabilitiesForVerification(scenario, capabilities),
    createdAt,
  );
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const historicalPack = historicalModelPackBundle.pack;
  const runtimePack = compiled.engineScenario.modelPack;
  runtimePack.id = historicalPack.id;
  runtimePack.version = historicalPack.version;
  runtimePack.digest = historicalPack.digest;
  runtimePack.intendedUse = { ...historicalPack.intendedUses[0] };
  runtimePack.observerSensors = historicalPack.sensors.map((sensor) => ({
    modelId: sensor.id,
    modelVersion: sensor.version,
    evidenceRefIds: [...sensor.evidenceRefIds],
    sensorKind: sensor.sensorKind,
    detectionRangeM: sensor.detectionRangeM,
    minimumRangeM: sensor.minimumRangeM,
    scanPeriodS: sensor.scanPeriodS,
    azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
    elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
    ...(sensor.verificationTrackModel
      ? { verificationTrackModel: structuredClone(sensor.verificationTrackModel) }
      : {}),
  }));
  runtimePack.scenarioPatches = [];
  delete runtimePack.weaponTerminations;
  runtimePack.runtimeDigest = "7bf22e26981fa0be7c28c755b8bffd1b6cc450461d4792a3db6d088a14f33dff";
  for (const entity of compiled.engineScenario.entities) {
    entity.provenance.modelPackDigest = historicalPack.digest;
    if (entity.weapon) {
      entity.weapon.admission.modelPackDigest = historicalPack.digest;
      delete entity.weapon.termination;
    }
  }
  let legacyRecord = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  legacyRecord = await replaceRecordMember(
    legacyRecord,
    "events.jsonl",
    LEGACY_VECTOR_EVENT_SCHEMA,
    textEncoder.encode(canonicalJson({
      schemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
      id: "event-000000",
      sequence: 0,
      t: 0,
      type: "ENTITY_ACTIVATED",
      entityId: "blue-aircraft-1",
      detail: "ACTIVE",
    })),
  );
  const serialized = serializeVectorRecord(legacyRecord);
  const opened = await openVectorSimulationRecord(serialized.buffer, serialized.byteLength);

  assert.equal(opened.result.engineRun.scenario.modelPack.version, "0.8.0");
  assert.equal(opened.result.engineRun.scenario.modelPack.runtimeDigest, runtimePack.runtimeDigest);
  assert.deepEqual(opened.result.engineRun.scenario.modelPack.weaponTerminations, []);
  assert.equal(opened.events.state, "UNAVAILABLE");

  const reopenedCompiled = JSON.parse(new TextDecoder().decode(
    legacyRecord.members.find((member) => member.path === "compiled.json").bytes,
  ));
  reopenedCompiled.engineScenario.modelPack.runtimeDigest = "0".repeat(64);
  const corrupt = await replaceRecordMember(
    legacyRecord,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(reopenedCompiled),
  );
  const corruptSerialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(corruptSerialized.buffer, corruptSerialized.byteLength),
    /legacy runtime model-pack projection digest does not match its v2 content/,
  );
});

test("VSR rejects unsupported, reordered, and causally corrupt v2 event streams", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const encodeEvents = (events) =>
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n"));

  const unsupported = await replaceRecordMember(
    record,
    "events.jsonl",
    "vector.simulation-event.v3",
    encodeEvents(result.engineRun.events.items),
  );
  let serialized = serializeVectorRecord(unsupported);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not admit a supported simulation-event schema/,
  );

  const reorderedItems = structuredClone(result.engineRun.events.items);
  [reorderedItems[0], reorderedItems[1]] = [reorderedItems[1], reorderedItems[0]];
  const reordered = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(reorderedItems),
  );
  serialized = serializeVectorRecord(reordered);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid sequence or ID/,
  );

  const causalItems = structuredClone(result.engineRun.events.items);
  causalItems[0].causeEventIds = [causalItems[1].id];
  const causal = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(causalItems),
  );
  serialized = serializeVectorRecord(causal);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /missing or future causal reference/,
  );

  const inventedBackwardCauseItems = structuredClone(result.engineRun.events.items);
  const completed = inventedBackwardCauseItems.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  completed.causeEventIds = [inventedBackwardCauseItems[0].id];
  const inventedBackwardCause = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(inventedBackwardCauseItems),
  );
  serialized = serializeVectorRecord(inventedBackwardCause);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload family does not admit causal references/,
  );

  const unknownPayloadItems = structuredClone(result.engineRun.events.items);
  unknownPayloadItems[0].payload.kind = "TYPO_EVENT";
  const unknownPayload = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(unknownPayloadItems),
  );
  serialized = serializeVectorRecord(unknownPayload);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload kind is unsupported/,
  );

  const futurePayloadVersionItems = structuredClone(result.engineRun.events.items);
  futurePayloadVersionItems[0].payload.schemaVersion =
    "vector.simulation-event-payload.run-started.v2";
  const futurePayloadVersion = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(futurePayloadVersionItems),
  );
  serialized = serializeVectorRecord(futurePayloadVersion);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /payload schema is unsupported/,
  );
});

test("VSR rejects a hash-resealed terminal-event distance that contradicts the report", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal);
  terminal.payload.closestApproachM += 1;
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept distance/,
  );
});

test("VSR rejects hash-rebound termination limits beside a retained pack identity", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const weapon = compiled.engineScenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.termination.interceptRadiusM += 100;
  const projected = compiled.engineScenario.modelPack.weaponTerminations.find(
    (candidate) => candidate.modelId === weapon.weapon.admission.weaponModelId,
  );
  assert.ok(projected);
  projected.termination.interceptRadiusM = weapon.weapon.termination.interceptRadiusM;
  const runtimeProjection = structuredClone(compiled.engineScenario.modelPack);
  delete runtimeProjection.runtimeDigest;
  compiled.engineScenario.modelPack = bindRuntimeModelPackDigest(runtimeProjection);
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match the exact compiled model pack/,
  );
});

test("VSR rejects missing runtime digest for retained weapon-termination authority", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  delete compiled.engineScenario.modelPack.runtimeDigest;
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /runtime model-pack projection digest/,
  );
});

test("VSR rejects hash-resealed weapon-termination authority under an unretained pack", async () => {
  const scenario = SCENARIO_LIBRARY.find((entry) => entry.scenario.airMission === undefined).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", [scenario.domain]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const compiledMember = record.members.find((member) => member.path === "compiled.json");
  assert.ok(compiledMember);
  const compiled = JSON.parse(new TextDecoder().decode(compiledMember.bytes));
  const runtimeProjection = structuredClone(compiled.engineScenario.modelPack);
  runtimeProjection.id = "unretained-termination-authority";
  runtimeProjection.version = "9.9.9";
  runtimeProjection.digest = "9".repeat(64);
  delete runtimeProjection.runtimeDigest;
  compiled.engineScenario.modelPack = bindRuntimeModelPackDigest(runtimeProjection);
  const corrupt = await replaceRecordMember(
    record,
    "compiled.json",
    compiledMember.schemaVersion,
    jsonBytes(compiled),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /No retained compiled model pack matches weapon-termination authority/,
  );
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength, {
      compiledModelPack: resolveRetainedCompiledModelPack(prepared.engineScenario.modelPack),
    }),
    /Supplied compiled model pack does not match the exact recorded identity/,
  );
});

test("VSR binds a terminal event to the report's exact primary weapon and target", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const carriedWeapon = result.engineRun.scenario.entities.find(
    (entity) =>
      entity.kind === "GUIDED_WEAPON" &&
      entity.id !== result.engineRun.primaryWeaponId,
  );
  assert.ok(carriedWeapon);
  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.primaryWeaponId = carriedWeapon.id;
  const corrupt = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR binds a nonterminal report's primary weapon and target to deterministic replay", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-crossing-intercept",
  ).scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "time_limit");
  const carriedWeapon = result.engineRun.scenario.entities.find(
    (entity) =>
      entity.kind === "GUIDED_WEAPON" &&
      entity.weapon?.launchTimeSeconds === null &&
      entity.weapon.launchPlatformId === "blue-platform-1",
  );
  assert.ok(carriedWeapon);

  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.primaryWeaponId = carriedWeapon.id;
  const corrupt = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);

  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /primary entity identity does not match deterministic engine replay/,
  );
});

test("VSR requires an active target for every terminal cause except target-unavailable", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const weapon = prepared.engineScenario.entities.find(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds !== null,
  );
  assert.ok(weapon?.weapon);
  governWeaponTermination(prepared.engineScenario, weapon, {
    maximumFlightTimeSeconds: 0.1,
  });
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  assert.equal(engineRun.termination, "weapon_expired");
  assert.equal(engineRun.events.state, "AVAILABLE");
  const terminal = engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "FLIGHT_TIME_EXPIRED");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects a hash-resealed terminal event with a false prior weapon state", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  terminal.payload.from = terminal.payload.from === "BOOST" ? "COAST" : "BOOST";
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects terminal geometry relabeled as a time-limit run", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const priorWeapon = frames[terminal.frameIndex - 1].entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  const finalWeapon = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  assert.ok(priorWeapon && finalWeapon);
  finalWeapon.lifecycle = priorWeapon.lifecycle;
  finalWeapon.weaponFlightState = priorWeapon.weaponFlightState;
  finalWeapon.phase = priorWeapon.phase;
  record = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );

  const events = result.engineRun.events.items
    .filter((event) =>
      event.payload.kind !== "WEAPON_TERMINATED" &&
      !(event.payload.kind === "ENTITY_LIFECYCLE_CHANGED" &&
        event.producer.entityId === terminal.payload.weaponId)
    )
    .map((event, sequence) => ({
      ...structuredClone(event),
      id: `event-${sequence.toString().padStart(6, "0")}`,
      sequence,
    }));
  const completed = events.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  completed.payload.termination = "time_limit";
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.termination = "time_limit";
  report.result.termination = "time_limit";
  record = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(record);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /suppresses the GEOMETRIC_INTERCEPT weapon termination proven by the final retained segment/,
  );
});

test("VSR rejects a relabeled terminal run with its exact final-step evidence removed", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const removedFrameIndex = terminal.frameIndex - 1;
  const removedFrame = frames[removedFrameIndex];
  const priorWeapon = removedFrame.entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  const finalWeapon = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  assert.ok(priorWeapon && finalWeapon);
  finalWeapon.lifecycle = priorWeapon.lifecycle;
  finalWeapon.weaponFlightState = priorWeapon.weaponFlightState;
  finalWeapon.phase = priorWeapon.phase;
  frames.splice(removedFrameIndex, 1);
  assert.ok(
    frames.at(-1).t - frames.at(-2).t > prepared.engineScenario.fixedStepSeconds + 1e-6,
    "falsifier must remove the exact final fixed-step predecessor",
  );
  record = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );

  const events = result.engineRun.events.items
    .filter((event) =>
      event.payload.kind !== "WEAPON_TERMINATED" &&
      !(event.payload.kind === "ENTITY_LIFECYCLE_CHANGED" &&
        event.producer.entityId === terminal.payload.weaponId)
    )
    .map((event, sequence) => ({
      ...structuredClone(event),
      id: `event-${sequence.toString().padStart(6, "0")}`,
      sequence,
      frameIndex: event.frameIndex > removedFrameIndex
        ? event.frameIndex - 1
        : event.frameIndex,
    }));
  const completed = events.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  completed.payload.termination = "time_limit";
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );

  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(pictureMember);
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n")
    .map(JSON.parse)
    .filter((picture) => picture.modelTimeSeconds !== removedFrame.t);
  record = await replaceRecordMember(
    record,
    "pictures.jsonl",
    pictureMember.schemaVersion,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.termination = "time_limit";
  report.result.termination = "time_limit";
  record = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );

  const serialized = serializeVectorRecord(record);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /no exact retained final fixed-step boundary geometry/,
  );
});

test("VSR rejects a terminal run truncated to an earlier nonterminal time-limit boundary", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  let cutoffFrameIndex = -1;
  for (let index = terminal.frameIndex - 2; index > 0; index -= 1) {
    if (
      Math.abs(
        frames[index].t - frames[index - 1].t - prepared.engineScenario.fixedStepSeconds,
      ) <= 1e-9
    ) {
      cutoffFrameIndex = index;
      break;
    }
  }
  assert.ok(cutoffFrameIndex > 0, "falsifier requires an earlier exact nonterminal pair");
  const cutoffTimeSeconds = frames[cutoffFrameIndex].t;
  const truncatedFrames = frames.slice(0, cutoffFrameIndex + 1);
  assert.ok(
    cutoffTimeSeconds < prepared.engineScenario.durationSeconds,
    "falsifier must stop before the declared scenario duration",
  );
  record = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(truncatedFrames),
  );

  const retainedEvents = result.engineRun.events.items
    .filter((event) =>
      event.payload.kind !== "RUN_COMPLETED" &&
      event.payload.kind !== "WEAPON_TERMINATED" &&
      event.frameIndex <= cutoffFrameIndex
    )
    .map((event) => structuredClone(event));
  const originalCompleted = result.engineRun.events.items.at(-1);
  assert.equal(originalCompleted?.payload.kind, "RUN_COMPLETED");
  retainedEvents.push({
    ...structuredClone(originalCompleted),
    tick: Math.round(cutoffTimeSeconds / prepared.engineScenario.fixedStepSeconds),
    modelTimeSeconds: cutoffTimeSeconds,
    frameIndex: cutoffFrameIndex,
    payload: {
      ...structuredClone(originalCompleted.payload),
      termination: "time_limit",
    },
  });
  const events = retainedEvents.map((event, sequence) => ({
    ...event,
    id: `event-${sequence.toString().padStart(6, "0")}`,
    sequence,
  }));
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );

  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(pictureMember);
  const pictures = new TextDecoder().decode(pictureMember.bytes).trim().split("\n")
    .map(JSON.parse)
    .filter((picture) => picture.modelTimeSeconds <= cutoffTimeSeconds);
  record = await replaceRecordMember(
    record,
    "pictures.jsonl",
    pictureMember.schemaVersion,
    textEncoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
  );

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.termination = "time_limit";
  report.result.termination = "time_limit";
  record = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );

  const serialized = serializeVectorRecord(record);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not reference the declared scenario terminal tick/,
  );
});

test("VSR replays a full termination-capable run before admitting a nonterminal claim", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-high-energy-crossing-challenge",
  ).scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  assert.equal(result.engineRun.termination, "weapon_intercept");
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const sourceFrameIndex = terminal.frameIndex - 2;
  const sourceFrame = frames[sourceFrameIndex];
  const sourceWeapon = sourceFrame?.entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  assert.ok(sourceFrame && sourceWeapon?.lifecycle !== "TERMINATED");
  const terminalTick = Math.ceil(
    prepared.engineScenario.durationSeconds / prepared.engineScenario.fixedStepSeconds - 1e-12,
  );
  const terminalTimeSeconds = terminalTick * prepared.engineScenario.fixedStepSeconds;
  const priorTerminalTimeSeconds = terminalTimeSeconds - prepared.engineScenario.fixedStepSeconds;
  const forgedFrames = frames.slice(0, sourceFrameIndex + 1);
  forgedFrames.push(
    { ...structuredClone(sourceFrame), t: priorTerminalTimeSeconds },
    { ...structuredClone(sourceFrame), t: terminalTimeSeconds },
  );
  record = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(forgedFrames),
  );

  const retainedEvents = result.engineRun.events.items
    .filter((event) =>
      event.frameIndex <= sourceFrameIndex &&
      event.payload.kind !== "RUN_COMPLETED" &&
      event.payload.kind !== "WEAPON_TERMINATED" &&
      !(event.payload.kind === "ENTITY_LIFECYCLE_CHANGED" &&
        event.producer.entityId === terminal.payload.weaponId)
    )
    .map((event) => structuredClone(event));
  const originalCompleted = result.engineRun.events.items.at(-1);
  assert.equal(originalCompleted?.payload.kind, "RUN_COMPLETED");
  retainedEvents.push({
    ...structuredClone(originalCompleted),
    tick: terminalTick,
    modelTimeSeconds: terminalTimeSeconds,
    frameIndex: forgedFrames.length - 1,
    causeEventIds: [],
    payload: {
      ...structuredClone(originalCompleted.payload),
      termination: "time_limit",
    },
  });
  const eventIdMap = new Map(
    retainedEvents.map((event, sequence) => [
      event.id,
      `event-${sequence.toString().padStart(6, "0")}`,
    ]),
  );
  const events = retainedEvents.map((event, sequence) => ({
    ...event,
    id: eventIdMap.get(event.id),
    sequence,
    causeEventIds: event.causeEventIds.map((id) => eventIdMap.get(id) ?? id),
  }));
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );

  const pictureMember = record.members.find((member) => member.path === "pictures.jsonl");
  assert.ok(pictureMember);
  const forgedPictures = projectObserverStates(forgedFrames);
  record = await replaceRecordMember(
    record,
    "pictures.jsonl",
    pictureMember.schemaVersion,
    textEncoder.encode(forgedPictures.map((picture) => canonicalJson(picture)).join("\n")),
  );

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.termination = "time_limit";
  report.result.termination = "time_limit";
  report.result.timeOfFlight = terminalTimeSeconds;
  record = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );

  const serialized = serializeVectorRecord(record);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match deterministic engine replay/,
  );
});

test("VSR rejects a hash-resealed geometric intercept occurrence time", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  terminal.payload.occurrenceTimeSeconds = Number((
    terminal.payload.occurrenceTimeSeconds - 0.04
  ).toFixed(6));
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept time/,
  );
});

test("VSR rejects hash-resealed geometric distance even when report and event agree", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  const forgedDistanceM = Math.min(
    terminal.payload.interceptRadiusM,
    terminal.payload.closestApproachM + 1,
  );
  assert.notEqual(forgedDistanceM, terminal.payload.closestApproachM);
  terminal.payload.closestApproachM = forgedDistanceM;

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.closestApproachM = forgedDistanceM;
  let corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  corrupt = await replaceRecordMember(
    corrupt,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match its exact geometric intercept distance/,
  );
});

test("VSR rejects hash-resealed non-intercept distance even when report and event agree", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2g-emitter-corridor",
  ).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2G"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  assert.equal(result.engineRun.termination, "weapon_failed");
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "TERRAIN_IMPACT");
  const forgedDistanceM = Number((terminal.payload.closestApproachM + 123).toFixed(6));
  terminal.payload.closestApproachM = forgedDistanceM;

  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.closestApproachM = forgedDistanceM;
  let corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  corrupt = await replaceRecordMember(
    corrupt,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /do not match retained lifetime closest-approach evidence/,
  );
});

test("VSR rejects removal and replacement of the declared lifetime-minimum witness", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "g2a-layered-screen",
  ).scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["G2A"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const result = simulateWithCapabilitiesForVerification(scenario, capabilities);
  let record = await createVectorSimulationRecord(prepared, result, createdAt);
  const events = structuredClone(result.engineRun.events.items);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "TERRAIN_IMPACT");

  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const removedIndex = frames.findIndex(
    (frame) => frame.t === terminal.payload.closestApproachNextTimeSeconds,
  );
  assert.ok(removedIndex > 0 && removedIndex < terminal.frameIndex);
  frames.splice(removedIndex, 1);

  const replacementNext = frames[terminal.frameIndex - 1];
  const replacementPrior = frames[terminal.frameIndex - 2];
  assert.ok(replacementPrior && replacementNext);
  const priorWeapon = replacementPrior.entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  const priorTarget = replacementPrior.entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  const nextWeapon = replacementNext.entities.find(
    (entity) => entity.id === terminal.payload.weaponId,
  );
  const nextTarget = replacementNext.entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(priorWeapon && priorTarget && nextWeapon && nextTarget);
  const forgedClosestApproachM = Number(closestApproachOnRelativeSegment(
    {
      x: priorTarget.position.x - priorWeapon.position.x,
      y: priorTarget.position.y - priorWeapon.position.y,
      z: priorTarget.position.z - priorWeapon.position.z,
    },
    {
      x: nextTarget.position.x - nextWeapon.position.x,
      y: nextTarget.position.y - nextWeapon.position.y,
      z: nextTarget.position.z - nextWeapon.position.z,
    },
  ).distanceM.toFixed(6));
  terminal.payload.closestApproachM = forgedClosestApproachM;
  terminal.payload.closestApproachPriorTimeSeconds = replacementPrior.t;
  terminal.payload.closestApproachNextTimeSeconds = replacementNext.t;
  for (const event of events) {
    if (event.frameIndex > removedIndex) event.frameIndex -= 1;
  }
  record = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  record = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const reportMember = record.members.find((member) => member.path === "report.json");
  assert.ok(reportMember);
  const report = JSON.parse(new TextDecoder().decode(reportMember.bytes));
  report.engine.closestApproachM = forgedClosestApproachM;
  report.result.closestApproach = forgedClosestApproachM;
  record = await replaceRecordMember(
    record,
    "report.json",
    reportMember.schemaVersion,
    jsonBytes(report),
  );

  const serialized = serializeVectorRecord(record);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /does not match deterministic engine replay/,
  );
});

test("VSR rejects a geometric intercept whose target is terminal in the event frame", async () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2a-defensive-break",
  ).scenario;
  const result = simulate(scenario);
  assert.equal(result.engineRun.events.state, "AVAILABLE");
  const terminal = result.engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT");
  const record = await createVectorSimulationRecord(
    prepareSimulation(scenario),
    result,
    createdAt,
  );
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects target-unavailable termination while the target remains active", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const targetDefinition = prepared.engineScenario.entities.find(
    (entity) => entity.id === "red-object-1",
  );
  assert.ok(targetDefinition);
  targetDefinition.lifecycle = "TERMINATED";
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  assert.equal(engineRun.events.state, "AVAILABLE");
  const terminal = engineRun.events.items.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "TARGET_UNAVAILABLE");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  const frameMember = record.members.find((member) => member.path === "frames.arrow");
  assert.ok(frameMember);
  const frames = decodeColumnarFrames(frameMember.bytes);
  const target = frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.ok(target);
  target.lifecycle = "ACTIVE";
  const corrupt = await replaceRecordMember(
    record,
    "frames.arrow",
    VECTOR_FRAME_SCHEMA,
    encodeColumnarFrames(frames),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /invalid authority, ownership, or achieved frame state/,
  );
});

test("VSR rejects a lifecycle event whose valid from-enum falsifies canonical history", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const prepared = prepareSimulation(scenario, scenario.profile, capabilities);
  const target = prepared.engineScenario.entities.find((entity) => entity.id === "red-object-1");
  assert.ok(target);
  target.lifecycle = "TERMINATED";
  const engineRun = runEngineBackend(prepared.engineScenario, "typescript");
  const result = buildSimulationResult(prepared, engineRun);
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  assert.equal(engineRun.events.state, "AVAILABLE");
  const events = structuredClone(engineRun.events.items);
  const transition = events.find((event) =>
    event.payload.kind === "ENTITY_LIFECYCLE_CHANGED"
  );
  assert.ok(transition?.payload.kind === "ENTITY_LIFECYCLE_CHANGED");
  transition.payload.from = "TRACKING";
  const corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
  );
  const serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /prior canonical lifecycle/,
  );
});

test("VSR rejects valid-state events moved away from their transition boundaries", async () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const prepared = prepareSimulation(scenario);
  const result = simulate(scenario);
  const engineRun = result.engineRun;
  const record = await createVectorSimulationRecord(prepared, result, createdAt);
  assert.equal(engineRun.events.state, "AVAILABLE");
  const weapon = engineRun.scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON");
  assert.ok(weapon?.weapon);
  const encodeEvents = (events) =>
    textEncoder.encode(events.map((event) => canonicalJson(event)).join("\n"));

  const delayedEntry = structuredClone(engineRun.events.items);
  const entry = delayedEntry.find((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id
  );
  assert.ok(entry);
  const laterFrame = engineRun.frames.findIndex((frame) => frame.t === 0.25);
  assert.ok(laterFrame >= 0);
  entry.tick = 5;
  entry.modelTimeSeconds = 0.25;
  entry.frameIndex = laterFrame;
  let corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(delayedEntry),
  );
  let serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /declared launch boundary/,
  );

  const earlyCompletion = structuredClone(engineRun.events.items);
  const completed = earlyCompletion.at(-1);
  assert.equal(completed?.payload.kind, "RUN_COMPLETED");
  const terminalTime = engineRun.frames.at(-1).t;
  const earlierTime = Number((terminalTime - 0.25).toFixed(6));
  const earlierFrame = engineRun.frames.findIndex((frame) => frame.t === earlierTime);
  assert.ok(earlierFrame >= 0);
  completed.tick = Math.round(earlierTime / engineRun.scenario.fixedStepSeconds);
  completed.modelTimeSeconds = earlierTime;
  completed.frameIndex = earlierFrame;
  corrupt = await replaceRecordMember(
    record,
    "events.jsonl",
    VECTOR_EVENT_SCHEMA,
    encodeEvents(earlyCompletion),
  );
  serialized = serializeVectorRecord(corrupt);
  await assert.rejects(
    openVectorSimulationRecord(serialized.buffer, serialized.byteLength),
    /final retained frame/,
  );
});

test("columnar frame decoder rejects an unsupported member schema", () => {
  const scenario = SCENARIO_LIBRARY[0].scenario;
  const bytes = encodeColumnarFrames(simulate(scenario).engineRun.frames);
  const encodedSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "9".charCodeAt(0);
  assert.throws(() => decodeColumnarFrames(bytes), /schema is unsupported/);
});

test("columnar frame decoder rejects v3 records because canonical observer state is absent", () => {
  const bytes = encodeColumnarFrames(simulate(SCENARIO_LIBRARY[0].scenario).engineRun.frames);
  const encodedSchema = new TextEncoder().encode(VECTOR_FRAME_SCHEMA);
  const offset = bytes.findIndex((_, index) =>
    encodedSchema.every((value, inner) => bytes[index + inner] === value),
  );
  assert.ok(offset > 0);
  bytes[offset + encodedSchema.length - 1] = "3".charCodeAt(0);
  assert.throws(
    () => decodeColumnarFrames(bytes),
    /omits canonical observer state/,
  );
});
