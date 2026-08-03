import type { Affiliation, EntityKind, EntityLifecycle } from "./engine/contracts.ts";

const frame = (affiliation: Affiliation) =>
  affiliation === "RED"
    ? '<path d="M24 2 46 24 24 46 2 24Z" class="tactical-frame"/>'
    : affiliation === "NEUTRAL"
      ? '<rect x="3" y="3" width="42" height="42" class="tactical-frame"/>'
      : '<circle cx="24" cy="24" r="22" class="tactical-frame"/>';

const glyph: Record<EntityKind, string> = {
  AIRCRAFT: '<path d="M24 5 28 18 42 25v4l-14-3-1 9 6 4v3l-9-3-9 3v-3l6-4-1-9-14 3v-4l14-7Z" class="tactical-glyph tactical-glyph-fill"/>',
  GUIDED_WEAPON: '<path d="M24 6 29 15v18l5 6-8-2-2 6-2-6-8 2 5-6V15Z" class="tactical-glyph tactical-glyph-fill"/>',
  RADAR: '<path d="M15 28a13 13 0 0 1 18-12M12 33a18 18 0 0 1 26-21m-21 9 15-15-3 13ZM24 31v7m-6 0h12" class="tactical-glyph"/>',
  AIR_DEFENCE_SYSTEM: '<path d="M12 34h24v5H12zM16 31l14-14m-9 15 14-14M13 18a13 13 0 0 1 22-6" class="tactical-glyph"/>',
  SURFACE_LAUNCHER: '<path d="M10 34h27v6H10zM15 32l15-15m-8 16 15-15" class="tactical-glyph"/>',
  BASE: '<path d="m19 9 10 30M14 13l7-2m6 24 7-2M17 21l10-3m-7 11 10-3" class="tactical-glyph"/>',
  FIXED_OBJECTIVE: '<path d="M15 15h18v18H15zM24 9v6m0 18v6M9 24h6m18 0h6" class="tactical-glyph"/><circle cx="24" cy="24" r="4" class="tactical-glyph"/>',
};

export function tacticalSymbolMarkup(
  kind: EntityKind,
  affiliation: Affiliation,
  lifecycle: EntityLifecycle,
) {
  return `<svg viewBox="0 0 48 48" data-kind="${kind}" class="tactical-symbol tactical-symbol-${affiliation.toLowerCase()} tactical-symbol-${lifecycle.toLowerCase()}" aria-hidden="true">${frame(affiliation)}${glyph[kind]}</svg>`;
}
