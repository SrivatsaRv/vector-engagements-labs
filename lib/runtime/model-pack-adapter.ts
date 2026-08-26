import { canonicalJson, sha256Hex } from "../canonical-json.ts";
import {
  admitWorkerCapabilityManifest,
  type CapabilityManifestIdentity,
} from "./deployment-capabilities.ts";
import type { PreparedSimulation } from "../simulation.ts";
import type { RuntimeModelPackAdapter } from "./protocol.ts";
import { assertRuntimeModelPackDigest } from "../engine/runtime-model-pack.ts";
import { compileAirMissionDefinition } from "../air-mission.ts";
import { admitEnvironmentPack } from "../geospatial/environment-pack.ts";
import { CURRENT_COMPILED_MODEL_PACK } from "../engine/weapon-admission.ts";

export async function adaptPreparedSimulation(
  prepared: PreparedSimulation,
): Promise<RuntimeModelPackAdapter> {
  const scenarioRef = `${prepared.engineScenario.id}@${prepared.engineScenario.version}`;
  const content = {
    schemaVersion: "vector.runtime-model-pack-adapter.v1" as const,
    scenarioRef,
    prepared,
  };
  return { ...content, digest: await sha256Hex(content) };
}

export async function verifyRuntimeModelPack(pack: RuntimeModelPackAdapter) {
  const { digest, ...content } = pack;
  return digest === (await sha256Hex(content));
}

/**
 * This is the Worker admission boundary for a structured-cloned compiled
 * scenario. It validates both the adapter bytes and the deployment authority
 * embedded in the adapter before a Worker stores or executes it.
 */
export async function admitRuntimeModelPack(
  pack: RuntimeModelPackAdapter,
): Promise<CapabilityManifestIdentity> {
  if (!(await verifyRuntimeModelPack(pack))) {
    throw new Error("The model-pack adapter digest is invalid.");
  }
  const manifest = admitWorkerCapabilityManifest(
    pack.prepared.capabilityManifest,
  );
  assertRuntimeModelPackDigest(pack.prepared.engineScenario.modelPack);
  if (!manifest.admittedModelPackDigests.includes(pack.prepared.engineScenario.modelPack.digest)) {
    throw new Error("The runtime model-pack digest is not admitted by this deployment.");
  }
  const { scenario, engineScenario } = pack.prepared;
  if (scenario.domain === "A2A") {
    if (!scenario.airMission || !engineScenario.airMission) {
      throw new Error("The Worker requires matching authored and compiled Air mission artifacts.");
    }
    const admittedEnvironment = admitEnvironmentPack({
      studyAreaId: scenario.studyAreaId,
      weatherPresetId: scenario.weatherPresetId,
      effectiveWeather: {
        windEastMps: scenario.wind,
        windNorthMps: scenario.windNorth,
        temperatureOffsetC: scenario.temperatureOffset,
      },
    });
    const verifiedMission = compileAirMissionDefinition(scenario.airMission, {
      scenario,
      modelPack: CURRENT_COMPILED_MODEL_PACK,
      environmentPackDigest: admittedEnvironment.pack.identity.digest,
      environmentPack: admittedEnvironment.pack,
      fixedStepSeconds: engineScenario.fixedStepSeconds,
      durationSeconds: engineScenario.durationSeconds,
    });
    if (
      verifiedMission.authoredDigest !== engineScenario.airMission.authoredDigest
      || verifiedMission.compiledDigest !== engineScenario.airMission.compiledDigest
      || canonicalJson(verifiedMission) !== canonicalJson(engineScenario.airMission)
    ) {
      throw new Error("The Worker Air mission does not match the compiled runtime artifact.");
    }
  } else if (scenario.airMission || engineScenario.airMission) {
    throw new Error("A non-Air Worker pack cannot add Air mission authority.");
  }
  return {
    schemaVersion: manifest.schemaVersion,
    digest: manifest.digest,
    engineId: manifest.engine.id,
  };
}
