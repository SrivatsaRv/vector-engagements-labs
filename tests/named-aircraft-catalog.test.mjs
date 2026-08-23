import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORMS,
  SOURCES,
  SUBSYSTEMS,
  catalogReviewState,
} from "../lib/capability-data.ts";
import { getOpposingObjects } from "../lib/object-catalog.ts";
import {
  CURRENT_MODEL_PACK_DIGEST,
  createCurrentModelPackSource,
} from "../lib/reference-model-pack.ts";
import { compileModelPack } from "../lib/model-pack.ts";

test("Peace Drive I C and D catalog subjects are separate while only C is selectable", () => {
  const c = PLATFORMS.find((item) => item.id === "f-16c-block52-paf");
  const d = PLATFORMS.find((item) => item.id === "f-16d-block52-paf");
  assert.equal(c?.variant, "F-16C Block 52 Peace Drive I");
  assert.equal(c?.deliveredQuantity, 12);
  assert.equal(d?.variant, "F-16D Block 52 Peace Drive I");
  assert.equal(d?.deliveredQuantity, 6);
  assert.equal(c?.scenarioSelectable, true);
  assert.equal(d?.scenarioSelectable, false);
  assert.deepEqual(
    getOpposingObjects("A2A").filter((item) => item.id.startsWith("f-16")).map((item) => item.id),
    ["f-16c-block52-paf"],
  );
});

test("catalog copy preserves only categorical F100/APG-68/Link 16 associations", () => {
  const c = PLATFORMS.find((item) => item.id === "f-16c-block52-paf");
  assert.ok(c);
  assert.equal(c.ewId, undefined);
  assert.equal(c.radarId, undefined);
  assert.equal(c.datalinkId, undefined);
  assert.equal(SUBSYSTEMS.some((item) => item.id === "alq-211v9"), false);
  for (const id of ["f100-pw-229", "apg-68v9", "link-16"]) {
    assert.equal(SUBSYSTEMS.find((item) => item.id === id)?.status, "CONTEXT_ONLY");
  }
  assert.ok(c.publicFacts.every((fact) => fact.label !== "Defensive EW"));
  assert.ok(c.defaultLoadout.every((item) => item.status === "MODEL_ASSUMPTION"));
});

test("the hearing date is corrected and the expired 2016 proposal is quarantined", () => {
  assert.equal(SOURCES.find((item) => item.id === "us-congress-paf-amraam-2008")?.publishedAt, "2008-09-16");
  assert.equal(SOURCES.find((item) => item.id === "dsca-pakistan-15-80")?.evidenceUse, "INELIGIBLE");
});

test("database seed review states preserve context, assumptions, and ineligible evidence", () => {
  assert.equal(catalogReviewState("SOURCED"), "ACCEPTED");
  assert.equal(catalogReviewState("PARTIAL"), "CONTEXT_ONLY");
  assert.equal(catalogReviewState("CONTEXT_ONLY"), "CONTEXT_ONLY");
  assert.equal(catalogReviewState("MODEL_ASSUMPTION"), "MODEL_ASSUMPTION");
  assert.equal(catalogReviewState("INELIGIBLE"), "INELIGIBLE");
  assert.equal(catalogReviewState("UNKNOWN"), "UNKNOWN");
});

test("catalog governance changes do not alter the executable model-pack digest or named-performance boundary", async () => {
  const { pack } = await compileModelPack(createCurrentModelPackSource());
  assert.equal(pack.digest, CURRENT_MODEL_PACK_DIGEST);
  const named = new Map(pack.aircraft.map((item) => [item.catalogObjectId, item.performanceAdmission]));
  assert.equal(named.get("su-30mki")?.state, "UNSUPPORTED");
  assert.equal(named.get("f-16c-block52-paf")?.state, "UNSUPPORTED");
  assert.equal(named.has("f-16d-block52-paf"), false);
});
