"use client";

import { Check, ChevronDown, Database, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogObject } from "@/lib/object-catalog";

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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? Math.min(options.length - 1, current + 1)
          : Math.max(0, current - 1),
      );
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, options.length - 1));
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <div className={`object-picker ${team}`} ref={root}>
      <span className="object-picker-label">{label}</span>
      <button
        className="object-picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!selected}
        onKeyDown={onKeyDown}
        onClick={() => {
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.id === value),
            ),
          );
          setOpen((current) => !current);
        }}
      >
        <span>
          <strong>{selected?.designation ?? "No compatible object"}</strong>
          <small>{selected?.name ?? "Review the platform selection"}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="object-picker-menu" role="listbox" aria-label={label}>
          <header>
            <span>
              {team === "blue" ? "Blue Team catalogue" : "Red Team catalogue"}
            </span>
            <small>{options.length} compatible objects</small>
          </header>
          {options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`${option.id === value ? "selected" : ""} ${index === activeIndex ? "keyboard-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <i>{option.id === value && <Check size={13} />}</i>
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
            </button>
          ))}
          <footer>
            <Database size={12} />
            Objects are filtered by engagement type and compatibility status.
          </footer>
        </div>
      )}
    </div>
  );
}
