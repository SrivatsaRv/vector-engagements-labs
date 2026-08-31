import type {
  EngineEntityDefinition,
  EngineEntityFrame,
} from "../engine/contracts.ts";
import type { Frame, RaspTrack, SimulationResult } from "../simulation.ts";
import {
  presentTargetEffect,
  projectTargetEffectAtFrame,
  type SelectedTargetEffect,
  type StructuralTargetEffect,
  type TargetEffectPresentation,
} from "../target-effect-presentation.ts";

export type SelectedDisplayFrame = {
  frame: Frame;
  frameIndex: number;
  displayTimeSeconds: number;
};

export type AirborneStoreTransferOutcome = {
  eventId: string;
  frameIndex: number;
  modelTimeSeconds: number;
  launcherId: string;
  storeId: string;
  stationId: string;
  operation: "RELEASE" | "JETTISON";
  requested: true;
  accepted: boolean;
  achieved: boolean;
  limiter: "NONE" | "AIRCRAFT_STATE" | "STORE_INVENTORY" | "DRAG_AUTHORITY";
  cause: "AIRBORNE_TRANSFER_ADMITTED" | "AIRCRAFT_NOT_ENROUTE" | "STORE_NOT_INSTALLED" | "INSTALLED_DRAG_EXCEEDED";
  transferDigest: string;
};

/** Reads only the canonical event stream up to the selected retained frame. */
export function selectAirborneStoreTransferOutcomes(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
): AirborneStoreTransferOutcome[] {
  const events = result.engineRun.events.state === "AVAILABLE"
    ? result.engineRun.events.items
    : [];
  return events.flatMap((event) => {
    if (
      event.payload.kind !== "AIRBORNE_STORE_TRANSFER_OUTCOME" ||
      event.frameIndex > selected.frameIndex
    ) return [];
    return [{
      eventId: event.id,
      frameIndex: event.frameIndex,
      modelTimeSeconds: event.modelTimeSeconds,
      launcherId: event.payload.launcherId,
      storeId: event.payload.storeId,
      stationId: event.payload.stationId,
      operation: event.payload.operation,
      requested: event.payload.requested,
      accepted: event.payload.accepted,
      achieved: event.payload.achieved,
      limiter: event.payload.limiter,
      cause: event.payload.cause,
      transferDigest: event.payload.transferDigest,
    }];
  });
}

export type RouteTransitionState =
  | {
      state: "ACTIVE";
      entityId: string;
      designation: string;
      displayTimeSeconds: number;
      frameIndex: number;
      routeSchemaVersion: "vector.route-plan.v1" | "vector.route-plan.v2";
      semantics: "LEGACY_ALL_FLY_BY" | "DECLARED";
      waypointIndex: number;
      waypointCount: number;
      transition: "FLY_BY" | "FLY_OVER";
      acceptanceRadiusM: number | null;
      limiter: NonNullable<EngineEntityFrame["aircraftControl"]>["limiter"];
    }
  | {
      state: "COMPLETE";
      entityId: string;
      designation: string;
      displayTimeSeconds: number;
      frameIndex: number;
      routeSchemaVersion: "vector.route-plan.v1" | "vector.route-plan.v2";
      semantics: "LEGACY_ALL_FLY_BY" | "DECLARED";
      waypointCount: number;
    }
  | {
      state: "UNAVAILABLE";
      entityId: string;
      designation: string;
      displayTimeSeconds: number;
      frameIndex: number;
      reason:
        | "ROUTE_NOT_COMPILED"
        | "ROUTE_CONTROL_NOT_RECORDED"
        | "ROUTE_POINT_NOT_RECORDED"
        | "ROUTE_TRANSITION_NOT_RECORDED";
    };

/**
 * Presents the route transition that the engine recorded as active at the
 * selected display frame. The selector reads the immutable compiled route and
 * frame-owned route-point index; it never advances a route or estimates a turn.
 */
