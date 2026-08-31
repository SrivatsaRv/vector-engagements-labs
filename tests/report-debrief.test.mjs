import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalReportDebrief } from "../lib/report-debrief.ts";
import { buildReportExport } from "../lib/report-export.ts";
import { getScenarioDefinition } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";
import { evaluateTargetEffect } from "../lib/engine/target-effect.ts";
import { buildVerifiedSavedRun } from "../lib/security/saved-run.ts";
import {
  buildAuthoredProfileBinding,
  projectReportCausalInputs,
} from "../lib/report-profile.ts";

function reportData(definition, result) {
  return {
    scenario: definition.scenario,
    result,
    events: [],
    createdAt: "2026-08-31T00:00:00.000Z",
    engine: "test",
    profileVersion: "test",
    libraryScenario: definition,
  };
}

function withCanonicalKill(result) {
  const event = result.engineRun.events.items.find(
    (candidate) => candidate.payload.kind === "TARGET_EFFECT_COMMITTED",
  );
  assert.ok(event?.payload.kind === "TARGET_EFFECT_COMMITTED");
  const causalEvent = result.engineRun.events.items.find(
    (candidate) => candidate.id === event.causeEventIds[0],
  );
  assert.ok(causalEvent?.payload.kind === "WEAPON_TERMINATED");
  const target = result.frames[event.frameIndex].entities.find(
    (entity) => entity.id === event.payload.commit.targetId,
  );
  assert.ok(target);
  causalEvent.payload.closestApproachM = 1;
  const model = result.engineRun.scenario.targetEffectAuthority.models[0];
  const commit = evaluateTargetEffect({
    modelPackDigest: result.engineRun.scenario.targetEffectAuthority.digest,
    model,
    weaponId: event.payload.commit.weaponId,
    termination: {
      receipt: { tick: causalEvent.tick, localKey: causalEvent.localKey },
      cause: causalEvent.payload.cause,
      closestApproachM: 1,
      modelTimeSeconds: causalEvent.modelTimeSeconds,
    },
    target: {
      entityId: target.id,
      kind: target.kind,
      lifecycle: "ACTIVE",
      massKg: target.massKg,
      speedMps: target.speedMps,
      altitudeMslM: target.position.z,
    },
  });
  event.payload.commit = structuredClone(commit);
  target.lifecycle = "TERMINATED";
  target.targetEffect = { commitId: commit.commitId, state: "KILL" };
  return result;
}

test("canonical debrief joins authored profile metadata only to exact recorded causal facts", () => {
  const definition = getScenarioDefinition("a2a-defensive-break");
  assert.ok(definition?.authoredProfile);
  const result = withCanonicalKill(simulate(definition.scenario));
  const debrief = buildCanonicalReportDebrief(result, definition, definition.scenario);

  assert.deepEqual(debrief.profile, {
    schemaVersion: "vector.authored-route-profile.v1",
    id: "wvr-one-circle-defensive-break",
    label: definition.authoredProfile.label,
    authority: "AUTHORED_ROUTE",
    applicability: "MATCHED",
    regime: "WVR_BFM",
    limitations: definition.authoredProfile.limitations,
  });
  assert.equal(debrief.routeLegs.length, 6);
  assert.deepEqual(
    debrief.routeLegs.filter(({ affiliation }) => affiliation === "BLUE").map(({ authoredIntent }) => authoredIntent),
    definition.authoredProfile.blue.legs,
  );
  assert.ok(debrief.achievedRouteTransitions.length > 0);
  assert.equal(debrief.launch?.weaponId, result.engineRun.primaryWeaponId);
  assert.equal(debrief.launch?.modelTimeSeconds, 20);
  assert.equal(debrief.storeTransfers.filter(({ achieved }) => achieved).length, 1);
  assert.equal(debrief.weaponTermination?.terminalState, "INTERCEPT");
  assert.equal(debrief.targetEffect.presentation.effectClass, "KILL");
  assert.equal(debrief.targetEffect.presentation.killClaimAuthorized, true);
  assert.equal(debrief.aircraft.length, 2);
  assert.ok(debrief.aircraft.every(({ initial, final }) => final.massKg <= initial.massKg));
  assert.ok(Number.isFinite(debrief.finalAircraftSeparationM));
  assert.match(
    debrief.explanation,
    /Blue Su-30MKI presentation aircraft recorded KILL against Red F-16C Block 52 presentation/i,
  );
  assert.match(debrief.explanation, /generic educational model .+ and authority .+ at model time|At model time .+ generic educational model/i);
  assert.match(debrief.explanation, /MODEL_ASSUMPTION limitations:/);
  assert.match(debrief.explanation, /\([a-f0-9]{64}\).*authority .+\([a-f0-9]{64}\)/i);
  assert.match(debrief.explanation, /exact causal inputs matched source authored route profile WVR one-circle defensive break/i);
  assert.match(debrief.explanation, /no autonomous pilot selected it/i);
  assert.match(debrief.explanation, /not named-system effectiveness/i);
});

