"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { notify } from "./MotionUI";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const GESTURE_EXCLUDE = [
  "input",
  ".ui-sort",
  ".ui-interaction-swipe",
  ".ui-interaction-longpress",
  ".eip-messages-panel",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "dialog",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-ui-gesture="off"]',
].join(", ");

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isGestureExcluded(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(GESTURE_EXCLUDE) !== null;
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function Spinner(): ReactElement {
  return (
    <svg className="ui-interaction-spinner" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 100" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* LoadingButton                                                       */
/* ------------------------------------------------------------------ */

export type LoadingButtonProps = ComponentProps<"button"> & {
  loading: boolean;
  /** Announced to assistive tech while pending; the visible children stay unchanged. */
  loadingLabel?: string;
};

export function LoadingButton({
  loading,
  loadingLabel,
  disabled,
  className,
  children,
  ...rest
}: LoadingButtonProps): ReactElement {
  return (
    <button
      {...rest}
      className={cx("ui-interaction-button", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading ? "true" : undefined}
    >
      {loading ? <Spinner /> : null}
      {children}
      {loading && loadingLabel ? <span className="ui-interaction-sr-only">{loadingLabel}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* FloatingInput                                                       */
/* ------------------------------------------------------------------ */

export type FloatingInputProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  /** Styling + aria-invalid only; validation is the caller's job. */
  invalid?: boolean;
};

export function FloatingInput({
  id,
  label,
  invalid,
  placeholder = " ",
  className,
  "aria-invalid": ariaInvalid,
  ...rest
}: FloatingInputProps): ReactElement {
  return (
    <div className="ui-field">
      <input
        {...rest}
        id={id}
        placeholder={placeholder}
        className={cx("ui-field-input", className)}
        aria-invalid={invalid ? true : ariaInvalid}
      />
      <label className="ui-field-label" htmlFor={id}>{label}</label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StatusProgress                                                      */
/* ------------------------------------------------------------------ */

export type StatusProgressState = "idle" | "sending" | "success" | "error";

export type StatusProgressProps = { state: StatusProgressState; label?: string };

const STATUS_TEXT: Record<StatusProgressState, string> = {
  idle: "尚未送出",
  sending: "傳送中…",
  success: "已完成",
  error: "發生錯誤，已停止",
};

export function StatusProgress({ state, label = "送出進度" }: StatusProgressProps): ReactElement | null {
  if (state === "idle") return null;
  const text = state === "sending" ? "正在送出" : state === "success" ? "已成功送出" : "送出未完成";
  const detail = state === "sending" ? "正在傳送資料，請稍候一下" : state === "success" ? "資料已送達，您可以繼續操作" : "請查看錯誤提示，確認後再試一次";
  return (
    <div className="ui-interaction-status" data-state={state}>
      <div className="ui-progress-heading">
        <span className="ui-progress-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {state === "success" ? <path d="m5 12 4 4L19 6" /> : state === "error" ? <><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></> : <><path d="m21 3-7 18-4-7-7-4L21 3ZM10 14 21 3"/></>}
          </svg>
        </span>
        <span className="ui-progress-copy"><small>{label}</small><strong role="status">{text}<span className="ui-progress-dots" aria-hidden="true"><i/><i/><i/></span></strong></span>
        <span className="ui-progress-badge">{state === "sending" ? "處理中" : state === "success" ? "完成" : "請重試"}</span>
      </div>
      <div className="ui-interaction-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state === "success" ? 100 : undefined} aria-valuetext={text} aria-busy={state === "sending" || undefined}>
        <span className="ui-interaction-progress-bar" />
      </div>
      <span className="ui-interaction-status-text">{detail}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* celebrate                                                           */
/* ------------------------------------------------------------------ */

const CONFETTI_COUNT = 24;
const CONFETTI_MS = 1200;
const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];

let confettiLayer: HTMLDivElement | null = null;
let confettiTimer = 0;

/** Call only after a real success. Pure CSS pieces, removed after 1.2s; skipped for reduced motion. */
export function celebrate(): void {
  if (typeof document === "undefined" || !document.body || prefersReducedMotion()) return;
  // Replace any burst still on screen so there are never more than 24 pieces.
  confettiLayer?.remove();
  window.clearTimeout(confettiTimer);

  const layer = document.createElement("div");
  layer.className = "ui-confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const piece = document.createElement("span");
    piece.className = "ui-confetti-piece";
    piece.style.setProperty("--ui-confetti-x", `${((i + Math.random()) / CONFETTI_COUNT) * 100}vw`);
    piece.style.setProperty("--ui-confetti-dx", `${(Math.random() - 0.5) * 30}vw`);
    piece.style.setProperty("--ui-confetti-rotate", `${(Math.random() * 2 - 1) * 720}deg`);
    piece.style.setProperty("--ui-confetti-delay", `${Math.round(Math.random() * 200)}ms`);
    piece.style.setProperty("--ui-confetti-duration", `${750 + Math.round(Math.random() * 200)}ms`);
    piece.style.setProperty("--ui-confetti-color", CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    layer.append(piece);
  }
  document.body.append(layer);
  confettiLayer = layer;
  confettiTimer = window.setTimeout(() => {
    layer.remove();
    if (confettiLayer === layer) confettiLayer = null;
  }, CONFETTI_MS);
}

/* ------------------------------------------------------------------ */
/* PullToRefresh                                                       */
/* ------------------------------------------------------------------ */

const PULL_TRIGGER = 90;
const PULL_MAX = 120;
const PULL_SLOP = 8;
const PULL_REFRESH_OFFSET = 48;

export type PullToRefreshProps = {
  children: ReactNode;
  /** Caller decides what to reload; the indicator stays until the promise settles. */
  onRefresh: () => Promise<void>;
  enabled?: boolean;
};

function isAtTop(target: EventTarget | null, root: HTMLElement): boolean {
  if (window.scrollY > 0 || (document.scrollingElement?.scrollTop ?? 0) > 0) return false;
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
    if (el === root) break;
  }
  return true;
}

export function PullToRefresh({ children, onRefresh, enabled = true }: PullToRefreshProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  const refreshingRef = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let pull = 0;

    const reset = () => {
      start = null;
      pulling = false;
      pull = 0;
      setDistance(0);
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      if (refreshingRef.current || isGestureExcluded(event.target) || !isAtTop(event.target, root)) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < PULL_SLOP && Math.abs(dy) < PULL_SLOP) return;
        // Upward or mostly-horizontal: hand the gesture back to the browser.
        if (dy <= 0 || Math.abs(dx) >= dy || !isAtTop(event.target, root)) {
          start = null;
          return;
        }
        pulling = true;
      }
      if (event.cancelable) event.preventDefault();
      pull = Math.max(0, dy);
      setDistance(Math.min(pull, PULL_MAX));
    };

    const onEnd = () => {
      const armed = pulling && pull >= PULL_TRIGGER;
      if (start || pulling) reset();
      if (!armed) return;
      refreshingRef.current = true;
      setRefreshing(true);
      void Promise.resolve()
        .then(() => onRefreshRef.current())
        .catch((error: unknown) => notify(error, "error"))
        .finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        });
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", reset);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", reset);
      setDistance(0);
    };
  }, [enabled]);

  const armed = distance >= PULL_TRIGGER;
  const phase = refreshing ? "refreshing" : armed ? "armed" : distance > 0 ? "pulling" : "idle";
  const offset = refreshing ? PULL_REFRESH_OFFSET : distance * 0.6;
  const text = refreshing ? "重新整理中…" : armed ? "放開以重新整理" : "下拉以重新整理";

  return (
    <div ref={rootRef} className="ui-interaction-pull" data-phase={phase} aria-busy={refreshing || undefined}>
      <div
        className="ui-interaction-pull-indicator"
        aria-hidden="true"
        style={{ "--ui-interaction-pull-offset": `${offset}px` } as CSSProperties}
      >
        {refreshing ? (
          <Spinner />
        ) : (
          <svg className="ui-interaction-pull-arrow" viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
            <path d="M12 4v15m0 0-6-6m6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span>{text}</span>
      </div>
      <span className="ui-interaction-sr-only" role="status">{refreshing ? "重新整理中" : ""}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SwipePager                                                          */
/* ------------------------------------------------------------------ */

const SWIPE_TRIGGER = 60;
const SWIPE_SLOP = 10;
const SWIPE_MAX_SHIFT = 48;

export type SwipePagerProps = {
  children: ReactNode;
  /** Omit to disable that direction (e.g. on the last page). */
  onNext?: () => void;
  onPrevious?: () => void;
  label: string;
};

export function SwipePager({ children, onNext, onPrevious, label }: SwipePagerProps): ReactElement {
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const [shift, setShift] = useState(0);

  const cancel = () => {
    gesture.current = null;
    setShift(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current) {
      cancel(); // second finger
      return;
    }
    if (event.pointerType === "mouse" || !event.isPrimary || isGestureExcluded(event.target)) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.abs(dy) > SWIPE_SLOP && Math.abs(dy) > Math.abs(dx)) {
      cancel();
      return;
    }
    if ((dx < 0 && !onNext) || (dx > 0 && !onPrevious)) return;
    setShift(Math.max(-SWIPE_MAX_SHIFT, Math.min(SWIPE_MAX_SHIFT, dx * 0.3)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    cancel();
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx <= -SWIPE_TRIGGER) onNext?.();
    else if (dx >= SWIPE_TRIGGER) onPrevious?.();
  };

  return (
    <section className="ui-interaction-swipe" aria-label={label}>
      <div
        className="ui-interaction-swipe-track"
        data-dragging={shift !== 0 || undefined}
        style={{ "--ui-interaction-swipe-x": `${shift}px` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
      >
        {children}
      </div>
      <div className="ui-interaction-swipe-controls">
        <button type="button" className="ui-interaction-swipe-button" onClick={onPrevious} disabled={!onPrevious}>
          <span aria-hidden="true">‹ </span>上一個
        </button>
        <button type="button" className="ui-interaction-swipe-button" onClick={onNext} disabled={!onNext}>
          下一個<span aria-hidden="true"> ›</span>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* LongPressMenu                                                       */
/* ------------------------------------------------------------------ */

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;
const CLICK_SUPPRESS_MS = 400;

export type LongPressMenuItem = { label: string; onSelect: () => void; disabled?: boolean };

export type LongPressMenuProps = { children: ReactNode; items: LongPressMenuItem[]; label: string };

function enabledMenuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
}

export function LongPressMenu({ children, items, label }: LongPressMenuProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef(0);
  const openRef = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuId = useId();

  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const open = (x: number, y: number) => {
    const root = rootRef.current;
    if (!root || openRef.current || items.length === 0) return;
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && root.contains(active)
      ? active
      : root.querySelector<HTMLElement>(FOCUSABLE);
    openRef.current = true;
    setMenu({ x, y });
  };

  const openAtElement = (el: Element) => {
    const rect = el.getBoundingClientRect();
    open(rect.left, rect.bottom);
  };

  const close = useCallback((restoreFocus: boolean) => {
    openRef.current = false;
    setMenu(null);
    if (restoreFocus) returnFocus.current?.focus({ preventScroll: true });
  }, []);

  const inMenu = (target: EventTarget | null) => target instanceof Node && menuRef.current?.contains(target) === true;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    clearPress();
    if (!event.isPrimary || event.button !== 0) return;
    const { clientX: x, clientY: y, pointerId: id } = event;
    const timer = window.setTimeout(() => {
      press.current = null;
      suppressClick.current = true;
      open(x, y);
    }, LONG_PRESS_MS);
    press.current = { id, x, y, timer };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && event.pointerId === p.id && Math.hypot(event.clientX - p.x, event.clientY - p.y) > LONG_PRESS_SLOP) clearPress();
  };

  const onPointerUp = () => {
    clearPress();
    if (!suppressClick.current) return;
    // Touch long-presses often never produce a click; don't let the flag eat a later one.
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_SUPPRESS_MS);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current || inMenu(event.target)) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (window.getSelection()?.toString()) return;
    event.preventDefault();
    clearPress();
    // Keyboard-triggered contextmenu reports 0,0: anchor to the element instead.
    if (event.clientX === 0 && event.clientY === 0) openAtElement(event.target as Element);
    else open(event.clientX, event.clientY);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "F10" || !event.shiftKey) return;
    event.preventDefault();
    openAtElement(event.target as Element);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = enabledMenuItems(event.currentTarget);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case "ArrowDown": next = list[(index + 1) % list.length]; break;
      case "ArrowUp": next = list[(index - 1 + list.length) % list.length]; break;
      case "Home": next = list[0]; break;
      case "End": next = list[list.length - 1]; break;
      case "Escape":
      case "Tab": close(true); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  };

  // Stop menu events from bubbling (through the portal) into the trigger or the caller's tree.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    enabledMenuItems(el)[0]?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      // Let a focusable click target keep focus; otherwise return it to the trigger.
      close(!(target instanceof Element && target.closest(FOCUSABLE)));
    };
    const onViewportChange = () => close(true);
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange);
    };
  }, [menu, close]);

  useEffect(() => () => {
    if (press.current) window.clearTimeout(press.current.timer);
    window.clearTimeout(suppressTimer.current);
  }, []);

  return (
    <div
      ref={rootRef}
      className="ui-interaction-longpress"
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menu ? true : undefined}
      aria-controls={menu ? menuId : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={clearPress}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {children}
      {menu && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="ui-interaction-menu"
            role="menu"
            aria-label={label}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={onMenuKeyDown}
            onPointerDown={stop}
            onPointerUp={stop}
            onClick={stop}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {items.map((item, index) => (
              <button
                key={`${index}:${item.label}`}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="ui-interaction-menu-item"
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SortableList                                                        */
/* ------------------------------------------------------------------ */

const SORT_FLIP_MS = 200;
const SORT_SETTLE_MS = 160;

export type SortableListProps<T> = {
  items: T[];
  getId: (item: T) => string;
  /** Called once per completed move: on drop / touch release / keyboard or button press. */
  onReorder: (items: T[]) => void;
  renderItem: (item: T) => ReactNode;
  label: string;
  disabled?: boolean;
};

type TouchDrag = { id: string; pointerId: number; startY: number; lastY: number; startTop: number };

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function SortableList<T>({ items, getId, onReorder, renderItem, label, disabled = false }: SortableListProps<T>): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);
  const nodes = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  const touch = useRef<TouchDrag | null>(null);
  const nativeId = useRef<string | null>(null);
  const draftRef = useRef<T[] | null>(null);
  const [draft, setDraft] = useState<T[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hintId = useId();
  const restoreControl = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { const control = restoreControl.current; restoreControl.current = null; if (control?.isConnected) control.focus({preventScroll:true}); }, [items]);

  const list = draft ?? items;
  const orderKey = list.map(getId).join("\n");

  const followPointer = () => {
    const drag = touch.current;
    const el = drag ? nodes.current.get(drag.id) : undefined;
    if (!drag || !el) return;
    el.style.transform = `translateY(${drag.lastY - drag.startY - (el.offsetTop - drag.startTop)}px)`;
  };

  // FLIP: offsetTop ignores transforms and scroll, so it is the stable "last" position.
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    const next = new Map<string, number>();
    for (const [id, el] of nodes.current) {
      const top = el.offsetTop;
      next.set(id, top);
      const old = tops.current.get(id);
      if (reduced || old === undefined || old === top || id === touch.current?.id || typeof el.animate !== "function") continue;
      el.animate([{ transform: `translateY(${old - top}px)` }, { transform: "none" }], { duration: SORT_FLIP_MS, easing: EASE_OUT });
    }
    tops.current = next;
    followPointer();
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reorderTo = (id: string, clientY: number) => {
    const listEl = listRef.current;
    const current = draftRef.current ?? items;
    if (!listEl) return;
    const y = clientY - listEl.getBoundingClientRect().top - listEl.clientTop;
    let to = 0;
    for (const item of current) {
      const itemId = getId(item);
      const el = nodes.current.get(itemId);
      if (itemId !== id && el && el.offsetTop + el.offsetHeight / 2 < y) to += 1;
    }
    const from = current.findIndex((item) => getId(item) === id);
    if (from < 0 || from === to) return;
    draftRef.current = moveItem(current, from, to);
    setDraft(draftRef.current);
  };

  const announce = (index: number, total: number) => setAnnouncement(`已移到第 ${index + 1} 項，共 ${total} 項`);

  const finish = (commit: boolean, id: string) => {
    const next = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    setDragId(null);
    if (disabled || !commit || !next || next.length !== items.length || next.every((item, i) => getId(item) === getId(items[i]))) return;
    restoreControl.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.dispatchEvent(new Event("ui:edited"));
    onReorder(next);
    announce(next.findIndex((item) => getId(item) === id), next.length);
  };

  const moveBy = (id: string, delta: number) => {
    if (disabled || dragId) return;
    const from = items.findIndex((item) => getId(item) === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    restoreControl.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.dispatchEvent(new Event("ui:edited"));
    onReorder(moveItem(items, from, to));
    announce(to, items.length);
  };

  /* Touch / pen: pointer capture on the handle only. Mouse: arm native drag on the <li>. */

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const li = nodes.current.get(id);
    if (disabled || !li) return;
    if (event.pointerType === "mouse") {
      li.draggable = true;
      return;
    }
    if (!event.isPrimary || touch.current) return;
    event.preventDefault();
    listRef.current?.setPointerCapture(event.pointerId);
    touch.current = { id, pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, startTop: li.offsetTop };
    setDragId(id);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = touch.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastY = event.clientY;
    reorderTo(drag.id, event.clientY);
    followPointer();
  };

  const endTouch = (event: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    const drag = touch.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    touch.current = null;
    const el = nodes.current.get(drag.id);
    if (el) {
      const from = el.style.transform;
      el.style.transform = "";
      if (from && !prefersReducedMotion() && typeof el.animate === "function") {
        el.animate([{ transform: from }, { transform: "none" }], { duration: SORT_SETTLE_MS, easing: EASE_OUT });
      }
    }
    finish(commit, drag.id);
  };

  const onDragStart = (event: ReactDragEvent<HTMLLIElement>, id: string) => {
    if (disabled || event.target !== event.currentTarget) return; // links/images inside keep their own drag
    nativeId.current = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDragId(id);
  };

  const onDragEnd = (event: ReactDragEvent<HTMLLIElement>, id: string) => {
    event.currentTarget.draggable = false;
    if (nativeId.current !== id) return;
    nativeId.current = null;
    finish(false, id); // no drop on the list: revert
  };

  const onDragOver = (event: ReactDragEvent<HTMLUListElement>) => {
    if (!nativeId.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    reorderTo(nativeId.current, event.clientY);
  };

  const onDrop = (event: ReactDragEvent<HTMLUListElement>) => {
    const id = nativeId.current;
    if (!id) return;
    event.preventDefault();
    nativeId.current = null;
    finish(true, id);
  };

  const onItemKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>, id: string) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown") || isGestureExcluded(event.target)) return;
    event.preventDefault();
    moveBy(id, event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div className="ui-sort">
      <span id={hintId} className="ui-interaction-sr-only">可用 Alt+上下鍵或上移、下移按鈕調整順序</span>
      <ul ref={listRef} className="ui-sort-list" aria-label={label} aria-describedby={hintId} onDragOver={onDragOver} onDrop={onDrop} onPointerMove={onHandlePointerMove} onPointerUp={event=>endTouch(event,true)} onPointerCancel={event=>endTouch(event,false)} onLostPointerCapture={event=>endTouch(event,false)}>
        {list.map((item, index) => {
          const id = getId(item);
          const first = index === 0;
          const last = index === list.length - 1;
          return (
            <li
              key={id}
              ref={(el) => {
                if (!el) return;
                nodes.current.set(id, el);
                return () => {
                  if (nodes.current.get(id) === el) nodes.current.delete(id);
                };
              }}
              className="ui-sort-item"
              data-dragging={dragId === id || undefined}
              onDragStart={(event) => onDragStart(event, id)}
              onDragEnd={(event) => onDragEnd(event, id)}
              onPointerUp={(event) => {
                if (event.pointerType === "mouse") event.currentTarget.draggable = false;
              }}
              onKeyDown={(event) => onItemKeyDown(event, id)}
            >
              <span
                className="ui-sort-handle"
                aria-hidden="true"
                onPointerDown={(event) => onHandlePointerDown(event, id)}
              >
                <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
                  <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
              <div className="ui-sort-content">{renderItem(item)}</div>
              <div className="ui-sort-controls">
                {/* aria-disabled (not disabled) so focus survives reaching the top/bottom. */}
                <button
                  type="button"
                  className="ui-sort-move"
                  aria-label={`上移（第 ${index + 1} 項）`}
                  aria-disabled={disabled || first || undefined}
                  onClick={() => moveBy(id, -1)}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="ui-sort-move"
                  aria-label={`下移（第 ${index + 1} 項）`}
                  aria-disabled={disabled || last || undefined}
                  onClick={() => moveBy(id, 1)}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="ui-interaction-sr-only" role="status">{announcement}</p>
    </div>
  );
}
