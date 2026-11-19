"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  AnimationEvent as ReactAnimationEvent,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
  ReactPortal,
} from "react";
import { createPortal, flushSync } from "react-dom";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export type ToastKind = "success" | "error" | "info";

type ToastPayload = { message: string; kind: ToastKind };

type ToastRecord = ToastPayload & { id: number; duration: number; leaving: boolean };

type ViewTransitionLike = {
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

const TOAST_EVENT = "ui-motion:toast";
const TOAST_MAX = 4;
const TOAST_KEEP = TOAST_MAX * 2;
const TOAST_DURATION: Record<ToastKind, number> = { success: 4000, error: 0, info: 4000 };
const TOAST_FALLBACK: Record<ToastKind, string> = { success: "完成", error: "發生錯誤", info: "通知" };
const TOAST_EXIT_MS = 220;
const DIALOG_EXIT_FALLBACK_MS = 320;
const RIPPLE_MS = 620;
const RIPPLE_MAX_PER_TARGET = 3;

const RIPPLE_TARGET = 'button, [data-ui-ripple="on"]';
const RIPPLE_EXCLUDE = [
  ".ui-ripple-off",
  '[data-ui-ripple="off"]',
  ".leaflet-container",
  ".gm-style",
  ".mapboxgl-map",
  ".maplibregl-map",
  ".ol-viewport",
].join(", ");
const RIPPLE_MEDIA = 'img[src*=".gif" i], img[src^="data:image/gif" i], canvas, video, iframe';

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

let reducedMotionQuery: MediaQueryList | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

function reportAsyncError(error: unknown): void {
  const report = (window as unknown as { reportError?: (e: unknown) => void }).reportError;
  if (typeof report === "function") report(error);
  else console.error(error);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

let toastOwner: object | null = null;
let pendingToasts: ToastPayload[] = [];
let toastSeq = 0;

function toMessage(message: unknown): string {
  if (typeof message === "string") return message;
  if (message instanceof Error) return message.message || message.name;
  if (message == null) return "";
  if (typeof message === "object" && "message" in message && typeof message.message === "string") {
    return message.message;
  }
  if (typeof message === "object") {
    try {
      const json = JSON.stringify(message);
      if (json && json !== "{}") return json;
    } catch {
      // circular or non-serializable — fall back to String()
    }
  }
  return String(message);
}

function normalizeToast(message: unknown, kind: unknown): ToastPayload {
  const safeKind: ToastKind = kind === "success" || kind === "error" ? kind : "info";
  let text = toMessage(message).trim();
  if (!text) text = TOAST_FALLBACK[safeKind];
  return { message: text, kind: safeKind };
}

/** Show a toast. Safe to call anywhere; no-op on the server, queued until <MotionUI /> mounts. */
export function notify(message: unknown, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  const inferred = kind === "info" && (message instanceof Error || /失敗|錯誤|無法|登入已過期|請重新登入|連線異常/.test(toMessage(message))) ? "error" : kind;
  const payload = normalizeToast(message, inferred);
  if (!toastOwner) {
    pendingToasts = [...pendingToasts, payload].slice(-TOAST_MAX);
    return;
  }
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

function addToast(prev: ToastRecord[], payload: ToastPayload): ToastRecord[] {
  toastSeq += 1;
  const next: ToastRecord[] = [
    ...prev,
    { ...payload, id: toastSeq, duration: TOAST_DURATION[payload.kind], leaving: false },
  ];
  let overflow = next.filter((t) => !t.leaving).length - TOAST_MAX;
  const trimmed = next.map((t) => {
    if (overflow > 0 && !t.leaving) {
      overflow -= 1;
      return { ...t, leaving: true };
    }
    return t;
  });
  return trimmed.length > TOAST_KEEP ? trimmed.slice(-TOAST_KEEP) : trimmed;
}

type ToastItemProps = {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
  onRemove: (id: number) => void;
};

function ToastItem({ toast, onDismiss, onRemove }: ToastItemProps): ReactElement {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const paused = hovered || focused;
  const { id, leaving } = toast;

  useEffect(() => {
    if (leaving || paused || toast.duration === 0) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [id, leaving, paused, onDismiss]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(() => onRemove(id), prefersReducedMotion() ? 0 : TOAST_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [id, leaving, onRemove]);

  const handleBlur = (event: ReactFocusEvent<HTMLLIElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocused(false);
  };

  return (
    <li
      className={`ui-toast-item ui-toast-${toast.kind}${leaving ? " ui-toast-leaving" : ""}`}
      role={toast.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      <span className="ui-toast-icon" aria-hidden="true" />
      <p className="ui-toast-message">{toast.message}</p>
      <button
        type="button"
        className="ui-toast-close ui-ripple-off"
        aria-label="關閉通知"
        onClick={() => onDismiss(id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Ripple (event delegation, no observers)                             */
/* ------------------------------------------------------------------ */

function isRippleAllowed(target: HTMLElement): boolean {
  if (target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return false;
  if (target.closest(RIPPLE_EXCLUDE)) return false;
  if (target.querySelector(RIPPLE_MEDIA)) return false;
  return true;
}

function removeRippleInk(ink: HTMLElement): void {
  const layer = ink.parentElement;
  ink.remove();
  if (layer && layer.childElementCount === 0) {
    const host = layer.parentElement;
    layer.remove();
    host?.classList.remove("ui-ripple-host");
  }
}

function startRipple(event: PointerEvent, timers: Set<number>): void {
  if (event.button !== 0 || !event.isPrimary) return;
  if (prefersReducedMotion()) return;
  const origin = event.target;
  if (!(origin instanceof Element)) return;
  const target = origin.closest<HTMLElement>(RIPPLE_TARGET);
  if (!target || !isRippleAllowed(target)) return;

  const style = window.getComputedStyle(target);
  if (style.display === "contents" || style.display === "none" || style.visibility === "hidden") return;
  if (style.position === "static") target.classList.add("ui-ripple-host");

  let layer = target.querySelector<HTMLElement>(":scope > .ui-ripple-layer");
  if (!layer) {
    layer = document.createElement("span");
    layer.className = "ui-ripple-layer";
    layer.setAttribute("aria-hidden", "true");
    target.appendChild(layer);
  }
  while (layer.childElementCount >= RIPPLE_MAX_PER_TARGET && layer.firstElementChild) {
    layer.firstElementChild.remove();
  }

  const rect = target.getBoundingClientRect();
  const x = event.clientX - rect.left - target.clientLeft;
  const y = event.clientY - rect.top - target.clientTop;
  const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

  const ink = document.createElement("span");
  ink.className = "ui-ripple-ink";
  ink.style.width = `${radius * 2}px`;
  ink.style.height = `${radius * 2}px`;
  ink.style.left = `${x - radius}px`;
  ink.style.top = `${y - radius}px`;
  layer.appendChild(ink);

  const timer = window.setTimeout(() => {
    timers.delete(timer);
    removeRippleInk(ink);
  }, RIPPLE_MS);
  timers.add(timer);
}

/* ------------------------------------------------------------------ */
/* MotionUI root                                                       */
/* ------------------------------------------------------------------ */

/** Mount once near the app root. Renders toasts into document.body and enables button ripples. */
export default function MotionUI(): ReactPortal | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)));
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (toastOwner) return undefined; // another <MotionUI /> is already active
    const owner = {};
    toastOwner = owner;

    const push = (payload: ToastPayload) => setToasts((prev) => addToast(prev, payload));
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      if (detail && typeof detail.message === "string") push(normalizeToast(detail.message, detail.kind));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    const queued = pendingToasts;
    pendingToasts = [];
    queued.forEach(push);

    const rippleTimers = new Set<number>();
    const onPointerDown = (event: PointerEvent) => startRipple(event, rippleTimers);
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });

    setHost(document.body);

    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      rippleTimers.forEach((timer) => window.clearTimeout(timer));
      rippleTimers.clear();
      document.querySelectorAll(".ui-ripple-layer").forEach((layer) => layer.remove());
      document.querySelectorAll(".ui-ripple-host").forEach((el) => el.classList.remove("ui-ripple-host"));
      if (toastOwner === owner) toastOwner = null;
      setHost(null);
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <div className="ui-toast-region">
      <ol className="ui-toast-list">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onRemove={remove} />
        ))}
      </ol>
    </div>,
    host,
  );
}

/* ------------------------------------------------------------------ */
/* View transitions                                                    */
/* ------------------------------------------------------------------ */

let activeViewTransitions = 0;

/**
 * Run a synchronous React state update inside a View Transition when supported and the user
 * has no reduced-motion preference; otherwise run it immediately. `update` runs exactly once.
 */
export function transitionUI(update: () => void): void {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const doc = document as unknown as ViewTransitionDocument;
  const start = doc.startViewTransition;
  if (typeof start !== "function" || prefersReducedMotion()) {
    update();
    return;
  }

  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    flushSync(update);
  };

  const root = document.documentElement;
  activeViewTransitions += 1;
  root.classList.add("ui-motion-vt");
  const done = () => {
    activeViewTransitions = Math.max(0, activeViewTransitions - 1);
    if (activeViewTransitions === 0) root.classList.remove("ui-motion-vt");
  };

  let transition: ViewTransitionLike;
  try {
    transition = start.call(document, run);
  } catch {
    done();
    if (!ran) update();
    return;
  }
  transition.updateCallbackDone.catch(reportAsyncError);
  transition.ready.catch(() => undefined);
  transition.finished.then(done, done);
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

export function LoadingStatus({label = "\u8b80\u53d6\u4e2d"}: {label?: string; rows?: number; cards?: boolean}) { return <p className="hr-loading-status" role="status"><span className="hr-loading-spinner" aria-hidden="true" />{label}</p>; }

export type SkeletonProps = {
  rows?: number;
  label?: string;
  cards?: boolean;
};

export function Skeleton({ rows = 4, label = "載入中", cards = false }: SkeletonProps): ReactElement {
  const count = Math.max(1, Math.min(24, Math.floor(Number(rows)) || 1));
  const items = Array.from({ length: count }, (_, index) => index);

  return (
    <div className={`ui-skeleton-root${cards ? " ui-skeleton-cards" : ""}`} role="status" aria-label={label}>
      <div className="ui-skeleton-stack" aria-hidden="true">
        {cards
          ? items.map((index) => (
              <div key={index} className="ui-skeleton-card">
                <span className="ui-skeleton-media ui-skeleton-shimmer" />
                <span className="ui-skeleton-line ui-skeleton-shimmer" />
                <span className="ui-skeleton-line ui-skeleton-line-short ui-skeleton-shimmer" />
              </div>
            ))
          : items.map((index) => <span key={index} className="ui-skeleton-line ui-skeleton-shimmer" />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export type MotionDialogProps = {
  children: ReactNode | ((close: () => void) => ReactNode);
  onClose: () => void;
  label: string;
  bottomSheet?: boolean;
  className?: string;
};

type ScrollLockSnapshot = { htmlOverflow: string; bodyOverflow: string; bodyPaddingRight: string };

const dialogStack: object[] = [];
let scrollLocks = 0;
let scrollSnapshot: ScrollLockSnapshot | null = null;

function lockScroll(): void {
  scrollLocks += 1;
  if (scrollLocks > 1) return;
  const html = document.documentElement;
  const body = document.body;
  const gap = window.innerWidth - html.clientWidth;
  scrollSnapshot = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
  };
  if (gap > 0) {
    const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + gap}px`;
  }
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
}

function unlockScroll(): void {
  if (scrollLocks === 0) return;
  scrollLocks -= 1;
  if (scrollLocks > 0 || !scrollSnapshot) return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = scrollSnapshot.htmlOverflow;
  body.style.overflow = scrollSnapshot.bodyOverflow;
  body.style.paddingRight = scrollSnapshot.bodyPaddingRight;
  scrollSnapshot = null;
}

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = getFocusable(panel);
  const active = document.activeElement;
  if (items.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const inside = active instanceof Node && panel.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first || active === panel) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

const noop = (): void => undefined;
const DialogCloseContext = createContext<(() => void) | null>(null);

/** Inside <MotionDialog>, returns a function that plays the exit animation and then calls onClose. */
export function useMotionDialogClose(): () => void {
  return useContext(DialogCloseContext) ?? noop;
}

/**
 * Modal dialog for callers that conditionally mount it (`{open && <MotionDialog …/>}`).
 * Esc / backdrop click play the exit animation, then call onClose exactly once.
 */
export function MotionDialog({
  children,
  onClose,
  label,
  bottomSheet = true,
  className,
}: MotionDialogProps): ReactPortal | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  const closedRef = useRef(false);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const backdropPressRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    window.clearTimeout(exitTimerRef.current);
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (prefersReducedMotion()) {
      finishClose();
      return;
    }
    setClosing(true);
    exitTimerRef.current = window.setTimeout(finishClose, DIALOG_EXIT_FALLBACK_MS);
  }, [finishClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry = {};
    dialogStack.push(entry);
    lockScroll();
    setHost(document.body);

    const isTop = () => dialogStack[dialogStack.length - 1] === entry;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      const panel = panelRef.current;
      if (event.key === "Escape") {
        if (event.defaultPrevented || event.isComposing) return;
        event.preventDefault();
        requestClose();
      } else if (event.key === "Tab" && panel) {
        trapTab(event, panel);
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isTop()) return;
      const panel = panelRef.current;
      const target = event.target;
      if (!panel || !(target instanceof Node) || panel.contains(target)) return;
      if (target instanceof Element && target.closest(".ui-toast-region")) return;
      panel.focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      const index = dialogStack.indexOf(entry);
      if (index !== -1) dialogStack.splice(index, 1);
      unlockScroll();
      window.clearTimeout(exitTimerRef.current);
      const active = document.activeElement;
      if (previous && previous.isConnected && (!active || active === document.body ||
          !active.isConnected || (active instanceof Element && active.closest(".ui-dialog-panel")))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [requestClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!host || !panel) return;
    if (panel.contains(document.activeElement)) return; // child used autoFocus
    const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
    (preferred ?? panel).focus({ preventScroll: true });
  }, [host]);

  if (!host) return null;

  const handleBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    backdropPressRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const pressedHere = backdropPressRef.current;
    backdropPressRef.current = false;
    if (pressedHere && event.target === event.currentTarget) requestClose();
  };

  const handlePanelAnimationEnd = (event: ReactAnimationEvent<HTMLDivElement>) => {
    if (closingRef.current && event.target === event.currentTarget) finishClose();
  };

  const backdropClass = [
    "ui-dialog-backdrop",
    bottomSheet ? "ui-dialog-sheet" : "",
    closing ? "ui-dialog-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={backdropClass} onPointerDown={handleBackdropPointerDown} onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        className={className ? `ui-dialog-panel ${className}` : "ui-dialog-panel"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onAnimationEnd={handlePanelAnimationEnd}
      >
        <DialogCloseContext.Provider value={requestClose}>
          {typeof children === "function" ? children(requestClose) : children}
        </DialogCloseContext.Provider>
      </div>
    </div>,
    host,
  );
}