test("a DEGRADED effect retains its exact canonical wording without terminal KILL wording", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.authoredProfile);
  const result = simulate(definition.scenario);
  const debrief = buildCanonicalReportDebrief(result, definition, definition.scenario);

  assert.equal(debrief.targetEffect.presentation.effectClass, "DEGRADED");
  assert.equal(debrief.targetEffect.presentation.killClaimAuthorized, false);
  assert.doesNotMatch(debrief.explanation, /\bkill(?:ed)?\b/i);
  assert.match(debrief.explanation, /recorded degraded target capability/i);
});

test("report export preserves authored profile and debrief while legacy definitions remain compatible", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.authoredProfile);
  const result = simulate(definition.scenario);
  const library = {
    ...definition,
    authoredProfileBinding: buildAuthoredProfileBinding(
      definition,
      definition.scenario,
    ),
  };
  const exported = buildReportExport(
    reportData(definition, result),
    library,
    "last-saved",
  );
  assert.deepEqual(exported.scenario.library.authoredProfile, definition.authoredProfile);
  assert.equal(exported.scenario.library.authoredProfileBinding.applicability, "MATCHED");
  assert.equal(exported.result.debrief.profile?.id, definition.authoredProfile.id);
  assert.equal(exported.result.debrief.causalInputs.duration.valueSeconds, 100);
  assert.equal(exported.result.debrief.launch.frameIndex, 17);
  assert.equal(
    Number(exported.result.debrief.launch.rangeM.toFixed(6)),
    36_792.145644,
  );
  assert.equal(exported.result.debrief.causalInputs.sides.BLUE.route.length, 4);
  assert.equal(exported.result.debrief.causalInputs.sides.RED.route.length, 4);
  assert.deepEqual(
    exported.result.debrief.achievedRouteTransitions,
    buildCanonicalReportDebrief(result, definition, definition.scenario).achievedRouteTransitions,
  );

  const legacyLibrary = structuredClone(definition);
  delete legacyLibrary.authoredProfile;
  const legacyDebrief = buildCanonicalReportDebrief(
    result,
    legacyLibrary,
    definition.scenario,
  );
  assert.equal(legacyDebrief.profile, null);
  assert.deepEqual(legacyDebrief.routeLegs, []);
  assert.equal(legacyDebrief.authoredTransitionGeometry, null);
  assert.match(legacyDebrief.explanation, /No authored route profile was preserved/);
});

test("verified saved-run report preserves the exact optional authored profile", async () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.authoredProfile);
  const { report } = await buildVerifiedSavedRun(
    definition.scenario,
    definition,
    {
      schemaVersion: "vector.scenario.v4",
      contentHash: "a".repeat(64),
      draftRevision: 0,
    },
  );
  assert.deepEqual(report.libraryScenario.authoredProfile, definition.authoredProfile);
  assert.notEqual(report.libraryScenario.authoredProfile, definition.authoredProfile);
  assert.equal(report.libraryScenario.authoredProfileBinding?.applicability, "MATCHED");
});

