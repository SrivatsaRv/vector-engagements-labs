"use client";

import {
  createContext,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type OverlayElementKind = "trigger" | "surface";
type CloseOptions = { restoreFocus?: boolean };

type OverlayCoordinator = {
  activeId: string | null;
  close: (id: string, options?: CloseOptions) => void;
  getOtherTriggerRects: (id: string) => DOMRect[];
  register: (
    id: string,
    kind: OverlayElementKind,
    element: HTMLElement | null,
  ) => void;
  toggle: (id: string) => void;
};

const OverlayCoordinatorContext = createContext<OverlayCoordinator | null>(null);

/**
 * Owns the one-open invariant and the only workspace-level document listeners.
 * Transient surfaces register their trigger and portal root; persistent
 * disclosures deliberately do not participate.
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const elements = useRef(
    new Map<string, { trigger: HTMLElement | null; surface: HTMLElement | null }>(),
  );

  const setActive = useCallback((next: string | null) => {
    activeIdRef.current = next;
    setActiveId(next);
  }, []);

  const close = useCallback((id: string, options: CloseOptions = {}) => {
    if (activeIdRef.current !== id) return;
    const trigger = elements.current.get(id)?.trigger;
    setActive(null);
    if (options.restoreFocus && trigger?.isConnected) {
      window.requestAnimationFrame(() => trigger.focus());
    }
  }, [setActive]);

  const toggle = useCallback((id: string) => {
    setActive(activeIdRef.current === id ? null : id);
  }, [setActive]);

  const getOtherTriggerRects = useCallback((id: string) =>
    [...elements.current.entries()]
      .filter(([candidateId, record]) => candidateId !== id && record.trigger?.isConnected)
      .map(([, record]) => record.trigger!.getBoundingClientRect()), []);

  const register = useCallback((
    id: string,
    kind: OverlayElementKind,
    element: HTMLElement | null,
  ) => {
    const record = elements.current.get(id) ?? { trigger: null, surface: null };
    record[kind] = element;
    elements.current.set(id, record);
    if (!element && kind === "trigger" && activeIdRef.current === id) {
      setActive(null);
    }
    if (!record.trigger && !record.surface) elements.current.delete(id);
  }, [setActive]);

  useEffect(() => {
    const registry = elements.current;
    const outsidePress = (event: PointerEvent) => {
      const id = activeIdRef.current;
      if (!id) return;
      const record = registry.get(id);
      const path = event.composedPath();
      if (
        (record?.trigger && path.includes(record.trigger))
        || (record?.surface && path.includes(record.surface))
      ) return;
      setActive(null);
    };
    const keys = (event: KeyboardEvent) => {
      const id = activeIdRef.current;
      if (!id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(id, { restoreFocus: true });
      }
    };
    const focusChanged = (event: FocusEvent) => {
      const id = activeIdRef.current;
      if (!id) return;
      const record = registry.get(id);
      const target = event.target;
      if (
        target instanceof Node
        && ((record?.trigger && record.trigger.contains(target))
          || (record?.surface && record.surface.contains(target)))
      ) return;
      setActive(null);
    };
    const routeChanged = () => setActive(null);
    const browserNavigation = (window as Window & {
      navigation?: EventTarget;
    }).navigation;
    document.addEventListener("pointerdown", outsidePress);
    document.addEventListener("keydown", keys);
    document.addEventListener("focusin", focusChanged);
    window.addEventListener("popstate", routeChanged);
    window.addEventListener("hashchange", routeChanged);
    browserNavigation?.addEventListener("navigate", routeChanged);
    return () => {
      document.removeEventListener("pointerdown", outsidePress);
      document.removeEventListener("keydown", keys);
      document.removeEventListener("focusin", focusChanged);
      window.removeEventListener("popstate", routeChanged);
      window.removeEventListener("hashchange", routeChanged);
      browserNavigation?.removeEventListener("navigate", routeChanged);
      registry.clear();
      activeIdRef.current = null;
    };
  }, [close, setActive]);

  const value = useMemo(
    () => ({ activeId, close, getOtherTriggerRects, register, toggle }),
    [activeId, close, getOtherTriggerRects, register, toggle],
  );
  return (
    <OverlayCoordinatorContext.Provider value={value}>
      {children}
    </OverlayCoordinatorContext.Provider>
  );
}

function useOverlayCoordinator() {
  const coordinator = useContext(OverlayCoordinatorContext);
  if (!coordinator) {
    throw new Error("VECTOR transient controls require one OverlayProvider");
  }
  return coordinator;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function useTransientOverlay(explicitId?: string) {
  const generatedId = useId();
  const id = explicitId ?? `vector-overlay-${safeId(generatedId)}`;
  const { activeId, close, getOtherTriggerRects, register, toggle } = useOverlayCoordinator();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setTrigger = useCallback((element: HTMLButtonElement | null) => {
    triggerRef.current = element;
    register(id, "trigger", element);
  }, [id, register]);
  const setSurface = useCallback((element: HTMLDivElement | null) => {
    register(id, "surface", element);
  }, [id, register]);

  useEffect(() => () => {
    register(id, "trigger", null);
    register(id, "surface", null);
  }, [id, register]);

  const closeCurrent = useCallback(
    (options?: CloseOptions) => close(id, options),
    [close, id],
  );
  const getCurrentOtherTriggerRects = useCallback(
    () => getOtherTriggerRects(id),
    [getOtherTriggerRects, id],
  );
  const toggleCurrent = useCallback(() => toggle(id), [id, toggle]);

  return {
    close: closeCurrent,
    getOtherTriggerRects: getCurrentOtherTriggerRects,
    id,
    open: activeId === id,
    setSurface,
    setTrigger,
    toggle: toggleCurrent,
    triggerRef,
  };
}

type SurfacePosition = Pick<CSSProperties, "left" | "top" | "width" | "maxHeight"> & {
  visibility: CSSProperties["visibility"];
};

function OverlaySurface({
  ariaLabel,
  children,
  className,
  id,
  matchTriggerWidth = false,
  maxWidth = 360,
  onKeyDown,
  otherTriggerRects,
  open,
  role,
  setSurface,
  tabIndex,
  triggerRef,
}: {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  id: string;
  matchTriggerWidth?: boolean;
  maxWidth?: number;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  otherTriggerRects: () => DOMRect[];
  open: boolean;
  role: "listbox" | "menu" | "dialog";
  setSurface: (element: HTMLDivElement | null) => void;
  tabIndex?: number;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [position, setPosition] = useState<SurfacePosition>({
    left: 8,
    top: 8,
    width: maxWidth,
    maxHeight: 240,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      const surface = document.getElementById(id);
      if (!trigger || !surface) return;
      const rootStyle = window.getComputedStyle(document.documentElement);
      const safeInset = (name: string) => {
        const value = Number.parseFloat(rootStyle.getPropertyValue(name));
        return Number.isFinite(value) ? Math.max(0, value) : 0;
      };
      const margin = 8;
      const gap = 5;
      const triggerBox = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const safeLeft = viewportLeft + Math.max(margin, safeInset("--vector-safe-area-left"));
      const safeTop = viewportTop + Math.max(margin, safeInset("--vector-safe-area-top"));
      const safeRight = viewportLeft + viewportWidth - Math.max(margin, safeInset("--vector-safe-area-right"));
      const hardObstacles = [...document.querySelectorAll<HTMLElement>("[data-vector-overlay-obstacle]")]
        .filter((element) => element.isConnected)
        .map((element) => element.getBoundingClientRect());
      const viewportSafeBottom = viewportTop + viewportHeight - Math.max(margin, safeInset("--vector-safe-area-bottom"));
      const persistentObstacleTops = hardObstacles
        .filter((box) => box.top > safeTop && box.top < viewportSafeBottom)
        .map((box) => box.top - gap);
      const safeBottom = Math.min(viewportSafeBottom, ...persistentObstacleTops);
      const availableWidth = Math.max(1, safeRight - safeLeft);
      const width = matchTriggerWidth
        ? Math.min(availableWidth, triggerBox.width)
        : Math.min(maxWidth, availableWidth);
      const height = Math.min(surface.scrollHeight, Math.max(1, safeBottom - safeTop));
      const clampLeft = (left: number, candidateWidth = width) =>
        Math.min(Math.max(safeLeft, left), Math.max(safeLeft, safeRight - candidateWidth));
      const clampTop = (top: number) =>
        Math.min(Math.max(safeTop, top), Math.max(safeTop, safeBottom - height));
      const candidates = [
        { left: clampLeft(triggerBox.left), top: clampTop(triggerBox.bottom + gap), width },
        { left: clampLeft(triggerBox.left), top: clampTop(triggerBox.top - gap - height), width },
        { left: clampLeft(triggerBox.right + gap), top: clampTop(triggerBox.top), width },
        { left: clampLeft(triggerBox.left - gap - width), top: clampTop(triggerBox.top), width },
      ];
      const obstacles = otherTriggerRects();
      const overlaps = (candidate: (typeof candidates)[number], box: DOMRect) =>
        candidate.left < box.right
        && candidate.left + candidate.width > box.left
        && candidate.top < box.bottom
        && candidate.top + height > box.top;
      const overlapCount = (candidate: (typeof candidates)[number]) =>
        obstacles.filter((box) => overlaps(candidate, box)).length;
      const avoidsPersistentObstacles = candidates.filter((candidate) =>
        hardObstacles.every((box) => !overlaps(candidate, box)),
      );
      const candidatePool = avoidsPersistentObstacles.length
        ? avoidsPersistentObstacles
        : candidates;
      const candidate = candidatePool.reduce((best, next) =>
        overlapCount(next) < overlapCount(best) ? next : best,
      );
      setPosition({
        left: candidate.left,
        top: candidate.top,
        width: candidate.width,
        maxHeight: Math.max(1, safeBottom - candidate.top),
        visibility: "visible",
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(update);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    const surface = document.getElementById(id);
    if (surface) observer?.observe(surface);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [id, matchTriggerWidth, maxWidth, open, otherTriggerRects, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div
      aria-label={ariaLabel}
      className={`vector-overlay-surface ${className}`}
      data-vector-overlay="transient"
      id={id}
      onKeyDown={onKeyDown}
      ref={setSurface}
      role={role}
      style={position}
      tabIndex={tabIndex}
    >
      {children}
    </div>,
    document.body,
  );
}

export function VectorPopover({
  children,
  className = "",
  label,
  matchTriggerWidth,
  maxWidth,
  overlayId,
  renderTrigger,
  surfaceClassName = "vector-popover-surface",
  triggerClassName = "vector-popover-trigger",
}: {
  children: ReactNode | ((controls: { close: () => void }) => ReactNode);
  className?: string;
  label: string;
  matchTriggerWidth?: boolean;
  maxWidth?: number;
  overlayId?: string;
  renderTrigger: (state: { open: boolean }) => ReactNode;
  surfaceClassName?: string;
  triggerClassName?: string;
}) {
  const {
    close,
    getOtherTriggerRects,
    id,
    open,
    setSurface,
    setTrigger,
    toggle,
    triggerRef,
  } = useTransientOverlay(overlayId);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const surfaceId = `${id}-surface`;
  const registerSurface = useCallback((element: HTMLDivElement | null) => {
    popoverRef.current = element;
    setSurface(element);
  }, [setSurface]);
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const surface = popoverRef.current;
      const firstFocusable = surface?.querySelector<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      (firstFocusable ?? surface)?.focus();
    });
  }, [open]);
  return (
    <div className={`vector-popover ${className}`}>
      <button
        aria-controls={surfaceId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={triggerClassName}
        onClick={toggle}
        ref={setTrigger}
        type="button"
      >
        {renderTrigger({ open })}
      </button>
      <OverlaySurface
        ariaLabel={label}
        className={surfaceClassName}
        id={surfaceId}
        matchTriggerWidth={matchTriggerWidth}
        maxWidth={maxWidth}
        open={open}
        otherTriggerRects={getOtherTriggerRects}
        role="dialog"
        setSurface={registerSurface}
        tabIndex={-1}
        triggerRef={triggerRef}
      >
        {typeof children === "function"
          ? children({ close: () => close({ restoreFocus: true }) })
          : children}
      </OverlaySurface>
    </div>
  );
}

export type VectorMenuItem<Value extends string> = {
  content?: ReactNode;
  disabled?: boolean;
  label: string;
  value: Value;
};

export function VectorMenu<Value extends string>({
  className = "",
  items,
  label,
  maxWidth,
  onSelect,
  overlayId,
  renderItem,
  renderTrigger,
  surfaceClassName = "vector-menu-surface",
  triggerClassName = "vector-menu-trigger",
}: {
  className?: string;
  items: readonly VectorMenuItem<Value>[];
  label: string;
  maxWidth?: number;
  onSelect: (value: Value) => void;
  overlayId?: string;
  renderItem?: (item: VectorMenuItem<Value>, state: { active: boolean }) => ReactNode;
  renderTrigger: (state: { open: boolean }) => ReactNode;
  surfaceClassName?: string;
  triggerClassName?: string;
}) {
  const {
    close,
    getOtherTriggerRects,
    id,
    open,
    setSurface,
    setTrigger,
    toggle,
    triggerRef,
  } = useTransientOverlay(overlayId);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const surfaceId = `${id}-surface`;
  const registerSurface = useCallback((element: HTMLDivElement | null) => {
    menuRef.current = element;
    setSurface(element);
  }, [setSurface]);
  const firstEnabled = useCallback((from: number, direction: 1 | -1) => {
    if (!items.length) return 0;
    let index = from;
    for (let count = 0; count < items.length; count += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index]?.disabled) return index;
    }
    return from;
  }, [items]);
  const focusItem = useCallback((index: number) => {
    setActiveIndex(index);
    window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelectorAll<HTMLElement>("[role=menuitem]")
        .item(index)
        .focus();
    });
  }, []);
  const openAt = (index: number) => {
    if (!open) toggle();
    focusItem(index);
  };
  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onSelect(item.value);
    close({ restoreFocus: true });
  };
  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const edge = event.key === "ArrowDown" ? -1 : 0;
      openAt(firstEnabled(edge, event.key === "ArrowDown" ? 1 : -1));
    }
  };
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") focusItem(items[0]?.disabled ? firstEnabled(0, 1) : 0);
      else if (event.key === "End") {
        const end = Math.max(0, items.length - 1);
        focusItem(items[end]?.disabled ? firstEnabled(end, -1) : end);
      } else focusItem(firstEnabled(activeIndex, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    }
  };
  return (
    <div className={`vector-menu ${className}`}>
      <button
        aria-controls={surfaceId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={triggerClassName}
        onClick={() => {
          if (open) toggle();
          else openAt(firstEnabled(-1, 1));
        }}
        onKeyDown={onTriggerKeyDown}
        ref={setTrigger}
        type="button"
      >
        {renderTrigger({ open })}
      </button>
      <OverlaySurface
        ariaLabel={label}
        className={surfaceClassName}
        id={surfaceId}
        maxWidth={maxWidth}
        onKeyDown={onMenuKeyDown}
        open={open}
        otherTriggerRects={getOtherTriggerRects}
        role="menu"
        setSurface={registerSurface}
        triggerRef={triggerRef}
      >
        {items.map((item, index) => (
          <button
            aria-disabled={item.disabled || undefined}
            className={index === activeIndex ? "keyboard-active" : ""}
            key={item.value}
            onClick={() => choose(index)}
            onPointerMove={() => setActiveIndex(index)}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            {renderItem?.(item, { active: index === activeIndex }) ?? item.content ?? item.label}
          </button>
        ))}
      </OverlaySurface>
    </div>
  );
}

export type VectorSelectOption<Value extends string> = {
  content?: ReactNode;
  disabled?: boolean;
  label: string;
  textValue?: string;
  value: Value;
};

export function VectorSelect<Value extends string>({
  className = "",
  emptyContent = "No options are available.",
  footer,
  header,
  label,
  labelClassName = "vector-select-label",
  matchTriggerWidth = true,
  maxWidth,
  onChange,
  options,
  overlayId,
  renderOption,
  renderTrigger,
  showLabel = true,
  surfaceClassName = "vector-select-surface",
  triggerClassName = "vector-select-trigger",
  value,
}: {
  className?: string;
  emptyContent?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  label: string;
  labelClassName?: string;
  matchTriggerWidth?: boolean;
  maxWidth?: number;
  onChange: (value: Value) => void;
  options: readonly VectorSelectOption<Value>[];
  overlayId?: string;
  renderOption?: (
    option: VectorSelectOption<Value>,
    state: { active: boolean; selected: boolean },
  ) => ReactNode;
  renderTrigger?: (
    selected: VectorSelectOption<Value> | undefined,
    state: { invalid: boolean },
  ) => ReactNode;
  showLabel?: boolean;
  surfaceClassName?: string;
  triggerClassName?: string;
  value: Value;
}) {
  const {
    close,
    getOtherTriggerRects,
    id: transientId,
    open,
    setSurface,
    setTrigger,
    toggle,
    triggerRef,
  } = useTransientOverlay(overlayId);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const invalid = Boolean(value) && !selected;
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const typeahead = useRef("");
  const typeaheadTimer = useRef<number | null>(null);
  const surfaceId = `${transientId}-surface`;
  const errorId = `${transientId}-error`;

  useEffect(() => () => {
    if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
  }, []);
  const boundedActiveIndex = Math.min(activeIndex, Math.max(0, options.length - 1));

  const firstEnabled = useCallback((from: number, direction: 1 | -1) => {
    if (!options.length) return 0;
    let index = from;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return from;
  }, [options]);

  const openAtSelection = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    toggle();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close({ restoreFocus: true });
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab" && open) {
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        toggle();
      } else {
        setActiveIndex((current) => firstEnabled(current, event.key === "ArrowDown" ? 1 : -1));
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) toggle();
      const edge = event.key === "Home" ? 0 : options.length - 1;
      setActiveIndex(options[edge]?.disabled ? firstEnabled(edge, event.key === "Home" ? 1 : -1) : edge);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(boundedActiveIndex);
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      typeahead.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => { typeahead.current = ""; }, 700);
      const found = options.findIndex((option) =>
        !option.disabled
        && (option.textValue ?? option.label).toLocaleLowerCase().startsWith(typeahead.current),
      );
      if (found >= 0) {
        event.preventDefault();
        setActiveIndex(found);
        if (!open) toggle();
      }
    }
  };

  const currentLabel = selected?.label ?? (value ? `Unavailable selection ${value}` : "No selection");
  return (
    <div className={`vector-select ${className}`}>
      {showLabel && <span className={labelClassName}>{label}</span>}
      <button
        aria-activedescendant={open && options[boundedActiveIndex] ? `${surfaceId}-option-${boundedActiveIndex}` : undefined}
        aria-controls={surfaceId}
        aria-describedby={invalid ? errorId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-label={`${label}: ${currentLabel}`}
        className={triggerClassName}
        onClick={openAtSelection}
        onKeyDown={onKeyDown}
        ref={setTrigger}
        role="combobox"
        type="button"
      >
        {renderTrigger?.(selected, { invalid }) ?? currentLabel}
      </button>
      {invalid && (
        <p className="vector-select-error" id={errorId} role="alert">
          Selection <code>{value}</code> is unavailable. Choose an admitted compatible option.
        </p>
      )}
      <OverlaySurface
        ariaLabel={label}
        className={surfaceClassName}
        id={surfaceId}
        matchTriggerWidth={matchTriggerWidth}
        maxWidth={maxWidth}
        open={open}
        otherTriggerRects={getOtherTriggerRects}
        role="listbox"
        setSurface={setSurface}
        triggerRef={triggerRef}
      >
        {header}
        {options.length ? options.map((option, index) => (
          <div
            aria-disabled={option.disabled || undefined}
            aria-selected={option.value === value}
            className={`${option.value === value ? "selected" : ""} ${index === boundedActiveIndex ? "keyboard-active" : ""}`}
            id={`${surfaceId}-option-${index}`}
            key={option.value}
            onClick={() => choose(index)}
            onPointerMove={() => setActiveIndex(index)}
            role="option"
          >
            {renderOption?.(option, {
              active: index === boundedActiveIndex,
              selected: option.value === value,
            }) ?? option.content ?? option.label}
          </div>
        )) : <div className="vector-select-empty">{emptyContent}</div>}
        {footer}
      </OverlaySurface>
    </div>
  );
}

/** Persistent explanatory content; intentionally outside overlay exclusivity. */
export function Disclosure({
  children,
  className,
  defaultOpen,
  summary,
}: {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  summary: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <details
      className={className}
      data-vector-disclosure="persistent"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
