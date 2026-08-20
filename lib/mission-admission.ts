import { PUBLIC_INSTALLATIONS } from "./installations.ts";
import { isPointInsideStudyArea } from "./scenario-spatial.ts";
import { getStudyArea, getWeatherPreset } from "./study-areas.ts";

/**
 * The only installation identity that the current airborne authoring surface
 * can retain. It deliberately does not describe a ground/runway start: the
 * governed catalog has point locations and text-only runway notes, not runway
 * geometry or start evidence.
 */
export type InstallationOriginReference = {
  schemaVersion: "vector.installation-origin.v1";
  installationId: string;
  sourceId: string;
  environment: { studyAreaId: string; weatherPresetId: string };
  /** A supplied runway is rejected until a runway dataset is admitted. */
  runwayId?: string;
};

export type MissionAdmissionCode =
  | "MISSION_INSTALLATION_UNKNOWN"
  | "MISSION_INSTALLATION_SOURCE_MISMATCH"
  | "MISSION_INSTALLATION_OUTSIDE_STUDY_AREA"
  | "MISSION_INSTALLATION_ENVIRONMENT_MISMATCH"
  | "MISSION_RUNWAY_UNAVAILABLE";

export class MissionAdmissionError extends Error {
  readonly code: MissionAdmissionCode;
  readonly fieldPath: string;
  readonly rejectedIdentity: string;

  constructor(code: MissionAdmissionCode, fieldPath: string, rejectedIdentity: string) {
    super(`${fieldPath} does not identify an admitted mission record.`);
    this.name = "MissionAdmissionError";
    this.code = code;
    this.fieldPath = fieldPath;
    this.rejectedIdentity = rejectedIdentity;
  }
}

/**
 * Resolve an optional airborne-origin reference. Manual airborne placement has
 * no reference and stays valid. This function never selects a substitute area,
 * weather preset, installation, or runway.
 */
export function resolveInstallationOriginReference(input: {
  reference: InstallationOriginReference | undefined;
  studyAreaId: string;
  weatherPresetId: string;
  fieldPath: string;
}) {
  const area = getStudyArea(input.studyAreaId);
  getWeatherPreset(area, input.weatherPresetId);
  if (!input.reference) return undefined;
  const referencePath = input.fieldPath;
  if (input.reference.environment.studyAreaId !== area.id) {
    throw new MissionAdmissionError("MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", `${referencePath}.environment.studyAreaId`, input.reference.environment.studyAreaId);
  }
  if (input.reference.environment.weatherPresetId !== input.weatherPresetId) {
    throw new MissionAdmissionError("MISSION_INSTALLATION_ENVIRONMENT_MISMATCH", `${referencePath}.environment.weatherPresetId`, input.reference.environment.weatherPresetId);
  }
  if (input.reference.runwayId !== undefined) {
    throw new MissionAdmissionError("MISSION_RUNWAY_UNAVAILABLE", `${referencePath}.runwayId`, input.reference.runwayId);
  }
  const installation = PUBLIC_INSTALLATIONS.find((candidate) => candidate.id === input.reference!.installationId);
  if (!installation) {
    throw new MissionAdmissionError("MISSION_INSTALLATION_UNKNOWN", `${referencePath}.installationId`, input.reference.installationId);
  }
  if (installation.sourceId !== input.reference.sourceId) {
    throw new MissionAdmissionError("MISSION_INSTALLATION_SOURCE_MISMATCH", `${referencePath}.sourceId`, input.reference.sourceId);
  }
  if (!isPointInsideStudyArea({ longitude: installation.longitude, latitude: installation.latitude, altitudeM: 0, verticalDatum: "MSL" }, area)) {
    throw new MissionAdmissionError("MISSION_INSTALLATION_OUTSIDE_STUDY_AREA", `${referencePath}.installationId`, installation.id);
  }
  return installation;
}
