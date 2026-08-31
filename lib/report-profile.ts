import { canonicalJson } from "./canonical-json.ts";
import { engineDurationSecondsForDomain } from "./engine/compiler.ts";
import type { AirMissionStart, EngagementRegime, FlightLegRole } from "./air-mission.ts";
import type { InstallationOriginReference } from "./mission-admission.ts";
import type {
  ScenarioSpatialEntity,
  ScenarioSpatialPoint,
} from "./scenario-spatial.ts";
import type { ScenarioDefinition } from "./scenarios.ts";
import type { Scenario } from "./simulation.ts";

export const REPORT_CAUSAL_INPUTS_SCHEMA_VERSION =
  "vector.report-causal-inputs.v1" as const;
export const AUTHORED_PROFILE_BINDING_SCHEMA_VERSION =
  "vector.authored-profile-binding.v1" as const;

export type ReportProfileApplicability =
  | "MATCHED"
  | "MODIFIED_FROM"
  | "UNVERIFIED_LEGACY";

type ReportRoutePoint = {
  index: number;
  position: ScenarioSpatialPoint;
  transition: "START" | "FLY_BY" | "FLY_OVER";
  acceptanceRadiusM: number;
};

type ReportSideCausalInputs = {
  start: {
    position: ScenarioSpatialPoint;
    headingDeg: number;
    tasMps: number;
    originReference: InstallationOriginReference | null;
  };
  routeSemantics: "EXPLICIT_V2" | "LEGACY_ALL_FLY_BY";
  route: ReportRoutePoint[];
};

export type ReportCausalInputProjection = {
  schemaVersion: typeof REPORT_CAUSAL_INPUTS_SCHEMA_VERSION;
  duration: {
    valueSeconds: number;
    authority: "SCENARIO_AUTHORED" | "VERSIONED_DOMAIN_DEFAULT";
    authoredFieldPresent: boolean;
  };
  guidance: Scenario["guidance"];
  regime: EngagementRegime | null;
  missionStart: AirMissionStart | null;
  blueFlightLegs: Array<{
    flightPlanId: string;
    legId: string;
    fromPointId: string;
    toPointId: string;
    role: FlightLegRole;
  }>;
  releaseRequests: Array<{
    assignmentId: string;
    requestId: string;
    launcherEntityId: string;
    storeEntityId: string;
    storeOrdinal: number;
    stationId: string;
    operation: "RELEASE" | "JETTISON";
    requestedTimeSeconds: number;
  }>;
  sides: {
    BLUE: ReportSideCausalInputs | null;
    RED: ReportSideCausalInputs | null;
  };
};

export type AuthoredProfileBinding = {
  schemaVersion: typeof AUTHORED_PROFILE_BINDING_SCHEMA_VERSION;
  applicability: Exclude<ReportProfileApplicability, "UNVERIFIED_LEGACY">;
  sourceCausalInputs: ReportCausalInputProjection;
};

function sideProjection(
  side: ScenarioSpatialEntity,
): ReportSideCausalInputs {
  const explicitTransitions = side.routeWaypointTransitions;
  return {
    start: {
      position: structuredClone(side.position),
      headingDeg: side.headingDeg,
      tasMps: side.speedMps,
      originReference: side.originReference
        ? structuredClone(side.originReference)
        : null,
    },
    routeSemantics: explicitTransitions ? "EXPLICIT_V2" : "LEGACY_ALL_FLY_BY",
    route: side.route.map((position, index) => ({
      index,
      position: structuredClone(position),
      transition: explicitTransitions?.[index]
        ?? (index === 0 ? "START" : "FLY_BY"),
      acceptanceRadiusM: side.routeAcceptanceRadiiM[index],
    })),
  };
}

/** Exact authored inputs that explain route/profile execution in a saved report. */
export function projectReportCausalInputs(
  scenario: Scenario,
): ReportCausalInputProjection {
  const mission = scenario.airMission;
  return {
    schemaVersion: REPORT_CAUSAL_INPUTS_SCHEMA_VERSION,
    duration: scenario.runDurationSeconds === undefined
      ? {
          valueSeconds: engineDurationSecondsForDomain(scenario.domain),
          authority: "VERSIONED_DOMAIN_DEFAULT",
          authoredFieldPresent: false,
        }
      : {
          valueSeconds: scenario.runDurationSeconds,
          authority: "SCENARIO_AUTHORED",
          authoredFieldPresent: true,
        },
    guidance: scenario.guidance,
    regime: mission?.regime ?? null,
    missionStart: mission ? structuredClone(mission.start) : null,
    blueFlightLegs: mission?.flightPlans.flatMap((plan) =>
      plan.legs.map((leg) => ({
        flightPlanId: plan.id,
        legId: leg.id,
        fromPointId: leg.fromPointId,
        toPointId: leg.toPointId,
        role: leg.role,
      }))) ?? [],
    releaseRequests: mission?.assignments.flatMap((assignment) =>
      assignment.storeTransferPlan?.requests.map((request) => ({
        assignmentId: assignment.id,
        requestId: request.id,
        launcherEntityId: request.launcherEntityId,
        storeEntityId: request.storeEntityId,
        storeOrdinal: request.storeOrdinal,
        stationId: request.stationId,
        operation: request.operation,
        requestedTimeSeconds: request.requestedTimeSeconds,
      })) ?? []) ?? [],
    sides: {
      BLUE: scenario.spatialPlan ? sideProjection(scenario.spatialPlan.blue) : null,
      RED: scenario.spatialPlan ? sideProjection(scenario.spatialPlan.red) : null,
    },
  };
}

export function deriveReportProfileApplicability(
  source: ReportCausalInputProjection,
  current: ReportCausalInputProjection,
): Exclude<ReportProfileApplicability, "UNVERIFIED_LEGACY"> {
  return canonicalJson(source) === canonicalJson(current)
    ? "MATCHED"
    : "MODIFIED_FROM";
}

/** Server-owned binding between descriptive profile ancestry and causal inputs. */
export function buildAuthoredProfileBinding(
  template: ScenarioDefinition,
  currentScenario: Scenario,
): AuthoredProfileBinding | undefined {
  if (!template.authoredProfile) return undefined;
  const sourceCausalInputs = projectReportCausalInputs(template.scenario);
  return {
    schemaVersion: AUTHORED_PROFILE_BINDING_SCHEMA_VERSION,
    applicability: deriveReportProfileApplicability(
      sourceCausalInputs,
      projectReportCausalInputs(currentScenario),
    ),
    sourceCausalInputs,
  };
}
