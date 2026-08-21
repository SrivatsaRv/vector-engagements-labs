import type {
  Affiliation,
  EntityKind,
  EntityLifecycle,
  TacticalSymbolRole,
} from "@/lib/engine/contracts";
import {
  TACTICAL_SYMBOL_LIBRARY,
  tacticalSymbolBody,
} from "@/lib/tactical-symbol-library";
import {
  presentTacticalSymbol,
  tacticalSymbolAccessibleName,
  type TacticalSymbol as TacticalSymbolPresentation,
  type TacticalValueState,
} from "@/lib/tactical-symbol-contract";

type InputProps = {
  id?: string;
  kind: EntityKind;
  affiliation: Affiliation;
  symbolRole?: TacticalSymbolRole;
  lifecycle?: EntityLifecycle;
  headingRad?: number;
  selected?: boolean;
  valueState?: TacticalValueState;
  size?: number;
  label?: string;
};
type Props = InputProps | {
  presentation: TacticalSymbolPresentation;
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

export function TacticalSymbol(props: Props) {
  const size = props.size ?? 48;
  const label = props.label;
  const presentation = "presentation" in props
    ? props.presentation
    : presentTacticalSymbol({
        id: props.id ?? label ?? `${props.kind}-${props.affiliation}`,
        designation: label ?? props.kind.replaceAll("_", " "),
        kind: props.kind,
        affiliation: props.affiliation,
        lifecycle: props.lifecycle ?? "ACTIVE",
        symbolRole: props.symbolRole,
        headingRad: props.headingRad,
        selected: props.selected,
        valueState: props.valueState ?? "WORLD",
      });
  const accessibleName = label ?? tacticalSymbolAccessibleName(presentation);
  if (presentation.availability === "UNAVAILABLE") {
    return (
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="tactical-symbol tactical-symbol-unavailable"
        data-availability="UNAVAILABLE"
        data-unavailable-reason={presentation.reason}
        role="img"
        aria-label={accessibleName}
      >
        <rect x="5" y="5" width="38" height="38" className="tactical-frame" />
        <path d="M13 13 35 35M35 13 13 35" className="tactical-unavailable-mark" />
      </svg>
    );
  }
  const classes = [
    "tactical-symbol",
    `tactical-symbol-${presentation.affiliation.toLowerCase()}`,
    `tactical-symbol-${presentation.lifecycle.toLowerCase()}`,
    presentation.selected ? "tactical-symbol-selected" : "",
  ].join(" ");
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={classes}
      data-availability="AVAILABLE"
      data-kind={presentation.kind}
      data-symbol-role={presentation.symbolRole}
      data-value-state={presentation.valueState}
      data-selected={presentation.selected}
      role="img"
      aria-label={accessibleName}
    >
      <Frame affiliation={presentation.affiliation} />
      <Glyph symbolRole={presentation.symbolRole} />
    </svg>
  );
}