export function selectRouteTransitionStates(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
): RouteTransitionState[] {
  return result.engineRun.scenario.entities
    .filter((definition) => definition.kind === "AIRCRAFT")
    .map((definition): RouteTransitionState => {
      const frameEntity = selected.frame.entities.find(
        (entity) => entity.id === definition.id,
      );
      const common = {
        entityId: definition.id,
        designation: definition.designation,
        displayTimeSeconds: selected.displayTimeSeconds,
        frameIndex: selected.frameIndex,
      };
      const route = definition.route;
      const routePlan = definition.routePlan;
      if (!route || !routePlan || route.length !== routePlan.waypointAcceptanceRadiiM.length) {
        return { ...common, state: "UNAVAILABLE", reason: "ROUTE_NOT_COMPILED" };
      }
      if (!frameEntity?.aircraftControl) {
        return { ...common, state: "UNAVAILABLE", reason: "ROUTE_CONTROL_NOT_RECORDED" };
      }
      const { routePointIndex } = frameEntity.aircraftControl;
      const semantics = routePlan.schemaVersion === "vector.route-plan.v1"
        ? "LEGACY_ALL_FLY_BY"
        : "DECLARED";
      if (routePointIndex === null || frameEntity.aircraftControl.limiter === "ROUTE_COMPLETE") {
        return {
          ...common,
          state: "COMPLETE",
          routeSchemaVersion: routePlan.schemaVersion,
          semantics,
          waypointCount: route.length,
        };
      }
      if (!Number.isInteger(routePointIndex) || routePointIndex <= 0 || routePointIndex >= route.length) {
        return { ...common, state: "UNAVAILABLE", reason: "ROUTE_POINT_NOT_RECORDED" };
      }
      const transition = routePlan.schemaVersion === "vector.route-plan.v1"
        ? "FLY_BY"
        : routePlan.waypointTransitions?.[routePointIndex];
      if (transition !== "FLY_BY" && transition !== "FLY_OVER") {
        return { ...common, state: "UNAVAILABLE", reason: "ROUTE_TRANSITION_NOT_RECORDED" };
      }
      return {
        ...common,
        state: "ACTIVE",
        routeSchemaVersion: routePlan.schemaVersion,
        semantics,
        waypointIndex: routePointIndex,
        waypointCount: route.length,
        transition,
        acceptanceRadiusM: transition === "FLY_BY"
          ? routePlan.waypointAcceptanceRadiiM[routePointIndex] ?? null
          : null,
        limiter: frameEntity.aircraftControl.limiter,
      };
    });
}

export function selectDisplayFrame(
  result: SimulationResult,
  requestedTimeSeconds: number,
): SelectedDisplayFrame {
  if (!result.frames.length) {
    throw new Error("A display frame cannot be selected from an empty record.");
  }
  const requested = Number.isFinite(requestedTimeSeconds)
    ? requestedTimeSeconds
    : result.frames[0].t;
  let frameIndex = 0;
  for (let index = 1; index < result.frames.length; index += 1) {
    if (
      Math.abs(result.frames[index].t - requested) <
      Math.abs(result.frames[frameIndex].t - requested)
    ) {
      frameIndex = index;
    }
  }
  const frame = result.frames[frameIndex];
  return { frame, frameIndex, displayTimeSeconds: frame.t };
}

export type CanonicalTargetEffectSelection = {
  projection: SelectedTargetEffect;
  presentation: TargetEffectPresentation;
  eventId: string | null;
  weaponId: string | null;
  targetId: string | null;
};

function unavailableTargetEffect(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
  reason: string,
): CanonicalTargetEffectSelection {
  const projection = projectTargetEffectAtFrame(
    { state: "UNAVAILABLE", reason },
    selected,
  );
  return {
    projection,
    presentation: presentTargetEffect(projection),
    eventId: null,
    weaponId: result.engineRun.primaryWeaponId || null,
    targetId: result.engineRun.primaryTargetId || null,
  };
}

/**
 * Binds target-effect presentation to one canonical event and the exact
 * retained target frame carrying the same committed identity. Geometry,
 * display labels and nearest distance never supply an effect classification.
 */
