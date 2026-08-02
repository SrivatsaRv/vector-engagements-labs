import type { EngineEntityDefinition, EngineScenario } from "./contracts.ts";
import type {
  EngagementDomain,
  Guidance,
  Maneuver,
  ProfileId,
  Vec3,
} from "./primitives.ts";
import { getCatalogObject } from "../object-catalog.ts";
import { findWeaponSimulationModel } from "../simulation-models.ts";

export type ScenarioCompilerInput = {
  id: string;
  version: string;
  domain: EngagementDomain;
  name: string;
  bluePlatformId: string;
  blueSystemId: string;
  redObjectId: string;
  redSystemId: string;
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
  guidanceInterruptionAt: number | null;
  guidanceInterruptionDuration: number;
  windShiftAt: number | null;
  windShiftEastMps: number;
  windShiftNorthMps: number;
  seed: number;
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
  valueState: EngineEntityDefinition["provenance"]["valueState"] = "SOURCED",
  modelVersion = "vector-entity-state-v0.5",
): EngineEntityDefinition {
  return {
    ...input,
    provenance: {
      sourceObjectId,
      modelVersion,
      valueState,
    },
  };
}

function fallbackWeaponAssumptions(domain: EngagementDomain, profile: CompilerProfile) {
  const launchMassKg =
    domain === "A2A"
      ? 170
      : domain === "G2A"
        ? 520
        : domain === "A2G"
          ? 640
          : 2500;
  const burnSeconds =
    domain === "G2G"
      ? 160
      : domain === "G2A" && profile.maxRange >= 120
        ? 65
        : domain === "G2A"
          ? profile.burn * 1.5
          : profile.burn;
  const dryMassKg = launchMassKg * (domain === "G2G" ? 0.76 : 0.58);
  const baselineThrust = launchMassKg * Math.max(
    18,
    profile.maxSpeed / Math.max(4, profile.burn),
  );
  const thrustNewtons =
    domain === "G2G"
      ? 65000
      : domain === "G2A" && profile.maxRange >= 120
        ? 35000
        : baselineThrust;
  return {
    launchMassKg,
    dryMassKg,
    burnSeconds,
    thrustNewtons,
    thrustTaperSpeedMps: profile.maxSpeed,
    referenceAreaM2:
      domain === "A2A"
        ? 0.055
        : domain === "G2A"
          ? 0.11
          : domain === "A2G"
            ? 0.16
            : 0.42,
    dragCoefficient: domain === "G2G" ? 0.31 : 0.28,
    navigationConstant: domain === "G2G" ? 2.5 : 3.5,
    maximumCommandG: profile.turnG,
    seekerActivationRangeM: Math.min(18000, profile.maxRange * 220),
    datalinkUpdateSeconds: 0.2,
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
  const targetHeadingRad = ((180 - input.aspect) * Math.PI) / 180;
  const movingTarget = input.domain === "A2A" || input.domain === "G2A";
  const blueIsAircraft = blueObject.kind === "AIRCRAFT";
  const selectedModel = findWeaponSimulationModel(input.blueSystemId);
  const assumptions = selectedModel
    ? {
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
      }
    : fallbackWeaponAssumptions(input.domain, profile);
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
  const redDecisionFactor =
    input.redDecision === "DEFEND"
      ? 1
      : input.redDecision === "CRANK"
        ? 0.7
        : input.redDecision === "DISENGAGE"
          ? 0.55
      : 0.25;
  const bluePlatformManeuver =
    input.blueDecision === "CRANK" ||
    input.blueDecision === "DEFEND" ||
    input.blueDecision === "DISENGAGE"
      ? "break"
      : "steady";
  const bluePlatformG =
    input.blueDecision === "CRANK"
      ? 2.5
      : input.blueDecision === "DEFEND"
        ? 5
        : input.blueDecision === "DISENGAGE"
          ? -4
          : 0;

  const bluePlatform = withProvenance(
    {
      id: "blue-platform-1",
      rddfId: `rddf://platform/${blueObject.kind.toLowerCase()}/${blueObject.id}`,
      designation: blueObject.designation,
      callsign: blueIsAircraft ? "BLUE 1" : "BLUE SITE 1",
      affiliation: "BLUE",
      kind: kindMap[blueObject.kind],
      lifecycle: "ACTIVE",
      initial: {
        position: { x: 0, y: 0, z: input.altitude },
        velocity: velocity(blueIsAircraft ? input.launcherSpeed : 0, 0),
        headingRad: 0,
        massKg: blueIsAircraft ? 26000 : 12000,
        fuelKg: blueIsAircraft ? 9400 * (input.blueFuelPercent / 100) : 0,
      },
      behavior: {
        maneuver: blueIsAircraft ? bluePlatformManeuver : "steady",
        commandedG: blueIsAircraft ? bluePlatformG : 0,
        decision: input.blueDecision,
      },
    },
    blueObject.id,
  );

  const redTarget = withProvenance(
    {
      id: "red-object-1",
      rddfId: `rddf://platform/${redObject.kind.toLowerCase()}/${redObject.id}`,
      designation: redObject.designation,
      callsign: movingTarget ? "RED 1" : "OBJECTIVE 1",
      affiliation: "RED",
      kind: kindMap[redObject.kind],
      lifecycle: "ACTIVE",
      initial: {
        position: {
          x: input.range,
          y: 0,
          z: Math.max(0, input.altitude + input.targetDelta),
        },
        velocity: velocity(movingTarget ? input.targetSpeed : 0, targetHeadingRad),
        headingRad: targetHeadingRad,
        massKg: movingTarget ? 12500 : 10000,
        fuelKg: movingTarget ? 3200 * (input.redFuelPercent / 100) : 0,
      },
      behavior: {
        maneuver: movingTarget ? input.maneuver : "steady",
        commandedG: movingTarget ? input.targetG * redDecisionFactor : 0,
        decision: input.redDecision,
      },
    },
    redObject.id,
  );

  const blueWeapon = withProvenance(
    {
      id: "blue-weapon-1",
      rddfId: `rddf://component/guided-weapon/${blueSystem.id}`,
      designation: blueSystem.designation,
      callsign: "BLUE WEAPON 1",
      affiliation: "BLUE",
      kind: "GUIDED_WEAPON",
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
    selectedModel?.valueState ?? "MODEL_ASSUMPTION",
    selectedModel?.version ?? "generic-public-study-v0.5",
  );

  const entities: EngineEntityDefinition[] = [
    bluePlatform,
    redTarget,
    blueWeapon,
  ];

  if (redSystem) {
    const redModel = findWeaponSimulationModel(redSystem.id);
    const redAssumptions = redModel
      ? {
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
        }
      : fallbackWeaponAssumptions(input.domain, profile);
    entities.push(
      withProvenance(
        {
          id: "red-weapon-1",
          rddfId: `rddf://component/guided-weapon/${redSystem.id}`,
          designation: redSystem.designation,
          callsign: "RED WEAPON 1",
          affiliation: "RED",
          kind: "GUIDED_WEAPON",
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
        redModel?.valueState ?? "MODEL_ASSUMPTION",
        redModel?.version ?? "generic-public-study-v0.5",
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

  return {
    id: input.id,
    version: input.version,
    domain: input.domain,
    name: input.name,
    seed: input.seed,
    durationSeconds: input.domain === "G2G" ? 240 : 140,
    fixedStepSeconds: 0.05,
    entities,
    environment: {
      gravityMps2: 9.80665,
      temperatureOffsetC: input.temperatureOffset,
      windMps: { x: input.windEastMps, y: input.windNorthMps, z: 0 },
      atmosphere: "NASA_EDUCATIONAL_STANDARD",
    },
    completion: { distanceMeters: 180 },
    events: [
      ...(input.guidanceInterruptionAt === null
        ? []
        : [
            {
              id: "guidance-hold-1",
              type: "GUIDANCE_HOLD" as const,
              startSeconds: input.guidanceInterruptionAt,
              durationSeconds: input.guidanceInterruptionDuration,
              entityId: blueWeapon.id,
            },
          ]),
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
