import type {
  Affiliation,
  EntityKind,
  EntityLifecycle,
  TacticalSymbolRole,
} from "./engine/contracts.ts";
import { defaultSymbolRole, TACTICAL_SYMBOL_LIBRARY } from "./tactical-symbol-library.ts";

/**
 * Presentation-only classification of the source that supports a displayed
 * entity. It does not create an observation, track, estimate, or world state.
 */
export type TacticalValueState =
  | "WORLD"
  | "OBSERVED_TRACK"
  | "ESTIMATED"
  | "UNSUPPORTED";

export type TacticalLabelVisibility = "VISIBLE" | "COMPACT" | "HIDDEN";

/**
 * A map-projected marker anchor supplied by a rendering surface. Coordinates
 * are CSS pixels in that surface only; they are not simulation coordinates.
 */
export type TacticalLabelScreenAnchor = {
  id: string;
  x: number;
  y: number;
};

export type TacticalSymbolInput = {
  id: string;
  designation: string;
  kind: EntityKind;
  affiliation: Affiliation;
  lifecycle: EntityLifecycle;
  symbolRole?: TacticalSymbolRole;
  /** Required only for symbols whose recorded state has an orientation. */
  headingRad?: number;
  headingRequired?: boolean;
  selected?: boolean;
  valueState: TacticalValueState;
};

export type TacticalSymbolUnavailableReason =
  | "UNSUPPORTED_SOURCE_STATE"
  | "UNSUPPORTED_KIND_ROLE"
  | "MISSING_DESIGNATION"
  | "MISSING_HEADING";

export type TacticalSymbolPresentation = {
  availability: "AVAILABLE";
  id: string;
  designation: string;
  kind: EntityKind;
  affiliation: Affiliation;
  lifecycle: EntityLifecycle;
  symbolRole: TacticalSymbolRole;
  valueState: Exclude<TacticalValueState, "UNSUPPORTED">;
  selected: boolean;
  /** Stowed inventory is not a world marker. */
  renderable: boolean;
  headingDeg?: number;
  label: {
    text: string;
    visibility: TacticalLabelVisibility;
  };
};

export type TacticalSymbolUnavailable = {
  availability: "UNAVAILABLE";
  id: string;
  designation: string;
  reason: TacticalSymbolUnavailableReason;
  label: {
    text: string;
    visibility: "VISIBLE";
  };
};

export type TacticalSymbol = TacticalSymbolPresentation | TacticalSymbolUnavailable;

const ROLES_BY_KIND: Readonly<Record<EntityKind, readonly TacticalSymbolRole[]>> = {
  AIRCRAFT: ["FIGHTER", "BOMBER", "TRANSPORT", "AEW_C", "TANKER", "HELICOPTER", "UAV"],
  GUIDED_WEAPON: ["GUIDED_MISSILE"],
  AIR_DEFENCE_SYSTEM: ["SAM_SYSTEM"],
  RADAR: ["RADAR"],
  SURFACE_LAUNCHER: ["SURFACE_LAUNCHER"],
  BASE: ["AIR_BASE"],
  FIXED_OBJECTIVE: ["FIXED_OBJECTIVE"],
};

function compactDesignation(designation: string) {
  return designation.trim().replace(/\s+/g, " ").slice(0, 48);
}

function unavailable(
  input: TacticalSymbolInput,
  reason: TacticalSymbolUnavailableReason,
): TacticalSymbolUnavailable {
  const designation = compactDesignation(input.designation) || "Entity";
  return {
    availability: "UNAVAILABLE",
    id: input.id,
    designation,
    reason,
    label: { text: `${designation} unavailable`, visibility: "VISIBLE" },
  };
}

function isOrientable(kind: EntityKind) {
  return kind === "AIRCRAFT" || kind === "GUIDED_WEAPON";
}

/**
 * Converts already-canonical entity/frame data into a render contract. This is
 * deliberately pure: consumers cannot mutate a record through a symbol.
 */
export function presentTacticalSymbol(input: TacticalSymbolInput): TacticalSymbol {
  const designation = compactDesignation(input.designation);
  if (!designation) return unavailable(input, "MISSING_DESIGNATION");
  if (input.valueState === "UNSUPPORTED") return unavailable(input, "UNSUPPORTED_SOURCE_STATE");

  const symbolRole = input.symbolRole ?? defaultSymbolRole(input.kind);
  if (!TACTICAL_SYMBOL_LIBRARY[symbolRole] || !ROLES_BY_KIND[input.kind].includes(symbolRole)) {
    return unavailable(input, "UNSUPPORTED_KIND_ROLE");
  }
  if (input.headingRequired && isOrientable(input.kind) && !Number.isFinite(input.headingRad)) {
    return unavailable(input, "MISSING_HEADING");
  }

  return {
    availability: "AVAILABLE",
    id: input.id,
    designation,
    kind: input.kind,
    affiliation: input.affiliation,
    lifecycle: input.lifecycle,
    symbolRole,
    valueState: input.valueState,
    selected: input.selected ?? false,
    renderable: input.lifecycle !== "STOWED",
    headingDeg: isOrientable(input.kind)
      ? 90 - ((input.headingRad ?? 0) * 180) / Math.PI
      : undefined,
    label: { text: designation, visibility: "VISIBLE" },
  };
}