export function selectCanonicalTargetEffect(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
): CanonicalTargetEffectSelection {
  if (result.engineRun.events.state !== "AVAILABLE") {
    return unavailableTargetEffect(
      result,
      selected,
      result.engineRun.events.reason,
    );
  }
  const events = result.engineRun.events.items;
  const committed = events.filter((event) =>
    event.payload.kind === "TARGET_EFFECT_COMMITTED" &&
    event.payload.commit.weaponId === result.engineRun.primaryWeaponId &&
    event.payload.commit.targetId === result.engineRun.primaryTargetId
  );
  if (committed.length > 1) {
    return unavailableTargetEffect(result, selected, "AMBIGUOUS_TARGET_EFFECT_EVENTS");
  }

  let structural: StructuralTargetEffect;
  let eventId: string;
  let weaponId: string;
  let targetId: string;
  if (committed.length === 1) {
    const event = committed[0];
    if (event.payload.kind !== "TARGET_EFFECT_COMMITTED") {
      return unavailableTargetEffect(result, selected, "TARGET_EFFECT_EVENT_INVALID");
    }
    const payload = event.payload;
    const commit = payload.commit;
    const causalEvent = event.causeEventIds.length === 1
      ? events.find((candidate) => candidate.id === event.causeEventIds[0])
      : undefined;
    const effectFrame = result.frames[event.frameIndex];
    const targetAtEffectFrame = effectFrame?.entities.find(
      (entity) => entity.id === commit.targetId,
    );
    const authority = result.engineRun.scenario.targetEffectAuthority;
    if (!authority) {
      return unavailableTargetEffect(result, selected, "TARGET_EFFECT_AUTHORITY_UNRESOLVED");
    }
    const causalAgreement = causalEvent?.payload.kind === "WEAPON_TERMINATED" &&
      causalEvent.payload.weaponId === commit.weaponId &&
      causalEvent.payload.targetId === commit.targetId &&
      causalEvent.payload.cause === commit.terminationReceipt.cause &&
      causalEvent.tick === commit.terminationReceipt.tick &&
      causalEvent.tick === event.tick &&
      causalEvent.frameIndex === event.frameIndex &&
      causalEvent.localKey === commit.terminationReceipt.localKey &&
      causalEvent.modelTimeSeconds === commit.terminationReceipt.modelTimeSeconds &&
      causalEvent.modelTimeSeconds === event.modelTimeSeconds;
    const frameAgreement = effectFrame?.t === event.modelTimeSeconds &&
      targetAtEffectFrame?.lifecycle === commit.targetLifecycleAfter &&
      targetAtEffectFrame?.targetEffect?.commitId === commit.commitId &&
      targetAtEffectFrame.targetEffect.state === commit.result &&
      commit.targetEffectStateAfter === commit.result;
    const authorityAgreement = authority.id === payload.authorityId &&
      authority.version === payload.authorityVersion &&
      commit.modelPackDigest === authority.digest;
    if (!causalAgreement || !frameAgreement || !authorityAgreement) {
      return unavailableTargetEffect(result, selected, "INCONSISTENT_CANONICAL_TARGET_EFFECT");
    }

    const model = commit.valueState === "MODEL_ASSUMPTION"
      ? authority.models.find((candidate) =>
          candidate.id === commit.modelId &&
          candidate.version === commit.modelVersion &&
          candidate.digest === commit.modelDigest &&
          candidate.intendedUse.id === commit.intendedUseId &&
          candidate.intendedUse.version === commit.intendedUseVersion &&
          candidate.targetProfile.id === commit.targetProfileId &&
          candidate.targetProfile.version === commit.targetProfileVersion
        )
      : undefined;
    if (
      (commit.valueState === "MODEL_ASSUMPTION" && !model) ||
      (commit.valueState === "UNAVAILABLE" && commit.reason !== "AUTHORITY_UNAVAILABLE") ||
      (commit.result !== "EFFECT_UNAVAILABLE" && !model)
    ) {
      return unavailableTargetEffect(result, selected, "TARGET_EFFECT_AUTHORITY_UNRESOLVED");
    }
    const admittedAuthority = model
      ? {
          state: "ADMITTED" as const,
          authorityId: authority.id,
          authorityVersion: authority.version,
          authorityDigest: authority.digest,
          modelId: model.id,
          modelVersion: model.version,
          modelDigest: model.digest,
          modelPackDigest: commit.modelPackDigest,
          targetProfileId: model.targetProfile.id,
          targetProfileVersion: model.targetProfile.version,
          intendedUseId: model.intendedUse.id,
          intendedUseVersion: model.intendedUse.version,
          valueState: "MODEL_ASSUMPTION" as const,
          limitationIds: model.limitationIds,
        }
      : null;
    structural = {
      state: "RECORDED",
      eventId: event.id,
      frameIndex: event.frameIndex,
      modelTimeSeconds: event.modelTimeSeconds,
      causalWeaponTerminationEventId: causalEvent.id,
      weaponId: commit.weaponId,
      targetId: commit.targetId,
      targetLifecycleBefore: commit.targetLifecycleBefore,
      targetLifecycleAfter: commit.targetLifecycleAfter,
      targetLifecycleAtEffectFrame: targetAtEffectFrame.lifecycle,
      effectClass: commit.result,
      effectReason: commit.reason,
      authority: admittedAuthority ?? { state: "UNAVAILABLE", reason: commit.reason },
    };
    eventId = event.id;
    weaponId = commit.weaponId;
    targetId = commit.targetId;
  } else {
    const legacy = events.filter((event) =>
      event.payload.kind === "WEAPON_TERMINATED" &&
      event.payload.weaponId === result.engineRun.primaryWeaponId &&
      event.payload.targetId === result.engineRun.primaryTargetId &&
      event.payload.targetEffect === "NOT_MODELLED"
    );
    if (legacy.length !== 1) {
      return unavailableTargetEffect(
        result,
        selected,
        legacy.length > 1 ? "AMBIGUOUS_LEGACY_TARGET_EFFECT_EVENTS" : "NO_TARGET_EFFECT_EVENT",
      );
    }
    const event = legacy[0];
    const effectFrame = result.frames[event.frameIndex];
    const targetAtEffectFrame = effectFrame?.entities.find(
      (entity) => entity.id === result.engineRun.primaryTargetId,
    );
    const previousTarget = result.frames[event.frameIndex - 1]?.entities.find(
      (entity) => entity.id === result.engineRun.primaryTargetId,
    );
    if (
      effectFrame?.t !== event.modelTimeSeconds ||
      !targetAtEffectFrame ||
      targetAtEffectFrame.targetEffect !== undefined ||
      previousTarget?.lifecycle !== targetAtEffectFrame.lifecycle
    ) {
      return unavailableTargetEffect(result, selected, "INCONSISTENT_LEGACY_TARGET_EFFECT");
    }
    structural = {
      state: "NOT_MODELLED",
      eventId: event.id,
      frameIndex: event.frameIndex,
      modelTimeSeconds: event.modelTimeSeconds,
      causalWeaponTerminationEventId: null,
      weaponId: result.engineRun.primaryWeaponId,
      targetId: result.engineRun.primaryTargetId,
      targetLifecycleBefore: previousTarget.lifecycle,
      targetLifecycleAfter: targetAtEffectFrame.lifecycle,
      targetLifecycleAtEffectFrame: targetAtEffectFrame.lifecycle,
    };
    eventId = event.id;
    weaponId = result.engineRun.primaryWeaponId;
    targetId = result.engineRun.primaryTargetId;
  }

  const projection = projectTargetEffectAtFrame(structural, selected);
  const weapon = result.entityManifest.find((entity) => entity.id === weaponId);
  const target = result.entityManifest.find((entity) => entity.id === targetId);
  return {
    projection,
    presentation: presentTargetEffect(projection, {
      weapon: weapon?.designation,
      target: target?.designation,
    }),
    eventId,
    weaponId,
    targetId,
  };
}

