import type {
  EngineEntityFrame,
  EngineObserverState,
  WeaponFlightState,
} from "./engine/contracts.ts";
import {
  selectCanonicalTargetEffect,
  selectDisplayFrame,
  type CanonicalTargetEffectSelection,
} from "./frontend/selectors.ts";
import type { ReportLibraryScenario } from "./report-export.ts";
import {
  deriveReportProfileApplicability,
  projectReportCausalInputs,
  type ReportCausalInputProjection,
  type ReportProfileApplicability,
} from "./report-profile.ts";
import type { Scenario, SimulationResult } from "./simulation.ts";

export type DebriefAircraftState = {
  entityId: string;
  affiliation: "BLUE" | "RED";
  designation: string;
  initial: {
    modelTimeSeconds: number;
    fuelKg: number;
    massKg: number;
    installedStoreIds: string[];
  };
  final: {
    modelTimeSeconds: number;
    lifecycle: EngineEntityFrame["lifecycle"];
    fuelKg: number;
    massKg: number;
    installedStoreIds: string[];
  };
};

type DebriefAircraftGeometryFrame = {
  frameIndex: number;
  modelTimeSeconds: number;
  relationship: "AIRCRAFT_TO_AIRCRAFT";
  rangeM: number;
  closureRateMps: number;
  blueAltitudeMslM: number;
  redAltitudeMslM: number;
};

type DebriefAuthoredLegGeometry = DebriefAircraftGeometryFrame & {
  authoredIntent: "INTERCEPT" | "RECOMMIT";
  legIndex: number;
  routePointIndex: number;
};

export type CanonicalReportDebrief = {
  profile: null | {
    schemaVersion: "vector.authored-route-profile.v1";
    id: string;
    label: string;
    authority: "AUTHORED_ROUTE";
    applicability: ReportProfileApplicability;
    regime: string | null;
    limitations: string[];
  };
  causalInputs: ReportCausalInputProjection;
  routeLegs: Array<{
    affiliation: "BLUE" | "RED";
    legIndex: number;
    authoredIntent: string;
    compiledRole: string | null;
    transitionMethod: "FLY_BY" | "FLY_OVER" | null;
  }>;
  achievedRouteTransitions: Array<{
    entityId: string;
    affiliation: "BLUE" | "RED";
    modelTimeSeconds: number;
    fromRoutePointIndex: number;
    toRoutePointIndex: number;
  }>;
  launch: null | {
    eventId: string;
    frameIndex: number;
    modelTimeSeconds: number;
    weaponId: string;
    relationship: "WEAPON_TO_TARGET";
    rangeM: number;
    closureRateMps: number;
    blueAltitudeMslM: number;
    redAltitudeMslM: number;
  };
  storeTransfers: Array<{
    eventId: string;
    modelTimeSeconds: number;
    operation: "RELEASE" | "JETTISON";
    launcherId: string;
    storeId: string;
    accepted: boolean;
    achieved: boolean;
    cause: string;
  }>;
  weaponTermination: null | {
    eventId: string;
    modelTimeSeconds: number;
    weaponId: string;
    targetId: string;
    terminalState:
      | "INTERCEPT"
      | "MISS"
      | "EXPIRED"
      | "FAILED"
      | "SELF_DESTRUCT"
      | "TARGET_UNAVAILABLE";
    cause: string;
    closestApproachM: number;
  };
  weaponFlightStates: Array<{
    frameIndex: number;
    modelTimeSeconds: number;
    state: WeaponFlightState;
  }>;
  observerStates: Array<{
    perspective: EngineObserverState["perspective"];
    schemaVersion: EngineObserverState["schemaVersion"];
    modelTimeSeconds: number;
    sensorState: EngineObserverState["sensorState"];
    observationCount: number;
    trackState: "UNSUPPORTED" | "NONE" | "PLOT" | null;
    trackCount: number | null;
    visibleTrackCount: number | null;
    availabilityReason: string;
  }>;
  targetEffect: CanonicalTargetEffectSelection;
  aircraft: DebriefAircraftState[];
  closestAircraftApproach: DebriefAircraftGeometryFrame | null;
  authoredTransitionGeometry: null | {
    state: "RECORDED" | "PARTIAL";
    initialCommit: DebriefAuthoredLegGeometry | null;
    recommit: DebriefAuthoredLegGeometry | null;
  };
  finalAircraftSeparationM: number | null;
  explanation: string;
};

