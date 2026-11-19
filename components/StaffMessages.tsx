"use client";
import { LongPressMenu } from "@/components/InteractionUI";
import { LoadingButton } from "@/components/InteractionUI";

import { LoadingStatus, notify } from "@/components/MotionUI";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type AnimationEvent, type Dispatch, type FocusEvent, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import { ArrowLeft, MessageCircle, Search, Send, UsersRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./StaffMessages.css";

type PanelState = "closed" | "open" | "closing";

const PANEL_EXIT_ANIMATION = "eip-messages-panel-out";
// Only guarantees unmount if animationend never arrives (hidden tab, interrupted style).
const PANEL_EXIT_FALLBACK_MS = 260;

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Contact = {
  discordId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unreadCount: number;
};

type DirectMessage = {
  id: string;
  sender_discord_id: string;
  recipient_discord_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Props = {
  organization: "qiunai" | "deepnight" | "hr";
  myDiscordId: string;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
};

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function StaffMessages({ organization, myDiscordId, open, onOpenChange }: Props) {
  const apiPath = `/api/${organization}/messages`;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUntil, setTypingUntil] = useState(0);
  const typingSent = useRef({ peer: "", at: 0, active: false, department: null as string | null });
  const typingQueue = useRef<Promise<unknown>>(Promise.resolve());
  const typingDepartment = useRef<string | null>(null);
  const [error, setError] = useState("");
  const retryRef = useRef<{ peerId: string; body: string; nonce: string } | null>(null);
  const currentPeerRef = useRef<string | null>(null);
  const initialScrollRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const focusInsideRef = useRef(false);
  const wasOpenRef = useRef(open);
  // Derived during render so the exiting panel and the returning launcher land in one commit.
  const [panelState, setPanelState] = useState<PanelState>(open ? "open" : "closed");
  const [panelOpenProp, setPanelOpenProp] = useState(open);
  if (panelOpenProp !== open) {
    setPanelOpenProp(open);
    setPanelState(open ? "open" : prefersReducedMotion() ? "closed" : "closing");
  }
  const closing = panelState === "closing";
  const selected =contacts.find((contact) => contact.discordId === selectedPeerId);
  const unreadCount = contacts.reduce((total, contact) => total + contact.unreadCount, 0);
  const visibleContacts = contacts.filter((contact) =>
    !search.trim() || [contact.name, contact.discordId].some((text) =>
      text.toLocaleLowerCase("zh-TW").includes(search.trim().toLocaleLowerCase("zh-TW"))
    )
  );

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("登入已過期，請重新登入");
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "讀取訊息失敗");
    return payload;
  }, []);

  const reportTyping = useCallback(async (active: boolean, peer = currentPeerRef.current) => {
    if (!peer) return;
    const scope = !active && typingSent.current.peer === peer ? typingSent.current.department : typingDepartment.current;
    if (organization === "hr" && !scope) return;
    const now = Date.now();
    const previous = typingSent.current;
    if (previous.peer === peer && previous.active === active && (!active || now - previous.at < 5000)) return;
    typingSent.current = { peer, at: now, active, department: scope };
    try {
      const request = () => authorizedFetch(apiPath, { method: "POST", body: JSON.stringify({ recipientId: peer, typing: active, department: scope }) });
      typingQueue.current = typingQueue.current.catch(()=>undefined).then(request);
      await typingQueue.current;
    } catch { /* Presence expires automatically when the connection is unavailable. */ }
  }, [apiPath, authorizedFetch, organization]);

  useEffect(() => {
    if (!typingUntil) return;
    const timer = window.setTimeout(() => setTypingUntil(0), Math.max(0, typingUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [typingUntil]);

  useEffect(() => {
    const peer = selectedPeerId;
    const stop = () => { if (document.visibilityState !== "visible") void reportTyping(false, peer); };
    document.addEventListener("visibilitychange", stop);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      if (peer) void reportTyping(false, peer);
    };
  }, [selectedPeerId, open, reportTyping]);

  const loadContacts = useCallback(async (silent = false) => {
    try {
      const payload = await authorizedFetch(apiPath);
      setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
      setError("");
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "讀取通訊錄失敗");
    } finally {
      setLoadingContacts(false);
    }
  }, [apiPath, authorizedFetch]);

  useEffect(() => {
    void Promise.resolve().then(() => loadContacts());
    const timer = window.setInterval(() => { void loadContacts(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    if (!contacts.length) return;
    const url = new URL(window.location.href);
    const peerId = url.searchParams.get("chat");
    if (!peerId || !contacts.some((contact) => contact.discordId === peerId)) return;
    currentPeerRef.current = peerId;
    typingDepartment.current = null;
    initialScrollRef.current = true;
    setSelectedPeerId(peerId);
    setLoadingThread(true);
    onOpenChange(true);
    url.searchParams.delete("chat");
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [contacts, onOpenChange]);

  useEffect(() => {
    if (!selectedPeerId || !open) return;
    let cancelled = false;
    async function load() {
      try {
        const payload = await authorizedFetch(`${apiPath}?peer=${encodeURIComponent(selectedPeerId!)}`);
        if (cancelled) return;
        typingDepartment.current = payload.typingDepartment || null;
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        setTypingUntil(payload.typing ? Date.now() + 8000 : 0);
        setError("");
        // A background tab has not actually shown the conversation to its recipient.
        if (document.visibilityState === "visible") {
          await authorizedFetch(apiPath, {
            method: "PATCH",
            body: JSON.stringify({ peerId: selectedPeerId }),
          });
        }
        if (!cancelled) void loadContacts(true);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "讀取對話失敗");
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    }
    void Promise.resolve().then(load);
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [apiPath, authorizedFetch, selectedPeerId, open, loadContacts]);

  useEffect(() => {
    if (loadingThread || !threadRef.current) return;
    const element = threadRef.current;
    const timer = window.setTimeout(() => {
      if (initialScrollRef.current || element.scrollHeight - element.scrollTop - element.clientHeight < 240) {
        element.scrollTop = element.scrollHeight;
        initialScrollRef.current = false;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadingThread, messages.length]);

  useEffect(() => {
    if (panelState !== "closing") return;
    const timer = window.setTimeout(() => {
      setPanelState((current) => current === "closing" ? "closed" : current);
    }, PANEL_EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [panelState]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const active = document.activeElement;
    const panel = panelRef.current;
    // Reduced motion removes the panel in this commit, leaving focus on <body>.
    const focusWasInside = (panel && active && panel.contains(active))
      || (focusInsideRef.current && (!active || active === document.body));
    focusInsideRef.current = false;
    if (focusWasInside) launcherRef.current?.focus();
  }, [open]);

  function finishPanelExit(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.animationName !== PANEL_EXIT_ANIMATION) return;
    setPanelState((current) => current === "closing" ? "closed" : current);
  }

  function closePanel() {
    focusInsideRef.current = true;
    onOpenChange(false);
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // LongPressMenu handles (and prevents) its own Escape first.
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || closing) return;
    event.preventDefault();
    closePanel();
  }

  function onPanelBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && !event.currentTarget.contains(next)) focusInsideRef.current = false;
  }

  function openContact(discordId: string) {
    if (discordId === selectedPeerId) return;
    currentPeerRef.current = discordId;
    initialScrollRef.current = true;
    retryRef.current = null;
    setSelectedPeerId(discordId);
    setMessages([]);
    setDraft("");
    setTypingUntil(0);
    setError("");
    setLoadingThread(true);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!open || !selectedPeerId || !body || sending) return;
    const retry = retryRef.current;
    const nonce = retry?.peerId === selectedPeerId && retry.body === body
      ? retry.nonce : crypto.randomUUID();
    retryRef.current = { peerId: selectedPeerId, body, nonce };
    void reportTyping(false);
    setSending(true);
    setError("");
    try {
      const payload = await authorizedFetch(apiPath, {
        method: "POST",
        body: JSON.stringify({ recipientId: selectedPeerId, body, nonce }),
      });
      if (currentPeerRef.current === selectedPeerId) {
        setMessages((current) => current.some((item) => item.id === payload.message.id)
          ? current : [...current, payload.message].slice(-100));
        setDraft("");
      }
      retryRef.current = null;
      void loadContacts(true);
    } catch (cause) {
      if (currentPeerRef.current === selectedPeerId) {
        setError(cause instanceof Error ? cause.message : "傳送訊息失敗；可按送出重試");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={`eip-messages eip-messages-${organization}${closing ? " is-panel-closing" : ""}`} aria-label="員工通訊與對話">
      {panelState !== "closed" ? <div ref={panelRef} id={panelId} role="region" aria-label="訊息"
        className={`eip-messages-panel ${closing ? "is-closing" : "is-open"}`}
        inert={closing} aria-hidden={closing || undefined}
        onAnimationEnd={finishPanelExit} onKeyDown={onPanelKeyDown}
        onFocus={() => { focusInsideRef.current = true; }} onBlur={onPanelBlur}>
      <div className="eip-messages-heading">
        <span className="eip-messages-heading-icon"><UsersRound size={23} /></span>
        <div><p>TEAM COMMUNICATION</p><h2>訊息</h2><span>與同公司的在職員工一對一聯絡</span></div>
        <button type="button" className="eip-messages-close" onClick={closePanel} aria-label="收合訊息" title="收合訊息" aria-controls={panelId} aria-expanded={open}><X size={19} /></button>
      </div>
      {error ? <div role="alert" className="eip-messages-error">{error}</div> : null}
      <div className="eip-messages-layout">
        <aside className={`eip-messages-contacts ${selectedPeerId ? "has-selection" : ""}`}>
          <label className="eip-messages-search"><Search size={17} /><span className="sr-only">搜尋員工</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋員工暱稱" /></label>
          {loadingContacts ? <LoadingStatus rows={3} label="載入通訊錄中…" />
            : visibleContacts.length ? <div className="eip-messages-contact-list">{visibleContacts.map((contact) => (
              <button type="button" key={contact.discordId} onClick={() => openContact(contact.discordId)}
                aria-pressed={selectedPeerId === contact.discordId}
                className={`eip-messages-contact ${selectedPeerId === contact.discordId ? "is-selected" : ""}`}>
                <span className="eip-messages-avatar">{contact.name.slice(0, 1)}</span>
                <span className="eip-messages-contact-content"><strong>{contact.name}</strong><small>{contact.lastMessage || "開始對話"}</small></span>
                <span className="eip-messages-contact-meta">{contact.lastAt ? <small>{dateText(contact.lastAt)}</small> : null}{contact.unreadCount > 0 ? <b>{contact.unreadCount > 99 ? "99+" : contact.unreadCount}</b> : null}</span>
              </button>
            ))}</div> : <p className="eip-messages-empty">目前沒有符合的員工。</p>}
        </aside>
        <div className={`eip-messages-thread ${selectedPeerId ? "has-selection" : ""}`}>
          {!selectedPeerId ? <div className="eip-messages-placeholder"><MessageCircle size={42} /><h3>選擇一位員工開始對話</h3><p>訊息只會顯示給對話雙方，不會公開在公告或訂單裡。</p></div> : <>
            <header className="eip-messages-thread-header"><button type="button" className="eip-messages-back" onClick={() => { currentPeerRef.current = null; setSelectedPeerId(null); }} aria-label="返回通訊錄" title="返回通訊錄"><ArrowLeft size={20} /></button><span className="eip-messages-avatar">{selected?.name.slice(0, 1) || "員"}</span><strong>{selected?.name || "員工"}</strong></header>
            <div className="eip-messages-history" ref={threadRef} aria-live="polite">
              {loadingThread ? <LoadingStatus rows={3} label="載入對話中…" /> : messages.length ? messages.map((message) => (
                <div key={message.id} className={`eip-messages-bubble-row ${message.sender_discord_id === myDiscordId ? "is-mine" : ""}`}>
                  <LongPressMenu label="訊息操作" items={[{label:"複製訊息",onSelect:()=>{void Promise.resolve().then(()=>navigator.clipboard.writeText(message.body)).then(()=>notify("訊息已複製", "success")).catch(()=>notify("無法複製訊息", "error"));}}]}><div className="eip-messages-bubble"><p>{message.body}</p><div className="eip-messages-bubble-meta"><time dateTime={message.created_at}>{dateText(message.created_at)}</time>{message.sender_discord_id === myDiscordId ? <span className="eip-messages-receipt" title={message.read_at ? `對方於 ${dateText(message.read_at)} 閱讀` : "對方尚未閱讀"}>{message.read_at ? "已讀" : "未讀"}</span> : null}</div></div></LongPressMenu>
                </div>
              )) : <p className="eip-messages-empty">還沒有訊息，打聲招呼吧。</p>}
            </div>
            {typingUntil > Date.now() ? <div className="ui-interaction-typing" role="status"><span aria-hidden="true"><i /><i /><i /></span>{selected?.name || "對方"}正在輸入…</div> : null}
            <form className="eip-messages-compose" onSubmit={send}><label className="sr-only" htmlFor="eip-message-draft">輸入訊息</label><textarea id="eip-message-draft" onBlur={() => void reportTyping(false)} value={draft} disabled={sending} maxLength={2000} rows={2} placeholder="輸入訊息…" onChange={(event) => { setDraft(event.target.value); retryRef.current = null; void reportTyping(Boolean(event.target.value.trim())); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><LoadingButton type="submit" disabled={!draft.trim() || sending} loading={Boolean(sending)} loadingLabel="傳送中">{sending ? "傳送中" : <><Send size={16} /> 送出</>}</LoadingButton></form>
          </>}
        </div>
      </div>
      </div> : null}
      {!open ? <button ref={launcherRef} type="button" className="eip-messages-launcher" onClick={() => onOpenChange(true)}
        aria-expanded={open} aria-controls={panelState !== "closed" ? panelId : undefined}
        aria-label={`開啟訊息${unreadCount ? `，${unreadCount} 則未讀` : ""}`}>
        <MessageCircle size={21} /><span>訊息</span>{unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
      </button> : null}
    </section>
  );
}