export type EntityMetricSeries = {
  id: string;
  label: string;
  affiliation: EngineEntityFrame["affiliation"];
  kind: EngineEntityFrame["kind"];
  values: Array<number | null>;
  current: number | null;
};

export function selectEntityMetricSeries(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
  metric: (entity: EngineEntityFrame) => number,
  include: (entity: EngineEntityDefinition) => boolean = () => true,
): EntityMetricSeries[] {
  const identities = result.entityManifest.filter(include);
  return identities.map((identity) => {
    const values = result.frames.map((sample) => {
      const state = sample.entities.find((entity) => entity.id === identity.id);
      if (!state || state.lifecycle === "STOWED") return null;
      const value = metric(state);
      return Number.isFinite(value) ? value : null;
    });
    return {
      id: identity.id,
      label: identity.designation,
      affiliation: identity.affiliation,
      kind: identity.kind,
      values,
      current: values[selected.frameIndex] ?? null,
    };
  });
}

export type SelectedTrackState =
  | {
      state: "AVAILABLE";
      track: RaspTrack;
      displayTimeSeconds: number;
    }
  | {
      state: "UNAVAILABLE";
      perspective: "IAF" | "PAF";
      displayTimeSeconds: number;
      reason: "PICTURE_NOT_RECORDED";
    };

