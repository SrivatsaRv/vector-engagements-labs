import type { EngineFrame, EngineObserverStateV3, EngineTrack, ObserverPerspective, ObserverTrackModel } from "../lib/engine/contracts.ts";
import { createVerificationObservation, TrackStore } from "../lib/engine/track-store.ts";
import { assertEngineObserverState, assertRecordedSidePictures, attachRecordedObserverStates, projectObserverStates } from "../lib/information-state.ts";
import { decodeColumnarFrames, encodeColumnarFrames } from "../lib/record/vector-record.ts";

const SIDES = ["IAF", "PAF"] as const;
const TRACKS_PER_SIDE = 50;
const model: ObserverTrackModel = {
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
const source = {
  modelPackDigest: "7".repeat(64),
  sensorModelId: "generic-verification-sensor",
  sensorModelVersion: "1.0.0",
};
let generation = 0;

function observation(owner: ObserverPerspective, index: number, tick: number) {
  const time = tick / 20;
  return createVerificationObservation({
    identity: source,
    owner,
    sourceAssociationId: `${owner}-SOURCE-${(index + 1).toString().padStart(4, "0")}`,
    sourceSequence: tick + 1,
    sourceTimeSeconds: time,
    measuredPositionM: { x: 10_000 + index * 1_000 + tick, y: owner === "IAF" ? 2_000 : -2_000, z: 7_000 },
    measuredVelocityMps: { x: 250, y: index / 10, z: 0 },
    model,
  });
}

async function digest(lines: readonly string[]) {
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

function start(runId: string) {
  const token = ++generation;
  const stores = SIDES.map((owner) => new TrackStore(
    { owner, source }, model, "vector.intended-use.engine-verification",
  ));
  const parityLines: string[] = [];
  let transitionCount = 0;
  let tick = 0;
  const advance = async () => {
    if (token !== generation) {
      postMessage({ type: "cancelled", runId });
      return;
    }
    const time = tick / 20;
    const due = tick <= 1 || tick >= 7;
    for (const [sideIndex, owner] of SIDES.entries()) {
      const observations = due
        ? Array.from({ length: TRACKS_PER_SIDE }, (_, index) => observation(owner, index, tick))
        : [];
      const update = stores[sideIndex]!.update(time, observations);
      transitionCount += update.transitions.length;
      for (const transition of update.transitions) parityLines.push([
        "E", tick, owner, transition.sourceAssociationId, transition.trackId,
        transition.from, transition.to, transition.cause, transition.sourceSequence,
        transition.sourceTimeSeconds.toFixed(6),
      ].join("|"));
    }
    postMessage({ type: "progress", runId, tick });
    if (tick < 100) {
      tick += 1;
      setTimeout(advance, 0);
      return;
    }
    let retainedTracks = 0;
    const tracksBySide = new Map<ObserverPerspective, EngineTrack[]>();
    for (const [sideIndex, store] of stores.entries()) {
      const tracks = store.update(5).snapshot.tracks;
      retainedTracks += tracks.length;
      tracksBySide.set(SIDES[sideIndex]!, tracks);
    }
    const observerStates: EngineObserverStateV3[] = SIDES.map((owner) => {
      const tracks = tracksBySide.get(owner)!;
      const state: EngineObserverStateV3 = {
        schemaVersion: "vector.observer-state.v3",
        perspective: owner,
        sensorState: "SEARCH",
        observationCount: 0,
        trackCount: tracks.length,
        visibleTrackCount: tracks.filter((track) => track.state === "CONFIRMED" || track.state === "COASTING").length,
        scanReason: "SCAN_NOT_DUE",
        effectScope: "AIR_PICTURE_ONLY",
        stateExplanation: "Capacity verification retains the complete side-owned TrackStore snapshot.",
        sensorModelId: source.sensorModelId,
        observations: [],
        tracks,
      };
      assertEngineObserverState(state);
      parityLines.push(["P", owner, state.trackCount, state.visibleTrackCount].join("|"));
      return state;
    });
    for (const owner of SIDES) {
      const tracks = tracksBySide.get(owner)!;
      for (const track of tracks) parityLines.push([
        "T", track.owner, track.sourceAssociationId, track.trackId, track.state,
        track.sourceSequence, track.sourceTimeSeconds.toFixed(6),
        track.estimate.positionM.x.toFixed(6), track.estimate.positionM.y.toFixed(6),
        track.estimate.positionM.z.toFixed(6), track.updateCount,
      ].join("|"));
    }
    const capacityFrame = {
      t: 5,
      entities: [],
      geographicPositions: [],
      primaryWeaponId: "verification-weapon",
      primaryTargetId: "verification-target",
      separationM: 0,
      closureRateMps: 0,
      lineOfSightRateRadS: 0,
      observerStates,
    } satisfies EngineFrame;
    const encodedFrames = encodeColumnarFrames([capacityFrame]);
    const decodedFrame = decodeColumnarFrames(encodedFrames)[0]!;
    const pictures = projectObserverStates([decodedFrame]);
    const pictureJsonl = pictures.map((picture) => JSON.stringify(picture)).join("\n");
    const decodedPictures = pictureJsonl.split("\n").map((line) => JSON.parse(line));
    assertRecordedSidePictures([decodedFrame], decodedPictures);
    const replayFrame = attachRecordedObserverStates([{ ...decodedFrame, observerStates: [] }], decodedPictures)[0]!;
    const tracksPerPicture = decodedPictures.map((picture) => picture.schemaVersion === "vector.observer-state.v3" ? picture.tracks.length : 0);
    if (tracksPerPicture.some((count) => count !== TRACKS_PER_SIDE)) {
      throw new Error("Canonical browser frame/picture round trip truncated retained tracks.");
    }
    if (replayFrame.observerStates.some((state) => state.schemaVersion !== "vector.observer-state.v3" || state.tracks.length !== TRACKS_PER_SIDE)) {
      throw new Error("Canonical browser replay attachment truncated retained tracks.");
    }
    postMessage({
      type: "completed",
      runId,
      retainedTracks,
      transitionCount,
      parityDigest: await digest(parityLines),
      canonicalPictures: pictures.length,
      tracksPerPicture,
      canonicalFrameBytes: encodedFrames.byteLength,
    });
  };
  void advance();
}

addEventListener("message", (event: MessageEvent<{ type: string; runId: string }>) => {
  if (event.data.type === "run") start(event.data.runId);
  else if (event.data.type === "cancel") generation += 1;
});
