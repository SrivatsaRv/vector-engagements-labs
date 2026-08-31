import assert from "node:assert/strict";
import test from "node:test";
import {
  presentTargetEffect,
  projectTargetEffectAtFrame,
} from "../lib/target-effect-presentation.ts";

const boundary = {
  eventId: "event-effect-1",
  frameIndex: 12,
  modelTimeSeconds: 6,
  causalWeaponTerminationEventId: "event-weapon-1",
  weaponId: "weapon-blue",
  targetId: "aircraft-red",
  targetLifecycleBefore: "ACTIVE",
  targetLifecycleAfter: "ACTIVE",
  targetLifecycleAtEffectFrame: "ACTIVE",
};

const admittedAuthority = {
  state: "ADMITTED",
  authorityId: "generic-target-effect-authority",
  authorityVersion: "1.0.0",
  authorityDigest: "b".repeat(64),
  modelId: "generic-target-effect-study",
  modelVersion: "1.0.0",
  modelDigest: "c".repeat(64),
  modelPackDigest: "a".repeat(64),
  targetProfileId: "generic-fighter-study",
  targetProfileVersion: "1.0.0",
  intendedUseId: "vector.intended-use.generic-target-effect-study",
  intendedUseVersion: "1.0.0",
  valueState: "MODEL_ASSUMPTION",
  limitationIds: ["not-named-system-effectiveness", "not-probability-of-kill"],
};

function recorded(effectClass, overrides = {}) {
  return {
    ...boundary,
    state: "RECORDED",
    effectClass,
    effectReason: effectClass === "EFFECT_UNAVAILABLE"
      ? "AUTHORITY_UNAVAILABLE"
      : effectClass === "NO_EFFECT"
        ? "ABOVE_EFFECT_BANDS"
        : "THRESHOLD_BAND",
    authority: effectClass === "EFFECT_UNAVAILABLE"
      ? { state: "UNAVAILABLE", reason: "EFFECT_AUTHORITY_NOT_ADMITTED" }
      : admittedAuthority,
    ...overrides,
  };
}

const exactFrame = { frameIndex: 12, displayTimeSeconds: 6 };

test("all five closed outcomes have distinct presentation and only KILL uses kill wording", () => {
  const presentations = [
    "NO_EFFECT",
    "DEGRADED",
    "MISSION_KILL",
    "KILL",
    "EFFECT_UNAVAILABLE",
  ].map((effectClass) => {
    const effect = effectClass === "KILL"
      ? recorded(effectClass, {
          targetLifecycleAfter: "TERMINATED",
          targetLifecycleAtEffectFrame: "TERMINATED",
        })
      : recorded(effectClass);
    return presentTargetEffect(
      projectTargetEffectAtFrame(effect, exactFrame),
      { weapon: "Blue weapon", target: "Red aircraft" },
    );
  });

  assert.equal(new Set(presentations.map((item) => item.label)).size, 5);
  assert.deepEqual(
    presentations.map((item) => item.effectClass),
    ["NO_EFFECT", "DEGRADED", "MISSION_KILL", "KILL", "EFFECT_UNAVAILABLE"],
  );
  for (const presentation of presentations.filter((item) => item.effectClass !== "KILL")) {
    assert.doesNotMatch(
      `${presentation.label} ${presentation.headline} ${presentation.detail}`,
      /\bkill(?:ed)?\b/i,
    );
    assert.equal(presentation.killClaimAuthorized, false);
  }
  const kill = presentations.find((item) => item.effectClass === "KILL");
  assert.equal(kill.killClaimAuthorized, true);
  assert.match(kill.headline, /Blue weapon scored a modeled kill against Red aircraft/);
  assert.equal(kill.assumptionLabel, "MODEL_ASSUMPTION");
});

test("KILL wording requires KILL plus terminated after-lifecycle plus terminated event-frame target", () => {
  const inconsistent = [
    recorded("KILL"),
    recorded("KILL", {
      targetLifecycleAfter: "TERMINATED",
      targetLifecycleAtEffectFrame: "ACTIVE",
    }),
    recorded("KILL", {
      targetLifecycleAfter: "ACTIVE",
      targetLifecycleAtEffectFrame: "TERMINATED",
    }),
  ];
  for (const effect of inconsistent) {
    const presentation = presentTargetEffect(
      projectTargetEffectAtFrame(effect, exactFrame),
    );
    assert.equal(presentation.killClaimAuthorized, false);
    assert.doesNotMatch(
      `${presentation.label} ${presentation.headline} ${presentation.detail}`,
      /\bkill(?:ed)?\b/i,
    );
  }
});