/**
 * Select one recorded, side-owned picture sample for the already selected
 * frame. This selector never derives a track, position, confidence, or value.
 */
export function selectRecordedTrackState(
  pictures: readonly RaspTrack[],
  selected: SelectedDisplayFrame,
  perspective: "IAF" | "PAF",
): SelectedTrackState {
  const track = pictures.find(
    (candidate) =>
      candidate.perspective === perspective &&
      candidate.modelTimeSeconds === selected.displayTimeSeconds,
  );
  if (!track) {
    return {
      state: "UNAVAILABLE",
      perspective,
      displayTimeSeconds: selected.displayTimeSeconds,
      reason: "PICTURE_NOT_RECORDED",
    };
  }
  return {
    state: "AVAILABLE",
    track,
    displayTimeSeconds: selected.displayTimeSeconds,
  };
}

export type ObserverEntityPresentation =
  | { state: "MODEL_TRUTH" }
  | { state: "HIDDEN" };

/**
 * Decides whether an entity may appear in a side-owned observer picture.
 * A track without an admitted visible estimate fails closed. Callers that did
 * not select an observer picture retain the separate Model Truth view.
 */
export function selectObserverEntityPresentation(
  track: RaspTrack | undefined,
  entityId: string,
): ObserverEntityPresentation {
  void entityId;
  if (!track) return { state: "MODEL_TRUTH" };
  // The only admitted observer state is explicitly unavailable. Do not use a
  // selected air-picture surface as permission to show world-truth entities.
  return { state: "HIDDEN" };
}

export type SelectedGeometry =
  | {
      state: "AVAILABLE";
      /** The exact recorded frame consumed by every value in this view. */
      displayTimeSeconds: number;
      frameIndex: number;
      relationship: "WEAPON_TO_TARGET" | "AIRCRAFT_TO_TARGET";
      rangeMeters: number;
      closureRateMps: number;
      lineOfSightRateRadS: number;
      aircraft?: {
        operationalState: NonNullable<EngineEntityFrame["aircraftOperationalState"]>;
        movementValueState: NonNullable<EngineEntityFrame["aircraftMovementValueState"]>;
        movementUnavailableReason?: NonNullable<EngineEntityFrame["aircraftMovementUnavailableReason"]>;
      };
      weapon:
        | {
            state: "AVAILABLE";
            speedMps: number;
            mach: number;
            flightState: NonNullable<EngineEntityFrame["weaponFlightState"]>;
          }
        | { state: "UNAVAILABLE"; reason: "NOT_LAUNCHED" };
    }
  | {
      state: "UNAVAILABLE";
      displayTimeSeconds: number;
      frameIndex: number;
      reason:
        | "TARGET_NOT_RECORDED"
        | "LAUNCH_PLATFORM_NOT_RECORDED"
        | "GEOMETRY_NOT_FINITE";
      weapon: { state: "UNAVAILABLE"; reason: "NOT_LAUNCHED" | "NOT_RECORDED" };
    };

function finite(...values: number[]) {
  return values.every(Number.isFinite);
}

/**
 * Selects geometry strictly from one recorded display frame. A launched weapon
 * uses the engine-recorded weapon-to-target values. Before launch, only the
 * aircraft-to-target relationship can be derived from recorded aircraft
 * states; weapon speed, Mach, and phase stay explicitly unavailable.
 */
