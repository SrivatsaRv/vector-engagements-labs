import type { EngineEntityDefinition, EngineScenario } from "./contracts.ts";
import type {
  EngagementDomain,
  Guidance,
  ProfileId,
  Vec3,
} from "./primitives.ts";
import { getCatalogObject } from "../object-catalog.ts";
import {
  CURRENT_COMPILED_MODEL_PACK,
  resolveCompiledWeaponAdmission,
} from "./weapon-admission.ts";
import { COMPILED_MODEL_PACK_SCHEMA_VERSION } from "../model-pack.ts";
import {
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "../reference-model-pack.ts";
import {
  DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M,
  enginePositionToGeographic,
  geographicToEnginePosition,
  ROUTE_PLAN_SCHEMA_VERSION,
  scenarioOrigin,
} from "../scenario-spatial.ts";
import { buildSyntheticEnvironmentManifest } from "../geospatial/synthetic-environment.ts";
import {
  admitEnvironmentPack,
  createEnvironmentSampler,
  environmentPackBinding,
  environmentRuntimeProjection,
} from "../geospatial/environment-pack.ts";
import { reconcileGroundStartElevation } from "../installations.ts";
import {
  resolveInstallationOriginReference,
  type InstallationOriginReference,
} from "../mission-admission.ts";
import { bindRuntimeModelPackDigest } from "./runtime-model-pack.ts";
import {
  compileAirMissionDefinition,
  type AirMissionDefinition,
} from "../air-mission.ts";
import type { Scenario } from "../simulation.ts";

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
  blueFuelPercent: number;
  redFuelPercent: number;
  blueWeaponQuantity: number;
  redWeaponQuantity: number;
  blueRadarMode?: "ACTIVE" | "SILENT";
  redRadarMode?: "ACTIVE" | "SILENT";
  windEastMps: number;
  windNorthMps: number;
  temperatureOffset: number;
  windShiftAt: number | null;
  windShiftEastMps: number;
  windShiftNorthMps: number;
  seed: number;
  airMission?: AirMissionDefinition;
  authoredScenario?: Scenario;
  placement?: {
    blueStart: Vec3;
    redStart: Vec3;
    blueHeadingRad: number;
    redHeadingRad: number;
    blueRoute: Vec3[];
    redRoute: Vec3[];
    blueRouteAcceptanceRadiiM: number[];
    redRouteAcceptanceRadiiM: number[];
    /** Omitted only when replaying a persisted v1 all-fly-by plan. */
    blueRouteWaypointTransitions?: ("START" | "FLY_BY" | "FLY_OVER")[];
    /** Omitted only when replaying a persisted v1 all-fly-by plan. */
    redRouteWaypointTransitions?: ("START" | "FLY_BY" | "FLY_OVER")[];
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

function runtimeTable(
  table: { id: string; axes: Array<{ semantic: string; values: number[] }>; values: number[] },
  semantic: string,
) {
  const axis = table.axes.find((candidate) => candidate.semantic === semantic);
  if (!axis || table.axes.length !== 1 || axis.values.length < 2 || axis.values.length !== table.values.length) {
    throw new Error(`Compiled table ${table.id} is not an admitted one-axis ${semantic} table.`);
  }
  return { id: table.id, axis: [...axis.values], values: [...table.values] };
}

function compiledAircraftRuntime(catalogObjectId: string) {
  const aircraft = CURRENT_COMPILED_MODEL_PACK.aircraft.find((item) => item.catalogObjectId === catalogObjectId);
  if (!aircraft) throw new Error(`Missing compiled aircraft model for ${catalogObjectId}`);
  const aerodynamic = CURRENT_COMPILED_MODEL_PACK.aerodynamics[aircraft.aerodynamicModelIndex];
  const propulsion = CURRENT_COMPILED_MODEL_PACK.propulsion[aircraft.propulsionModelIndexes[0]];
  if (!aerodynamic || !propulsion) throw new Error(`Compiled aircraft dependencies are incomplete for ${catalogObjectId}`);
  const drag = aerodynamic.coefficientTables.find((table) => table.axes.some((axis) => axis.semantic === "MACH"));
  const induced = aerodynamic.coefficientTables.find((table) => table.axes.some((axis) => axis.semantic === "ANGLE_OF_ATTACK"));
  if (!drag || !induced) throw new Error(`Compiled aircraft aerodynamic tables are incomplete for ${catalogObjectId}`);
  return {
    id: aircraft.id,
    version: aircraft.version,
    valueState: "MODEL_ASSUMPTION" as const,
    emptyMassKg: aircraft.emptyMassKg,
    fuelCapacityKg: aircraft.fuelCapacityKg,
    referenceAreaM2: aerodynamic.referenceAreaM2,
    zeroLiftDragByMach: runtimeTable(drag, "MACH"),
    inducedDragByAngleOfAttackRad: runtimeTable(induced, "ANGLE_OF_ATTACK"),
    thrustByThrottle: runtimeTable(propulsion.thrustTable, "THROTTLE"),
    fuelFlowByThrottle: runtimeTable(propulsion.fuelFlowTable, "THROTTLE"),
    maximumCommandG: aircraft.maximumCommandLoadFactorG,
  };
}

function compiledObserverSensorRuntime(
  catalogObjectId: string,
  mode: "ACTIVE" | "SILENT",
) {
  const aircraft = CURRENT_COMPILED_MODEL_PACK.aircraft.find((item) => item.catalogObjectId === catalogObjectId);
  if (!aircraft) throw new Error(`Missing compiled aircraft model for ${catalogObjectId}`);
  const sensor = aircraft.sensorModelIndexes
    .map((index) => CURRENT_COMPILED_MODEL_PACK.sensors[index])
    .find((candidate) => candidate?.sensorKind !== "DECLARED_ENVELOPE");
  // A declared envelope is not a measurement model. It must never become a
  // hidden generic radar when the operator selects an emission state.
  if (!sensor || sensor.sensorKind === "DECLARED_ENVELOPE") return undefined;
  if (
    !["RADAR", "INFRARED", "VISUAL"].includes(sensor.sensorKind) ||
    sensor.detectionRangeM <= 0 ||
    sensor.minimumRangeM < 0 ||
    sensor.minimumRangeM > sensor.detectionRangeM ||
    sensor.scanPeriodS <= 0 ||
    sensor.azimuthFieldOfViewRad <= 0 || sensor.azimuthFieldOfViewRad > Math.PI * 2 ||
    sensor.elevationFieldOfViewRad <= 0 || sensor.elevationFieldOfViewRad > Math.PI ||
    !sensor.evidenceRefIds.length
  ) {
    throw new Error(`Compiled observer sensor ${sensor.id} is incomplete for ${catalogObjectId}`);
  }
  return {
    schemaVersion: "vector.observer-sensor-admission.v1" as const,
    modelPackDigest: CURRENT_MODEL_PACK_DIGEST,
    modelId: sensor.id,
    modelVersion: sensor.version,
    evidenceRefIds: [...sensor.evidenceRefIds],
    sensorKind: sensor.sensorKind,
    mode: mode === "ACTIVE" ? "SEARCH" as const : "OFF" as const,
    detectionRangeM: sensor.detectionRangeM,
    minimumRangeM: sensor.minimumRangeM,
    scanPeriodS: sensor.scanPeriodS,
    azimuthFieldOfViewRad: sensor.azimuthFieldOfViewRad,
    elevationFieldOfViewRad: sensor.elevationFieldOfViewRad,
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
  if (!Number.isInteger(input.blueWeaponQuantity) || input.blueWeaponQuantity <= 0 || input.blueWeaponQuantity > 64 || !Number.isInteger(input.redWeaponQuantity) || input.redWeaponQuantity < 0 || input.redWeaponQuantity > 64) {
    throw new Error("Compiled loadout quantities must be bounded integers.");
  }
  const blueObject = getCatalogObject(input.bluePlatformId);
  const blueSystem = getCatalogObject(input.blueSystemId);
  const redObject = getCatalogObject(input.redObjectId);
  const redSystem =
    input.domain === "A2A" ? getCatalogObject(input.redSystemId) : undefined;
  // Admission resolves a single immutable environment package. The compiler,
  // engine and replay record consume this object; none may re-look up the
  // authored string IDs after this boundary.
  const admittedEnvironment = admitEnvironmentPack({
    studyAreaId: input.studyAreaId,
    weatherPresetId: input.weatherPresetId,
    effectiveWeather: {
      windEastMps: input.windEastMps,
      windNorthMps: input.windNorthMps,
      temperatureOffsetC: input.temperatureOffset,
    },
  });
  const { studyArea, weatherPreset, pack: environmentPack } = admittedEnvironment;
  const compiledAirMission = input.airMission
    ? input.authoredScenario
      ? compileAirMissionDefinition(input.airMission, {
          scenario: input.authoredScenario,
          modelPack: CURRENT_COMPILED_MODEL_PACK,
          environmentPackDigest: environmentPack.identity.digest,
          environmentPack,
        })
      : (() => {
          throw new Error("An authored Air mission requires its exact scenario context.");
        })()
    : undefined;
  // A2A runtime values cross this single adapter only after the authored
  // Scenario and Air mission have been proven identical above. The immutable
  // compiled flight plan owns route, start, transitions and acceptance radii;
  // legacy spatialPlan is only the compatibility projection retained for
  // non-Air/red-route consumers until its owning migration. Legacy non-Air
  // domains retain their existing inputs.
  const compiledAssignment = compiledAirMission?.assignment;
  const compiledBluePlan = compiledAirMission?.flightPlan;
  const compiledBlueRoute = compiledBluePlan?.routePoints.map((point) => geographicToEnginePosition({
    longitude: point.position.longitude,
    latitude: point.position.latitude,
    altitudeM: point.position.altitude.valueM,
    verticalDatum: "MSL",
  }, studyArea));
  const compiledBlueTransitions = compiledBluePlan?.routePoints.map((point) => point.turnMethod);
  const compiledBlueAcceptanceRadiiM = compiledBluePlan?.routePoints.map((point) => point.acceptanceRadiusM);
  const runtimeBlueFuelPercent = compiledAssignment?.initialFuelPercent ?? input.blueFuelPercent;
  const runtimeBlueWeaponQuantity = compiledAssignment?.loadout.reduce((total, store) => total + store.quantity, 0) ?? input.blueWeaponQuantity;
  const runtimeBlueRadarMode = compiledAirMission?.policies.emission ?? input.blueRadarMode;
  const environmentSampler = createEnvironmentSampler(environmentPack);
  const blueOrigin = resolveInstallationOriginReference({
    reference: input.placement?.blueOriginReference,
    studyAreaId: input.studyAreaId,
    weatherPresetId: input.weatherPresetId,
    fieldPath: "placement.blue.originReference",
    environmentPack,
  });
  const redOrigin = resolveInstallationOriginReference({
    reference: input.placement?.redOriginReference,
    studyAreaId: input.studyAreaId,
    weatherPresetId: input.weatherPresetId,
    fieldPath: "placement.red.originReference",
    environmentPack,
  });
  const targetHeadingRad = ((180 - input.aspect) * Math.PI) / 180;
  const authoredBlueStart = input.placement?.blueStart ?? {
    x: 0,
    y: 0,
    z: input.altitude,
  };
  const authoredRedStart = input.placement?.redStart ?? {
    x: input.range,
    y: 0,
    z: Math.max(0, input.altitude + input.targetDelta),
  };
  const reconcileRunwayStart = (input: {
    position: Vec3;
    runwayMslM: number;
    longitude: number;
    latitude: number;
  }): Vec3 => {
    const { position } = input;
    const terrain = environmentSampler.terrain.sample({ eastM: position.x, northM: position.y });
    if (!terrain.elevation) {
      throw new TypeError("Ground-start runway has no admitted DEM surface.");
    }
    const resolved = reconcileGroundStartElevation(input.runwayMslM, terrain.elevation.valueM);
    return geographicToEnginePosition({
      longitude: input.longitude,
      latitude: input.latitude,
      altitudeM: resolved.valueM,
      verticalDatum: "MSL",
    }, studyArea);
  };
  const runwayStart = (origin: typeof blueOrigin, authoredStart: Vec3): Vec3 => {
    if (!origin) return authoredStart;
    const local = geographicToEnginePosition({
      longitude: origin.groundStart.threshold.longitudeDeg,
      latitude: origin.groundStart.threshold.latitudeDeg,
      altitudeM: origin.groundStart.altitude.valueM,
      verticalDatum: "MSL",
    }, studyArea);
    return reconcileRunwayStart({
      position: local,
      runwayMslM: origin.groundStart.altitude.valueM,
      longitude: origin.groundStart.threshold.longitudeDeg,
      latitude: origin.groundStart.threshold.latitudeDeg,
    });
  };
  const compiledBlueStart = compiledAirMission?.start
    ? geographicToEnginePosition({
        longitude: compiledAirMission.start.position.longitude,
        latitude: compiledAirMission.start.position.latitude,
        altitudeM: compiledAirMission.start.position.altitude.valueM,
        verticalDatum: "MSL",
      }, studyArea)
    : undefined;
  const blueStart = compiledBlueStart
    ? compiledAirMission!.start.entryState === "GROUND"
      ? reconcileRunwayStart({
          position: compiledBlueStart,
          runwayMslM: compiledAirMission!.start.position.altitude.valueM,
          longitude: compiledAirMission!.start.position.longitude,
          latitude: compiledAirMission!.start.position.latitude,
        })
      : compiledBlueStart
    : runwayStart(blueOrigin, authoredBlueStart);
  const redStart = runwayStart(redOrigin, authoredRedStart);
  const blueHeadingRad = compiledAirMission
    ? compiledAirMission.start.headingSource === "FLIGHT_PLAN_FIRST_LEG"
      ? Math.atan2(
          compiledBlueRoute![1].y - compiledBlueRoute![0].y,
          compiledBlueRoute![1].x - compiledBlueRoute![0].x,
        )
      : ((90 - compiledAirMission.start.runwayHeadingDegTrue!) * Math.PI) / 180
    : blueOrigin
      ? ((90 - blueOrigin.groundStart.trueHeadingDeg) * Math.PI) / 180
    : input.placement?.blueHeadingRad ?? 0;
  const redHeadingRad = redOrigin
    ? ((90 - redOrigin.groundStart.trueHeadingDeg) * Math.PI) / 180
    : input.placement?.redHeadingRad ?? targetHeadingRad;
  const blueRoute = compiledBlueRoute?.length
    ? compiledBlueRoute.map((point, index) => index === 0 ? { ...blueStart } : { ...point })
    : input.placement?.blueRoute.length
    ? input.placement.blueRoute.map((point, index) => index === 0 && blueOrigin ? { ...blueStart } : { ...point })
    : undefined;
  const redRoute = input.placement?.redRoute.length
    ? input.placement.redRoute.map((point, index) => index === 0 && redOrigin ? { ...redStart } : { ...point })
    : undefined;
  const movingTarget = input.domain === "A2A" || input.domain === "G2A";
  const blueIsAircraft = blueObject.kind === "AIRCRAFT";
  const blueAircraftModel = blueIsAircraft ? compiledAircraftRuntime(blueObject.id) : undefined;
  if (blueIsAircraft && !blueAircraftModel) {
    throw new Error(`Missing aircraft model for ${blueObject.id}`);
  }
  const redAircraftModel = redObject.kind === "AIRCRAFT" ? compiledAircraftRuntime(redObject.id) : undefined;
  if (movingTarget && !redAircraftModel) {
    throw new Error(`Missing aircraft model for moving target ${redObject.id}`);
  }
  const blueAircraft = blueAircraftModel
    ? {
        emptyMassKg: blueAircraftModel.emptyMassKg,
        fuelCapacityKg: blueAircraftModel.fuelCapacityKg,
        referenceAreaM2: blueAircraftModel.referenceAreaM2,
        zeroLiftDragByMach: blueAircraftModel.zeroLiftDragByMach,
        inducedDragByAngleOfAttackRad: blueAircraftModel.inducedDragByAngleOfAttackRad,
        thrustByThrottle: blueAircraftModel.thrustByThrottle,
        fuelFlowByThrottle: blueAircraftModel.fuelFlowByThrottle,
        maximumCommandG: blueAircraftModel.maximumCommandG,
      }
    : undefined;
  const redAircraft = redAircraftModel
    ? {
        emptyMassKg: redAircraftModel.emptyMassKg,
        fuelCapacityKg: redAircraftModel.fuelCapacityKg,
        referenceAreaM2: redAircraftModel.referenceAreaM2,
        zeroLiftDragByMach: redAircraftModel.zeroLiftDragByMach,
        inducedDragByAngleOfAttackRad: redAircraftModel.inducedDragByAngleOfAttackRad,
        thrustByThrottle: redAircraftModel.thrustByThrottle,
        fuelFlowByThrottle: redAircraftModel.fuelFlowByThrottle,
        maximumCommandG: redAircraftModel.maximumCommandG,
      }
    : undefined;
  const blueFuelKg = blueAircraft
    ? blueAircraft.fuelCapacityKg * (runtimeBlueFuelPercent / 100)
    : 0;
  const redFuelKg = redAircraft
    ? redAircraft.fuelCapacityKg * (input.redFuelPercent / 100)
    : 0;
  const resolvedBlueCompiledWeapon = resolveCompiledWeaponAdmission(
    CURRENT_COMPILED_MODEL_PACK,
    blueObject.id,
    blueSystem.id,
  );
  const blueMissionStore = compiledAssignment?.loadout[0];
  const blueCompiledWeapon = blueMissionStore
    ? {
        ...resolvedBlueCompiledWeapon,
        admission: {
          ...resolvedBlueCompiledWeapon.admission,
          stationId: blueMissionStore.stationId,
          compatibilityRuleId: blueMissionStore.compatibilityRuleId,
        },
      }
    : resolvedBlueCompiledWeapon;
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
      route: blueRoute
        ? blueRoute
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
      routePlan: {
        schemaVersion: compiledBlueRoute?.length
          ? ROUTE_PLAN_SCHEMA_VERSION
          : input.placement?.blueRoute.length &&
            input.placement.blueRouteWaypointTransitions === undefined
          ? "vector.route-plan.v1"
          : ROUTE_PLAN_SCHEMA_VERSION,
        waypointAcceptanceRadiiM: compiledBlueAcceptanceRadiiM?.length
          ? [...compiledBlueAcceptanceRadiiM]
          : input.placement?.blueRoute.length
            ? [...input.placement.blueRouteAcceptanceRadiiM]
          : [1, DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M],
        waypointTransitions: compiledBlueTransitions?.length
          ? [...compiledBlueTransitions]
          : input.placement?.blueRoute.length
            ? input.placement.blueRouteWaypointTransitions === undefined
              ? undefined
              : [...input.placement.blueRouteWaypointTransitions]
          : ["START", "FLY_BY"],
      },
      initial: {
        position: { ...blueStart },
        velocity: velocity(
          blueIsAircraft
            ? compiledAirMission?.start.initialSpeedMps ?? input.launcherSpeed
            : 0,
          blueHeadingRad,
        ),
        headingRad: blueHeadingRad,
        massKg: blueAircraft
          ? blueAircraft.emptyMassKg + blueFuelKg + assumptions.launchMassKg * runtimeBlueWeaponQuantity
          : 12000,
        fuelKg: blueFuelKg,
      },
      aircraft: blueAircraft,
      ...(compiledAirMission?.start.entryState === "GROUND"
        ? {
            groundOperation: {
              schemaVersion: "vector.aircraft-ground-operation.v1" as const,
              posture: compiledAirMission.start.posture as "PARKING" | "RUNWAY" | "GROUND_ALERT_QRA",
              releaseTimeSeconds:
                compiledAirMission.authored.start.posture === "AIRBORNE"
                  ? 0
                  : compiledAirMission.authored.start.readinessDelaySeconds,
              missionDigest: compiledAirMission.compiledDigest,
              runwayEvidenceDigest:
                compiledAirMission.authored.start.posture === "AIRBORNE"
                  ? ""
                  : compiledAirMission.authored.start.runway.evidence.digest,
              executionAuthority: "UNAVAILABLE" as const,
              unavailabilityReason: "GROUND_DYNAMICS_MODEL_UNAVAILABLE" as const,
            },
          }
        : {}),
      observerSensor: blueIsAircraft
        ? compiledObserverSensorRuntime(blueObject.id, runtimeBlueRadarMode ?? "SILENT")
        : undefined,
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
      route: redRoute
        ? redRoute
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
      routePlan: {
        schemaVersion: input.placement?.redRoute.length &&
            input.placement.redRouteWaypointTransitions === undefined
          ? "vector.route-plan.v1"
          : ROUTE_PLAN_SCHEMA_VERSION,
        waypointAcceptanceRadiiM: input.placement?.redRoute.length
          ? [...input.placement.redRouteAcceptanceRadiiM]
          : [1, DEFAULT_WAYPOINT_ACCEPTANCE_RADIUS_M],
        waypointTransitions: input.placement?.redRoute.length
          ? input.placement.redRouteWaypointTransitions === undefined
            ? undefined
            : [...input.placement.redRouteWaypointTransitions]
          : ["START", "FLY_BY"],
      },
      initial: {
        position: { ...redStart },
        velocity: velocity(movingTarget ? input.targetSpeed : 0, redHeadingRad),
        headingRad: redHeadingRad,
        massKg: redAircraft
          ? redAircraft.emptyMassKg +
            redFuelKg +
            (redCompiledWeapon?.weapon.launchMassKg ?? 0) * input.redWeaponQuantity
          : 10000,
        fuelKg: redFuelKg,
      },
      aircraft: redAircraft,
      observerSensor: movingTarget && redObject.kind === "AIRCRAFT"
        ? compiledObserverSensorRuntime(redObject.id, input.redRadarMode ?? "SILENT")
        : undefined,
    },
    redObject.id,
    redAircraftModel?.id ?? `${redObject.id}-static-study-v1`,
    redAircraftModel?.valueState ?? "MODEL_ASSUMPTION",
    redAircraftModel?.version ?? "static-object-v1.0.0",
  );

  const blueWeapons = Array.from({ length: runtimeBlueWeaponQuantity }, (_, index) => withProvenance(
    {
      id: `blue-weapon-${index + 1}`,
      rddfId: `rddf://component/guided-weapon/${blueSystem.id}`,
      designation: blueSystem.designation,
      callsign: `BLUE WEAPON ${index + 1}`,
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
      weapon: {
        launchPlatformId: bluePlatform.id,
        targetEntityId: redTarget.id,
        guidance: input.guidance,
        launchTimeSeconds: index === 0 ? 0 : null,
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
  ));

  const entities: EngineEntityDefinition[] = [
    bluePlatform,
    redTarget,
    ...blueWeapons,
  ];

  if (redSystem) {
    const redModel = redCompiledWeapon!;
    const redAssumptions = compiledWeaponRuntime(redModel.weapon);
    entities.push(
      ...Array.from({ length: input.redWeaponQuantity }, (_, index) => withProvenance(
        {
          id: `red-weapon-${index + 1}`,
          rddfId: `rddf://component/guided-weapon/${redSystem.id}`,
          designation: redSystem.designation,
          callsign: `RED WEAPON ${index + 1}`,
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
      )),
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
    weatherPreset: environmentPack.content.weather,
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
    ...(compiledAirMission ? { airMission: compiledAirMission } : {}),
    ...(bluePlatform.groundOperation
      ? { airMissionRuntime: structuredClone(bluePlatform.groundOperation) }
      : {}),
    modelPack: bindRuntimeModelPackDigest({
      schemaVersion: COMPILED_MODEL_PACK_SCHEMA_VERSION,
      id: CURRENT_MODEL_PACK_ID,
      version: CURRENT_MODEL_PACK_VERSION,
      digest: CURRENT_MODEL_PACK_DIGEST,
      intendedUse: {
        id: CURRENT_INTENDED_USE_ID,
        version: CURRENT_INTENDED_USE_VERSION,
      },
      observerSensors: CURRENT_COMPILED_MODEL_PACK.sensors.map((sensor) => ({
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
      })),
      scenarioPatches: [],
    }),
    entities,
    geospatial: {
      schemaVersion: "vector.engine-geospatial.v1",
      origin,
      initialPositions: entities.map((entity) => ({
        entityId: entity.id,
        position: enginePositionToGeographic(entity.initial.position, origin),
      })),
      syntheticEnvironment,
      environmentPack,
      originReferences: compiledOriginReferences,
    },
    environment: {
      gravityMps2: 9.80665,
      temperatureOffsetC: environmentPack.weather.temperatureOffsetC,
      windMps: {
        x: environmentPack.weather.windEastMps,
        y: environmentPack.weather.windNorthMps,
        z: 0,
      },
      atmosphere: "NASA_EDUCATIONAL_STANDARD",
      runtimeEnvironment: environmentRuntimeProjection(environmentPack),
      environmentPack: environmentPackBinding(environmentPack),
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
