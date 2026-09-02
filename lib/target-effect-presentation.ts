/**
 * Presentation-only structural boundary for a future canonical target-effect
 * event. It intentionally imports no engine contract: #196 can bind the
 * canonical event to this shape without making presentation an authority.
 */
export type TargetEffectClass =
  | "NO_EFFECT"
  | "DEGRADED"
  | "MISSION_KILL"
  | "KILL"
  | "EFFECT_UNAVAILABLE";

export type TargetEffectLifecycle =
  | "STOWED"
  | "ACTIVE"
  | "TRACKING"
  | "ENGAGING"
  | "TERMINATED";

export type StructuralTargetEffectAuthority =
  | {
      state: "ADMITTED";
      authorityId: string;
      authorityVersion: string;
      authorityDigest: string;
      modelId: string;
      modelVersion: string;
      modelDigest: string;
      modelPackDigest: string;
      targetProfileId: string;
      targetProfileVersion: string;
      intendedUseId: string;
      intendedUseVersion: string;
      valueState: "MODEL_ASSUMPTION";
      limitationIds: readonly string[];
    }
  | {
      state: "UNAVAILABLE";
      reason: string;
    };

type StructuralEffectBoundary = {
  eventId: string;
  frameIndex: number;
  modelTimeSeconds: number;
  causalWeaponTerminationEventId: string | null;
  weaponId: string;
  targetId: string;
  targetLifecycleBefore: TargetEffectLifecycle;
  targetLifecycleAfter: TargetEffectLifecycle;
  targetLifecycleAtEffectFrame: TargetEffectLifecycle;
};

export type StructuralTargetEffectRecord = StructuralEffectBoundary & {
  state: "RECORDED";
  effectClass: TargetEffectClass;
  effectReason: string;
  authority: StructuralTargetEffectAuthority;
};

export type StructuralNotModelledEffect = StructuralEffectBoundary & {
  state: "NOT_MODELLED";
};

export type StructuralTargetEffect =
  | StructuralTargetEffectRecord
  | StructuralNotModelledEffect
  | {
      state: "UNAVAILABLE";
      reason: string;
    };

export type StructuralSelectedFrame = {
  frameIndex: number;
  displayTimeSeconds: number;
};

export type SelectedTargetEffect =
  | {
      state: "BEFORE_EFFECT_BOUNDARY";
      displayFrameIndex: number;
      displayTimeSeconds: number;
      effectFrameIndex: number;
      effectTimeSeconds: number;
    }
  | (StructuralTargetEffectRecord & {
      displayFrameIndex: number;
      displayTimeSeconds: number;
    })
  | (StructuralNotModelledEffect & {
      displayFrameIndex: number;
      displayTimeSeconds: number;
    })
  | {
      state: "UNAVAILABLE";
      reason: string;
      displayFrameIndex: number;
      displayTimeSeconds: number;
    };

export type TargetEffectPresentation = {
  state: SelectedTargetEffect["state"];
  effectClass: TargetEffectClass | null;
  label: string;
  headline: string;
  compactHeadline: string;
  detail: string;
  tone: "neutral" | "caution" | "adverse";
  assumptionLabel: "MODEL_ASSUMPTION" | null;
  killClaimAuthorized: boolean;
};

function unavailable(
  selected: StructuralSelectedFrame,
  reason: string,
): SelectedTargetEffect {
  return {
    state: "UNAVAILABLE",
    reason,
    displayFrameIndex: selected.frameIndex,
    displayTimeSeconds: selected.displayTimeSeconds,
  };
}

function validSelectedFrame(selected: StructuralSelectedFrame) {
  return Number.isSafeInteger(selected.frameIndex) && selected.frameIndex >= 0 &&
    Number.isFinite(selected.displayTimeSeconds) && selected.displayTimeSeconds >= 0;
}

function nonBlank(value: string) {
  return value.trim().length > 0;
}

function validBoundary(effect: StructuralEffectBoundary) {
  return nonBlank(effect.eventId) &&
    nonBlank(effect.weaponId) &&
    nonBlank(effect.targetId) &&
    Number.isSafeInteger(effect.frameIndex) && effect.frameIndex >= 0 &&
    Number.isFinite(effect.modelTimeSeconds) && effect.modelTimeSeconds >= 0 &&
    effect.targetLifecycleAfter === effect.targetLifecycleAtEffectFrame;
}

