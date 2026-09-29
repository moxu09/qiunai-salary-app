"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, MessageCircle, Search, Send, UsersRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  organization: "qiunai" | "deepnight";
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
  const [error, setError] = useState("");
  const retryRef = useRef<{ peerId: string; body: string; nonce: string } | null>(null);
  const currentPeerRef = useRef<string | null>(null);
  const initialScrollRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const selected = contacts.find((contact) => contact.discordId === selectedPeerId);
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
    if (!response.ok) throw new Error(payload.message || "讀取員工訊息失敗");
    return payload;
  }, []);

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
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
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

  function openContact(discordId: string) {
    if (discordId === selectedPeerId) return;
    currentPeerRef.current = discordId;
    initialScrollRef.current = true;
    retryRef.current = null;
    setSelectedPeerId(discordId);
    setMessages([]);
    setDraft("");
    setError("");
    setLoadingThread(true);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedPeerId || !body || sending) return;
    const retry = retryRef.current;
    const nonce = retry?.peerId === selectedPeerId && retry.body === body
      ? retry.nonce : crypto.randomUUID();
    retryRef.current = { peerId: selectedPeerId, body, nonce };
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
    <section className={`eip-messages eip-messages-${organization}`} aria-label="員工通訊與對話">
      {!open ? <button type="button" className="eip-messages-launcher" onClick={() => onOpenChange(true)} aria-label={`開啟員工訊息${unreadCount ? `，${unreadCount} 則未讀` : ""}`}>
        <MessageCircle size={21} /><span>員工訊息</span>{unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
      </button> : <div className="eip-messages-panel">
      <div className="eip-messages-heading">
        <span className="eip-messages-heading-icon"><UsersRound size={23} /></span>
        <div><p>TEAM COMMUNICATION</p><h2>員工訊息</h2><span>與同公司的在職員工一對一聯絡</span></div>
        <button type="button" className="eip-messages-close" onClick={() => onOpenChange(false)} aria-label="收合員工訊息"><X size={19} /></button>
      </div>
      {error ? <div role="alert" className="eip-messages-error">{error}</div> : null}
      <div className="eip-messages-layout">
        <aside className={`eip-messages-contacts ${selectedPeerId ? "has-selection" : ""}`}>
          <label className="eip-messages-search"><Search size={17} /><span className="sr-only">搜尋員工</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋員工暱稱" /></label>
          {loadingContacts ? <p className="eip-messages-empty">載入通訊錄中…</p>
            : visibleContacts.length ? <div className="eip-messages-contact-list">{visibleContacts.map((contact) => (
              <button type="button" key={contact.discordId} onClick={() => openContact(contact.discordId)}
                className={`eip-messages-contact ${selectedPeerId === contact.discordId ? "is-selected" : ""}`}>
                <span className="eip-messages-avatar">{contact.name.slice(0, 1)}</span>
                <span className="eip-messages-contact-content"><strong>{contact.name}</strong><small>{contact.lastMessage || "開始對話"}</small></span>
                <span className="eip-messages-contact-meta">{contact.lastAt ? <small>{dateText(contact.lastAt)}</small> : null}{contact.unreadCount > 0 ? <b>{contact.unreadCount > 99 ? "99+" : contact.unreadCount}</b> : null}</span>
              </button>
            ))}</div> : <p className="eip-messages-empty">目前沒有符合的員工。</p>}
        </aside>
        <div className={`eip-messages-thread ${selectedPeerId ? "has-selection" : ""}`}>
          {!selectedPeerId ? <div className="eip-messages-placeholder"><MessageCircle size={42} /><h3>選擇一位員工開始對話</h3><p>訊息只會顯示給對話雙方，不會公開在公告或訂單裡。</p></div> : <>
            <header className="eip-messages-thread-header"><button type="button" className="eip-messages-back" onClick={() => { currentPeerRef.current = null; setSelectedPeerId(null); }} aria-label="返回通訊錄"><ArrowLeft size={20} /></button><span className="eip-messages-avatar">{selected?.name.slice(0, 1) || "員"}</span><strong>{selected?.name || "員工"}</strong></header>
            <div className="eip-messages-history" ref={threadRef} aria-live="polite">
              {loadingThread ? <p className="eip-messages-empty">載入對話中…</p> : messages.length ? messages.map((message) => (
                <div key={message.id} className={`eip-messages-bubble-row ${message.sender_discord_id === myDiscordId ? "is-mine" : ""}`}>
                  <div className="eip-messages-bubble"><p>{message.body}</p><div className="eip-messages-bubble-meta"><time dateTime={message.created_at}>{dateText(message.created_at)}</time>{message.sender_discord_id === myDiscordId ? <span className="eip-messages-receipt" title={message.read_at ? `對方於 ${dateText(message.read_at)} 閱讀` : "對方尚未閱讀"}>{message.read_at ? "已讀" : "未讀"}</span> : null}</div></div>
                </div>
              )) : <p className="eip-messages-empty">還沒有訊息，打聲招呼吧。</p>}
            </div>
            <form className="eip-messages-compose" onSubmit={send}><label className="sr-only" htmlFor="eip-message-draft">輸入訊息</label><textarea id="eip-message-draft" value={draft} disabled={sending} maxLength={2000} rows={2} placeholder="輸入訊息…" onChange={(event) => { setDraft(event.target.value); retryRef.current = null; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" disabled={!draft.trim() || sending}>{sending ? "傳送中" : <><Send size={16} /> 送出</>}</button></form>
          </>}
        </div>
      </div>
      </div>}
    </section>
  );
}
