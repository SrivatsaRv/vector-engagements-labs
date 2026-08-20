import type { Frame, RaspAvailabilityReason, RaspTrack, Scenario, TrackSource } from "./simulation.ts";
import type { Vec3 } from "./engine/primitives.ts";
import type { DeploymentCapabilityManifest } from "./runtime/deployment-capabilities.ts";
import { isOptionalCapabilityEnabled } from "./runtime/deployment-capabilities.ts";

/**
 * Versioned, public-educational information model. These are assumptions, not
 * claims about named equipment. The manifest gates their use in a deployment.
 */
export const INFORMATION_MODEL = Object.freeze({
  id: "vector.a2a-information-study.v1",
  version: "1.0.0",
  sensorDigest: "declared-envelope-sensor-study-v05",
  scanPeriodSeconds: 1,
  detectionRangeM: 80_000,
  minimumRangeM: 1_000,
  coastSeconds: 4,
  confirmationObservations: 2,
  datalinkLatencySeconds: 0.5,
  jammerSignalScale: 0.55,
  measurementFloorM: 150,
  measurementRangeFraction: 0.0125,
} as const);

export type SensorState = "OFF" | "STANDBY" | "SEARCH" | "ACQUIRE" | "TRACK" | "SUPPORT" | "DEGRADED" | "FAILED";
export type TrackState = "NONE" | "PLOT" | "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST" | "UNSUPPORTED";
export type ObservationCause = "RADAR_SCAN" | "VISUAL" | "DATALINK_RECEIPT" | "NO_SENSOR_MODEL" | "RADAR_SILENT" | "OUT_OF_RANGE" | "JAMMED" | "DATALINK_UNAVAILABLE";

export type Observation = {
  id: string;
  owner: "IAF" | "PAF";
  sensorState: SensorState;
  source: TrackSource;
  modelTimeSeconds: number;
  position: Vec3;
  covarianceMeters: number;
  cause: ObservationCause;
  sensorModelDigest: string;
};

export type DatalinkMessage = {
  id: string;
  sender: "IAF" | "PAF";
  receiver: "IAF" | "PAF";
  sentAtSeconds: number;
  receivedAtSeconds: number;
  lossCause: "NONE" | "DATALINK_UNAVAILABLE";
  payloadVersion: "vector.datalink-track.v1";
};

type MutableTrack = {
  observations: Observation[];
  lastObservation?: Observation;
  state: TrackState;
};

const sourceLabel: Record<TrackSource, string> = {
  ONBOARD_RADAR: "Onboard radar",
  DATALINK: "Tactical data link",
  AIRBORNE_EARLY_WARNING: "Airborne early warning",
  VISUAL: "Visual observation",
};

function sideConfiguration(scenario: Scenario, perspective: "IAF" | "PAF") {
  const blue = perspective === "IAF";
  return {
    source: blue ? scenario.blueTrackSource : scenario.redTrackSource,
    radar: blue ? scenario.blueRadarMode : scenario.redRadarMode,
    datalink: blue ? scenario.blueDatalink : scenario.redDatalink,
    opposingJammer: blue ? scenario.redJammer : scenario.blueJammer,
    observedEntityId: blue ? "red-object-1" : "blue-platform-1",
  } as const;
}

function unavailable(reason: RaspAvailabilityReason, explanation: string) {
  return { available: false, reason, explanation } as const;
}

export function informationAvailability(
  scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
  manifest?: DeploymentCapabilityManifest,
) {
  const config = sideConfiguration(scenario, perspective);
  if (!frame.entities.some((entity) => entity.id === config.observedEntityId)) {
    return unavailable("NO_OBSERVED_ENTITY", "The opposing aircraft is not present in this engine frame.");
  }
  if (manifest && !isOptionalCapabilityEnabled("sensors", manifest)) {
    return unavailable("SENSOR_UNSUPPORTED", "The deployment does not admit the information-model sensor capability.");
  }
  if (config.source === "ONBOARD_RADAR" && config.radar !== "ACTIVE") {
    return unavailable("RADAR_SILENT", "The observing radar is not active.");
  }
  if ((config.source === "DATALINK" || config.source === "AIRBORNE_EARLY_WARNING") &&
      (!config.datalink || (manifest && !isOptionalCapabilityEnabled("datalink", manifest)))) {
    return unavailable("DATALINK_UNAVAILABLE", "The required admitted data-link path is unavailable.");
  }
  if (config.source === "DATALINK" || config.source === "AIRBORNE_EARLY_WARNING") {
    return unavailable("DATALINK_SOURCE_UNAVAILABLE", "No admitted sender-side observation source exists for this off-board track.");
  }
  const range = frame.range;
  if (config.source === "VISUAL" && range > Math.min(scenario.visibilityKm * 1000, 18_000)) {
    return unavailable("BEYOND_VISUAL_RANGE", "The opposing aircraft is outside the declared visual-acquisition range.");
  }
  if (config.source === "ONBOARD_RADAR" && (range < INFORMATION_MODEL.minimumRangeM || range > INFORMATION_MODEL.detectionRangeM)) {
    return unavailable("RADAR_OUT_OF_RANGE", "The opposing aircraft is outside the admitted sensor-model range.");
  }
  return { available: true, reason: "AVAILABLE" as const, explanation: `${sourceLabel[config.source]} is admitted for this frame.` };
}