test("an eventual recorded KILL cannot appear before its exact effect frame", () => {
  const effect = recorded("KILL", {
    targetLifecycleAfter: "TERMINATED",
    targetLifecycleAtEffectFrame: "TERMINATED",
  });
  const before = projectTargetEffectAtFrame(effect, {
    frameIndex: 11,
    displayTimeSeconds: 5.5,
  });
  assert.equal(before.state, "BEFORE_EFFECT_BOUNDARY");
  const presentation = presentTargetEffect(before);
  assert.equal(presentation.killClaimAuthorized, false);
  assert.doesNotMatch(
    `${presentation.label} ${presentation.headline} ${presentation.detail}`,
    /\bkill(?:ed)?\b/i,
  );

  const atBoundary = presentTargetEffect(
    projectTargetEffectAtFrame(effect, exactFrame),
  );
  assert.equal(atBoundary.killClaimAuthorized, true);
});

test("NOT_MODELLED and unavailable records remain explicit and never promote geometry", () => {
  const notModelled = presentTargetEffect(projectTargetEffectAtFrame({
    ...boundary,
    state: "NOT_MODELLED",
    causalWeaponTerminationEventId: null,
  }, exactFrame));
  assert.equal(notModelled.state, "NOT_MODELLED");
  assert.equal(notModelled.label, "Not modelled");
  assert.equal(notModelled.killClaimAuthorized, false);

  const unavailable = presentTargetEffect(projectTargetEffectAtFrame({
    state: "UNAVAILABLE",
    reason: "LEGACY_EVENT_SCHEMA",
  }, exactFrame));
  assert.equal(unavailable.state, "UNAVAILABLE");
  assert.equal(unavailable.label, "Record unavailable");
  assert.match(unavailable.detail, /LEGACY_EVENT_SCHEMA/);

  for (const presentation of [notModelled, unavailable]) {
    assert.doesNotMatch(
      `${presentation.label} ${presentation.headline} ${presentation.detail}`,
      /\bkill(?:ed)?\b/i,
    );
  }
});

test("EFFECT_UNAVAILABLE distinguishes absent authority from admitted-model domain limits", () => {
  const authorityUnavailable = presentTargetEffect(
    projectTargetEffectAtFrame(recorded("EFFECT_UNAVAILABLE"), exactFrame),
  );
  assert.equal(authorityUnavailable.assumptionLabel, null);
  assert.match(authorityUnavailable.detail, /AUTHORITY_UNAVAILABLE/);
  assert.match(authorityUnavailable.detail, /No admitted effect authority/);

  for (const effectReason of ["OUTSIDE_TARGET_DOMAIN", "TARGET_UNAVAILABLE"]) {
    const admittedUnavailable = presentTargetEffect(projectTargetEffectAtFrame(
      recorded("EFFECT_UNAVAILABLE", {
        effectReason,
        authority: admittedAuthority,
      }),
      exactFrame,
    ));
    assert.equal(admittedUnavailable.effectClass, "EFFECT_UNAVAILABLE");
    assert.equal(admittedUnavailable.assumptionLabel, "MODEL_ASSUMPTION");
    assert.match(admittedUnavailable.detail, new RegExp(effectReason));
    assert.match(admittedUnavailable.detail, /MODEL_ASSUMPTION limitations:/);
    assert.equal(admittedUnavailable.killClaimAuthorized, false);
    assert.doesNotMatch(
      `${admittedUnavailable.label} ${admittedUnavailable.headline} ${admittedUnavailable.detail}`,
      /\bkill(?:ed)?\b/i,
    );
  }
});

test("frame/time disagreement and malformed admitted authority fail closed", () => {
  const mismatchedTime = projectTargetEffectAtFrame(recorded("NO_EFFECT"), {
    frameIndex: 12,
    displayTimeSeconds: 6.1,
  });
  assert.deepEqual(
    { state: mismatchedTime.state, reason: mismatchedTime.reason },
    { state: "UNAVAILABLE", reason: "EFFECT_FRAME_TIME_MISMATCH" },
  );

  const malformedAuthority = projectTargetEffectAtFrame(recorded("KILL", {
    targetLifecycleAfter: "TERMINATED",
    targetLifecycleAtEffectFrame: "TERMINATED",
    authority: { ...admittedAuthority, modelPackDigest: "not-a-digest" },
  }), exactFrame);
  const presentation = presentTargetEffect(malformedAuthority);
  assert.equal(presentation.state, "UNAVAILABLE");
  assert.equal(presentation.killClaimAuthorized, false);
  assert.doesNotMatch(
    `${presentation.label} ${presentation.headline} ${presentation.detail}`,
    /\bkill(?:ed)?\b/i,
  );
});