function validAdmittedAuthority(
  authority: Extract<StructuralTargetEffectAuthority, { state: "ADMITTED" }>,
) {
  return nonBlank(authority.authorityId) &&
    nonBlank(authority.authorityVersion) &&
    /^[a-f0-9]{64}$/.test(authority.authorityDigest) &&
    nonBlank(authority.modelId) &&
    nonBlank(authority.modelVersion) &&
    /^[a-f0-9]{64}$/.test(authority.modelDigest) &&
    /^[a-f0-9]{64}$/.test(authority.modelPackDigest) &&
    nonBlank(authority.targetProfileId) &&
    nonBlank(authority.targetProfileVersion) &&
    nonBlank(authority.intendedUseId) &&
    nonBlank(authority.intendedUseVersion) &&
    authority.valueState === "MODEL_ASSUMPTION" &&
    authority.limitationIds.length > 0 &&
    authority.limitationIds.every(nonBlank);
}

function validEffectRecord(effect: StructuralTargetEffectRecord) {
  if (!validBoundary(effect)) return false;
  if (
    effect.causalWeaponTerminationEventId === null ||
    !nonBlank(effect.causalWeaponTerminationEventId) ||
    effect.eventId === effect.causalWeaponTerminationEventId
  ) return false;
  if (!nonBlank(effect.effectReason)) return false;
  if (effect.effectClass === "EFFECT_UNAVAILABLE") {
    if (effect.authority.state === "UNAVAILABLE") {
      return effect.effectReason === "AUTHORITY_UNAVAILABLE" &&
        nonBlank(effect.authority.reason);
    }
    return (
      effect.effectReason === "OUTSIDE_TARGET_DOMAIN" ||
      effect.effectReason === "TARGET_UNAVAILABLE"
    ) && validAdmittedAuthority(effect.authority);
  }
  return effect.authority.state === "ADMITTED" && validAdmittedAuthority(effect.authority);
}

/**
 * Projects one already-recorded effect against one exact retained display
 * frame. Frame ordering is authoritative; time is checked for agreement and is
 * never used to interpolate an effect.
 */
export function projectTargetEffectAtFrame(
  effect: StructuralTargetEffect,
  selected: StructuralSelectedFrame,
): SelectedTargetEffect {
  if (!validSelectedFrame(selected)) {
    return unavailable(
      {
        frameIndex: Number.isSafeInteger(selected.frameIndex) ? selected.frameIndex : 0,
        displayTimeSeconds: Number.isFinite(selected.displayTimeSeconds)
          ? selected.displayTimeSeconds
          : 0,
      },
      "SELECTED_FRAME_INVALID",
    );
  }
  if (effect.state === "UNAVAILABLE") {
    return unavailable(selected, nonBlank(effect.reason) ? effect.reason : "EFFECT_RECORD_UNAVAILABLE");
  }
  if (
    !validBoundary(effect) ||
    (effect.state === "RECORDED" && !validEffectRecord(effect)) ||
    (effect.state === "NOT_MODELLED" && effect.causalWeaponTerminationEventId !== null)
  ) {
    return unavailable(selected, "INCONSISTENT_EFFECT_RECORD");
  }

  const frameOrder = Math.sign(selected.frameIndex - effect.frameIndex);
  const timeOrder = Math.sign(selected.displayTimeSeconds - effect.modelTimeSeconds);
  if (frameOrder !== timeOrder) {
    return unavailable(selected, "EFFECT_FRAME_TIME_MISMATCH");
  }
  if (frameOrder < 0) {
    return {
      state: "BEFORE_EFFECT_BOUNDARY",
      displayFrameIndex: selected.frameIndex,
      displayTimeSeconds: selected.displayTimeSeconds,
      effectFrameIndex: effect.frameIndex,
      effectTimeSeconds: effect.modelTimeSeconds,
    };
  }
  return {
    ...effect,
    displayFrameIndex: selected.frameIndex,
    displayTimeSeconds: selected.displayTimeSeconds,
  };
}

function displayName(value: string | undefined, fallback: string) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

function displayLimitation(id: string) {
  if (id === "not-probability-of-kill") return "no outcome-probability model";
  return id.replaceAll("kill", "terminal-effect").replaceAll("-", " ");
}

/**
 * Converts the fail-closed selected projection into user-facing language.
 * Only the exact KILL/lifecycle conjunction can authorize kill wording.
 */
