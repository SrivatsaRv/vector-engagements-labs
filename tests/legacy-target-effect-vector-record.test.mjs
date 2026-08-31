import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { openVectorSimulationRecord } from "../lib/record/vector-record.ts";

const LEGACY_RECORD_BYTES = 131_583;
const LEGACY_RECORD_SHA256 =
  "453c8bc894b6ac54a51ec851c7cf37d85b9ccf738b91b124d4bdaf877b572f10";
const LEGACY_RECORD_ID =
  "864b3af6b250b146c18118a5d4764608fbdae4966c40e083c09ab2475b25319f";
const LEGACY_CONTENT_DIGEST =
  "3323175df352b288c08828072d12d2779d4bb6a8a3496f8fe21134ba62809df2";
const LEGACY_MODEL_PACK_DIGEST =
  "aecedbb6868395bb6ee2b46c4867c032d358210b1aa5a719cb5a868b24f5917c";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("pre-target-effect VSR bytes remain readable without promoting geometric intercept to kill", async () => {
  const fixture = await readFile(
    new URL(
      "../fixtures/vector-record/pre-target-effect-not-modelled.vsr",
      import.meta.url,
    ),
  );
  assert.equal(fixture.byteLength, LEGACY_RECORD_BYTES);
  assert.equal(sha256(fixture), LEGACY_RECORD_SHA256);

  const buffer = fixture.buffer.slice(
    fixture.byteOffset,
    fixture.byteOffset + fixture.byteLength,
  );
  const inputHash = sha256(new Uint8Array(buffer));
  const opened = await openVectorSimulationRecord(buffer, fixture.byteLength);

  assert.equal(sha256(new Uint8Array(buffer)), inputHash, "opening must not rewrite legacy bytes");
  assert.equal(opened.manifest.recordId, LEGACY_RECORD_ID);
  assert.equal(opened.manifest.contentDigest, LEGACY_CONTENT_DIGEST);
  assert.equal(opened.result.engineRun.scenario.modelPack.id, "vector-scalar-study-models");
  assert.equal(opened.result.engineRun.scenario.modelPack.version, "0.9.0");
  assert.equal(opened.result.engineRun.scenario.modelPack.digest, LEGACY_MODEL_PACK_DIGEST);
  assert.equal(opened.result.termination, "weapon_intercept");
  assert.equal(opened.events.state, "AVAILABLE");

  const terminalEvents = opened.events.items.filter(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  );
  assert.equal(terminalEvents.length, 1);
  const terminal = terminalEvents[0];
  assert.equal(terminal.payload.targetEffect, "NOT_MODELLED");
  assert.equal(
    opened.events.items.some((event) => event.payload.kind === "TARGET_EFFECT_RESOLVED"),
    false,
  );

  const target = opened.result.engineRun.frames[terminal.frameIndex].entities.find(
    (entity) => entity.id === terminal.payload.targetId,
  );
  assert.equal(target?.lifecycle, "ACTIVE");
  assert.match(opened.report.result.reason, /target damage and kill are not modelled/i);
});
