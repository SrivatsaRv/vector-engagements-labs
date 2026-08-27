import {
  compileModelPack,
  INTENDED_USE_SCHEMA_VERSION,
  SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION,
  type CompiledModelPack,
  type ModelPackSource,
} from "../model-pack.ts";
import { createCurrentModelPackSource } from "../reference-model-pack.ts";
import type {
  EngineScenario,
  ObserverSensorAdmission,
  ObserverTrackModel,
} from "./contracts.ts";
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "./runtime-model-pack.ts";

export const ENGINE_VERIFICATION_INTENDED_USE =
  "vector.intended-use.engine-verification" as const;
export const GENERIC_VERIFICATION_SENSOR_ID =
  "generic-observation-track-verification-v1" as const;

const SOURCE_ID = "generic-track-verification-source-v1";
const VALIDATION_ID = "generic-track-verification-validation-v1";
const ARTIFACT_DIGEST = "3".repeat(64);

export const DEFAULT_VERIFICATION_TRACK_MODEL: ObserverTrackModel = {
  schemaVersion: "vector.generic-track-model.v1",
  valueState: "TEST_FIXTURE",
  intendedUse: "ENGINE_VERIFICATION_ONLY",
  positionBiasM: { x: 5, y: -2, z: 1 },
  velocityBiasMps: { x: 0.5, y: -0.25, z: 0 },
  positionStandardDeviationM: { x: 40, y: 40, z: 60 },
  velocityStandardDeviationMps: { x: 3, y: 3, z: 4 },
  confirmationObservations: 2,
  maximumObservationAgeSeconds: 0.1,
  coastAfterSeconds: 0.1,
  lostAfterSeconds: 0.2,
  observationWindowsSeconds: [
    { start: 0, end: 0.05 },
    { start: 0.35, end: 140 },
  ],
};

/**
 * Creates a source-authored generic pack through the normal model-pack
 * compiler. This fixture is deliberately unavailable to deployment code.
 */
export function createVerificationTrackModelPackSource(): ModelPackSource {
  const source = createCurrentModelPackSource();
  const declared = source.sensors[0]!;
  source.id = "vector-generic-track-engine-verification";
  source.version = "1.0.0";
  source.intendedUses.push({
    schemaVersion: INTENDED_USE_SCHEMA_VERSION,
    id: ENGINE_VERIFICATION_INTENDED_USE,
    version: "1.0.0",
    question: "Does the generic side-owned TrackStore obey its declared deterministic contract?",
    requiredCapabilities: ["generic-observation", "side-owned-track-store", "canonical-events"],
    supportedInterpretations: ["engine verification only"],
    unsupportedInterpretations: ["named radar performance", "operational detection", "weapon support"],
  });
  source.evidence.push(
    {
      id: SOURCE_ID,
      kind: "SOURCE",
      title: "Source-authored generic TrackStore verification fixture",
      uri: "urn:vector:test:generic-track-source-v1",
      contentSha256: ARTIFACT_DIGEST,
      accessedAt: "2026-08-23",
    },
    {
      id: VALIDATION_ID,
      kind: "VALIDATION",
      title: "Independent generic TrackStore transition oracle",
      uri: "urn:vector:test:generic-track-validation-v1",
      contentSha256: "4".repeat(64),
      accessedAt: "2026-08-23",
    },
  );
  source.sensors.push({
    ...structuredClone(declared),
    id: GENERIC_VERIFICATION_SENSOR_ID,
    version: "1.0.0",
    sensorKind: "RADAR",
    evidenceRefIds: [SOURCE_ID, VALIDATION_ID],
    evidenceAdmission: {
      schemaVersion: SENSOR_EVIDENCE_ADMISSION_SCHEMA_VERSION,
      sourceEvidenceRefIds: [SOURCE_ID],
      validationEvidenceRefIds: [VALIDATION_ID],
      coverage: {
        detectionRange: "VALIDATED",
        minimumRange: "VALIDATED",
        scanPeriod: "VALIDATED",
        azimuthFieldOfView: "VALIDATED",
        elevationFieldOfView: "VALIDATED",
        measurementUncertainty: "VALIDATED",
        targetApplicability: "VALIDATED",
      },
    },
    detectionRange: { value: 200, unit: "km", evidenceRefIds: [SOURCE_ID] },
    minimumRange: { value: 0, unit: "m", evidenceRefIds: [SOURCE_ID] },
    scanPeriod: { value: 50, unit: "ms", evidenceRefIds: [SOURCE_ID] },
    azimuthFieldOfView: { value: 360, unit: "deg", evidenceRefIds: [SOURCE_ID] },
    elevationFieldOfView: { value: 180, unit: "deg", evidenceRefIds: [SOURCE_ID] },
    verificationTrackModel: structuredClone(DEFAULT_VERIFICATION_TRACK_MODEL),
  });
  for (const aircraft of source.aircraft) {
    aircraft.sensorModelIds.push(GENERIC_VERIFICATION_SENSOR_ID);
  }
  source.credibility.intendedUseRefs.push({
    id: ENGINE_VERIFICATION_INTENDED_USE,
    version: "1.0.0",
  });
  return source;
}