export function presentTargetEffect(
  selected: SelectedTargetEffect,
  names: { weapon?: string; target?: string } = {},
): TargetEffectPresentation {
  if (selected.state === "BEFORE_EFFECT_BOUNDARY") {
    return {
      state: selected.state,
      effectClass: null,
      label: "Effect pending",
      headline: "No target effect has occurred at this frame",
      compactHeadline: `Boundary ${selected.effectTimeSeconds.toFixed(3)} s`,
      detail: `The recorded effect boundary is frame ${selected.effectFrameIndex} at ${selected.effectTimeSeconds.toFixed(3)} s.`,
      tone: "neutral",
      assumptionLabel: null,
      killClaimAuthorized: false,
    };
  }
  if (selected.state === "NOT_MODELLED") {
    return {
      state: selected.state,
      effectClass: null,
      label: "Not modelled",
      headline: "Target effect was not modelled",
      compactHeadline: "No governed result",
      detail: "The recorded weapon termination carries no governed target-effect result, and the target lifecycle is unchanged by it.",
      tone: "caution",
      assumptionLabel: null,
      killClaimAuthorized: false,
    };
  }
  if (selected.state === "UNAVAILABLE") {
    return {
      state: selected.state,
      effectClass: null,
      label: "Record unavailable",
      headline: "Target-effect evidence is unavailable",
      compactHeadline: "Evidence unavailable",
      detail: `The selected frame cannot present a governed target-effect result (${selected.reason}).`,
      tone: "caution",
      assumptionLabel: null,
      killClaimAuthorized: false,
    };
  }

  const assumptionDetail = selected.authority.state === "ADMITTED"
    ? `Recorded reason: ${selected.effectReason}. Generic educational model ${selected.authority.modelId}@${selected.authority.modelVersion}; target profile ${selected.authority.targetProfileId}@${selected.authority.targetProfileVersion}; MODEL_ASSUMPTION limitations: ${selected.authority.limitationIds.map(displayLimitation).join(", ")}.`
    : `Recorded reason: ${selected.effectReason}. No admitted effect authority was available (${selected.authority.reason}).`;
  const common = {
    state: selected.state,
    effectClass: selected.effectClass,
    assumptionLabel: selected.authority.state === "ADMITTED"
      ? "MODEL_ASSUMPTION" as const
      : null,
    killClaimAuthorized: false,
  };

  if (selected.effectClass === "NO_EFFECT") {
    return {
      ...common,
      label: "No modeled effect",
      headline: "The target retained its recorded capability state",
      compactHeadline: "No effect recorded",
      detail: assumptionDetail,
      tone: "neutral",
    };
  }
  if (selected.effectClass === "DEGRADED") {
    return {
      ...common,
      label: "Target degraded",
      headline: "The model recorded degraded target capability",
      compactHeadline: "Capability degraded",
      detail: assumptionDetail,
      tone: "caution",
    };
  }
  if (selected.effectClass === "MISSION_KILL") {
    return {
      ...common,
      label: "Mission-disabled",
      headline: "The model recorded loss of mission capability",
      compactHeadline: "Mission capability lost",
      detail: assumptionDetail,
      tone: "adverse",
    };
  }
  if (selected.effectClass === "EFFECT_UNAVAILABLE") {
    return {
      ...common,
      label: "Effect unavailable",
      headline: "No governed target-effect result is available",
      compactHeadline: "Governed result unavailable",
      detail: assumptionDetail,
      tone: "caution",
    };
  }

  const authorized = selected.targetLifecycleAfter === "TERMINATED" &&
    selected.targetLifecycleAtEffectFrame === "TERMINATED";
  if (!authorized) {
    return {
      state: "UNAVAILABLE",
      effectClass: null,
      label: "Record unavailable",
      headline: "Target-effect evidence is unavailable",
      compactHeadline: "Evidence unavailable",
      detail: "The recorded terminal-effect class does not agree with the target lifecycle at the exact effect frame.",
      tone: "caution",
      assumptionLabel: null,
      killClaimAuthorized: false,
    };
  }
  const weapon = displayName(names.weapon, "The recorded weapon");
  const target = displayName(names.target, "the recorded target");
  return {
    ...common,
    label: "Modeled kill",
    headline: `${weapon} scored a modeled kill against ${target}`,
    compactHeadline: `${target} terminated at effect frame`,
    detail: assumptionDetail,
    tone: "adverse",
    killClaimAuthorized: true,
  };
}
