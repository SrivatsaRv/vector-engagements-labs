import type { Affiliation, EntityKind, EntityLifecycle, TacticalSymbolRole } from "./engine/contracts.ts";
import { defaultSymbolRole, tacticalSymbolGlyphMarkup } from "./tactical-symbol-library.ts";

const frame = (affiliation: Affiliation) =>
  affiliation === "RED"
    ? '<path d="M24 2 46 24 24 46 2 24Z" class="tactical-frame"/>'
    : affiliation === "NEUTRAL"
      ? '<rect x="3" y="3" width="42" height="42" class="tactical-frame"/>'
      : '<circle cx="24" cy="24" r="22" class="tactical-frame"/>';

export function tacticalSymbolMarkup(
  kind: EntityKind,
  affiliation: Affiliation,
  lifecycle: EntityLifecycle,
  symbolRole: TacticalSymbolRole = defaultSymbolRole(kind),
) {
  return `<svg viewBox="0 0 48 48" data-kind="${kind}" data-symbol-role="${symbolRole}" class="tactical-symbol tactical-symbol-${affiliation.toLowerCase()} tactical-symbol-${lifecycle.toLowerCase()}" aria-hidden="true">${frame(affiliation)}${tacticalSymbolGlyphMarkup(symbolRole)}</svg>`;
}
