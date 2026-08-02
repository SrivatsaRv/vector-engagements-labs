import type { Scenario, SimulationResult } from "@/lib/simulation";

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
  events: Array<{ id: number; time: number; type: string; title: string; detail: string }>;
  createdAt: string;
  engine: string;
  profileVersion: string;
  libraryScenario?: ReportLibraryScenario;
};

export function buildReportExport(data: ReportData, library: ReportLibraryScenario, sourceState: "example" | "last-saved") {
  return {
    schema: "vector.engagement-report.v1",
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
        profile: data.scenario.profile,
        guidance: data.scenario.guidance,
        maneuver: data.scenario.maneuver,
        seed: data.scenario.seed,
        geometry: {
          launchRange: { value: data.scenario.range, unit: "m" },
          launchAltitude: { value: data.scenario.altitude, unit: "m" },
          targetAltitudeDelta: { value: data.scenario.targetDelta, unit: "m" },
          aspect: { value: data.scenario.aspect, unit: "deg" },
        },
        motion: {
          launcherSpeed: { value: data.scenario.launcherSpeed, unit: "m/s" },
          targetSpeed: { value: data.scenario.targetSpeed, unit: "m/s" },
          targetDemand: { value: data.scenario.targetG, unit: "g" },
          wind: { value: data.scenario.wind, unit: "m/s" },
        },
      },
    },
    result: {
      outcome: data.result.outcome,
      reason: data.result.reason,
      closestApproach: { value: Math.round(data.result.closestApproach), unit: "m" },
      timeOfFlight: { value: Number(data.result.timeOfFlight.toFixed(1)), unit: "s" },
      endSpeed: { value: Math.round(data.result.endSpeed), unit: "m/s" },
      peakDemand: { value: Number(data.result.peakDemand.toFixed(1)), unit: "g" },
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
      coordinateSystem: "local Cartesian educational frame",
      samples: data.result.frames.map((frame) => ({
        time: Number(frame.t.toFixed(1)),
        phase: frame.phase,
        interceptor: frame.interceptor,
        target: frame.target,
        speed: Math.round(frame.speed),
        range: Math.round(frame.range),
        energyIndex: Math.round(frame.energy),
        lineOfSightRate: Number(frame.losRate.toFixed(4)),
      })),
      units: {
        time: "s",
        position: "m",
        speed: "m/s",
        range: "m",
        energyIndex: "percent",
        lineOfSightRate: "rad/s",
      },
    },
    provenance: {
      engine: data.engine,
      profileLibrary: data.profileVersion,
      scenarioLibrary: `${library.id}@${library.version}`,
      sourceClass: "public / illustrative",
      reviewState: "demonstration",
    },
    limitations: [
      "Public-data educational approximation.",
      "Not verified weapon performance.",
      "Not current operational deployment information.",
      "Not an actual engagement prediction or weapon-control recommendation.",
    ],
  };
}

export function reportExportFilename(library: ReportLibraryScenario, createdAt: string) {
  return `vector-${library.id}-${createdAt.slice(0, 10)}.json`;
}
