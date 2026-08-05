import type { Scenario, SimulationResult } from "./simulation.ts";
import { findPlatform, findWeapon, getSource } from "./capability-data.ts";
import { getCatalogObject } from "./object-catalog.ts";
import { findWeaponSimulationModel } from "./simulation-models.ts";

export type ReportLibraryScenario = {
  id: string;
  version: string;
  domain: string;
  title: string;
  scope: string;
  targetProfile: string;
  theatre: string;
};

export type ReportData = {
  scenario: Scenario;
  result: SimulationResult;
  events: Array<{
    id: number;
    time: number;
    type: string;
    title: string;
    detail: string;
  }>;
  createdAt: string;
  engine: string;
  profileVersion: string;
  packageProvenance?: {
    schemaVersion: string;
    contentHash: string;
    draftRevision: number;
    frameHash?: string;
  };
  libraryScenario?: ReportLibraryScenario;
};

export function buildReportExport(
  data: ReportData,
  library: ReportLibraryScenario,
  sourceState: "example" | "last-saved",
) {
  const bluePlatform = findPlatform(data.scenario.bluePlatformId);
  const blueWeapon = findWeapon(data.scenario.blueSystemId);
  const redPlatform = findPlatform(data.scenario.redObjectId);
  const redWeapon =
    data.scenario.domain === "A2A"
      ? findWeapon(data.scenario.redSystemId)
      : undefined;
  const blueObject = getCatalogObject(data.scenario.bluePlatformId);
  const blueSystem = getCatalogObject(data.scenario.blueSystemId);
  const redObject = getCatalogObject(data.scenario.redObjectId);
  const profileFallback = {
    id: `${data.scenario.blueSystemId}-public-study`,
    version: "unavailable",
    rationale:
      "No coefficient record was available when this export was generated.",
  };
  const simulationModel = findWeaponSimulationModel(
    data.scenario.blueSystemId,
  );
  const weaponModel = simulationModel ?? profileFallback;
  const modelCoefficients = simulationModel
    ? {
        launchMassKg: simulationModel.launchMassKg,
        dryMassKg: simulationModel.dryMassKg,
        poweredFlightSeconds: simulationModel.poweredFlightSeconds,
        thrustNewtons: simulationModel.thrustNewtons,
        referenceAreaM2: simulationModel.referenceAreaM2,
        dragCoefficient: simulationModel.dragCoefficient,
        navigationConstant: simulationModel.navigationConstant,
        maximumCommandG: simulationModel.maximumCommandG,
      }
    : null;
  const sourceIds = [
    ...new Set([
      ...(bluePlatform?.sourceIds ?? blueObject.sourceIds ?? []),
      ...(blueWeapon?.sourceIds ?? blueSystem.sourceIds ?? []),
      ...(redPlatform?.sourceIds ?? redObject.sourceIds ?? []),
      ...(redWeapon?.sourceIds ?? []),
    ]),
  ];
  return {
    schema: "vector.engagement-report.v2",
    export: {
      generatedAt: new Date().toISOString(),
      sourceState,
      publicDataMode: true,
      classification: "PUBLIC / ILLUSTRATIVE",
    },
    scenario: {
      library: {
        id: library.id,
        version: library.version,
        domain: library.domain,
        title: library.title,
      },
      intent: {
        name: data.scenario.name,
        objective: data.scenario.objective,
      },
      context: {
        targetProfile: library.targetProfile,
        theatre: library.theatre,
        modelScope: library.scope,
      },
      configuration: {
        blueTeam: {
          service: bluePlatform?.service ?? blueObject.country,
          platform: bluePlatform?.designation ?? blueObject.designation,
          weapon: blueWeapon?.designation ?? blueSystem.designation,
          weaponQuantity: data.scenario.blueWeaponQuantity,
          fuelPercent: data.scenario.blueFuelPercent,
        },
        redTeam: {
          service: redPlatform?.service ?? redObject.country,
          platform: redPlatform?.designation ?? redObject.designation,
          weapon: redWeapon?.designation ?? null,
          weaponQuantity: redWeapon ? data.scenario.redWeaponQuantity : 0,
          fuelPercent: redPlatform ? data.scenario.redFuelPercent : null,
        },
        weaponStudyModel: {
          id: weaponModel.id,
          version: weaponModel.version,
          rationale: weaponModel.rationale,
          coefficients: modelCoefficients,
        },
        guidance: data.scenario.guidance,
        maneuver: data.scenario.maneuver,
        seed: data.scenario.seed,
        geometry: {
          launchRange: { value: data.scenario.range, unit: "m" },
          launchAltitude: { value: data.scenario.altitude, unit: "m" },
          commandedCruiseAltitude: {
            value: data.scenario.cruiseAltitude,
            unit: "m",
          },
          targetAltitudeDelta: { value: data.scenario.targetDelta, unit: "m" },
          aspect: { value: data.scenario.aspect, unit: "deg" },
        },
        motion: {
          launcherSpeed: { value: data.scenario.launcherSpeed, unit: "m/s" },
          targetSpeed: { value: data.scenario.targetSpeed, unit: "m/s" },
          targetDemand: { value: data.scenario.targetG, unit: "g" },
          eastWind: { value: data.scenario.wind, unit: "m/s" },
          northWind: { value: data.scenario.windNorth, unit: "m/s" },
        },
        information: {
          blueRadarMode: data.scenario.blueRadarMode,
          redRadarMode: data.scenario.redRadarMode,
          blueTrackSource: data.scenario.blueTrackSource,
          redTrackSource: data.scenario.redTrackSource,
          blueDatalink: data.scenario.blueDatalink,
          redDatalink: data.scenario.redDatalink,
          blueJammer: data.scenario.blueJammer,
          redJammer: data.scenario.redJammer,
        },
        decisions: {
          blue: data.scenario.blueDecision,
          red: data.scenario.redDecision,
        },
        environment: {
          atmosphere: "NASA educational standard atmosphere",
          temperatureOffset: {
            value: data.scenario.temperatureOffset,
            unit: "degC",
          },
          visibility: { value: data.scenario.visibilityKm, unit: "km" },
          humidity: { value: data.scenario.humidityPercent, unit: "%" },
        },
      },
    },
    result: {
      outcome: data.result.outcome,
      reason: data.result.reason,
      closestApproach: {
        value: Math.round(data.result.closestApproach),
        unit: "m",
      },
      timeOfFlight: {
        value: Number(data.result.timeOfFlight.toFixed(1)),
        unit: "s",
      },
      endSpeed: { value: Math.round(data.result.endSpeed), unit: "m/s" },
      peakDemand: {
        value: Number(data.result.peakDemand.toFixed(1)),
        unit: "g",
      },
    },
    session: {
      createdAt: data.createdAt,
      events: data.events.map((event) => ({
        time: { value: Number(event.time.toFixed(1)), unit: "s" },
        type: event.type,
        title: event.title,
        detail: event.detail,
      })),
    },
    telemetry: {
      coordinateSystem: "WGS84 geographic plus scenario-local ENU",
      scenarioOrigin: data.result.engineRun.scenario.geospatial.origin,
      samples: data.result.frames.map((frame) => ({
        time: Number(frame.t.toFixed(1)),
        phase: frame.phase,
        interceptor: frame.interceptor,
        target: frame.target,
        geographicPositions: frame.geographicPositions,
        speed: Math.round(frame.speed),
        range: Math.round(frame.range),
        normalizedWeaponSpeedPercent: Math.round(frame.energy),
        lineOfSightRate: Number(frame.losRate.toFixed(4)),
        airDensity: Number(frame.airDensity.toFixed(5)),
        mach: Number(frame.mach.toFixed(3)),
      })),
      units: {
        time: "s",
        position: "m",
        speed: "m/s",
        range: "m",
        normalizedWeaponSpeedPercent:
          "percent of selected study-model maximum speed",
        lineOfSightRate: "rad/s",
      },
    },
    provenance: {
      engine: data.engine,
      scenarioSchema: data.packageProvenance?.schemaVersion ?? "unrecorded",
      scenarioContentHash: data.packageProvenance?.contentHash ?? "unrecorded",
      draftRevision: data.packageProvenance?.draftRevision ?? 0,
      frameHash: data.packageProvenance?.frameHash ?? "recorded by saved-run envelope",
      profileLibrary: data.profileVersion,
      scenarioLibrary: `${library.id}@${library.version}`,
      sourceClass: "public / official-source-first",
      sources: sourceIds
        .map(getSource)
        .filter(Boolean)
        .map((source) => ({
          id: source!.id,
          publisher: source!.publisher,
          title: source!.title,
          url: source!.url,
          sourceClass: source!.sourceClass,
        })),
      reviewState: "public-study",
      syntheticEnvironment:
        data.result.engineRun.scenario.geospatial.syntheticEnvironment,
    },
    limitations: [
      "Public-data educational approximation.",
      "Not verified weapon performance.",
      "Not current operational deployment information.",
      "Not an actual engagement prediction or weapon-control recommendation.",
    ],
  };
}

export function reportExportFilename(
  library: ReportLibraryScenario,
  createdAt: string,
) {
  return `vector-${library.id}-${createdAt.slice(0, 10)}.json`;
}