function observationFor(
  scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
  manifest?: DeploymentCapabilityManifest,
): Observation | undefined {
  const config = sideConfiguration(scenario, perspective);
  const availability = informationAvailability(scenario, frame, perspective, manifest);
  if (!availability.available) return undefined;
  const observed = frame.entities.find((entity) => entity.id === config.observedEntityId);
  if (!observed) return undefined;
  const source = config.source;
  const isRadar = source === "ONBOARD_RADAR";
  const ewEnabled = !manifest || isOptionalCapabilityEnabled("ew", manifest);
  const effectiveRange = config.opposingJammer && isRadar && ewEnabled
    ? INFORMATION_MODEL.detectionRangeM * INFORMATION_MODEL.jammerSignalScale
    : INFORMATION_MODEL.detectionRangeM;
  if (isRadar && frame.range > effectiveRange) return undefined;
  const covarianceMeters = Math.max(
    INFORMATION_MODEL.measurementFloorM,
    frame.range * INFORMATION_MODEL.measurementRangeFraction * (config.opposingJammer && isRadar && ewEnabled ? 1 / INFORMATION_MODEL.jammerSignalScale : 1),
  );
  return {
    id: `${perspective}-${source}-${frame.t.toFixed(2)}`,
    owner: perspective,
    sensorState: isRadar ? (config.opposingJammer && ewEnabled ? "DEGRADED" : "TRACK") : "ACQUIRE",
    source,
    modelTimeSeconds: frame.t,
    position: { ...observed.position },
    covarianceMeters,
    cause: config.opposingJammer && isRadar && ewEnabled ? "JAMMED" : source === "VISUAL" ? "VISUAL" : source === "ONBOARD_RADAR" ? "RADAR_SCAN" : "DATALINK_RECEIPT",
    sensorModelDigest: INFORMATION_MODEL.sensorDigest,
  };
}

function status(state: TrackState): RaspTrack["status"] {
  if (state === "CONFIRMED") return "TRACKING";
  if (state === "PLOT" || state === "TENTATIVE") return "DEGRADED";
  if (state === "COASTING") return "COASTING";
  return "NO_TRACK";
}

function snapshot(
  scenario: Scenario,
  frame: Frame,
  perspective: "IAF" | "PAF",
  track: MutableTrack,
  manifest?: DeploymentCapabilityManifest,
): RaspTrack {
  const config = sideConfiguration(scenario, perspective);
  const last = track.lastObservation;
  const age = last ? Math.max(0, frame.t - last.modelTimeSeconds) : 0;
  const availability = informationAvailability(scenario, frame, perspective, manifest);
  const visible = track.state !== "NONE" && track.state !== "LOST" && track.state !== "UNSUPPORTED" && Boolean(last);
  return {
    perspective,
    trackId: `${perspective}-${config.observedEntityId}-track-v1`,
    classification: "Unidentified airborne track",
    identification: "UNKNOWN",
    source: sourceLabel[config.source],
    lastUpdateSeconds: last?.modelTimeSeconds ?? frame.t,
    ageSeconds: age,
    confidence: track.state === "CONFIRMED" ? 80 : track.state === "TENTATIVE" ? 55 : track.state === "PLOT" ? 35 : track.state === "COASTING" ? 20 : 0,
    uncertaintyMeters: last ? Math.round(last.covarianceMeters + age * 250) : 0,
    position: last ? { ...last.position } : { x: 0, y: 0, z: 0 },
    observedEntityId: config.observedEntityId,
    visible,
    status: status(track.state),
    trackState: track.state,
    availabilityReason: availability.reason,
    effectScope: "AIR_PICTURE_ONLY",
    stateExplanation: last
      ? `${sourceLabel[last.source]} updated this side-owned track at ${last.modelTimeSeconds.toFixed(2)} s.`
      : availability.explanation,
  };
}

/** Deterministic fixed-history derivation. Truth is read only to form a sensor-owned measurement. */
export function buildSidePictures(
  scenario: Scenario,
  frames: readonly Frame[],
  manifest?: DeploymentCapabilityManifest,
): RaspTrack[] {
  const tracks: Record<"IAF" | "PAF", MutableTrack> = {
    IAF: { observations: [], state: "NONE" },
    PAF: { observations: [], state: "NONE" },
  };
  const output: RaspTrack[] = [];
  for (const frame of frames) {
    for (const perspective of ["IAF", "PAF"] as const) {
      const track = tracks[perspective];
      const availability = informationAvailability(scenario, frame, perspective, manifest);
      const scanDue = Math.abs((frame.t / INFORMATION_MODEL.scanPeriodSeconds) - Math.round(frame.t / INFORMATION_MODEL.scanPeriodSeconds)) < 1e-8;
      const observation = scanDue ? observationFor(scenario, frame, perspective, manifest) : undefined;
      if (!availability.available && availability.reason === "SENSOR_UNSUPPORTED") {
        track.state = "UNSUPPORTED";
      } else if (observation) {
        track.observations.push(observation);
        track.lastObservation = observation;
        track.state = track.observations.length >= INFORMATION_MODEL.confirmationObservations ? "CONFIRMED" : track.observations.length === 1 ? "PLOT" : "TENTATIVE";
      } else if (track.lastObservation) {
        track.state = frame.t - track.lastObservation.modelTimeSeconds <= INFORMATION_MODEL.coastSeconds ? "COASTING" : "LOST";
      } else if (!availability.available) {
        track.state = "NONE";
      }
      output.push(snapshot(scenario, frame, perspective, track, manifest));
    }
  }
  return output;
}
