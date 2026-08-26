import { TacticalSymbol } from "@/components/TacticalSymbol";
import type { TacticalSymbol as TacticalSymbolPresentation } from "@/lib/tactical-symbol-contract";

type Props = {
  symbols: readonly TacticalSymbolPresentation[];
  label?: string;
};

/** Presentation-only legend. It accepts resolved symbols and has no run input. */
export function TacticalSymbolLegend({ symbols, label = "Entity symbols" }: Props) {
  return (
    <ul className="symbol-key tactical-symbol-legend" aria-label={label}>
      {symbols.map((symbol) => (
        <li
          key={symbol.id}
          data-availability={symbol.availability}
          data-entity-id={symbol.id}
        >
          <TacticalSymbol presentation={symbol} size={22} />
          <span>{symbol.label.text}</span>
          {symbol.availability === "UNAVAILABLE" && <small>Unavailable</small>}
        </li>
      ))}
    </ul>
  );
}