function runtimeSensor(pack: CompiledModelPack): ObserverSensorAdmission {
  const sensor = pack.sensors.find((item) => item.id === GENERIC_VERIFICATION_SENSOR_ID);
  if (!sensor?.verificationTrackModel) throw new Error("Compiled verification sensor is incomplete.");
  return {
    schemaVersion: "vector.observer-sensor-admission.v2",
    modelPackDigest: pack.digest,
    modelId: sensor.id,
    modelVersion: sensor.version,
    evidenceRefIds: [...sensor.evidenceRefIds],
    sensorKind: "RADAR",
    mode: "SEARCH",
    detectionRangeM: sensor.detectionRangeM,
    minimumRangeM: sensor.minimumRangeM,
    scanPeriodS: sensor.scanPeriodS,
    azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
    elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
    verificationTrackModel: structuredClone(sensor.verificationTrackModel),
  };
}

export async function bindVerificationTrackModelPack(
  input: EngineScenario,
  trackModel: ObserverTrackModel = DEFAULT_VERIFICATION_TRACK_MODEL,
): Promise<{ scenario: EngineScenario; pack: CompiledModelPack }> {
  const source = createVerificationTrackModelPackSource();
  const sensor = source.sensors.find((item) => item.id === GENERIC_VERIFICATION_SENSOR_ID);
  if (!sensor) throw new Error("Source verification sensor is unavailable.");
  sensor.verificationTrackModel = structuredClone(trackModel);
  const { pack } = await compileModelPack(source);
  const admittedSensor = runtimeSensor(pack);
  const scenario = structuredClone(input);
  scenario.modelPack = bindRuntimeModelPackDigest({
    schemaVersion: "vector.compiled-model-pack.v1",
    id: pack.id,
    version: pack.version,
    digest: pack.digest,
    intendedUse: { id: ENGINE_VERIFICATION_INTENDED_USE, version: "1.0.0" },
    observerSensors: pack.sensors.map((item) => ({
      modelId: item.id,
      modelVersion: item.version,
      evidenceRefIds: [...item.evidenceRefIds],
      sensorKind: item.sensorKind,
      detectionRangeM: item.detectionRangeM,
      minimumRangeM: item.minimumRangeM,
      scanPeriodS: item.scanPeriodS,
      azimuthFieldOfViewRad: item.azimuthFieldOfViewRad,
      elevationFieldOfViewRad: item.elevationFieldOfViewRad,
      ...(item.verificationTrackModel
        ? { verificationTrackModel: structuredClone(item.verificationTrackModel) }
        : {}),
    })),
    weaponTerminations: runtimeWeaponTerminations(pack, []),
    scenarioPatches: [],
  });
  for (const entity of scenario.entities) {
    entity.provenance.modelPackDigest = pack.digest;
    if (entity.weapon) entity.weapon.admission.modelPackDigest = pack.digest;
    if (entity.kind === "AIRCRAFT") entity.observerSensor = structuredClone(admittedSensor);
  }
  return { scenario, pack };
}
