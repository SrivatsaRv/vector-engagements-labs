import { sha256HexBytesSync } from "../geospatial/digest.ts";
import {
  validateScenarioModelPatch,
  type CompiledModelPack,
  type ScenarioModelPatch,
} from "../model-pack.ts";
import type { EngineScenario } from "./contracts.ts";

export type RuntimeModelPackProjection = EngineScenario["modelPack"];
export type LegacyRuntimeModelPackProjection = Omit<
  RuntimeModelPackProjection,
  "weaponTerminations"
>;

function projectionIdentity(
  pack: RuntimeModelPackProjection | LegacyRuntimeModelPackProjection,
  version: "v2" | "v3",
) {
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

  string(`vector.runtime-model-pack-digest.${version}`);
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
  if (version === "v3") {
    if (!("weaponTerminations" in pack) || !Array.isArray(pack.weaponTerminations)) {
      throw new Error("The runtime model-pack v3 projection has no weapon-termination inventory.");
    }
    integer(pack.weaponTerminations.length);
    for (const weapon of pack.weaponTerminations) {
      string(weapon.modelId); string(weapon.modelVersion);
      string(weapon.termination.schemaVersion); string(weapon.termination.intendedUse);
      string(weapon.termination.criterion); number(weapon.termination.interceptRadiusM);
      number(weapon.termination.maximumFlightTimeSeconds);
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

export function runtimeWeaponTerminations(
  pack: Readonly<CompiledModelPack>,
  patches: readonly ScenarioModelPatch[],
): RuntimeModelPackProjection["weaponTerminations"] {
  for (const patch of patches) validateScenarioModelPatch(pack, patch);
  const relevantPatchKeys = new Set<string>();
  for (const patch of patches) {
    if (!patch.fieldPath.startsWith("/termination/")) continue;
    const key = `${patch.modelId}${patch.fieldPath}`;
    if (relevantPatchKeys.has(key)) {
      throw new Error(`Runtime model pack has duplicate weapon termination patch ${key}.`);
    }
    relevantPatchKeys.add(key);
  }
  return pack.weapons.flatMap((weapon) => {
    // Retained packs authored before vector.weapon-termination-model.v1 remain
    // replayable, but cannot manufacture authority they never contained.
    if (!weapon.termination) return [];
    const interceptPatch = patches.find((patch) =>
      patch.modelId === weapon.id && patch.fieldPath === "/termination/interceptRadiusM"
    );
    const lifetimePatch = patches.find((patch) =>
      patch.modelId === weapon.id && patch.fieldPath === "/termination/maximumFlightTimeS"
    );
    return [{
      modelId: weapon.id,
      modelVersion: weapon.version,
      termination: {
        schemaVersion: weapon.termination.schemaVersion,
        intendedUse: weapon.termination.intendedUse,
        criterion: weapon.termination.criterion,
        interceptRadiusM: interceptPatch?.newValue ?? weapon.termination.interceptRadiusM,
        maximumFlightTimeSeconds: lifetimePatch?.newValue ?? weapon.termination.maximumFlightTimeS,
      },
    }];
  });
}

export function runtimeObserverSensors(
  pack: Readonly<CompiledModelPack>,
): RuntimeModelPackProjection["observerSensors"] {
  return pack.sensors.map((sensor) => ({
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
}

export function assertRuntimeObserverSensorAuthority(
  runtimePack: RuntimeModelPackProjection,
  compiledPack: Readonly<CompiledModelPack>,
) {
  const expected = runtimeObserverSensors(compiledPack);
  if (runtimeModelPackDigest({ ...runtimePack, observerSensors: expected }) !==
      runtimeModelPackDigest(runtimePack)) {
    throw new Error(
      "The runtime observer-sensor projection does not match the exact compiled model pack.",
    );
  }
}

export function assertRuntimeWeaponTerminationAuthority(
  runtimePack: RuntimeModelPackProjection,
  compiledPack: Readonly<CompiledModelPack>,
) {
  const expected = runtimeWeaponTerminations(compiledPack, runtimePack.scenarioPatches);
  const exact = runtimePack.weaponTerminations.length === expected.length &&
    runtimePack.weaponTerminations.every((actual, index) => {
      const item = expected[index];
      return item !== undefined && actual.modelId === item.modelId &&
        actual.modelVersion === item.modelVersion &&
        actual.termination.schemaVersion === item.termination.schemaVersion &&
        actual.termination.intendedUse === item.termination.intendedUse &&
        actual.termination.criterion === item.termination.criterion &&
        actual.termination.interceptRadiusM === item.termination.interceptRadiusM &&
        actual.termination.maximumFlightTimeSeconds ===
          item.termination.maximumFlightTimeSeconds;
    });
  if (!exact) {
    throw new Error("The runtime weapon-termination projection does not match the exact compiled model pack.");
  }
}

export function runtimeModelPackDigest(pack: RuntimeModelPackProjection) {
  return sha256HexBytesSync(projectionIdentity(pack, "v3"));
}

export function legacyRuntimeModelPackDigest(pack: LegacyRuntimeModelPackProjection) {
  return sha256HexBytesSync(projectionIdentity(pack, "v2"));
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

export function assertLegacyRuntimeModelPackDigest(pack: LegacyRuntimeModelPackProjection) {
  if (!pack.runtimeDigest || pack.runtimeDigest !== legacyRuntimeModelPackDigest(pack)) {
    throw new Error("The legacy runtime model-pack projection digest does not match its v2 content.");
  }
}

export function assertRuntimeModelPackAuthority(
  runtimePack: RuntimeModelPackProjection,
  compiledPack?: Readonly<CompiledModelPack>,
  options: {
    requireCompiledWeaponTerminationAuthority?: boolean;
    runtimeDigestVersion?: "v2" | "v3";
  } = {},
) {
  const hasRuntimeTerminationAuthority =
    (runtimePack.weaponTerminations?.length ?? 0) > 0;
  const compiledTerminationAuthority = compiledPack?.weapons.some(
    (weapon) => weapon.termination !== undefined,
  ) ?? false;
  if (options.requireCompiledWeaponTerminationAuthority && !compiledPack) {
    throw new Error(
      `No retained compiled model pack matches weapon-termination authority ${runtimePack.id}@${runtimePack.version} (${runtimePack.digest}).`,
    );
  }
  if (options.requireCompiledWeaponTerminationAuthority && !compiledTerminationAuthority) {
    throw new Error(
      `The retained compiled model pack ${runtimePack.id}@${runtimePack.version} contains no weapon-termination authority.`,
    );
  }
  const requiresDigest = compiledTerminationAuthority ||
    hasRuntimeTerminationAuthority ||
    (runtimePack.observerSensors ?? []).some(
      (sensor) => sensor.verificationTrackModel !== undefined,
    );
  if (requiresDigest || runtimePack.runtimeDigest !== undefined) {
    if (options.runtimeDigestVersion === "v2") {
      assertLegacyRuntimeModelPackDigest(runtimePack);
    } else {
      assertRuntimeModelPackDigest(runtimePack);
    }
  }
  if (compiledPack && runtimePack.runtimeDigest !== undefined) {
    assertRuntimeObserverSensorAuthority(runtimePack, compiledPack);
    assertRuntimeWeaponTerminationAuthority(runtimePack, compiledPack);
  }
}
