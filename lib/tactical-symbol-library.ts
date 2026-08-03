import { GAME_ICON_AUTHORS, GAME_ICON_BODIES } from "./generated/game-icons.ts";
import type { EntityKind, TacticalSymbolRole } from "./engine/contracts.ts";

type GameIconName = keyof typeof GAME_ICON_BODIES;

export type TacticalSymbolDefinition = {
  role: TacticalSymbolRole;
  label: string;
  use: string;
  icon: GameIconName;
  author: string;
  auxiliaryMarkup?: string;
};

const role = (
  symbolRole: TacticalSymbolRole,
  label: string,
  use: string,
  icon: GameIconName,
  auxiliaryMarkup?: string,
): TacticalSymbolDefinition => ({
  role: symbolRole,
  label,
  use,
  icon,
  author: GAME_ICON_AUTHORS[icon],
  auxiliaryMarkup,
});

export const TACTICAL_SYMBOL_LIBRARY: Record<
  TacticalSymbolRole,
  TacticalSymbolDefinition
> = {
  FIGHTER: role("FIGHTER", "Fighter aircraft", "Fighter and multirole combat aircraft", "jet-fighter"),
  BOMBER: role("BOMBER", "Bomber", "Dedicated bomber or strike aircraft", "stealth-bomber"),
  TRANSPORT: role("TRANSPORT", "Transport aircraft", "Tactical and strategic airlift aircraft", "commercial-airplane"),
  AEW_C: role(
    "AEW_C",
    "Airborne early warning",
    "AEW&C aircraft contributing an off-board track",
    "commercial-airplane",
    '<ellipse cx="24" cy="14" rx="7" ry="2.5" class="tactical-role-detail"/><path d="M24 16.5v4" class="tactical-role-detail"/>',
  ),
  TANKER: role(
    "TANKER",
    "Tanker aircraft",
    "Air-to-air refuelling aircraft",
    "commercial-airplane",
    '<path d="M25 29l5 8 4 2" class="tactical-role-detail"/>',
  ),
  HELICOPTER: role("HELICOPTER", "Helicopter", "Rotary-wing aircraft", "helicopter"),
  UAV: role("UAV", "Uncrewed aircraft", "Remotely piloted or autonomous aircraft", "delivery-drone"),
  GUIDED_MISSILE: role("GUIDED_MISSILE", "Guided weapon", "A launched air-to-air, surface-to-air, or strike weapon", "rocket-flight"),
  RADAR: role("RADAR", "Radar", "Search, surveillance, or fire-control sensor", "radar-dish"),
  SAM_SYSTEM: role("SAM_SYSTEM", "Air-defence system", "Surface-to-air sensor and launcher system", "missile-launcher"),
  SURFACE_LAUNCHER: role("SURFACE_LAUNCHER", "Surface launcher", "Ground-launched strike or interceptor origin", "missile-pod"),
  AIR_BASE: role("AIR_BASE", "Air installation", "Air station, operating base, or launch site", "control-tower"),
  FIXED_OBJECTIVE: role("FIXED_OBJECTIVE", "Fixed objective", "Radar, shelter, command site, or positioned objective", "flag-objective"),
};

export const TACTICAL_SYMBOL_ROLES = Object.keys(
  TACTICAL_SYMBOL_LIBRARY,
) as TacticalSymbolRole[];

export function defaultSymbolRole(kind: EntityKind): TacticalSymbolRole {
  switch (kind) {
    case "AIRCRAFT":
      return "FIGHTER";
    case "GUIDED_WEAPON":
      return "GUIDED_MISSILE";
    case "RADAR":
      return "RADAR";
    case "AIR_DEFENCE_SYSTEM":
      return "SAM_SYSTEM";
    case "SURFACE_LAUNCHER":
      return "SURFACE_LAUNCHER";
    case "BASE":
      return "AIR_BASE";
    case "FIXED_OBJECTIVE":
      return "FIXED_OBJECTIVE";
  }
}

export function tacticalSymbolGlyphMarkup(symbolRole: TacticalSymbolRole) {
  const definition = TACTICAL_SYMBOL_LIBRARY[symbolRole];
  return `<g class="tactical-heading-layer"><g class="tactical-silhouette" transform="translate(12 12) scale(.046875)">${GAME_ICON_BODIES[definition.icon]}</g>${definition.auxiliaryMarkup ?? ""}</g>`;
}

export function tacticalSymbolBody(symbolRole: TacticalSymbolRole) {
  const definition = TACTICAL_SYMBOL_LIBRARY[symbolRole];
  return GAME_ICON_BODIES[definition.icon];
}
