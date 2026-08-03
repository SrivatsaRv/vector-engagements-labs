import type {
  Affiliation,
  EntityKind,
  EntityLifecycle,
  TacticalSymbolRole,
} from "@/lib/engine/contracts";
import {
  defaultSymbolRole,
  TACTICAL_SYMBOL_LIBRARY,
  tacticalSymbolBody,
} from "@/lib/tactical-symbol-library";

type Props = {
  kind: EntityKind;
  affiliation: Affiliation;
  symbolRole?: TacticalSymbolRole;
  lifecycle?: EntityLifecycle;
  size?: number;
  label?: string;
};

function Frame({ affiliation }: { affiliation: Affiliation }) {
  if (affiliation === "RED") {
    return <path d="M24 2 46 24 24 46 2 24Z" className="tactical-frame" />;
  }
  if (affiliation === "NEUTRAL") {
    return <rect x="3" y="3" width="42" height="42" className="tactical-frame" />;
  }
  return <circle cx="24" cy="24" r="22" className="tactical-frame" />;
}

function Glyph({ symbolRole }: { symbolRole: TacticalSymbolRole }) {
  const definition = TACTICAL_SYMBOL_LIBRARY[symbolRole];
  return (
    <g className="tactical-heading-layer">
      <g
        className="tactical-silhouette"
        transform="translate(12 12) scale(.046875)"
        dangerouslySetInnerHTML={{ __html: tacticalSymbolBody(symbolRole) }}
      />
      {definition.auxiliaryMarkup && (
        <g
          className="tactical-role-detail-group"
          dangerouslySetInnerHTML={{ __html: definition.auxiliaryMarkup }}
        />
      )}
    </g>
  );
}

export function TacticalSymbol({
  kind,
  affiliation,
  symbolRole = defaultSymbolRole(kind),
  lifecycle = "ACTIVE",
  size = 48,
  label,
}: Props) {
  const classes = [
    "tactical-symbol",
    `tactical-symbol-${affiliation.toLowerCase()}`,
    `tactical-symbol-${lifecycle.toLowerCase()}`,
  ].join(" ");
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={classes}
      data-kind={kind}
      data-symbol-role={symbolRole}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Frame affiliation={affiliation} />
      <Glyph symbolRole={symbolRole} />
    </svg>
  );
}
