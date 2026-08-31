import assert from "node:assert/strict";
import test from "node:test";
import {
  selectDisplayFrame,
  selectEntityMetricSeries,
  selectCurrentGeometry,
  selectObserverEntityPresentation,
  selectRecordedTrackState,
  selectRouteTransitionStates,
} from "../lib/frontend/selectors.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";

const result = simulate(SCENARIO_LIBRARY[0].scenario);

test("display-time selection returns one canonical recorded frame identity", () => {
  const midpoint = (result.frames[4].t + result.frames[5].t) / 2;
  const selected = selectDisplayFrame(result, midpoint);
  assert.equal(selected.frame, result.frames[selected.frameIndex]);
  assert.equal(selected.displayTimeSeconds, selected.frame.t);
  assert.ok(selected.frameIndex === 4 || selected.frameIndex === 5);
  assert.throws(() => selectDisplayFrame({ ...result, frames: [] }, 0), /empty record/);
});

test("current geometry consumes one selected frame and keeps weapon values unavailable before launch", () => {
  const launchFrameIndex = result.frames.findIndex((frame) =>
    frame.entities.some(
      (entity) => entity.id === result.engineRun.primaryWeaponId,
    )
  );
  assert.ok(launchFrameIndex > 0);
  const selected = selectDisplayFrame(result, result.frames[launchFrameIndex].t);
  const geometry = selectCurrentGeometry(result, selected);
  assert.equal(geometry.state, "AVAILABLE");
  assert.equal(geometry.displayTimeSeconds, selected.displayTimeSeconds);
  assert.equal(geometry.frameIndex, selected.frameIndex);
  assert.equal(geometry.relationship, "WEAPON_TO_TARGET");
  assert.equal(geometry.rangeMeters, selected.frame.range);
  assert.equal(geometry.closureRateMps, selected.frame.closureRate);
  assert.equal(geometry.lineOfSightRateRadS, selected.frame.losRate);
  assert.equal(geometry.weapon.state, "AVAILABLE");

  const prelaunchSelected = selectDisplayFrame(
    result,
    result.frames[launchFrameIndex - 1].t,
  );
  const beforeLaunch = selectCurrentGeometry(result, prelaunchSelected);
  assert.equal(beforeLaunch.state, "AVAILABLE");
  assert.equal(beforeLaunch.relationship, "AIRCRAFT_TO_TARGET");
  assert.deepEqual(beforeLaunch.weapon, { state: "UNAVAILABLE", reason: "NOT_LAUNCHED" });
  assert.notEqual(beforeLaunch.rangeMeters, 0);
});

test("observer-picture presentation hides world entities while the selected side has no admitted sensor model", () => {
  const unavailable = result.pictures.find((picture) => picture.perspective === "IAF");
  assert.ok(unavailable);
  assert.deepEqual(selectObserverEntityPresentation(unavailable, "red-object-1"), { state: "HIDDEN" });
  assert.deepEqual(selectObserverEntityPresentation(unavailable, "blue-platform-1"), { state: "HIDDEN" });
  assert.deepEqual(selectObserverEntityPresentation(undefined, "blue-platform-1"), { state: "MODEL_TRUTH" });
});

test("entity metric series use gaps instead of invented zeroes", () => {
  const selected = selectDisplayFrame(result, 0);
  const series = selectEntityMetricSeries(result, selected, (entity) => entity.speedMps, (entity) => entity.kind === "GUIDED_WEAPON");
  const redWeapon = series.find((item) => item.id === "red-weapon-1");
  assert.ok(redWeapon);
  assert.equal(redWeapon.current, null);
  assert.ok(redWeapon.values.some((value) => value === null));
  assert.ok(redWeapon.values.every((value) => value === null || Number.isFinite(value)));
});

test("recorded track selection returns the exact unavailable tick state", () => {
  const selected = selectDisplayFrame(result, result.frames[3].t);
  const track = selectRecordedTrackState(result.pictures, selected, "IAF");
  assert.equal(track.state, "AVAILABLE");
  assert.equal(track.track.modelTimeSeconds, selected.displayTimeSeconds);
  assert.equal(track.track.availabilityReason, "SENSOR_MODEL_UNAVAILABLE");
  const missing = selectRecordedTrackState([], selected, "PAF");
  assert.deepEqual(missing, { state: "UNAVAILABLE", perspective: "PAF", displayTimeSeconds: selected.displayTimeSeconds, reason: "PICTURE_NOT_RECORDED" });
});

test("route-transition state consumes the selected frame and immutable compiled v2 plan", () => {
  const controlFrame = result.frames.find((frame) =>
    frame.entities.some((entity) => entity.id === "blue-platform-1" && entity.aircraftControl)
  );
  assert.ok(controlFrame);
  const selected = selectDisplayFrame(result, controlFrame.t);
  const transitions = selectRouteTransitionStates(result, selected);
  const blue = transitions.find((transition) => transition.entityId === "blue-platform-1");
  assert.ok(blue);
  assert.equal(blue.displayTimeSeconds, selected.displayTimeSeconds);
  assert.equal(blue.frameIndex, selected.frameIndex);
  assert.equal(blue.state, "ACTIVE");
  assert.equal(blue.routeSchemaVersion, "vector.route-plan.v2");
  assert.equal(blue.semantics, "DECLARED");
  assert.equal(blue.transition, "FLY_BY");
  assert.equal(blue.waypointIndex, selected.frame.entities.find((entity) => entity.id === blue.entityId)?.aircraftControl?.routePointIndex);
  assert.ok(blue.acceptanceRadiusM > 0);
});

test("route-transition state exposes legacy v1 semantics and fails closed when compiled control is absent", () => {
  const legacy = structuredClone(result);
  const blue = legacy.engineRun.scenario.entities.find((entity) => entity.id === "blue-platform-1");
  assert.ok(blue?.routePlan);
  blue.routePlan = {
    schemaVersion: "vector.route-plan.v1",
    waypointAcceptanceRadiiM: [...blue.routePlan.waypointAcceptanceRadiiM],
  };
  const controlFrame = legacy.frames.find((frame) =>
    frame.entities.some((entity) => entity.id === "blue-platform-1" && entity.aircraftControl)
  );
  assert.ok(controlFrame);
  const selected = selectDisplayFrame(legacy, controlFrame.t);
  const transition = selectRouteTransitionStates(legacy, selected).find((item) => item.entityId === "blue-platform-1");
  assert.ok(transition && transition.state === "ACTIVE");
  assert.equal(transition.semantics, "LEGACY_ALL_FLY_BY");
  assert.equal(transition.transition, "FLY_BY");

  const missingControl = {
    ...legacy,
    frames: legacy.frames.map((frame, index) => index === selected.frameIndex
      ? {
          ...frame,
          entities: frame.entities.map((entity) => entity.id === "blue-platform-1"
            ? { ...entity, aircraftControl: undefined }
            : entity),
        }
      : frame),
  };
  const unavailable = selectRouteTransitionStates(
    missingControl,
    selectDisplayFrame(missingControl, selected.displayTimeSeconds),
  ).find((item) => item.entityId === "blue-platform-1");
  assert.deepEqual(unavailable && { state: unavailable.state, reason: unavailable.state === "UNAVAILABLE" ? unavailable.reason : undefined }, {
    state: "UNAVAILABLE",
    reason: "ROUTE_CONTROL_NOT_RECORDED",
  });
});
