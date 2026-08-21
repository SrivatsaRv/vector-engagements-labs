import type { Affiliation } from "./engine/contracts.ts";
import type { TacticalSymbol } from "./tactical-symbol-contract.ts";
import { tacticalSymbolGlyphMarkup } from "./tactical-symbol-library.ts";

const frame = (affiliation: Affiliation) =>
  affiliation === "RED"
    ? '<path d="M24 2 46 24 24 46 2 24Z" class="tactical-frame"/>'
    : affiliation === "NEUTRAL"
      ? '<rect x="3" y="3" width="42" height="42" class="tactical-frame"/>'
      : '<circle cx="24" cy="24" r="22" class="tactical-frame"/>';

export function tacticalSymbolMarkup(symbol: TacticalSymbol) {
  if (symbol.availability === "UNAVAILABLE") {
    return `<svg viewBox="0 0 48 48" data-availability="UNAVAILABLE" data-unavailable-reason="${symbol.reason}" class="tactical-symbol tactical-symbol-unavailable" aria-hidden="true"><rect x="5" y="5" width="38" height="38" class="tactical-frame"/><path d="M13 13 35 35M35 13 13 35" class="tactical-unavailable-mark"/></svg>`;
  }
  const selected = symbol.selected ? " tactical-symbol-selected" : "";
  return `<svg viewBox="0 0 48 48" data-availability="AVAILABLE" data-kind="${symbol.kind}" data-symbol-role="${symbol.symbolRole}" data-lifecycle="${symbol.lifecycle}" data-value-state="${symbol.valueState}" data-selected="${symbol.selected}" class="tactical-symbol tactical-symbol-${symbol.affiliation.toLowerCase()} tactical-symbol-${symbol.lifecycle.toLowerCase()}${selected}" aria-hidden="true">${frame(symbol.affiliation)}${tacticalSymbolGlyphMarkup(symbol.symbolRole)}</svg>`;
}
