import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createVerificationObservation,
  TrackStore,
} from "../lib/engine/track-store.ts";
import {
  assertTrackStoreCapacityWorkload,
  TRACK_STORE_CAPACITY_WORKLOAD,
} from "../lib/validation/track-store-capacity.ts";

const DIGEST = "7".repeat(64);
const SOURCE = {
  modelPackDigest: DIGEST,
  sensorModelId: "generic-verification-sensor",
  sensorModelVersion: "1.0.0",
};
const MODEL = {
  schemaVersion: "vector.generic-track-model.v1",
  valueState: "TEST_FIXTURE",
  intendedUse: "ENGINE_VERIFICATION_ONLY",
  positionBiasM: { x: 5, y: -2, z: 1 },
  velocityBiasMps: { x: 0.5, y: -0.25, z: 0 },
  positionStandardDeviationM: { x: 40, y: 40, z: 60 },
  velocityStandardDeviationMps: { x: 3, y: 3, z: 4 },
  confirmationObservations: 2,
  maximumObservationAgeSeconds: 0.1,
  coastAfterSeconds: 0.1,
  lostAfterSeconds: 0.2,
  observationWindowsSeconds: [{ start: 0, end: 5 }],
};

test("capacity workload is an immutable exact contract shared by benchmark and Worker", () => {
  const bytes = readFileSync(new URL("../fixtures/performance/track-store-capacity-workload.v1.json", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "44c402b8c1bb89f6ae435783eb49474bf1af533ea7c4df909423dce0f244afe4");
  assert.doesNotThrow(() => assertTrackStoreCapacityWorkload(structuredClone(TRACK_STORE_CAPACITY_WORKLOAD)));
  assert.throws(() => assertTrackStoreCapacityWorkload({ ...structuredClone(TRACK_STORE_CAPACITY_WORKLOAD), invented: true }), /unsupported|missing/i);
  assert.throws(() => assertTrackStoreCapacityWorkload({ ...structuredClone(TRACK_STORE_CAPACITY_WORKLOAD), ticks: 100 }), /dimensions/i);
  assert.throws(() => assertTrackStoreCapacityWorkload({
    ...structuredClone(TRACK_STORE_CAPACITY_WORKLOAD),
    expected: { ...TRACK_STORE_CAPACITY_WORKLOAD.expected, parityDigest: "not-a-digest" },
  }), /digest/i);
  assert.throws(() => assertTrackStoreCapacityWorkload({
    ...structuredClone(TRACK_STORE_CAPACITY_WORKLOAD),
    trackModel: { ...TRACK_STORE_CAPACITY_WORKLOAD.trackModel, intendedUse: "OPERATIONAL" },
  }), /engine verification/i);
});

function observation(owner, sequence, time, sourceAssociationId = `${owner}-SOURCE-0001`) {
  return createVerificationObservation({
    identity: SOURCE,
    owner,
    sourceAssociationId,
    sourceSequence: sequence,
    sourceTimeSeconds: time,
    measuredPositionM: { x: 10_000 + sequence, y: 2_000, z: 7_000 },
    measuredVelocityMps: { x: 250, y: 0, z: 0 },
    model: MODEL,
  });
}

test("TrackStore commits deterministic confirmation, coast, loss, and reacquisition facts", () => {
  const store = new TrackStore(
    { owner: "IAF", source: SOURCE },
    MODEL,
    "vector.intended-use.engine-verification",
  );

  let update = store.update(0, [observation("IAF", 1, 0)]);
  assert.equal(update.snapshot.tracks[0]?.state, "TENTATIVE");
  assert.deepEqual(update.transitions.map((item) => [item.from, item.to, item.cause]), [
    ["NONE", "TENTATIVE", "INITIAL_OBSERVATION"],
  ]);

  update = store.update(0.05, [observation("IAF", 2, 0.05)]);
  assert.equal(update.snapshot.tracks[0]?.state, "CONFIRMED");
  assert.deepEqual(update.transitions.map((item) => [item.from, item.to, item.cause]), [
    ["TENTATIVE", "CONFIRMED", "CONFIRMATION_THRESHOLD_MET"],
  ]);

  update = store.update(0.16);
  assert.equal(update.snapshot.tracks[0]?.state, "COASTING");
  assert.deepEqual(update.transitions.map((item) => item.cause), ["FRESHNESS_EXPIRED"]);

  update = store.update(0.26);
  assert.equal(update.snapshot.tracks[0]?.state, "LOST");
  assert.deepEqual(update.transitions.map((item) => item.cause), ["TRACK_EXPIRED"]);

  update = store.update(0.30, [observation("IAF", 3, 0.30)]);
  assert.equal(update.snapshot.tracks[0]?.state, "TENTATIVE");
  assert.deepEqual(update.transitions.map((item) => item.cause), ["OBSERVATION_REACQUIRED"]);
  assert.equal(update.snapshot.tracks[0]?.trackId, "IAF-TRACK-0001");
  assert.equal(JSON.stringify(update), JSON.stringify(structuredClone(update)));
  assert.doesNotMatch(JSON.stringify(update), /observedEntityId|targetEntityId|truthEntityId|truthPosition/);
});

test("TrackStore rejects wrong-side, stale, out-of-order, source-mismatch, non-positional, non-finite, and truth-leaking input", () => {
  const makeStore = () => new TrackStore(
    { owner: "IAF", source: SOURCE },
    MODEL,
    "vector.intended-use.engine-verification",
  );
  const mutations = [
    (value) => ({ ...value, owner: "PAF" }),
    (value) => ({ ...value, sourceTimeSeconds: -1 }),
    (value) => ({ ...value, source: { ...value.source, modelPackDigest: "8".repeat(64) } }),
    (value) => ({ ...value, estimate: { valueState: "UNAVAILABLE", reason: "NON_POSITIONAL_OBSERVATION" } }),
    (value) => ({ ...value, uncertainty: { ...value.uncertainty, positionStandardDeviationM: { x: NaN, y: 1, z: 1 } } }),
    (value) => ({ ...value, truthEntityId: "red-object-1" }),
  ];
  for (const mutate of mutations) {
    assert.throws(() => makeStore().update(0, [mutate(observation("IAF", 1, 0))]));
  }

  const duplicate = makeStore();
  duplicate.update(0, [observation("IAF", 1, 0)]);
  assert.throws(() => duplicate.update(0.05, [observation("IAF", 1, 0.05)]), /duplicate|out of order/i);
  assert.throws(() => makeStore().update(0.2, [observation("IAF", 1, 0)]), /stale/i);
});

test("one side-owned TrackStore retains independently associated tracks in canonical order", () => {
  const store = new TrackStore(
    { owner: "IAF", source: SOURCE },
    MODEL,
    "vector.intended-use.engine-verification",
  );
  const update = store.update(0, [
    observation("IAF", 2, 0, "IAF-SOURCE-0002"),
    observation("IAF", 1, 0, "IAF-SOURCE-0001"),
  ]);
  assert.deepEqual(update.snapshot.tracks.map((track) => [track.sourceAssociationId, track.trackId]), [
    ["IAF-SOURCE-0001", "IAF-TRACK-0001"],
    ["IAF-SOURCE-0002", "IAF-TRACK-0002"],
  ]);
  assert.equal(update.transitions.length, 2);
  const before = structuredClone(update.snapshot);
  assert.throws(
    () => store.update(0.05, [observation("IAF", 3, 0.05, "IAF-SOURCE-0001"), observation("IAF", 2, 0.05, "IAF-SOURCE-0002")]),
    /duplicate|out of order/i,
  );
  assert.deepEqual(store.snapshot(), before, "a rejected batch must not partially mutate the store");
});

test("TrackStore constructor rejects every malformed owner/source/identity shape", () => {
  const identities = [
    { owner: "BLUE", source: SOURCE },
    { owner: "IAF", source: SOURCE, invented: true },
    { owner: "IAF", source: { ...SOURCE, invented: true } },
    { owner: "IAF", source: { ...SOURCE, sensorModelId: "" } },
    { owner: "IAF", source: { ...SOURCE, sensorModelVersion: "" } },
    { owner: "IAF", source: { ...SOURCE, modelPackDigest: "7" } },
  ];
  for (const identity of identities) {
    assert.throws(() => new TrackStore(identity, MODEL, "vector.intended-use.engine-verification"));
  }
});

test("generic track policy is admitted only for the engine-verification intended use", () => {
  assert.throws(
    () => new TrackStore({ owner: "IAF", source: SOURCE }, MODEL, "vector.intended-use.geometry-teaching"),
    /engine verification/i,
  );
});
