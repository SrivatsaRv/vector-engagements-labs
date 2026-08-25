"use client";

import { Check, ChevronDown, Database, TriangleAlert } from "lucide-react";
import type { CatalogObject } from "@/lib/object-catalog";
import {
  VectorSelect,
  type VectorSelectOption,
} from "@/components/ui/OverlayPrimitives";

export function ObjectPicker({
  label,
  value,
  options,
  team,
  onChange,
}: {
  label: string;
  value: string;
  options: CatalogObject[];
  team: "blue" | "red";
  onChange: (value: string) => void;
}) {
  const selectOptions: VectorSelectOption<string>[] = options.map((option) => ({
    value: option.id,
    label: option.designation,
    textValue: `${option.designation} ${option.name} ${option.country}`,
    content: option.designation,
  }));
  const byId = new Map(options.map((option) => [option.id, option]));

  return (
    <VectorSelect
      className={`object-picker ${team}`}
      emptyContent="No compatible object is available. Review the engagement type and admitted catalogue."
      footer={(
        <footer>
          <Database size={12} />
          Objects are filtered by engagement type and compatibility status.
        </footer>
      )}
      header={(
        <header>
          <span>
            {team === "blue" ? "Blue Team catalogue" : "Red Team catalogue"}
          </span>
          <small>{options.length} compatible objects</small>
        </header>
      )}
      label={label}
      labelClassName="object-picker-label"
      onChange={onChange}
      options={selectOptions}
      renderOption={(selectOption, state) => {
        const option = byId.get(selectOption.value)!;
        return (
          <>
            <i>{state.selected && <Check size={13} />}</i>
            <span>
              <strong>{option.designation}</strong>
              <small>
                {option.name} · {option.country}
              </small>
            </span>
            <em>
              {option.dataState === "PUBLIC_REFERENCE" ? (
                <Database size={12} />
              ) : (
                <TriangleAlert size={12} />
              )}
            </em>
          </>
        );
      }}
      renderTrigger={(selected, state) => {
        const option = selected ? byId.get(selected.value) : undefined;
        return (
          <>
            <span>
              <strong>{state.invalid ? "Unavailable selection" : option?.designation ?? "No compatible object"}</strong>
              <small>{state.invalid ? value : option?.name ?? "Review the platform selection"}</small>
            </span>
            <ChevronDown aria-hidden="true" size={15} />
          </>
        );
      }}
      surfaceClassName="object-picker-menu"
      triggerClassName="object-picker-trigger"
      value={value}
    />
  );
}