function labelScore(symbol: TacticalSymbolPresentation) {
  return (symbol.selected ? 10_000 : 0)
    + (symbol.lifecycle === "ENGAGING" ? 400 : 0)
    + (symbol.kind === "GUIDED_WEAPON" ? 200 : 0)
    + (symbol.kind === "AIRCRAFT" ? 100 : 0);
}

/**
 * Stable, display-only label decluttering. The selected entity is always
 * available by label; remaining labels use lifecycle/kind and stable ID order.
 */
export function applyTacticalLabelPolicy(
  symbols: readonly TacticalSymbol[],
): TacticalSymbol[] {
  const available = symbols
    .filter((symbol): symbol is TacticalSymbolPresentation => symbol.availability === "AVAILABLE" && symbol.renderable)
    .sort((left, right) => labelScore(right) - labelScore(left) || left.id.localeCompare(right.id));
  const visibilityById = new Map(available.map((symbol, index) => [
    symbol.id,
    index === 0 || symbol.selected ? "VISIBLE" : index < 3 ? "COMPACT" : "HIDDEN",
  ] as const));

  return symbols.map((symbol) => symbol.availability === "UNAVAILABLE"
    ? symbol
    : {
        ...symbol,
        label: {
          ...symbol.label,
          visibility: symbol.renderable
            ? visibilityById.get(symbol.id) ?? "HIDDEN"
            : "HIDDEN",
        },
      });
}

type LabelBox = { left: number; top: number; right: number; bottom: number };

const FULL_LABEL_WIDTH = 150;
const COMPACT_LABEL_WIDTH = 116;
const LABEL_HEIGHT = 20;

function labelBox(anchor: TacticalLabelScreenAnchor, visibility: Exclude<TacticalLabelVisibility, "HIDDEN">): LabelBox {
  if (visibility === "COMPACT") {
    return {
      left: anchor.x + 14,
      top: anchor.y - 46,
      right: anchor.x + 14 + COMPACT_LABEL_WIDTH,
      bottom: anchor.y - 46 + LABEL_HEIGHT,
    };
  }
  return {
    left: anchor.x - FULL_LABEL_WIDTH / 2,
    top: anchor.y + 18,
    right: anchor.x + FULL_LABEL_WIDTH / 2,
    bottom: anchor.y + 18 + LABEL_HEIGHT,
  };
}

function overlaps(left: LabelBox, right: LabelBox) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

/**
 * Resolves label collision after a map projects canonical positions into its
 * own CSS-pixel coordinate space. It changes only presentation visibility.
 * A selected entity retains its full label; lower priority colliding labels
 * are hidden and remain available through marker focus/selection.
 */
export function applyTacticalLabelCollisionPolicy(
  symbols: readonly TacticalSymbol[],
  anchors: readonly TacticalLabelScreenAnchor[],
): TacticalSymbol[] {
  const initial = applyTacticalLabelPolicy(symbols);
  const anchorById = new Map(
    anchors
      .filter((anchor) => Number.isFinite(anchor.x) && Number.isFinite(anchor.y))
      .map((anchor) => [anchor.id, anchor]),
  );
  const ordered = initial
    .filter((symbol): symbol is TacticalSymbolPresentation => (
      symbol.availability === "AVAILABLE" && symbol.renderable && symbol.label.visibility !== "HIDDEN"
    ))
    .sort((left, right) => labelScore(right) - labelScore(left) || left.id.localeCompare(right.id));
  const accepted: LabelBox[] = [];
  const visibilityById = new Map<string, TacticalLabelVisibility>();

  for (const symbol of ordered) {
    const anchor = anchorById.get(symbol.id);
    if (!anchor) {
      visibilityById.set(symbol.id, symbol.label.visibility);
      continue;
    }
    const preferred: Exclude<TacticalLabelVisibility, "HIDDEN"> = symbol.selected
      ? "VISIBLE"
      : symbol.label.visibility === "COMPACT"
        ? "COMPACT"
        : "VISIBLE";
    const proposed = labelBox(anchor, preferred);
    if (symbol.selected || !accepted.some((box) => overlaps(box, proposed))) {
      accepted.push(proposed);
      visibilityById.set(symbol.id, preferred);
      continue;
    }
    visibilityById.set(symbol.id, "HIDDEN");
  }

  return initial.map((symbol) => symbol.availability === "UNAVAILABLE"
    ? symbol
    : {
        ...symbol,
        label: {
          ...symbol.label,
          visibility: symbol.renderable
            ? visibilityById.get(symbol.id) ?? symbol.label.visibility
            : "HIDDEN",
        },
      });
}

export function tacticalSymbolAccessibleName(symbol: TacticalSymbol) {
  if (symbol.availability === "UNAVAILABLE") {
    return `${symbol.designation}: unavailable (${symbol.reason.replaceAll("_", " ").toLowerCase()})`;
  }
  const source = symbol.valueState === "WORLD"
    ? "recorded world state"
    : symbol.valueState === "OBSERVED_TRACK"
      ? "observed track"
      : "estimated state";
  return `${symbol.designation}: ${symbol.affiliation.toLowerCase()} ${symbol.symbolRole.replaceAll("_", " ").toLowerCase()}, ${symbol.lifecycle.toLowerCase()}, ${source}${symbol.selected ? ", selected" : ""}`;
}