test("all three report profiles retain exact causal starts, routes, duration, release, and observer evidence", () => {
  const expectations = [
    ["a2a-crossing-intercept", "BVR", "direct", 4, 100, 275, 250, ["BOOST", "COAST", "TERMINAL_GUIDANCE", "INTERCEPT"]],
    ["a2a-defensive-break", "WVR_BFM", "loft", 20, 45, 260, 235, ["BOOST", "INTERCEPT"]],
    ["a2a-high-energy-crossing-challenge", "UNRESTRICTED_TRANSITION", "direct", 50, 140, 268, 245, ["BOOST", "COAST", "TERMINAL_GUIDANCE", "INTERCEPT"]],
  ];
  for (const [id, regime, guidance, releaseTime, duration, blueTas, redTas, flightStates] of expectations) {
    const definition = getScenarioDefinition(id);
    assert.ok(definition?.authoredProfile);
    const result = simulate(definition.scenario);
    const debrief = buildCanonicalReportDebrief(
      result,
      definition,
      definition.scenario,
    );
    assert.equal(debrief.profile?.applicability, "MATCHED", id);
    assert.equal(debrief.causalInputs.regime, regime, id);
    assert.equal(debrief.causalInputs.guidance, guidance, id);
    assert.deepEqual(debrief.causalInputs.duration, {
      valueSeconds: duration,
      authority: "SCENARIO_AUTHORED",
      authoredFieldPresent: true,
    }, id);
    assert.equal(debrief.causalInputs.releaseRequests[0]?.requestedTimeSeconds, releaseTime, id);
    assert.equal(debrief.causalInputs.sides.BLUE?.start.tasMps, blueTas, id);
    assert.equal(debrief.causalInputs.sides.RED?.start.tasMps, redTas, id);
    assert.equal(debrief.causalInputs.sides.BLUE?.route.length, 4, id);
    assert.equal(debrief.causalInputs.sides.RED?.route.length, 4, id);
    assert.ok(debrief.causalInputs.sides.BLUE?.route.every(
      ({ position, transition, acceptanceRadiusM }, index) =>
        position.verticalDatum === "MSL" &&
        transition === (index === 0 ? "START" : "FLY_BY") &&
        acceptanceRadiusM === (index === 0 ? 1 : 500),
    ), id);
    assert.deepEqual(debrief.weaponFlightStates.map(({ state }) => state), flightStates, id);
    assert.equal(debrief.observerStates.length, 2, id);
    assert.ok(debrief.observerStates.every(({ sensorState }) => sensorState === "UNSUPPORTED"), id);
  }
});

