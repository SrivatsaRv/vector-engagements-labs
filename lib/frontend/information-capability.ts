import type { EngineScenario } from "../engine/contracts";
import type {
  CapabilityDecision,
  DeploymentCapabilityManifest,
} from "../runtime/deployment-capabilities";

type RuntimeObserverSensor = EngineScenario["modelPack"]["observerSensors"][number];

export type RunInformationCapability = {
  state: "AVAILABLE" | "UNAVAILABLE";
  reason: string;
};

export type RunInformationCapabilitySummary = {
  sensors: RunInformationCapability;
  datalink: RunInformationCapability;
  ew: RunInformationCapability;
  virtualPilot: RunInformationCapability;
};

const unavailable = (reason: string): RunInformationCapability => ({
  state: "UNAVAILABLE",
  reason,
});

const available = (reason: string): RunInformationCapability => ({
  state: "AVAILABLE",
  reason,
});

function deploymentAllows(decision: CapabilityDecision) {
  return decision.state === "ENABLED";
}

/**
 * Project what this exact run can produce. A deployment switch can forbid a
 * capability, but it cannot promote absent compiled model authority into one.
 */
export function projectRunInformationCapabilities(input: {
  manifest: DeploymentCapabilityManifest;
  observerSensors: readonly RuntimeObserverSensor[];
  datalinkModelAdmitted?: boolean;
  ewModelAdmitted?: boolean;
  virtualPilotModelAdmitted?: boolean;
}): RunInformationCapabilitySummary {
  const positiveSensor = input.observerSensors.find((sensor) =>
    sensor.sensorKind !== "DECLARED_ENVELOPE"
    && sensor.detectionRangeM > sensor.minimumRangeM
  );
  const sensorDeployment = input.manifest.optionalCapabilities.sensors;
  const sensors = !deploymentAllows(sensorDeployment)
    ? unavailable(sensorDeployment.reason)
    : positiveSensor
      ? available(
          `Compiled ${positiveSensor.sensorKind.toLowerCase()} model ${positiveSensor.modelId}@${positiveSensor.modelVersion} is admitted for this run.`,
        )
      : unavailable(
          "The compiled production model pack has no positive-range sensor model, so this run records no observations or tracks.",
        );

  const datalinkDeployment = input.manifest.optionalCapabilities.datalink;
  const datalink = !deploymentAllows(datalinkDeployment)
    ? unavailable(datalinkDeployment.reason)
    : input.datalinkModelAdmitted
      ? available("A compiled causal data-link model is admitted for this run.")
      : unavailable("No compiled causal data-link model is admitted for this run.");

  const ewDeployment = input.manifest.optionalCapabilities.ew;
  const ew = !deploymentAllows(ewDeployment)
    ? unavailable(ewDeployment.reason)
    : input.ewModelAdmitted
      ? available("A compiled causal EW model is admitted for this run.")
      : unavailable(
          "The deployment switch is enabled, but this run has no compiled EW model; jamming does not alter its sensor or weapon state.",
        );

  const virtualPilot = input.virtualPilotModelAdmitted
    ? available("A compiled virtual-pilot policy is admitted for this run.")
    : unavailable(
        "No virtual-pilot policy is admitted; both aircraft follow authored routes and Red does not autonomously launch a weapon.",
      );

  return { sensors, datalink, ew, virtualPilot };
}
