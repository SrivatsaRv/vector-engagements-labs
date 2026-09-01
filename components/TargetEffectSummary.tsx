import type { CanonicalTargetEffectSelection } from "@/lib/frontend/selectors";

export function TargetEffectSummary({
  selection,
  compact = false,
}: {
  selection: CanonicalTargetEffectSelection;
  compact?: boolean;
}) {
  const { presentation, projection } = selection;
  const targetLifecycle = "targetLifecycleAtEffectFrame" in projection
    ? projection.targetLifecycleAtEffectFrame
    : undefined;
  return (
    <section
      className={`target-effect-summary target-effect-${presentation.tone}${compact ? " is-compact" : ""}`}
      aria-label="Canonical target effect"
      data-effect-state={presentation.state}
      data-effect-class={presentation.effectClass ?? "NONE"}
      data-effect-event-id={selection.eventId ?? "UNAVAILABLE"}
      data-effect-frame-index={"frameIndex" in projection ? projection.frameIndex : undefined}
      data-effect-time={"modelTimeSeconds" in projection ? projection.modelTimeSeconds : undefined}
      data-target-lifecycle={targetLifecycle}
      data-kill-claim-authorized={String(presentation.killClaimAuthorized)}
    >
      <span>{presentation.label}</span>
      <strong>{compact ? presentation.compactHeadline : presentation.headline}</strong>
      {!compact && <p>{presentation.detail}</p>}
      {!compact && presentation.assumptionLabel && (
        <small>{presentation.assumptionLabel} · limitations shown above</small>
      )}
    </section>
  );
}