function aircraftState(
  result: SimulationResult,
  entityId: string,
  affiliation: "BLUE" | "RED",
): DebriefAircraftState | null {
  const samples = result.frames.flatMap((frame) => {
    const entity = frame.entities.find((candidate) => candidate.id === entityId);
    return entity ? [{ frame, entity }] : [];
  });
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return null;
  return {
    entityId,
    affiliation,
    designation: first.entity.designation,
    initial: {
      modelTimeSeconds: first.frame.t,
      fuelKg: first.entity.fuelKg,
      massKg: first.entity.massKg,
      installedStoreIds: [...first.entity.installedStoreIds],
    },
    final: {
      modelTimeSeconds: last.frame.t,
      lifecycle: last.entity.lifecycle,
      fuelKg: last.entity.fuelKg,
      massKg: last.entity.massKg,
      installedStoreIds: [...last.entity.installedStoreIds],
    },
  };
}

function aircraftGeometryAtFrame(
  result: SimulationResult,
  frameIndex: number,
  blueId: string,
  redId: string,
): DebriefAircraftGeometryFrame | null {
  const frame = result.frames[frameIndex];
  const blue = frame?.entities.find((entity) => entity.id === blueId);
  const red = frame?.entities.find((entity) => entity.id === redId);
  if (!frame || !blue || !red) return null;
  const relativePosition = {
    x: red.position.x - blue.position.x,
    y: red.position.y - blue.position.y,
    z: red.position.z - blue.position.z,
  };
  const relativeVelocity = {
    x: red.velocity.x - blue.velocity.x,
    y: red.velocity.y - blue.velocity.y,
    z: red.velocity.z - blue.velocity.z,
  };
  const rangeM = Math.hypot(
    relativePosition.x,
    relativePosition.y,
    relativePosition.z,
  );
  if (!Number.isFinite(rangeM) || rangeM <= 0) return null;
  const closureRateMps = -(
    relativePosition.x * relativeVelocity.x +
    relativePosition.y * relativeVelocity.y +
    relativePosition.z * relativeVelocity.z
  ) / rangeM;
  if (![closureRateMps, blue.position.z, red.position.z].every(Number.isFinite)) {
    return null;
  }
  return {
    frameIndex,
    modelTimeSeconds: frame.t,
    relationship: "AIRCRAFT_TO_AIRCRAFT",
    rangeM,
    closureRateMps,
    blueAltitudeMslM: blue.position.z,
    redAltitudeMslM: red.position.z,
  };
}

