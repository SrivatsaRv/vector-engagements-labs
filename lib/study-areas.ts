export type StudyAreaId =
  | "north-punjab"
  | "rajasthan-desert"
  | "ladakh-high-altitude"
  | "north-east-mountains"
  | "arabian-sea"
  | "coastal-gujarat";

export type WeatherPreset = {
  id: string;
  label: string;
  description: string;
  temperatureOffsetC: number;
  windEastMps: number;
  windNorthMps: number;
  visibilityKm: number;
  humidityPercent: number;
  valueState: "MODEL_ASSUMPTION";
};

export type StudyArea = {
  id: StudyAreaId;
  name: string;
  shortName: string;
  description: string;
  terrainClass: "PLAINS" | "DESERT" | "HIGH_MOUNTAIN" | "MOUNTAIN" | "MARITIME" | "COASTAL";
  surfaceElevationM: number;
  surfaceElevationDatum: "MSL";
  anchor: { longitude: number; latitude: number };
  bounds: [[number, number], [number, number]];
  weatherPresets: WeatherPreset[];
  defaultWeatherPresetId: string;
  sourceClass: "PUBLIC_EDUCATIONAL";
};

const weather = (
  id: string,
  label: string,
  description: string,
  temperatureOffsetC: number,
  windEastMps: number,
  windNorthMps: number,
  visibilityKm: number,
  humidityPercent: number,
): WeatherPreset => ({
  id,
  label,
  description,
  temperatureOffsetC,
  windEastMps,
  windNorthMps,
  visibilityKm,
  humidityPercent,
  valueState: "MODEL_ASSUMPTION",
});

export const STUDY_AREAS: StudyArea[] = [
  {
    id: "north-punjab",
    name: "North Punjab public study area",
    shortName: "North Punjab",
    description: "Low-elevation plains used for repeatable air-intercept studies.",
    terrainClass: "PLAINS",
    surfaceElevationM: 260,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 74.2, latitude: 31.8 },
    bounds: [[72.6, 30.5], [76.4, 33.4]],
    weatherPresets: [
      weather("north-punjab-clear", "Clear winter day", "Cool, dry air with light westerly wind.", -4, -4, 1, 25, 35),
      weather("north-punjab-hot", "Hot summer day", "Hot low-level air with moderate easterly wind.", 12, 7, 2, 14, 48),
    ],
    defaultWeatherPresetId: "north-punjab-clear",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
  {
    id: "rajasthan-desert",
    name: "Rajasthan desert public study area",
    shortName: "Rajasthan",
    description: "Hot, dry desert conditions for air and surface-launch studies.",
    terrainClass: "DESERT",
    surfaceElevationM: 230,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 72.8, latitude: 27.1 },
    bounds: [[69.7, 24.8], [75.4, 29.8]],
    weatherPresets: [
      weather("rajasthan-hot-dry", "Hot and dry", "High temperature, low humidity, and a moderate crosswind.", 15, 9, 1, 18, 18),
      weather("rajasthan-dust", "Dusty crosswind", "Reduced visibility with a strong westerly wind.", 10, -14, 2, 6, 24),
    ],
    defaultWeatherPresetId: "rajasthan-hot-dry",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
  {
    id: "ladakh-high-altitude",
    name: "Ladakh high-altitude public study area",
    shortName: "Ladakh",
    description: "High terrain and cold, thin air for altitude-sensitive studies.",
    terrainClass: "HIGH_MOUNTAIN",
    surfaceElevationM: 3300,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 77.3, latitude: 34.1 },
    bounds: [[75.5, 32.5], [79.6, 35.9]],
    weatherPresets: [
      weather("ladakh-cold-clear", "Cold and clear", "Cold, dry high-altitude air with good visibility.", -12, 3, -4, 35, 15),
      weather("ladakh-high-wind", "High-altitude wind", "Strong upper-level crosswind and cold air.", -9, 18, -7, 22, 20),
    ],
    defaultWeatherPresetId: "ladakh-cold-clear",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
  {
    id: "north-east-mountains",
    name: "North-east mountain public study area",
    shortName: "North-east",
    description: "Mountain and valley context with humid conditions and variable wind.",
    terrainClass: "MOUNTAIN",
    surfaceElevationM: 1450,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 92.3, latitude: 27.1 },
    bounds: [[89.8, 25.2], [95.2, 29.4]],
    weatherPresets: [
      weather("north-east-humid", "Humid mountain day", "Humid air, moderate visibility, and light valley wind.", 3, 2, 5, 12, 78),
      weather("north-east-monsoon", "Monsoon conditions", "Warm humid air, reduced visibility, and stronger wind.", 5, 8, 10, 7, 92),
    ],
    defaultWeatherPresetId: "north-east-humid",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
  {
    id: "arabian-sea",
    name: "Arabian Sea public study area",
    shortName: "Arabian Sea",
    description: "Maritime airspace for over-water intercept and strike studies.",
    terrainClass: "MARITIME",
    surfaceElevationM: 0,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 68.3, latitude: 20.8 },
    bounds: [[63.5, 17.0], [73.2, 24.6]],
    weatherPresets: [
      weather("arabian-sea-fair", "Fair maritime day", "Warm humid marine air with steady wind.", 4, 7, 3, 28, 74),
      weather("arabian-sea-strong-wind", "Strong maritime wind", "Warm marine air with a strong crosswind.", 3, 16, 8, 16, 82),
    ],
    defaultWeatherPresetId: "arabian-sea-fair",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
  {
    id: "coastal-gujarat",
    name: "Coastal Gujarat public study area",
    shortName: "Coastal Gujarat",
    description: "Low coastal terrain for surface-strike and air-defence studies.",
    terrainClass: "COASTAL",
    surfaceElevationM: 40,
    surfaceElevationDatum: "MSL",
    anchor: { longitude: 69.8, latitude: 23.1 },
    bounds: [[67.3, 20.4], [73.2, 25.2]],
    weatherPresets: [
      weather("coastal-gujarat-fair", "Fair coastal day", "Warm air with moderate humidity and a sea breeze.", 5, 6, 2, 24, 62),
      weather("coastal-gujarat-haze", "Coastal haze", "Warm humid air with reduced visibility.", 7, 4, 1, 8, 78),
    ],
    defaultWeatherPresetId: "coastal-gujarat-fair",
    sourceClass: "PUBLIC_EDUCATIONAL",
  },
];

