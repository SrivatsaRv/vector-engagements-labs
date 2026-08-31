import { sha256HexSync } from "../geospatial/digest.ts";
import {
  deriveReportProfileApplicability,
  projectReportCausalInputs,
  type AuthoredProfileBinding,
  type ReportProfileApplicability,
} from "../report-profile.ts";
import type { AuthoredRouteProfile } from "../scenarios.ts";
import type { Scenario, SimulationResult } from "../simulation.ts";

export type AuthoredProfilePresentation = {
  state: ReportProfileApplicability;
  profile?: AuthoredRouteProfile;
  reason: string;
};

export type AuthoredProfilePresentationAuthority = {
  binding: AuthoredProfileBinding;
  profile: AuthoredRouteProfile;
  currentScenario: Scenario;
};

/**
 * Presentation-only applicability. Source ancestry comes from an immutable
 * library definition and the shared exact causal-input projection; display
 * names and achieved geometry never select or promote a profile.
 */
export function selectAuthoredProfilePresentation(
  result: SimulationResult,
  authority?: AuthoredProfilePresentationAuthority,
): AuthoredProfilePresentation {
  const compiledMission = result.engineRun.scenario.airMission;
  if (!compiledMission) {
    return { state: "UNVERIFIED_LEGACY", reason: "NO_COMPILED_AIR_MISSION" };
  }

  if (authority) {
    const { binding, currentScenario, profile } = authority;
    const derived = deriveReportProfileApplicability(
      binding.sourceCausalInputs,
      projectReportCausalInputs(currentScenario),
    );
    if (binding.applicability !== derived) {
      return {
        state: "UNVERIFIED_LEGACY",
        profile,
        reason: "PROFILE_BINDING_MISMATCH",
      };
    }
    const currentMission = currentScenario.airMission;
    if (
      !currentMission ||
      compiledMission.authoredDigest !== sha256HexSync(currentMission)
    ) {
      return {
        state: "UNVERIFIED_LEGACY",
        profile,
        reason: "RESULT_CAUSAL_INPUT_MISMATCH",
      };
    }
    return {
      state: derived,
      profile,
      reason: derived === "MATCHED"
        ? "EXACT_CAUSAL_MATCH"
        : "CAUSAL_INPUTS_MODIFIED",
    };
  }
  return { state: "UNVERIFIED_LEGACY", reason: "SOURCE_PROFILE_UNAVAILABLE" };
}