export function selectCurrentGeometry(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
): SelectedGeometry {
  const { frame } = selected;
  const unavailable = (
    reason: Extract<SelectedGeometry, { state: "UNAVAILABLE" }>["reason"],
    weaponReason: "NOT_LAUNCHED" | "NOT_RECORDED",
  ): SelectedGeometry => ({
    state: "UNAVAILABLE",
    displayTimeSeconds: selected.displayTimeSeconds,
    frameIndex: selected.frameIndex,
    reason,
    weapon: { state: "UNAVAILABLE", reason: weaponReason },
  });
  const target = frame.entities.find(
    (entity) => entity.id === result.engineRun.primaryTargetId,
  );
  if (!target) return unavailable("TARGET_NOT_RECORDED", "NOT_RECORDED");

  const weapon = frame.entities.find(
    (entity) => entity.id === result.engineRun.primaryWeaponId,
  );
  if (weapon) {
    if (
      !finite(
        frame.range,
        frame.closureRate,
        frame.losRate,
        weapon.speedMps,
        weapon.mach,
      ) || !weapon.weaponFlightState
    ) {
      return unavailable("GEOMETRY_NOT_FINITE", "NOT_RECORDED");
    }
    return {
      state: "AVAILABLE",
      displayTimeSeconds: selected.displayTimeSeconds,
      frameIndex: selected.frameIndex,
      relationship: "WEAPON_TO_TARGET",
      rangeMeters: frame.range,
      closureRateMps: frame.closureRate,
      lineOfSightRateRadS: frame.losRate,
      weapon: {
        state: "AVAILABLE",
        speedMps: weapon.speedMps,
        mach: weapon.mach,
        flightState: weapon.weaponFlightState,
      },
    };
  }

  const weaponDefinition = result.entityManifest.find(
    (entity) => entity.id === result.engineRun.primaryWeaponId,
  );
  const launcher = weaponDefinition?.weapon
    ? frame.entities.find(
        (entity) => entity.id === weaponDefinition.weapon?.launchPlatformId,
      )
    : undefined;
  if (!launcher) return unavailable("LAUNCH_PLATFORM_NOT_RECORDED", "NOT_LAUNCHED");

  const relativePosition = {
    x: target.position.x - launcher.position.x,
    y: target.position.y - launcher.position.y,
    z: target.position.z - launcher.position.z,
  };
  const relativeVelocity = {
    x: target.velocity.x - launcher.velocity.x,
    y: target.velocity.y - launcher.velocity.y,
    z: target.velocity.z - launcher.velocity.z,
  };
  const rangeMeters = Math.hypot(
    relativePosition.x,
    relativePosition.y,
    relativePosition.z,
  );
  if (!finite(rangeMeters) || rangeMeters <= 0) {
    return unavailable("GEOMETRY_NOT_FINITE", "NOT_LAUNCHED");
  }
  const lineOfSight = {
    x: relativePosition.x / rangeMeters,
    y: relativePosition.y / rangeMeters,
    z: relativePosition.z / rangeMeters,
  };
  const closureRateMps = -(
    relativeVelocity.x * lineOfSight.x +
    relativeVelocity.y * lineOfSight.y +
    relativeVelocity.z * lineOfSight.z
  );
  const cross = {
    x: relativePosition.y * relativeVelocity.z - relativePosition.z * relativeVelocity.y,
    y: relativePosition.z * relativeVelocity.x - relativePosition.x * relativeVelocity.z,
    z: relativePosition.x * relativeVelocity.y - relativePosition.y * relativeVelocity.x,
  };
  const lineOfSightRateRadS = Math.hypot(cross.x, cross.y, cross.z) / (rangeMeters * rangeMeters);
  if (!finite(closureRateMps, lineOfSightRateRadS)) {
    return unavailable("GEOMETRY_NOT_FINITE", "NOT_LAUNCHED");
  }
  return {
    state: "AVAILABLE",
    displayTimeSeconds: selected.displayTimeSeconds,
    frameIndex: selected.frameIndex,
    relationship: "AIRCRAFT_TO_TARGET",
    rangeMeters,
    closureRateMps,
    lineOfSightRateRadS,
    ...(launcher.aircraftOperationalState && launcher.aircraftMovementValueState
      ? {
          aircraft: {
            operationalState: launcher.aircraftOperationalState,
            movementValueState: launcher.aircraftMovementValueState,
            ...(launcher.aircraftMovementUnavailableReason
              ? { movementUnavailableReason: launcher.aircraftMovementUnavailableReason }
              : {}),
          },
        }
      : {}),
    weapon: { state: "UNAVAILABLE" as const, reason: "NOT_LAUNCHED" as const },
  };
}