function exactWorldEntry(
  result: SimulationResult,
  weaponId: string,
  blueId: string,
  redId: string,
): CanonicalReportDebrief["launch"] {
  const events = result.engineRun.events.state === "AVAILABLE"
    ? result.engineRun.events.items
    : [];
  const matches = events.filter((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" &&
    event.payload.entityKind === "GUIDED_WEAPON" &&
    event.participants.some(
      (participant) => participant.entityId === weaponId && participant.role === "SUBJECT",
    )
  );
  if (matches.length !== 1) return null;
  const event = matches[0];
  const frame = result.frames[event.frameIndex];
  const engineFrame = result.engineRun.frames[event.frameIndex];
  const aircraftGeometry = aircraftGeometryAtFrame(
    result,
    event.frameIndex,
    blueId,
    redId,
  );
  const weapon = frame?.entities.find((entity) => entity.id === weaponId);
  if (
    !frame ||
    !engineFrame ||
    !weapon ||
    frame.t !== event.modelTimeSeconds ||
    engineFrame.t !== event.modelTimeSeconds ||
    !aircraftGeometry ||
    ![engineFrame.separationM, engineFrame.closureRateMps].every(Number.isFinite)
  ) return null;
  return {
    eventId: event.id,
    frameIndex: event.frameIndex,
    modelTimeSeconds: event.modelTimeSeconds,
    weaponId,
    relationship: "WEAPON_TO_TARGET",
    rangeM: engineFrame.separationM,
    closureRateMps: engineFrame.closureRateMps,
    blueAltitudeMslM: aircraftGeometry.blueAltitudeMslM,
    redAltitudeMslM: aircraftGeometry.redAltitudeMslM,
  };
}

function routeTransitions(result: SimulationResult) {
  const transitions: CanonicalReportDebrief["achievedRouteTransitions"] = [];
  const prior = new Map<string, number>();
  for (const frame of result.frames) {
    for (const entity of frame.entities) {
      if (
        entity.kind !== "AIRCRAFT" ||
        (entity.affiliation !== "BLUE" && entity.affiliation !== "RED") ||
        entity.aircraftControl?.routePointIndex == null
      ) continue;
      const current = entity.aircraftControl.routePointIndex;
      const previous = prior.get(entity.id);
      if (previous !== undefined && previous !== current) {
        transitions.push({
          entityId: entity.id,
          affiliation: entity.affiliation,
          modelTimeSeconds: frame.t,
          fromRoutePointIndex: previous,
          toRoutePointIndex: current,
        });
      }
      prior.set(entity.id, current);
    }
  }
  return transitions;
}

function aircraftSeparation(result: SimulationResult, blueId?: string, redId?: string) {
  const frame = result.frames.at(-1);
  const blue = frame?.entities.find((entity) => entity.id === blueId);
  const red = frame?.entities.find((entity) => entity.id === redId);
  if (!blue || !red) return null;
  return Math.hypot(
    blue.position.x - red.position.x,
    blue.position.y - red.position.y,
    blue.position.z - red.position.z,
  );
}

function closestAircraftApproach(
  result: SimulationResult,
  blueId?: string,
  redId?: string,
) {
  if (!blueId || !redId) return null;
  let closest: DebriefAircraftGeometryFrame | null = null;
  result.frames.forEach((frame, frameIndex) => {
    const blue = frame.entities.find((entity) => entity.id === blueId);
    const red = frame.entities.find((entity) => entity.id === redId);
    if (
      !blue ||
      !red ||
      blue.lifecycle === "STOWED" ||
      red.lifecycle === "STOWED" ||
      blue.lifecycle === "TERMINATED" ||
      red.lifecycle === "TERMINATED"
    ) return;
    const geometry = aircraftGeometryAtFrame(result, frameIndex, blueId, redId);
    if (geometry && (!closest || geometry.rangeM < closest.rangeM)) {
      closest = geometry;
    }
  });
  return closest;
}

function firstAuthoredLegGeometry(
  result: SimulationResult,
  blueId: string,
  redId: string,
  authoredIntent: "INTERCEPT" | "RECOMMIT",
  legIndex: number,
): DebriefAuthoredLegGeometry | null {
  const routePointIndex = legIndex + 1;
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const frame = result.frames[frameIndex];
    const blue = frame.entities.find((entity) => entity.id === blueId);
    const red = frame.entities.find((entity) => entity.id === redId);
    if (
      blue?.aircraftControl?.routePointIndex !== routePointIndex ||
      !red ||
      blue.lifecycle === "TERMINATED" ||
      red.lifecycle === "TERMINATED"
    ) continue;
    const geometry = aircraftGeometryAtFrame(result, frameIndex, blueId, redId);
    if (geometry) {
      return { ...geometry, authoredIntent, legIndex, routePointIndex };
    }
  }
  return null;
}

function authoredTransitionGeometry(
  result: SimulationResult,
  library: ReportLibraryScenario,
  applicability: ReportProfileApplicability | null,
  blueId?: string,
  redId?: string,
): CanonicalReportDebrief["authoredTransitionGeometry"] {
  if (applicability !== "MATCHED" || !blueId || !redId) return null;
  const intents = library.authoredProfile?.blue.legs ?? [];
  const initialCommitIndex = intents.findIndex((intent) => intent === "INTERCEPT");
  const recommitIndex = intents.findIndex((intent) => intent === "RECOMMIT");
  if (initialCommitIndex < 0 || recommitIndex < 0) return null;
  const initialCommit = firstAuthoredLegGeometry(
    result,
    blueId,
    redId,
    "INTERCEPT",
    initialCommitIndex,
  );
  const recommit = firstAuthoredLegGeometry(
    result,
    blueId,
    redId,
    "RECOMMIT",
    recommitIndex,
  );
  return {
    state: initialCommit && recommit ? "RECORDED" : "PARTIAL",
    initialCommit,
    recommit,
  };
}

