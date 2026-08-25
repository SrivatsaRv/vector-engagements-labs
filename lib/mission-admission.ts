import { admitGroundStart, PUBLIC_INSTALLATIONS } from "./installations.ts";
import { admitEnvironmentPack, type EnvironmentPack } from "./geospatial/environment-pack.ts";
import { isPointInsideStudyArea } from "./scenario-spatial.ts";
import { getStudyArea, getWeatherPreset } from "./study-areas.ts";

/** Exact governed runway-start identity retained by authoring and replay. */
export type InstallationOriginReference = {
  schemaVersion: "vector.installation-origin.v2";
  installationId: string;
  sourceId: string;
  startKind: "RUNWAY";
  environment: { studyAreaId: string; weatherPresetId: string };
  runwayId: string;
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
 * Resolve an optional runway-origin reference. Manual airborne placement has
 * no reference and stays valid. This function never selects a substitute area,
 * weather preset, installation, or runway.
 */
export function resolveInstallationOriginReference(input: {
  reference: InstallationOriginReference | undefined;
  studyAreaId: string;
  weatherPresetId: string;
  fieldPath: string;
  environmentPack?: EnvironmentPack;
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
  try {
    const pack = input.environmentPack ?? admitEnvironmentPack({
      studyAreaId: input.studyAreaId,
      weatherPresetId: input.weatherPresetId,
    }).pack;
    const groundStart = admitGroundStart({
      pack,
      installationId: installation.id,
      runwayId: input.reference.runwayId,
    });
    return { installation, groundStart };
  } catch {
    throw new MissionAdmissionError("MISSION_RUNWAY_UNAVAILABLE", `${referencePath}.runwayId`, input.reference.runwayId);
  }
}