export type EnvironmentAdmissionCode =
  | "ENVIRONMENT_STUDY_AREA_UNKNOWN"
  | "ENVIRONMENT_WEATHER_PRESET_UNKNOWN";

export class EnvironmentAdmissionError extends Error {
  readonly code: EnvironmentAdmissionCode;
  readonly fieldPath: "studyAreaId" | "weatherPresetId";
  readonly rejectedIdentity: string;

  constructor(
    code: EnvironmentAdmissionCode,
    fieldPath: "studyAreaId" | "weatherPresetId",
    rejectedIdentity: string,
  ) {
    super(`${fieldPath} does not identify an admitted environment record.`);
    this.name = "EnvironmentAdmissionError";
    this.code = code;
    this.fieldPath = fieldPath;
    this.rejectedIdentity = rejectedIdentity;
  }
}

export function getStudyArea(id: string): StudyArea {
  const area = STUDY_AREAS.find((candidate) => candidate.id === id);
  if (!area) {
    throw new EnvironmentAdmissionError(
      "ENVIRONMENT_STUDY_AREA_UNKNOWN",
      "studyAreaId",
      id,
    );
  }
  return area;
}

export function getWeatherPreset(area: StudyArea, presetId: string): WeatherPreset {
  const preset = area.weatherPresets.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new EnvironmentAdmissionError(
      "ENVIRONMENT_WEATHER_PRESET_UNKNOWN",
      "weatherPresetId",
      presetId,
    );
  }
  return preset;
}

export function resolveEnvironmentSelection(input: {
  studyAreaId: string;
  weatherPresetId: string;
}) {
  const studyArea = getStudyArea(input.studyAreaId);
  return {
    studyArea,
    weatherPreset: getWeatherPreset(studyArea, input.weatherPresetId),
  };
}
