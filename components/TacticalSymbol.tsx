import type {
  Affiliation,
  EntityKind,
  EntityLifecycle,
} from "@/lib/engine/contracts";

type Props = {
  kind: EntityKind;
  affiliation: Affiliation;
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
function Glyph({ kind }: { kind: EntityKind }) {
  switch (kind) {
    case "AIRCRAFT":
      return (
        <path
          d="m24 9 3.2 10.2 11.3 5.2v3.2l-11-2.1-1.1 7.6 4.3 3v2.4L24 36l-6.7 2.5v-2.4l4.3-3-1.1-7.6-11 2.1v-3.2l11.3-5.2Z"
          className="tactical-glyph tactical-glyph-fill"
        />
      );
    case "GUIDED_WEAPON":
      return (
        <path
          d="M13 29 29.5 12.5l5-1-1 5L17 33l-7 3 3-7Zm11-6 7 7m-12-2-1-7"
          className="tactical-glyph"
        />
      );
    case "RADAR":
      return (
        <g className="tactical-glyph">
          <path d="M15 28a13 13 0 0 1 18-12M12 33a18 18 0 0 1 26-21" />
          <path d="m17 31 15-15-3 13Z" className="tactical-glyph-fill" />
          <path d="M24 31v7m-6 0h12" />
        </g>
      );
    case "AIR_DEFENCE_SYSTEM":
      return (
        <g className="tactical-glyph">
          <path d="M12 34h24v5H12zM16 31l14-14m-9 15 14-14" />
          <path d="m29 14 7 1-3 6Z" className="tactical-glyph-fill" />
          <path d="M13 18a13 13 0 0 1 22-6" />
        </g>
      );
    case "SURFACE_LAUNCHER":
      return (
        <g className="tactical-glyph">
          <path d="M10 34h27v6H10zM15 32l15-15m-8 16 15-15" />
          <circle cx="16" cy="40" r="2" className="tactical-glyph-fill" />
          <circle cx="32" cy="40" r="2" className="tactical-glyph-fill" />
        </g>
      );
    case "BASE":
      return (
        <g className="tactical-glyph">
          <path d="m19 9 10 30M14 13l7-2m6 24 7-2M17 21l10-3m-7 11 10-3" />
        </g>
      );
    case "FIXED_OBJECTIVE":
      return (
        <g className="tactical-glyph">
          <rect x="15" y="15" width="18" height="18" />
          <circle cx="24" cy="24" r="4" />
          <path d="M24 9v6m0 18v6M9 24h6m18 0h6" />
        </g>
      );
    default:
      return (
        <g className="tactical-glyph">
          <path d="M15 36V22h18v14M18 22v-7h12v7M12 36h24" />
        </g>
      );
  }
}

export function TacticalSymbol({
  kind,
  affiliation,
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
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Frame affiliation={affiliation} />
      <Glyph kind={kind} />
    </svg>
  );
}