test("all three exact reports project canonical launch, aircraft-approach, and authored transition geometry", () => {
  const bvrDefinition = getScenarioDefinition("a2a-crossing-intercept");
  const wvrDefinition = getScenarioDefinition("a2a-defensive-break");
  const transitionDefinition = getScenarioDefinition("a2a-high-energy-crossing-challenge");
  assert.ok(bvrDefinition?.authoredProfile);
  assert.ok(wvrDefinition?.authoredProfile);
  assert.ok(transitionDefinition?.authoredProfile);

  const bvr = buildCanonicalReportDebrief(
    simulate(bvrDefinition.scenario),
    bvrDefinition,
    bvrDefinition.scenario,
  );
  assert.deepEqual({
    frameIndex: bvr.launch?.frameIndex,
    modelTimeSeconds: bvr.launch?.modelTimeSeconds,
    relationship: bvr.launch?.relationship,
    rangeM: Number(bvr.launch?.rangeM.toFixed(6)),
    closureRateMps: Number(bvr.launch?.closureRateMps.toFixed(6)),
    blueAltitudeMslM: bvr.launch?.blueAltitudeMslM,
    redAltitudeMslM: bvr.launch?.redAltitudeMslM,
  }, {
    frameIndex: 17,
    modelTimeSeconds: 4,
    relationship: "WEAPON_TO_TARGET",
    rangeM: 36_792.145644,
    closureRateMps: 322.564273,
    blueAltitudeMslM: 9_500,
    redAltitudeMslM: 8_200,
  });

  const wvr = buildCanonicalReportDebrief(
    simulate(wvrDefinition.scenario),
    wvrDefinition,
    wvrDefinition.scenario,
  );
  assert.deepEqual({
    frameIndex: wvr.closestAircraftApproach?.frameIndex,
    modelTimeSeconds: wvr.closestAircraftApproach?.modelTimeSeconds,
    relationship: wvr.closestAircraftApproach?.relationship,
    rangeM: Number(wvr.closestAircraftApproach?.rangeM.toFixed(6)),
    closureRateMps: Number(wvr.closestAircraftApproach?.closureRateMps.toFixed(6)),
  }, {
    frameIndex: 115,
    modelTimeSeconds: 28.35,
    relationship: "AIRCRAFT_TO_AIRCRAFT",
    rangeM: 4_224.485469,
    closureRateMps: 344.845989,
  });

  const transition = buildCanonicalReportDebrief(
    simulate(transitionDefinition.scenario),
    transitionDefinition,
    transitionDefinition.scenario,
  );
  assert.equal(transition.authoredTransitionGeometry?.state, "RECORDED");
  assert.deepEqual({
    frameIndex: transition.authoredTransitionGeometry?.initialCommit?.frameIndex,
    modelTimeSeconds: transition.authoredTransitionGeometry?.initialCommit?.modelTimeSeconds,
    rangeM: Number(transition.authoredTransitionGeometry?.initialCommit?.rangeM.toFixed(6)),
    closureRateMps: Number(transition.authoredTransitionGeometry?.initialCommit?.closureRateMps.toFixed(6)),
    authoredIntent: transition.authoredTransitionGeometry?.initialCommit?.authoredIntent,
    routePointIndex: transition.authoredTransitionGeometry?.initialCommit?.routePointIndex,
  }, {
    frameIndex: 1,
    modelTimeSeconds: 0.05,
    rangeM: 33_530.449833,
    closureRateMps: 340.213352,
    authoredIntent: "INTERCEPT",
    routePointIndex: 1,
  });
  assert.deepEqual({
    frameIndex: transition.authoredTransitionGeometry?.recommit?.frameIndex,
    modelTimeSeconds: transition.authoredTransitionGeometry?.recommit?.modelTimeSeconds,
    rangeM: Number(transition.authoredTransitionGeometry?.recommit?.rangeM.toFixed(6)),
    closureRateMps: Number(transition.authoredTransitionGeometry?.recommit?.closureRateMps.toFixed(6)),
    authoredIntent: transition.authoredTransitionGeometry?.recommit?.authoredIntent,
    routePointIndex: transition.authoredTransitionGeometry?.recommit?.routePointIndex,
  }, {
    frameIndex: 383,
    modelTimeSeconds: 95.5,
    rangeM: 19_896.024097,
    closureRateMps: 47.765922,
    authoredIntent: "RECOMMIT",
    routePointIndex: 3,
  });
  assert.equal(Number(transition.finalAircraftSeparationM?.toFixed(6)), 19_381.557591);
});

