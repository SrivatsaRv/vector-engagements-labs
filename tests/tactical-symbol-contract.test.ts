import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTacticalLabelCollisionPolicy,
  applyTacticalLabelPolicy,
  presentTacticalSymbol,
  tacticalSymbolAccessibleName,
} from "../lib/tactical-symbol-contract.ts";
import type { TacticalSymbolInput } from "../lib/tactical-symbol-contract.ts";

const fighter = (overrides: Partial<TacticalSymbolInput> = {}) => presentTacticalSymbol({
  id: "blue-1",
  designation: "Blue One",
  kind: "AIRCRAFT",
  affiliation: "BLUE",
  lifecycle: "ACTIVE",
  symbolRole: "FIGHTER",
  headingRad: 0,
  headingRequired: true,
  valueState: "WORLD",
  ...overrides,
});

test("tactical presentation accepts only a supported canonical kind/role pair", () => {
  const symbol = fighter();
  assert.equal(symbol.availability, "AVAILABLE");
  assert.equal(symbol.kind, "AIRCRAFT");
  assert.equal(symbol.symbolRole, "FIGHTER");
  assert.equal(symbol.headingDeg, 90);
  assert.equal(symbol.renderable, true);

  const invalid = fighter({ symbolRole: "GUIDED_MISSILE" });
  assert.deepEqual(invalid, {
    availability: "UNAVAILABLE",
    id: "blue-1",
    designation: "Blue One",
    reason: "UNSUPPORTED_KIND_ROLE",
    label: { text: "Blue One unavailable", visibility: "VISIBLE" },
  });
});

test("missing orientation and unsupported source state fail explicit rather than drawing a generic entity", () => {
  const missingHeading = fighter({ headingRad: undefined });
  assert.equal(missingHeading.availability, "UNAVAILABLE");
  assert.equal(missingHeading.reason, "MISSING_HEADING");

  const unsupported = fighter({ valueState: "UNSUPPORTED" });
  assert.equal(unsupported.availability, "UNAVAILABLE");
  assert.equal(unsupported.reason, "UNSUPPORTED_SOURCE_STATE");
  assert.match(tacticalSymbolAccessibleName(unsupported), /unavailable/i);
});

test("stowed inventory is explicit but not renderable as a world marker", () => {
  const stowed = fighter({ lifecycle: "STOWED" });
  assert.equal(stowed.availability, "AVAILABLE");
  assert.equal(stowed.renderable, false);
});

test("label policy is stable, selection-first, and presentation-only", () => {
  const symbols = [
    fighter({ id: "blue-2", designation: "Blue Two" }),
    fighter({ id: "weapon-1", designation: "Weapon One", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", lifecycle: "ENGAGING" }),
    fighter({ id: "red-1", designation: "Red One", affiliation: "RED", selected: true }),
    fighter({ id: "blue-3", designation: "Blue Three" }),
    fighter({ id: "blue-4", designation: "Blue Four" }),
  ];
  const rendered = applyTacticalLabelPolicy(symbols);
  const selected = rendered.find((symbol) => symbol.id === "red-1");
  assert.equal(selected?.availability, "AVAILABLE");
  if (selected?.availability === "AVAILABLE") assert.equal(selected.label.visibility, "VISIBLE");
  const hidden = rendered.find((symbol) => symbol.id === "blue-4");
  if (hidden?.availability === "AVAILABLE") assert.equal(hidden.label.visibility, "HIDDEN");
  assert.deepEqual(symbols.map((symbol) => symbol.label.visibility), ["VISIBLE", "VISIBLE", "VISIBLE", "VISIBLE", "VISIBLE"]);
});

test("presentation and decluttering cannot mutate canonical inputs", () => {
  const input = Object.freeze({
    id: "recorded-aircraft",
    designation: "Recorded aircraft",
    kind: "AIRCRAFT" as const,
    affiliation: "BLUE" as const,
    lifecycle: "ACTIVE" as const,
    symbolRole: "FIGHTER" as const,
    headingRad: 0,
    headingRequired: true,
    valueState: "WORLD" as const,
  });
  const before = structuredClone(input);
  const presentation = presentTacticalSymbol(input);
  applyTacticalLabelPolicy([presentation]);
  assert.deepEqual(input, before);
});

test("projected-label collisions hide lower priority detail while a selected entity remains visible", () => {
  const symbols = [
    fighter({ id: "blue-1", designation: "Blue One" }),
    fighter({ id: "red-selected", designation: "Red Selected", affiliation: "RED", selected: true }),
    fighter({ id: "blue-2", designation: "Blue Two" }),
  ];
  const anchors = symbols.map((symbol) => ({ id: symbol.id, x: 100, y: 100 }));
  const rendered = applyTacticalLabelCollisionPolicy(symbols, anchors);
  const byId = new Map(rendered.map((symbol) => [symbol.id, symbol]));
  assert.equal(byId.get("red-selected")?.label.visibility, "VISIBLE");
  assert.equal(byId.get("blue-1")?.label.visibility, "COMPACT");
  assert.equal(byId.get("blue-2")?.label.visibility, "HIDDEN");
  assert.deepEqual(symbols.map((symbol) => symbol.label.visibility), ["VISIBLE", "VISIBLE", "VISIBLE"]);
});

test("coincident close-merge labels preserve both aircraft identities before the weapon", () => {
  const symbols = [
    fighter({ id: "blue-aircraft", designation: "Blue aircraft" }),
    fighter({ id: "red-aircraft", designation: "Red aircraft", affiliation: "RED", lifecycle: "TERMINATED" }),
    fighter({
      id: "blue-weapon",
      designation: "Blue weapon",
      kind: "GUIDED_WEAPON",
      symbolRole: "GUIDED_MISSILE",
      lifecycle: "TERMINATED",
    }),
  ];
  const anchors = symbols.map((symbol) => ({ id: symbol.id, x: 100, y: 100 }));
  const rendered = applyTacticalLabelCollisionPolicy(symbols, anchors);
  const byId = new Map(rendered.map((symbol) => [symbol.id, symbol]));
  assert.equal(byId.get("blue-aircraft")?.label.visibility, "VISIBLE");
  assert.equal(byId.get("red-aircraft")?.label.visibility, "COMPACT");
  assert.equal(byId.get("blue-weapon")?.label.visibility, "HIDDEN");
});
