import { TacticalSymbol } from "@/components/TacticalSymbol";
import type { EntityKind } from "@/lib/engine/contracts";

const symbols: Array<{ kind: EntityKind; label: string; use: string }> = [
  { kind: "AIRCRAFT", label: "Aircraft", use: "Fighter, bomber, transport, AEW&C, tanker or UAV track" },
  { kind: "GUIDED_WEAPON", label: "Guided weapon", use: "Air-to-air, surface-to-air or strike vehicle in flight" },
  { kind: "RADAR", label: "Radar", use: "Search, surveillance or fire-control sensor" },
  { kind: "AIR_DEFENCE_SYSTEM", label: "Air-defence system", use: "Combined sensor, launcher and engagement system" },
  { kind: "SURFACE_LAUNCHER", label: "Surface launcher", use: "Ground-launched strike or interceptor origin" },
  { kind: "BASE", label: "Installation", use: "Air station, operating base or launch site" },
  { kind: "FIXED_OBJECTIVE", label: "Fixed objective", use: "Radar, shelter, command site or user-positioned target" },
];

export function SymbolReference() {
  return (
    <div className="symbol-reference">
      <section className="symbol-section">
        <header>
          <span>ENTITY CLASS</span>
          <h2>One glyph per modeled object class</h2>
        </header>
        <div className="symbol-grid">
          {symbols.map((symbol) => (
            <article key={symbol.kind} className="symbol-card">
              <div className="symbol-affiliation-row">
                <TacticalSymbol kind={symbol.kind} affiliation="BLUE" size={58} label={`Blue ${symbol.label}`} />
                <TacticalSymbol kind={symbol.kind} affiliation="RED" size={58} label={`Red ${symbol.label}`} />
                <TacticalSymbol kind={symbol.kind} affiliation="NEUTRAL" size={58} label={`Neutral ${symbol.label}`} />
              </div>
              <strong>{symbol.label}</strong>
              <p>{symbol.use}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="symbol-section symbol-state-section">
        <header>
          <span>AFFILIATION + STATE</span>
          <h2>Shape remains meaningful without color</h2>
        </header>
        <div className="symbol-state-grid">
          <article><TacticalSymbol kind="AIRCRAFT" affiliation="BLUE" size={68} /><strong>Blue</strong><span>Circle frame</span></article>
          <article><TacticalSymbol kind="AIRCRAFT" affiliation="RED" size={68} /><strong>Red</strong><span>Diamond frame</span></article>
          <article><TacticalSymbol kind="AIRCRAFT" affiliation="NEUTRAL" size={68} /><strong>Neutral</strong><span>Square frame</span></article>
          <article><TacticalSymbol kind="GUIDED_WEAPON" affiliation="BLUE" lifecycle="STOWED" size={68} /><strong>Stowed</strong><span>Dashed frame</span></article>
          <article><TacticalSymbol kind="GUIDED_WEAPON" affiliation="RED" lifecycle="TERMINATED" size={68} /><strong>Terminated</strong><span>Muted cross-state</span></article>
        </div>
      </section>
    </div>
  );
}