function weaponFlightStates(result: SimulationResult) {
  const timeline: CanonicalReportDebrief["weaponFlightStates"] = [];
  let previous: WeaponFlightState | undefined;
  result.engineRun.frames.forEach((frame, frameIndex) => {
    const current = frame.entities.find(
      (entity) => entity.id === result.engineRun.primaryWeaponId,
    )?.weaponFlightState;
    if (current && current !== previous) {
      timeline.push({ frameIndex, modelTimeSeconds: frame.t, state: current });
      previous = current;
    }
  });
  return timeline;
}

function finalObserverStates(result: SimulationResult) {
  const finalFrame = result.engineRun.frames.at(-1);
  if (!finalFrame) return [];
  return finalFrame.observerStates.map((state) => ({
    perspective: state.perspective,
    schemaVersion: state.schemaVersion,
    modelTimeSeconds: finalFrame.t,
    sensorState: state.sensorState,
    observationCount: state.observationCount,
    trackState: state.schemaVersion === "vector.observer-state.v2"
      ? state.trackState
      : null,
    trackCount: state.schemaVersion === "vector.observer-state.v3"
      ? state.trackCount
      : null,
    visibleTrackCount: state.schemaVersion === "vector.observer-state.v3"
      ? state.visibleTrackCount
      : null,
    availabilityReason: state.schemaVersion === "vector.observer-state.v2"
      ? state.availabilityReason
      : state.scanReason,
  }));
}

function effectExplanation(
  targetEffect: CanonicalTargetEffectSelection,
  profile: CanonicalReportDebrief["profile"],
  blueDesignation: string | undefined,
  redDesignation: string | undefined,
) {
  const presentation = targetEffect.presentation;
  const profileSentence = profile?.applicability === "MATCHED"
    ? `The run's exact causal inputs matched source authored route profile ${profile.label} (${profile.id})`
    : profile?.applicability === "MODIFIED_FROM"
      ? `The run was modified from source authored route profile ${profile.label} (${profile.id}); its leg-intent labels are not asserted for the edited causal inputs`
      : profile
        ? `Source authored route profile ${profile.label} (${profile.id}) was preserved, but historical evidence cannot establish exact causal-input applicability`
        : "No authored route profile was preserved for this run";
  if (
    presentation.effectClass === "KILL" &&
    presentation.killClaimAuthorized &&
    targetEffect.projection.state === "RECORDED" &&
    targetEffect.projection.authority.state === "ADMITTED"
  ) {
    const authority = targetEffect.projection.authority;
    return `At model time ${targetEffect.projection.modelTimeSeconds.toFixed(3)} s, Blue ${blueDesignation ?? "aircraft"} presentation aircraft recorded KILL against Red ${redDesignation ?? "aircraft"} presentation under the generic educational model ${authority.modelId}@${authority.modelVersion} (${authority.modelDigest}) and authority ${authority.authorityId}@${authority.authorityVersion} (${authority.authorityDigest}). ${presentation.detail} ${profileSentence}; no autonomous pilot selected it, and this is not named-system effectiveness.`;
  }
  return `${presentation.headline} ${presentation.detail} ${profileSentence}; no autonomous pilot selected it. This is not named-system effectiveness.`;
}

function profileApplicability(
  library: ReportLibraryScenario,
  current: ReportCausalInputProjection,
): ReportProfileApplicability {
  const binding = library.authoredProfileBinding;
  if (binding?.schemaVersion === "vector.authored-profile-binding.v1") {
    const derived = deriveReportProfileApplicability(
      binding.sourceCausalInputs,
      current,
    );
    return binding.applicability === derived ? derived : "UNVERIFIED_LEGACY";
  }
  const embeddedScenario = (library as ReportLibraryScenario & {
    scenario?: Scenario;
  }).scenario;
  return embeddedScenario
    ? deriveReportProfileApplicability(
        projectReportCausalInputs(embeddedScenario),
        current,
      )
    : "UNVERIFIED_LEGACY";
}

/**
 * Builds a report-only debrief from immutable runtime output and preserved
 * authored metadata. It never infers tactics, intent, or autonomous decisions
 * from geometry.
 */