test("profile applicability fails closed for every causal profile input", () => {
  const definition = getScenarioDefinition("a2a-defensive-break");
  assert.ok(definition?.authoredProfile);
  const cases = [
    ["Blue start", (scenario) => { scenario.spatialPlan.blue.position.longitude += 0.001; }],
    ["Red route", (scenario) => { scenario.spatialPlan.red.route[2].latitude += 0.001; }],
    ["transition", (scenario) => { scenario.spatialPlan.blue.routeWaypointTransitions[2] = "FLY_OVER"; }],
    ["radius", (scenario) => { scenario.spatialPlan.red.routeAcceptanceRadiiM[2] += 1; }],
    ["guidance", (scenario) => { scenario.guidance = "direct"; }],
    ["release", (scenario) => { scenario.airMission.assignments[0].storeTransferPlan.requests[0].requestedTimeSeconds += 0.05; }],
    ["duration", (scenario) => { scenario.runDurationSeconds += 0.125; }],
    ["regime", (scenario) => { scenario.airMission.regime = "BVR"; }],
    ["Blue TAS", (scenario) => { scenario.spatialPlan.blue.speedMps += 1; }],
    ["Red heading", (scenario) => { scenario.spatialPlan.red.headingDeg += 1; }],
    ["leg role", (scenario) => { scenario.airMission.flightPlans[0].legs[1].role = "EGRESS"; }],
  ];
  for (const [label, mutate] of cases) {
    const scenario = structuredClone(definition.scenario);
    mutate(scenario);
    assert.equal(
      buildAuthoredProfileBinding(definition, scenario)?.applicability,
      "MODIFIED_FROM",
      label,
    );
  }
});

test("edited saved runs retain source identity without asserting source leg intent", async () => {
  const definition = getScenarioDefinition("a2a-defensive-break");
  assert.ok(definition?.authoredProfile);
  const edited = structuredClone(definition.scenario);
  edited.spatialPlan.red.route[2].longitude += 0.001;
  const { scenario, result, report } = await buildVerifiedSavedRun(
    edited,
    definition,
    {
      schemaVersion: "vector.scenario.v4",
      contentHash: "b".repeat(64),
      draftRevision: 1,
    },
  );
  const debrief = buildCanonicalReportDebrief(
    result,
    report.libraryScenario,
    scenario,
  );
  assert.equal(debrief.profile?.id, definition.authoredProfile.id);
  assert.equal(debrief.profile?.applicability, "MODIFIED_FROM");
  assert.deepEqual(debrief.routeLegs, []);
  assert.match(debrief.explanation, /modified from source authored route profile/i);
  assert.match(debrief.explanation, /leg-intent labels are not asserted/i);
  assert.doesNotMatch(debrief.explanation, /followed authored route profile/i);
});

test("historical duration omission is explicit and uses the versioned domain default", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition);
  const historical = structuredClone(definition.scenario);
  delete historical.runDurationSeconds;
  const projection = projectReportCausalInputs(historical);
  assert.equal(projection.duration.authority, "VERSIONED_DOMAIN_DEFAULT");
  assert.equal(projection.duration.authoredFieldPresent, false);
  assert.equal(projection.duration.valueSeconds, 140);
  assert.equal(
    buildAuthoredProfileBinding(definition, historical)?.applicability,
    "MODIFIED_FROM",
  );
});

test("a historical profile without causal binding remains unverified and exposes no leg claims", () => {
  const definition = getScenarioDefinition("a2a-crossing-intercept");
  assert.ok(definition?.authoredProfile);
  const historicalLibrary = {
    id: definition.id,
    version: definition.version,
    domain: definition.domain,
    title: definition.title,
    scope: definition.scope,
    targetProfile: definition.targetProfile,
    theatre: definition.theatre,
    authoredProfile: structuredClone(definition.authoredProfile),
  };
  const result = simulate(definition.scenario);
  const debrief = buildCanonicalReportDebrief(
    result,
    historicalLibrary,
    definition.scenario,
  );
  assert.equal(debrief.profile?.applicability, "UNVERIFIED_LEGACY");
  assert.deepEqual(debrief.routeLegs, []);
  assert.match(debrief.explanation, /historical evidence cannot establish/i);
});
