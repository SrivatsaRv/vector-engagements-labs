"use client";

import { useEffect, useState } from "react";
import {
  admitRawNumber,
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

  useEffect(() => {
    onValidityChange(controlId, admission.ok);
    return () => onValidityChange(controlId, true);
  }, [admission.ok, controlId, onValidityChange]);

  return (
    <>
      <input
        type="text"
        inputMode={authority.integer ? "numeric" : "decimal"}
        data-control-id={controlId}
        aria-label={ariaLabel}
        aria-invalid={!admission.ok}
        aria-describedby={!admission.ok ? `${controlId}-error` : undefined}
        disabled={disabled}
        value={raw}
        onChange={(event) => {
          const nextRaw = event.target.value;
          setDraft({ raw: nextRaw, sourceValue: value });
          const next = admitRawNumber(nextRaw, authority);
          if (next.ok) onChange(next.value);
        }}
      />
      {!admission.ok && (
        <small className="field-error" id={`${controlId}-error`} role="alert">
          {admission.code.replaceAll("CONTROL_NUMBER_", "").toLowerCase().replaceAll("_", " ")}
        </small>
      )}
    </>
  );
}
