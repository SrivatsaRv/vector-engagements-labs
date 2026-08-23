import { sha256HexBytesSync } from "../geospatial/digest.ts";
import type { EngineScenario } from "./contracts.ts";

export type RuntimeModelPackProjection = EngineScenario["modelPack"];

function projectionIdentity(pack: RuntimeModelPackProjection) {
  const fields: number[] = [];
  const taggedU64 = (tag: number, value: bigint) => {
    fields.push(tag);
    const bytes = new ArrayBuffer(8);
    new DataView(bytes).setBigUint64(0, value, false);
    fields.push(...new Uint8Array(bytes));
  };
  const string = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    taggedU64(0x73, BigInt(bytes.byteLength));
    fields.push(...bytes);
  };
  const integer = (value: number) => taggedU64(0x69, BigInt(value));
  const number = (value: number) => {
    const bytes = new ArrayBuffer(8);
    new DataView(bytes).setFloat64(0, value, false);
    fields.push(0x66, ...new Uint8Array(bytes));
  };
  const vector = (value: { x: number; y: number; z: number }) => {
    number(value.x); number(value.y); number(value.z);
  };
  const strings = (values: readonly string[]) => {
    integer(values.length);
    values.forEach(string);
  };

  string("vector.runtime-model-pack-digest.v2");
  string(pack.schemaVersion); string(pack.id); string(pack.version); string(pack.digest);
  string(pack.intendedUse.id); string(pack.intendedUse.version);
  integer(pack.observerSensors.length);
  for (const sensor of pack.observerSensors) {
    string(sensor.modelId); string(sensor.modelVersion); strings(sensor.evidenceRefIds); string(sensor.sensorKind);
    number(sensor.detectionRangeM); number(sensor.minimumRangeM); number(sensor.scanPeriodS);
    number(sensor.azimuthFieldOfViewRad); number(sensor.elevationFieldOfViewRad);
    const model = sensor.verificationTrackModel;
    integer(model ? 1 : 0);
    if (model) {
      string(model.schemaVersion); string(model.valueState); string(model.intendedUse);
      vector(model.positionBiasM); vector(model.velocityBiasMps);
      vector(model.positionStandardDeviationM); vector(model.velocityStandardDeviationMps);
      integer(model.confirmationObservations);
      number(model.maximumObservationAgeSeconds); number(model.coastAfterSeconds); number(model.lostAfterSeconds);
      integer(model.observationWindowsSeconds.length);
      for (const window of model.observationWindowsSeconds) { number(window.start); number(window.end); }
    }
  }
  integer(pack.scenarioPatches.length);
  for (const patch of pack.scenarioPatches) {
    string(patch.schemaVersion); string(patch.id); string(patch.modelPackDigest); string(patch.modelId);
    string(patch.fieldPath); number(patch.oldValue); number(patch.newValue); string(patch.unit); string(patch.reason);
    string(patch.provenance.authorId); string(patch.provenance.authoredAt); strings(patch.provenance.evidenceRefIds);
  }
  return new Uint8Array(fields);
}

export function runtimeModelPackDigest(pack: RuntimeModelPackProjection) {
  return sha256HexBytesSync(projectionIdentity(pack));
}

export function bindRuntimeModelPackDigest(
  pack: Omit<RuntimeModelPackProjection, "runtimeDigest">,
): RuntimeModelPackProjection {
  return { ...pack, runtimeDigest: runtimeModelPackDigest(pack) };
}

export function assertRuntimeModelPackDigest(pack: RuntimeModelPackProjection) {
  if (!pack.runtimeDigest || pack.runtimeDigest !== runtimeModelPackDigest(pack)) {
    throw new Error("The runtime model-pack projection digest does not match its content.");
  }
}