export function buildCanonicalReportDebrief(
  result: SimulationResult,
  library: ReportLibraryScenario,
  scenario: Scenario,
): CanonicalReportDebrief {
  const engineScenario = result.engineRun.scenario;
  const events = result.engineRun.events.state === "AVAILABLE"
    ? result.engineRun.events.items
    : [];
  const blueDefinition = engineScenario.entities.find(
    (entity) => entity.kind === "AIRCRAFT" && entity.affiliation === "BLUE",
  );
  const redDefinition = engineScenario.entities.find(
    (entity) => entity.kind === "AIRCRAFT" && entity.affiliation === "RED",
  );
  const targetEffect = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
  const causalInputs = projectReportCausalInputs(scenario);
  const applicability = library.authoredProfile
    ? profileApplicability(library, causalInputs)
    : null;
  const profile = library.authoredProfile
    ? {
        schemaVersion: library.authoredProfile.schemaVersion,
        id: library.authoredProfile.id,
        label: library.authoredProfile.label,
        authority: library.authoredProfile.authority,
        applicability: applicability!,
        regime: engineScenario.airMission?.authored.regime ?? null,
        limitations: [...library.authoredProfile.limitations],
      }
    : null;
  const routeLegs = (["BLUE", "RED"] as const).flatMap((affiliation) => {
    const definition = affiliation === "BLUE" ? blueDefinition : redDefinition;
    const intents = affiliation === "BLUE"
      ? library.authoredProfile?.blue.legs ?? []
      : library.authoredProfile?.red.legs ?? [];
    return applicability === "MATCHED"
      ? intents.map((authoredIntent, legIndex) => {
          const transition = definition?.routePlan?.waypointTransitions?.[legIndex + 1];
          return {
            affiliation,
            legIndex,
            authoredIntent,
            compiledRole: affiliation === "BLUE"
              ? engineScenario.airMission?.flightPlan.legs[legIndex]?.role ?? null
              : null,
            transitionMethod: transition === "FLY_BY" || transition === "FLY_OVER"
              ? transition
              : null,
          };
        })
      : [];
  });
  const storeTransfers = events.flatMap((event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME"
    ? [{
        eventId: event.id,
        modelTimeSeconds: event.modelTimeSeconds,
        operation: event.payload.operation,
        launcherId: event.payload.launcherId,
        storeId: event.payload.storeId,
        accepted: event.payload.accepted,
        achieved: event.payload.achieved,
        cause: event.payload.cause,
      }]
    : []);
  const terminations = events.filter(
    (event) => event.payload.kind === "WEAPON_TERMINATED" &&
      event.payload.weaponId === result.engineRun.primaryWeaponId,
  );
  const termination = terminations.length === 1 && terminations[0].payload.kind === "WEAPON_TERMINATED"
    ? {
        eventId: terminations[0].id,
        modelTimeSeconds: terminations[0].modelTimeSeconds,
        weaponId: terminations[0].payload.weaponId,
        targetId: terminations[0].payload.targetId,
        terminalState: terminations[0].payload.to,
        cause: terminations[0].payload.cause,
        closestApproachM: terminations[0].payload.closestApproachM,
      }
    : null;
  const aircraft = [
    blueDefinition ? aircraftState(result, blueDefinition.id, "BLUE") : null,
    redDefinition ? aircraftState(result, redDefinition.id, "RED") : null,
  ].filter((state): state is DebriefAircraftState => state !== null);

  return {
    profile,
    causalInputs,
    routeLegs,
    achievedRouteTransitions: routeTransitions(result),
    launch: blueDefinition && redDefinition
      ? exactWorldEntry(
          result,
          result.engineRun.primaryWeaponId,
          blueDefinition.id,
          redDefinition.id,
        )
      : null,
    storeTransfers,
    weaponTermination: termination,
    weaponFlightStates: weaponFlightStates(result),
    observerStates: finalObserverStates(result),
    targetEffect,
    aircraft,
    closestAircraftApproach: closestAircraftApproach(
      result,
      blueDefinition?.id,
      redDefinition?.id,
    ),
    authoredTransitionGeometry: authoredTransitionGeometry(
      result,
      library,
      applicability,
      blueDefinition?.id,
      redDefinition?.id,
    ),
    finalAircraftSeparationM: aircraftSeparation(
      result,
      blueDefinition?.id,
      redDefinition?.id,
    ),
    explanation: effectExplanation(
      targetEffect,
      profile,
      blueDefinition?.designation,
      redDefinition?.designation,
    ),
  };
}
