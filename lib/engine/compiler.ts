import type { EngineEntityDefinition, EngineScenario } from "./contracts.ts";
import type {
  EngagementDomain,
  Guidance,
  Maneuver,
  ProfileId,
  Vec3,
} from "./primitives.ts";
import { getCatalogObject } from "../object-catalog.ts";
import {
  findAircraftSimulationModel,
  findWeaponSimulationModel,
  isModelLoadoutCompatible,
} from "../simulation-models.ts";
import { getStudyArea, getWeatherPreset } from "../study-areas.ts";
import { COMPILED_MODEL_PACK_SCHEMA_VERSION } from "../model-pack.ts";
import {
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "../reference-model-pack.ts";
import { localFrameToGeographic } from "../geospatial/geodesy.ts";
import { scenarioOrigin } from "../scenario-spatial.ts";
import { buildSyntheticEnvironmentManifest } from "../geospatial/synthetic-environment.ts";

export type ScenarioCompilerInput = {
  id: string;
  version: string;
  domain: EngagementDomain;
  name: string;
  bluePlatformId: string;
  blueSystemId: string;
  redObjectId: string;
  redSystemId: string;
  studyAreaId: string;
  weatherPresetId: string;
  profile: ProfileId;
  guidance: Guidance;
  altitude: number;
  cruiseAltitude: number;
  targetDelta: number;
  range: number;
  aspect: number;
  launcherSpeed: number;
  targetSpeed: number;
  maneuver: Maneuver;
  targetG: number;
  blueFuelPercent: number;
  redFuelPercent: number;
  blueDecision: string;
  redDecision: string;
  windEastMps: number;
  windNorthMps: number;
  temperatureOffset: number;
  windShiftAt: number | null;
  windShiftEastMps: number;
  windShiftNorthMps: number;
  seed: number;
  placement?: {
    blueStart: Vec3;
    redStart: Vec3;
    blueHeadingRad: number;
    redHeadingRad: number;
    blueRoute: Vec3[];
    redRoute: Vec3[];
  };
};

export type CompilerProfile = {
  name: string;
  burn: number;
  maxSpeed: number;
  maxRange: number;
  turnG: number;
};

const kindMap = {
  AIRCRAFT: "AIRCRAFT",
  GUIDED_WEAPON: "GUIDED_WEAPON",
  AIR_DEFENCE_SYSTEM: "AIR_DEFENCE_SYSTEM",
  RADAR: "RADAR",
  SURFACE_LAUNCHER: "SURFACE_LAUNCHER",
  FIXED_SITE: "FIXED_OBJECTIVE",
} as const;

const velocity = (speed: number, headingRad: number): Vec3 => ({
  x: Math.cos(headingRad) * speed,
  y: Math.sin(headingRad) * speed,
  z: 0,
});

function withProvenance(
  input: Omit<EngineEntityDefinition, "provenance">,
  sourceObjectId: string,
  modelId: string,
  valueState: EngineEntityDefinition["provenance"]["valueState"] = "SOURCED",
  modelVersion = "vector-entity-state-v0.5",
): EngineEntityDefinition {
  return {
    ...input,
    provenance: {
      sourceObjectId,
      modelId,
      modelVersion,
      modelPackDigest: CURRENT_MODEL_PACK_DIGEST,
      valueState,
    },
  };
}

export function compileScenario(
  input: ScenarioCompilerInput,
  profile: CompilerProfile,
): EngineScenario {
  const blueObject = getCatalogObject(input.bluePlatformId);
  const blueSystem = getCatalogObject(input.blueSystemId);
  const redObject = getCatalogObject(input.redObjectId);
  const redSystem =
    input.domain === "A2A" ? getCatalogObject(input.redSystemId) : undefined;
  if (!isModelLoadoutCompatible(blueObject.id, blueSystem.id)) {
    throw new Error(`Incompatible loadout: ${blueSystem.id} on ${blueObject.id}`);
  }
  if (redSystem && !isModelLoadoutCompatible(redObject.id, redSystem.id)) {
    throw new Error(`Incompatible loadout: ${redSystem.id} on ${redObject.id}`);
  }
  const studyArea = getStudyArea(input.studyAreaId);
  const weatherPreset = getWeatherPreset(studyArea, input.weatherPresetId);
  const targetHeadingRad = ((180 - input.aspect) * Math.PI) / 180;
  const blueStart = input.placement?.blueStart ?? {
    x: 0,
    y: 0,
    z: input.altitude,
  };
  const redStart = input.placement?.redStart ?? {
    x: input.range,
    y: 0,
    z: Math.max(0, input.altitude + input.targetDelta),
  };
  const blueHeadingRad = input.placement?.blueHeadingRad ?? 0;
  const redHeadingRad = input.placement?.redHeadingRad ?? targetHeadingRad;
  const movingTarget = input.domain === "A2A" || input.domain === "G2A";
  const blueIsAircraft = blueObject.kind === "AIRCRAFT";
  const blueAircraftModel = blueIsAircraft
    ? findAircraftSimulationModel(blueObject.id)
    : undefined;
  if (blueIsAircraft && !blueAircraftModel) {
    throw new Error(`Missing aircraft model for ${blueObject.id}`);
  }
  const redAircraftModel = redObject.kind === "AIRCRAFT"
    ? findAircraftSimulationModel(redObject.id)
    : undefined;
  if (movingTarget && !redAircraftModel) {
    throw new Error(`Missing aircraft model for moving target ${redObject.id}`);
  }
  const blueAircraft = blueAircraftModel
    ? {
        emptyMassKg: blueAircraftModel.emptyMassKg,
        fuelCapacityKg: blueAircraftModel.fuelCapacityKg,
        referenceAreaM2: blueAircraftModel.referenceAreaM2,
        zeroLiftDragCoefficient: blueAircraftModel.zeroLiftDragCoefficient,
        inducedDragFactor: blueAircraftModel.inducedDragFactor,
        maximumThrustNewtons: blueAircraftModel.maximumThrustNewtons,
        specificFuelConsumptionKgPerNewtonSecond:
          blueAircraftModel.specificFuelConsumptionKgPerNewtonSecond,
        maximumCommandG: blueAircraftModel.maximumCommandG,
      }
    : undefined;
  const redAircraft = redAircraftModel
    ? {
        emptyMassKg: redAircraftModel.emptyMassKg,
        fuelCapacityKg: redAircraftModel.fuelCapacityKg,
        referenceAreaM2: redAircraftModel.referenceAreaM2,
        zeroLiftDragCoefficient: redAircraftModel.zeroLiftDragCoefficient,
        inducedDragFactor: redAircraftModel.inducedDragFactor,
        maximumThrustNewtons: redAircraftModel.maximumThrustNewtons,
        specificFuelConsumptionKgPerNewtonSecond:
          redAircraftModel.specificFuelConsumptionKgPerNewtonSecond,
        maximumCommandG: redAircraftModel.maximumCommandG,
      }
    : undefined;
  const blueFuelKg = blueAircraft
    ? blueAircraft.fuelCapacityKg * (input.blueFuelPercent / 100)
    : 0;
  const redFuelKg = redAircraft
    ? redAircraft.fuelCapacityKg * (input.redFuelPercent / 100)
    : 0;
  const selectedModel = findWeaponSimulationModel(input.blueSystemId);
  if (!selectedModel) throw new Error(`Missing weapon model for ${input.blueSystemId}`);
  if (!selectedModel.domains.includes(input.domain)) {
    throw new Error(`Weapon model ${selectedModel.id} does not support ${input.domain}`);
  }
  const redSelectedModel = redSystem
    ? findWeaponSimulationModel(redSystem.id)
    : undefined;
  if (redSystem && !redSelectedModel) {
    throw new Error(`Missing weapon model for ${redSystem.id}`);
  }
  if (redSelectedModel && !redSelectedModel.domains.includes(input.domain)) {
    throw new Error(
      `Weapon model ${redSelectedModel.id} does not support ${input.domain}`,
    );
  }
  const assumptions = {
    launchMassKg: selectedModel.launchMassKg,
    dryMassKg: selectedModel.dryMassKg,
    burnSeconds: selectedModel.poweredFlightSeconds,
    thrustNewtons: selectedModel.thrustNewtons,
    thrustTaperSpeedMps: selectedModel.thrustTaperSpeedMps,
    referenceAreaM2: selectedModel.referenceAreaM2,
    dragCoefficient: selectedModel.dragCoefficient,
    navigationConstant: selectedModel.navigationConstant,
    maximumCommandG: selectedModel.maximumCommandG,
    seekerActivationRangeM: selectedModel.seekerActivationRangeM,
    datalinkUpdateSeconds: selectedModel.datalinkUpdateSeconds,
  };
  const blueDecisionFactor =
    input.blueDecision === "PRESS"
      ? 1.05
      : input.blueDecision === "CRANK"
        ? 0.9
        : input.blueDecision === "DEFEND"
          ? 0.75
          : input.blueDecision === "DISENGAGE"
            ? 0.45
            : 1;
  const bluePlatform = withProvenance(
    {
      id: "blue-platform-1",
      rddfId: `rddf://platform/${blueObject.kind.toLowerCase()}/${blueObject.id}`,
      designation: blueObject.designation,
      callsign: blueIsAircraft ? "BLUE 1" : "BLUE SITE 1",
      affiliation: "BLUE",
      kind: kindMap[blueObject.kind],
      symbolRole: blueObject.symbolRole,
      lifecycle: "ACTIVE",
      route: input.placement?.blueRoute.length
        ? input.placement.blueRoute.map((point) => ({ ...point }))
        : [
            blueStart,
            {
              x:
                blueStart.x +
                Math.cos(blueHeadingRad) *
                  (blueIsAircraft ? input.launcherSpeed : 0) *
                  140,
              y:
                blueStart.y +
                Math.sin(blueHeadingRad) *
                  (blueIsAircraft ? input.launcherSpeed : 0) *
                  140,
              z: blueStart.z,
            },
          ],
      initial: {
        position: { ...blueStart },
        velocity: velocity(blueIsAircraft ? input.launcherSpeed : 0, blueHeadingRad),
        headingRad: blueHeadingRad,
        massKg: blueAircraft
          ? blueAircraft.emptyMassKg + blueFuelKg + assumptions.launchMassKg
          : 12000,
        fuelKg: blueFuelKg,
      },
      behavior: {
        maneuver: "steady",
        commandedG: 0,
        decision: input.blueDecision,
      },
      aircraft: blueAircraft,
    },
    blueObject.id,
    blueAircraftModel?.id ?? `${blueObject.id}-static-study-v1`,
    blueAircraftModel?.valueState ?? "MODEL_ASSUMPTION",
    blueAircraftModel?.version ?? "static-object-v1.0.0",
  );

  const redTarget = withProvenance(
    {
      id: "red-object-1",
      rddfId: `rddf://platform/${redObject.kind.toLowerCase()}/${redObject.id}`,
      designation: redObject.designation,
      callsign: movingTarget ? "RED 1" : "OBJECTIVE 1",
      affiliation: "RED",
      kind: kindMap[redObject.kind],
      symbolRole: redObject.symbolRole,
      lifecycle: "ACTIVE",
      route: input.placement?.redRoute.length
        ? input.placement.redRoute.map((point) => ({ ...point }))
        : [
            redStart,
            {
              x:
                redStart.x +
                Math.cos(redHeadingRad) *
                  (movingTarget ? input.targetSpeed : 0) *
                  140,
              y:
                redStart.y +
                Math.sin(redHeadingRad) *
                  (movingTarget ? input.targetSpeed : 0) *
                  140,
              z: redStart.z,
            },
          ],
      initial: {
        position: { ...redStart },
        velocity: velocity(movingTarget ? input.targetSpeed : 0, redHeadingRad),
        headingRad: redHeadingRad,
        massKg: redAircraft
          ? redAircraft.emptyMassKg +
            redFuelKg +
            (redSelectedModel?.launchMassKg ?? 0)
          : 10000,
        fuelKg: redFuelKg,
      },
      behavior: {
        maneuver: "steady",
        commandedG: 0,
        decision: input.redDecision,
      },
      aircraft: redAircraft,
    },
    redObject.id,
    redAircraftModel?.id ?? `${redObject.id}-static-study-v1`,
    redAircraftModel?.valueState ?? "MODEL_ASSUMPTION",
    redAircraftModel?.version ?? "static-object-v1.0.0",
  );

  const blueWeapon = withProvenance(
    {
      id: "blue-weapon-1",
      rddfId: `rddf://component/guided-weapon/${blueSystem.id}`,
      designation: blueSystem.designation,
      callsign: "BLUE WEAPON 1",
      affiliation: "BLUE",
      kind: "GUIDED_WEAPON",
      symbolRole: blueSystem.symbolRole,
      lifecycle: "STOWED",
      initial: {
        position: { ...bluePlatform.initial.position },
        velocity: { ...bluePlatform.initial.velocity },
        headingRad: 0,
        massKg: assumptions.launchMassKg,
        fuelKg: assumptions.launchMassKg - assumptions.dryMassKg,
      },
      behavior: {
        maneuver: "steady",
        commandedG: 0,
        decision: input.blueDecision,
      },
      weapon: {
        launchPlatformId: bluePlatform.id,
        targetEntityId: redTarget.id,
        guidance: input.guidance,
        launchTimeSeconds: 0,
        ...assumptions,
        commandedCruiseAltitudeM:
          input.domain === "G2G" ? input.cruiseAltitude : input.altitude,
        navigationConstant:
          assumptions.navigationConstant * blueDecisionFactor,
      },
    },
    blueSystem.id,
    selectedModel.id,
    selectedModel.valueState,
    selectedModel.version,
  );

  const entities: EngineEntityDefinition[] = [
    bluePlatform,
    redTarget,
    blueWeapon,
  ];

  if (redSystem) {
    const redModel = redSelectedModel!;
    const redAssumptions = {
      launchMassKg: redModel.launchMassKg,
      dryMassKg: redModel.dryMassKg,
      burnSeconds: redModel.poweredFlightSeconds,
      thrustNewtons: redModel.thrustNewtons,
      thrustTaperSpeedMps: redModel.thrustTaperSpeedMps,
      referenceAreaM2: redModel.referenceAreaM2,
      dragCoefficient: redModel.dragCoefficient,
      navigationConstant: redModel.navigationConstant,
      maximumCommandG: redModel.maximumCommandG,
      seekerActivationRangeM: redModel.seekerActivationRangeM,
      datalinkUpdateSeconds: redModel.datalinkUpdateSeconds,
    };
    entities.push(
      withProvenance(
        {
          id: "red-weapon-1",
          rddfId: `rddf://component/guided-weapon/${redSystem.id}`,
          designation: redSystem.designation,
          callsign: "RED WEAPON 1",
          affiliation: "RED",
          kind: "GUIDED_WEAPON",
          symbolRole: redSystem.symbolRole,
          lifecycle: "STOWED",
          initial: {
            position: { ...redTarget.initial.position },
            velocity: { ...redTarget.initial.velocity },
            headingRad: targetHeadingRad,
            massKg: redAssumptions.launchMassKg,
            fuelKg: redAssumptions.launchMassKg - redAssumptions.dryMassKg,
          },
          behavior: {
            maneuver: "steady",
            commandedG: 0,
            decision: input.redDecision,
          },
          weapon: {
            launchPlatformId: redTarget.id,
            targetEntityId: bluePlatform.id,
            guidance: "direct",
            launchTimeSeconds: null,
            ...redAssumptions,
            commandedCruiseAltitudeM: redTarget.initial.position.z,
          },
        },
        redSystem.id,
        redModel.id,
        redModel.valueState,
        redModel.version,
      ),
    );
  }

  if (input.domain === "G2A") {
    bluePlatform.sensor = {
      detectionRadiusM: profile.maxRange * 1350,
      trackingRadiusM: profile.maxRange * 1150,
      engagementRadiusM: profile.maxRange * 1000,
      minimumRangeM: Math.max(1000, profile.maxRange * 35),
      minimumAltitudeM: 30,
      maximumAltitudeM: 22000,
    };
  }

  if (redObject.kind === "RADAR") {
    redTarget.sensor = {
      detectionRadiusM: Math.max(70000, profile.maxRange * 900),
      trackingRadiusM: Math.max(45000, profile.maxRange * 650),
      engagementRadiusM: 0,
      minimumRangeM: 0,
      minimumAltitudeM: 50,
      maximumAltitudeM: 18000,
    };
    redTarget.provenance = {
      ...redTarget.provenance,
      valueState: "MODEL_ASSUMPTION",
      modelVersion: "public-radar-envelope-v0.1",
    };
  }

  const origin = scenarioOrigin(studyArea);
  const routes = entities.map((entity) => ({
    entityId: entity.id,
    points: (entity.route ?? []).map((point) => ({ ...point })),
  }));
  const syntheticEnvironment = buildSyntheticEnvironmentManifest({
    studyArea,
    weatherPreset,
    origin,
    routes,
    effectiveWeather: {
      windEastMps: input.windEastMps,
      windNorthMps: input.windNorthMps,
      temperatureOffsetC: input.temperatureOffset,
    },
  });

  return {
    id: input.id,
    version: input.version,
    domain: input.domain,
    name: input.name,
    seed: input.seed,
    durationSeconds: input.domain === "G2G" ? 240 : 140,
    fixedStepSeconds: 0.05,
    modelPack: {
      schemaVersion: COMPILED_MODEL_PACK_SCHEMA_VERSION,
      id: CURRENT_MODEL_PACK_ID,
      version: CURRENT_MODEL_PACK_VERSION,
      digest: CURRENT_MODEL_PACK_DIGEST,
      intendedUse: {
        id: CURRENT_INTENDED_USE_ID,
        version: CURRENT_INTENDED_USE_VERSION,
      },
      scenarioPatches: [],
    },
    entities,
    geospatial: {
      schemaVersion: "vector.engine-geospatial.v1",
      origin,
      initialPositions: entities.map((entity) => ({
        entityId: entity.id,
        position: localFrameToGeographic(entity.initial.position, origin),
      })),
      syntheticEnvironment,
    },
    environment: {
      gravityMps2: 9.80665,
      temperatureOffsetC: input.temperatureOffset,
      windMps: { x: input.windEastMps, y: input.windNorthMps, z: 0 },
      atmosphere: "NASA_EDUCATIONAL_STANDARD",
      studyArea: {
        id: studyArea.id,
        name: studyArea.name,
        terrainClass: studyArea.terrainClass,
        surfaceElevationM: studyArea.surfaceElevationM,
        surfaceElevationDatum: studyArea.surfaceElevationDatum,
        anchor: studyArea.anchor,
        bounds: studyArea.bounds,
        weatherPresetId: weatherPreset.id,
      },
    },
    completion: { distanceMeters: 180 },
    events: [
      ...(input.windShiftAt === null
        ? []
        : [
            {
              id: "wind-shift-1",
              type: "WIND_SHIFT" as const,
              startSeconds: input.windShiftAt,
              durationSeconds: 20,
              vectorMps: {
                x: input.windShiftEastMps,
                y: input.windShiftNorthMps,
                z: 0,
              },
            },
          ]),
    ],
  };
}
