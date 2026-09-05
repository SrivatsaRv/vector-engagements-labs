"use client";

import { useEffect, useState } from "react";
import {
  admitRawNumber,
  authoritiesEqual,
  resolveScenarioNumericControlAuthority,
  type NumericAuthority,
} from "@/lib/scenario-control-authority";

export function NumericAuthoringInput({
  controlId,
  ariaLabel,
  value,
  authority,
  disabled = false,
  onChange,
  onValidityChange,
}: {
  controlId: string;
  ariaLabel: string;
  value: number | null | undefined;
  authority: NumericAuthority;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onValidityChange: (controlId: string, valid: boolean) => void;
}) {
  const governedAuthority = resolveScenarioNumericControlAuthority(controlId);
  if (!governedAuthority) {
    throw new TypeError(`${controlId} has no governed #193 numeric authority.`);
  }
  if (!authoritiesEqual(governedAuthority, authority)) {
    throw new TypeError(`${controlId} is not bound to its governed #193 numeric authority.`);
  }
  const [draft, setDraft] = useState({
    raw: value == null ? "" : String(value),
    sourceValue: value,
  });
  const draftAdmission = admitRawNumber(draft.raw, authority);
  const externalValueReplacedDraft = !Object.is(draft.sourceValue, value)
    && (!draftAdmission.ok || !Object.is(draftAdmission.value, value ?? null));
  const raw = externalValueReplacedDraft
    ? (value == null ? "" : String(value))
    : draft.raw;
  const admission = admitRawNumber(raw, authority);
  // Disabled controls are read-only projections of another authoritative
  // choice (for example START or FLY_OVER waypoint semantics). Their sentinel
  // value is still checked by structured scenario admission, but it is not an
  // operator-editable raw draft and therefore must not poison the global raw
  // authoring-validity registry.
  const rawDraftValid = disabled || admission.ok;

  useEffect(() => {
    onValidityChange(controlId, rawDraftValid);
    return () => onValidityChange(controlId, true);
  }, [controlId, onValidityChange, rawDraftValid]);

  return (
    <>
      <input
        type="text"
        inputMode={authority.integer ? "numeric" : "decimal"}
        data-control-id={controlId}
        aria-label={ariaLabel}
        aria-invalid={!rawDraftValid}
        aria-describedby={!rawDraftValid ? `${controlId}-error` : undefined}
        disabled={disabled}
        value={raw}
        onChange={(event) => {
          const nextRaw = event.target.value;
          setDraft({ raw: nextRaw, sourceValue: value });
          const next = admitRawNumber(nextRaw, authority);
          if (next.ok) onChange(next.value);
        }}
      />
      {!rawDraftValid && (
        <small className="field-error" id={`${controlId}-error`} role="alert">
          {admission.code.replaceAll("CONTROL_NUMBER_", "").toLowerCase().replaceAll("_", " ")}
        </small>
      )}
    </>
  );
}
