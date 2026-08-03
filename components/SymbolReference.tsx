import { TacticalSymbol } from "@/components/TacticalSymbol";
import type { EntityKind, TacticalSymbolRole } from "@/lib/engine/contracts";
import {
  TACTICAL_SYMBOL_LIBRARY,
  TACTICAL_SYMBOL_ROLES,
} from "@/lib/tactical-symbol-library";

function kindForRole(role: TacticalSymbolRole): EntityKind {
  if (["FIGHTER", "BOMBER", "TRANSPORT", "AEW_C", "TANKER", "HELICOPTER", "UAV"].includes(role)) {
    return "AIRCRAFT";
  }
  if (role === "GUIDED_MISSILE") return "GUIDED_WEAPON";
  if (role === "RADAR") return "RADAR";
  if (role === "SAM_SYSTEM") return "AIR_DEFENCE_SYSTEM";
  if (role === "SURFACE_LAUNCHER") return "SURFACE_LAUNCHER";
  if (role === "AIR_BASE") return "BASE";
  return "FIXED_OBJECTIVE";
}

export function SymbolReference() {
  return (
    <div className="symbol-reference">
      <section className="symbol-section">
        <header>
          <span>ENTITY ROLE</span>
          <h2>Recognisable silhouettes, governed by the scenario entity</h2>
          <p>
            The database assigns a role to each object. The engine carries that
            role into every frame, so the map, 3D playback, legend, and report
            cannot silently substitute a generic dot.
          </p>
        </header>
        <div className="symbol-grid">
          {TACTICAL_SYMBOL_ROLES.map((symbolRole) => {
            const symbol = TACTICAL_SYMBOL_LIBRARY[symbolRole];
            const kind = kindForRole(symbolRole);
            return (
              <article key={symbolRole} className="symbol-card">
                <div className="symbol-affiliation-row">
                  <TacticalSymbol kind={kind} symbolRole={symbolRole} affiliation="BLUE" size={62} label={`Blue ${symbol.label}`} />
                  <TacticalSymbol kind={kind} symbolRole={symbolRole} affiliation="RED" size={62} label={`Red ${symbol.label}`} />
                  <TacticalSymbol kind={kind} symbolRole={symbolRole} affiliation="NEUTRAL" size={62} label={`Neutral ${symbol.label}`} />
                </div>
                <strong>{symbol.label}</strong>
                <p>{symbol.use}</p>
                <small>{symbolRole.replaceAll("_", " ")} · Game Icons by {symbol.author}</small>
              </article>
            );
          })}
        </div>
      </section>
      <section className="symbol-section symbol-state-section">
        <header>
          <span>AFFILIATION + LIFECYCLE</span>
          <h2>A carried weapon becomes a world object only at launch</h2>
        </header>
        <div className="symbol-state-grid">
          <article><TacticalSymbol kind="AIRCRAFT" symbolRole="FIGHTER" affiliation="BLUE" size={68} /><strong>Blue Team</strong><span>Blue circle frame</span></article>
          <article><TacticalSymbol kind="AIRCRAFT" symbolRole="FIGHTER" affiliation="RED" size={68} /><strong>Red Team</strong><span>Red diamond frame</span></article>
          <article><TacticalSymbol kind="AIRCRAFT" symbolRole="TRANSPORT" affiliation="NEUTRAL" size={68} /><strong>Neutral</strong><span>Grey square frame</span></article>
          <article><TacticalSymbol kind="GUIDED_WEAPON" symbolRole="GUIDED_MISSILE" affiliation="BLUE" lifecycle="STOWED" size={68} /><strong>Stowed</strong><span>Manifest only; hidden from world view</span></article>
          <article><TacticalSymbol kind="GUIDED_WEAPON" symbolRole="GUIDED_MISSILE" affiliation="RED" lifecycle="TERMINATED" size={68} /><strong>Terminated</strong><span>Muted in replay history</span></article>
        </div>
      </section>
      <section className="symbol-license-note">
        <strong>Visual source and scope</strong>
        <p>
          Silhouettes are selected from Game Icons and compiled into VECTOR
          under CC BY 3.0. VECTOR adds affiliation frames, lifecycle, heading,
          altitude, labels, tracks, and coverage. This is an analysis-display
          subset, not NATO APP-6/MIL-STD-2525 compliance and not Tacview
          compatibility.
        </p>
      </section>
    </div>
  );
}
