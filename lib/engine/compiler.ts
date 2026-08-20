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
} from "../simulation-models.ts";
import {
  CURRENT_COMPILED_MODEL_PACK,
  resolveCompiledWeaponAdmission,
} from "./weapon-admission.ts";
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
import {
  resolveInstallationOriginReference,
  type InstallationOriginReference,
} from "../mission-admission.ts";

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
    blueOriginReference?: InstallationOriginReference;
    redOriginReference?: InstallationOriginReference;
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

function compiledWeaponRuntime(weapon: (typeof CURRENT_COMPILED_MODEL_PACK.weapons)[number]) {
  const aerodynamic = CURRENT_COMPILED_MODEL_PACK.aerodynamics[weapon.aerodynamicModelIndex];
  const propulsion = CURRENT_COMPILED_MODEL_PACK.propulsion[weapon.propulsionModelIndex];
  const dragTable = aerodynamic?.coefficientTables[0];
  const thrustAxis = propulsion?.thrustTable.axes.find((axis) => axis.semantic === "TIME");
  const thrust = propulsion?.thrustTable.values[0];
  const burnSeconds = thrustAxis?.values.at(-1);
  const dragCoefficient = dragTable?.values[0];
  if (
    !aerodynamic ||
    thrust === undefined ||
    burnSeconds === undefined ||
    dragCoefficient === undefined ||
    !Number.isFinite(thrust) ||
    !Number.isFinite(burnSeconds) ||
    !Number.isFinite(dragCoefficient)
  ) {
    throw new Error(`Compiled weapon dependencies are incomplete for ${weapon.catalogObjectId}`);
  }
  return {
    launchMassKg: weapon.launchMassKg,
    dryMassKg: weapon.dryMassKg,
    burnSeconds,
    thrustNewtons: thrust,
    thrustTaperSpeedMps: weapon.thrustTaperSpeedMps,
    referenceAreaM2: aerodynamic.referenceAreaM2,
    dragCoefficient,
    navigationConstant: weapon.navigationConstant,
    maximumCommandG: weapon.maximumCommandLoadFactorG,
    seekerActivationRangeM: weapon.seekerActivationRangeM,
    datalinkUpdateSeconds: weapon.datalinkUpdatePeriodS,
  };
}

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
  const studyArea = getStudyArea(input.studyAreaId);
  const weatherPreset = getWeatherPreset(studyArea, input.weatherPresetId);
  const admittedOriginReferences = [
    [input.placement?.blueOriginReference, "placement.blue.originReference"],
    [input.placement?.redOriginReference, "placement.red.originReference"],
  ] as const;
  admittedOriginReferences.forEach(([reference, fieldPath]) => {
    resolveInstallationOriginReference({
      reference,
      studyAreaId: input.studyAreaId,
      weatherPresetId: input.weatherPresetId,
      fieldPath,
    });
  });
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
  const blueCompiledWeapon = resolveCompiledWeaponAdmission(
    CURRENT_COMPILED_MODEL_PACK,
    blueObject.id,
    blueSystem.id,
  );
  const redCompiledWeapon = redSystem
    ? resolveCompiledWeaponAdmission(CURRENT_COMPILED_MODEL_PACK, redObject.id, redSystem.id)
    : undefined;
  const assumptions = compiledWeaponRuntime(blueCompiledWeapon.weapon);
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
        // Tactical policy is not admitted yet. Aircraft movement follows its
        // authored route; weapon guidance uses its declared model-pack rate.
        decision: "PRESS",
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
            (redCompiledWeapon?.weapon.launchMassKg ?? 0)
          : 10000,
        fuelKg: redFuelKg,
      },
      behavior: {
        maneuver: "steady",
        commandedG: 0,
        decision: "PRESS",
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
        decision: "PRESS",
      },
      weapon: {
        launchPlatformId: bluePlatform.id,
        targetEntityId: redTarget.id,
        guidance: input.guidance,
        launchTimeSeconds: 0,
        ...assumptions,
        commandedCruiseAltitudeM:
          input.domain === "G2G" ? input.cruiseAltitude : input.altitude,
        navigationConstant: assumptions.navigationConstant,
        admission: blueCompiledWeapon.admission,
      },
    },
    blueSystem.id,
    blueCompiledWeapon.weapon.id,
    "MODEL_ASSUMPTION",
    blueCompiledWeapon.weapon.version,
  );

  const entities: EngineEntityDefinition[] = [
    bluePlatform,
    redTarget,
    blueWeapon,
  ];

  if (redSystem) {
    const redModel = redCompiledWeapon!;
    const redAssumptions = compiledWeaponRuntime(redModel.weapon);
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
            decision: "PRESS",
          },
          weapon: {
            launchPlatformId: redTarget.id,
            targetEntityId: bluePlatform.id,
            guidance: "direct",
            launchTimeSeconds: null,
            ...redAssumptions,
            commandedCruiseAltitudeM: redTarget.initial.position.z,
            admission: redModel.admission,
          },
        },
        redSystem.id,
        redModel.weapon.id,
        "MODEL_ASSUMPTION",
        redModel.weapon.version,
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
  const compiledOriginReferences = [
    input.placement?.blueOriginReference
      ? { entityId: bluePlatform.id, reference: input.placement.blueOriginReference }
      : undefined,
    input.placement?.redOriginReference
      ? { entityId: redTarget.id, reference: input.placement.redOriginReference }
      : undefined,
  ].filter((item): item is NonNullable<typeof item> => item !== undefined);
  const syntheticEnvironment = buildSyntheticEnvironmentManifest({
    studyArea,
    weatherPreset,
    origin,
    routes,
    originReferences: compiledOriginReferences,
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
      originReferences: compiledOriginReferences,
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
