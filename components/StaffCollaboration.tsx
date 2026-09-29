"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, BookOpenText, CalendarDays, CheckCircle2, ClipboardCheck, FileText, MessageSquareText, Search, Send, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import WorkspaceDocumentFiles from "@/components/WorkspaceDocumentFiles";

type Section = "workspace" | "calendar" | "documents" | "knowledge" | "workflows";
type Event = { id: string; title: string; details: string; location: string; starts_at: string; ends_at: string };
type Document = { id: string; document_type: "document" | "knowledge"; category: string; title: string; body: string; version: number; updated_at: string };
type Field = { key: string; label: string; type: "text" | "textarea" | "date" | "choice"; required: boolean; options: string[] };
type Template = { id: string; name: string; description: string; fields: Field[]; approver_role: "manager" | "owner" };
type Submission = { id: string; template_id: string; status: "pending" | "approved" | "rejected"; created_at: string; decided_at: string | null; decision_note: string | null; form_data: Record<string, string> };
type AuditEntry = { new_status: "approved" | "rejected"; note: string | null; created_at: string };
type ExistingAnnouncement = { id: string; title: string; created_at: string; requires_signature?: boolean; signature?: { status: string } | null };
type ExistingRequest = { id: string; request_type: string; status: string; application_date: string };
type Data = { events: Event[]; documents: Document[]; templates: Template[]; requests: Submission[] };
type Props = { organization: "qiunai" | "deepnight"; section: Section; employeeName: string; onSelect: (tab: string) => void };
const emptyData: Data = { events: [], documents: [], templates: [], requests: [] };
const time = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const statusLabel: Record<string, string> = { pending: "待簽核", approved: "已核准", rejected: "未通過" };

export default function StaffCollaboration({ organization, section, employeeName, onSelect }: Props) {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);
  const [workflowTargetHours, setWorkflowTargetHours] = useState(48);
  const [existingAnnouncements, setExistingAnnouncements] = useState<ExistingAnnouncement[]>([]);
  const [existingRequests, setExistingRequests] = useState<ExistingRequest[]>([]);
  const [requestHistory, setRequestHistory] = useState<{ item: Submission; audit: AuditEntry[] } | null>(null);

  const authorizedFetch = useCallback(async (method: "GET" | "POST", payload?: unknown, endpoint = "workspace") => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) throw new Error("登入已過期，請重新登入");
    const response = await fetch(`/api/${organization}/${endpoint}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "讀取協作資料失敗");
    return result;
  }, [organization]);
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await authorizedFetch("GET");
      setData({ events: result.events || [], documents: result.documents || [], templates: result.templates || [], requests: result.requests || [] });
      setReferenceTime(Date.now());
      setWorkflowTargetHours(Number(result.workflowTargetHours || 48));
      if (section === "workspace") {
        const [announcements, hr] = await Promise.allSettled([
          authorizedFetch("GET", undefined, "announcements"),
          authorizedFetch("GET", undefined, "hr"),
        ]);
        setExistingAnnouncements(announcements.status === "fulfilled" ? announcements.value.announcements || [] : []);
        setExistingRequests(hr.status === "fulfilled" ? hr.value.requests || [] : []);
      }
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取失敗"); }
    finally { setLoading(false); }
  }, [authorizedFetch, section]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const filteredDocuments = useMemo(() => data.documents.filter((item) =>
    (section === "knowledge" ? item.document_type === "knowledge" : item.document_type === "document") &&
    (!query || [item.title, item.category, item.body].some((value) => value.toLocaleLowerCase("zh-TW").includes(query.trim().toLocaleLowerCase("zh-TW"))))
  ), [data.documents, query, section]);
  const upcoming = data.events.filter((item) => new Date(item.ends_at).getTime() >= referenceTime).slice(0, 5);
  const pending = data.requests.filter((item) => item.status === "pending").length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedTemplate) return;
    try {
      setSending(true); setError(""); setNotice("");
      await authorizedFetch("POST", { kind: "request", templateId: selectedTemplate.id, formData: answers });
      setSelectedTemplate(null); setAnswers({});
      setNotice("申請已送出，可在「我的申請」追蹤結果。");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "送出失敗"); }
    finally { setSending(false); }
  }
  async function showRequestHistory(id: string) {
    try {
      setError("");
      const result = await authorizedFetch("GET", undefined, `workspace?audit=${encodeURIComponent(id)}`);
      setRequestHistory({ item: result.item, audit: result.audit || [] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取申請進度失敗"); }
  }
  const go = (tab: string) => { onSelect(tab); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <section className="eip-collaboration">
      <div className="eip-collab-hero">
        <div>
          <p className="eip-collab-eyebrow"><Sparkles size={15} /> TEAM WORKSPACE</p>
          <h1>{section === "workspace" ? `早安，${employeeName}` : ({ calendar: "團隊日程", documents: "共享文件", knowledge: "知識庫", workflows: "流程中心" } as Record<string, string>)[section]}</h1>
          <p>{section === "workspace" ? "把需要知道、需要處理的工作，放在同一個地方。" : "資料與流程由團隊即時維護，依權限顯示。"}</p>
        </div>
        <button type="button" className="eip-collab-refresh" onClick={() => void refresh()}>重新整理</button>
      </div>
      {error ? <p className="eip-collab-alert" role="alert">{error}</p> : null}
      {notice ? <p className="eip-collab-notice" role="status">{notice}</p> : null}
      {loading ? <p className="eip-collab-empty">正在同步工作資料…</p> : null}
      {!loading && section === "workspace" ? (
        <>
          <div className="eip-collab-metrics">
            <button onClick={() => go("calendar")}><CalendarDays size={21} /><strong>{upcoming.length}</strong><span>近期團隊日程</span></button>
            <button onClick={() => go("workflows")}><ClipboardCheck size={21} /><strong>{pending + existingRequests.filter((item) => item.status === "pending").length}</strong><span>進行中的申請</span></button>
            <button onClick={() => go("knowledge")}><BookOpenText size={21} /><strong>{data.documents.filter((item) => item.document_type === "knowledge").length}</strong><span>可查閱知識</span></button>
          </div>
          <div className="eip-collab-columns">
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>我的工作進度</h2><button onClick={() => go("workflows")}>查看所有申請 <ArrowRight size={15} /></button></div>
              {data.requests.slice(0, 4).map((item) => <button type="button" className="eip-collab-action-row" key={item.id} onClick={() => { void showRequestHistory(item.id); go("workflows"); }}><span><strong>{data.templates.find((entry) => entry.id === item.template_id)?.name || "流程申請"}</strong><small>{time(item.created_at)}</small></span><span className={`eip-collab-status ${item.status}`}>{item.status === "pending" && referenceTime - new Date(item.created_at).getTime() >= workflowTargetHours * 3600000 ? "超時待處理" : statusLabel[item.status]}</span></button>)}
              {!data.requests.length ? <p className="eip-collab-empty">還沒有申請紀錄，可從流程中心發起。</p> : null}
            </div>
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>需要我處理</h2><button onClick={() => go("profile")}>前往公告 <ArrowRight size={15} /></button></div>
              {existingAnnouncements.filter((item) => item.requires_signature && item.signature?.status !== "signed").slice(0, 4).map((item) => <button type="button" className="eip-collab-action-row" key={item.id} onClick={() => go("profile")}><span><strong>{item.title}</strong><small>公告待簽署</small></span><ArrowRight size={16} /></button>)}
              {!existingAnnouncements.some((item) => item.requires_signature && item.signature?.status !== "signed") ? <p className="eip-collab-empty">目前沒有需要簽署的公告。</p> : null}
            </div>
          </div>
          <div className="eip-collab-columns">
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>接下來的日程</h2><button onClick={() => go("calendar")}>查看全部 <ArrowRight size={15} /></button></div>
              {upcoming.length ? upcoming.map((item) => <div className="eip-collab-row" key={item.id}><span className="eip-collab-date">{time(item.starts_at)}</span><strong>{item.title}</strong><small>{item.location}</small></div>) : <p className="eip-collab-empty">目前沒有已發布的近期日程。</p>}
            </div>
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>快速開始</h2></div>
              <div className="eip-collab-actions">
                <button onClick={() => go("messages")}><MessageSquareText /> 聯絡同事 <ArrowRight /></button>
                <button onClick={() => go("workflows")}><ClipboardCheck /> 發起流程 <ArrowRight /></button>
                <button onClick={() => go("approval-administrative")}><CheckCircle2 /> 現有行政簽核 <ArrowRight /></button>
                <button onClick={() => go("documents")}><FileText /> 共享文件 <ArrowRight /></button>
              </div>
            </div>
          </div>
          <div className="eip-collab-panel">
            <div className="eip-collab-panel-head"><h2>最近更新的知識</h2><button onClick={() => go("knowledge")}>開啟知識庫 <ArrowRight size={15} /></button></div>
            <div className="eip-collab-tile-grid">{data.documents.filter((item) => item.document_type === "knowledge").slice(0, 3).map((item) => <button className="eip-collab-tile" key={item.id} onClick={() => { setSelectedDocument(item); go("knowledge"); }}><BookOpenText size={18} /><span>{item.category}</span><strong>{item.title}</strong></button>)}</div>
            {!data.documents.some((item) => item.document_type === "knowledge") ? <p className="eip-collab-empty">知識庫尚未發布文章。</p> : null}
          </div>
          <div className="eip-collab-columns">
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>最新公告</h2><button onClick={() => go("profile")}>查看公告 <ArrowRight size={15} /></button></div>
              {existingAnnouncements.slice(0, 4).map((item) => <div className="eip-collab-row" key={item.id}><span className="eip-collab-date">{item.created_at ? time(item.created_at) : ""}</span><strong>{item.title}</strong><small>{item.requires_signature && item.signature?.status !== "signed" ? "待簽署" : ""}</small></div>)}
              {!existingAnnouncements.length ? <p className="eip-collab-empty">目前沒有新公告。</p> : null}
            </div>
            <div className="eip-collab-panel">
              <div className="eip-collab-panel-head"><h2>現有簽核進度</h2><button onClick={() => go("approval-administrative")}>查看簽核 <ArrowRight size={15} /></button></div>
              {existingRequests.slice(0, 4).map((item) => <div className="eip-collab-row" key={item.id}><span className="eip-collab-date">{item.application_date || ""}</span><strong>{item.request_type}</strong><small>{statusLabel[item.status] || item.status}</small></div>)}
              {!existingRequests.length ? <p className="eip-collab-empty">本月沒有既有流程申請。</p> : null}
            </div>
          </div>
        </>
      ) : null}
      {!loading && section === "calendar" ? <div className="eip-collab-panel">
        <div className="eip-collab-panel-head"><h2>團隊行事曆</h2><span>台灣時間 · 近期活動與會議</span></div>
        {data.events.length ? data.events.map((item) => <article className="eip-collab-event" key={item.id}><div className="eip-collab-event-time">{time(item.starts_at)}<br />至 {time(item.ends_at)}</div><div><h3>{item.title}</h3>{item.location ? <p>地點：{item.location}</p> : null}{item.details ? <p>{item.details}</p> : null}</div></article>) : <p className="eip-collab-empty">目前沒有已發布的日程。</p>}
      </div> : null}
      {!loading && (section === "documents" || section === "knowledge") ? <div className="eip-collab-panel">
        <div className="eip-collab-panel-head"><h2>{section === "knowledge" ? "團隊知識庫" : "共享文件"}</h2><span>{filteredDocuments.length} 篇</span></div>
        <label className="eip-collab-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、分類或內容" /></label>
        <div className="eip-collab-document-layout">
          <div className="eip-collab-document-list">{filteredDocuments.map((item) => <button key={item.id} className={selectedDocument?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedDocument(item)}><span>{item.category} · v{item.version}</span><strong>{item.title}</strong><small>更新於 {time(item.updated_at)}</small></button>)}{!filteredDocuments.length ? <p className="eip-collab-empty">沒有符合條件的內容。</p> : null}</div>
          <article className="eip-collab-document-body">{selectedDocument && filteredDocuments.some((item) => item.id === selectedDocument.id) ? <><span>{selectedDocument.category} · 版本 {selectedDocument.version}</span><h3>{selectedDocument.title}</h3><div>{selectedDocument.body}</div><WorkspaceDocumentFiles key={selectedDocument.id} organization={organization} documentId={selectedDocument.id} /></> : <p className="eip-collab-empty">選擇左側文件以閱讀全文。</p>}</article>
        </div>
      </div> : null}
      {!loading && section === "workflows" ? <div className="eip-collab-columns">
        <div className="eip-collab-panel">
          <div className="eip-collab-panel-head"><h2>發起申請</h2><span>依團隊流程送出</span></div>
          {data.templates.length ? data.templates.map((item) => <button className="eip-collab-template" key={item.id} onClick={() => { setSelectedTemplate(item); setAnswers({}); }}><ClipboardCheck size={20} /><span><strong>{item.name}</strong><small>{item.description || "填寫表單並送交簽核"}</small></span><ArrowRight size={16} /></button>) : <p className="eip-collab-empty">目前沒有可發起的新流程。既有行政與福利申請仍可從左側「簽核」操作。</p>}
          {selectedTemplate ? <form className="eip-collab-form" onSubmit={(event) => void submit(event)}>
            <h3>{selectedTemplate.name}</h3>
            <p>{selectedTemplate.description}</p>
            {selectedTemplate.fields.map((field) => <label key={field.key}>{field.label}{field.required ? " *" : ""}
              {field.type === "textarea" ? <textarea value={answers[field.key] || ""} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} required={field.required} maxLength={3000} /> :
                field.type === "choice" ? <select value={answers[field.key] || ""} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} required={field.required}><option value="">請選擇</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> :
                  <input type={field.type === "date" ? "date" : "text"} value={answers[field.key] || ""} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} required={field.required} maxLength={3000} />}
            </label>)}
            <div className="eip-collab-form-actions"><button type="button" onClick={() => setSelectedTemplate(null)}>取消</button><button disabled={sending} type="submit"><Send size={15} /> {sending ? "送出中…" : "送出申請"}</button></div>
          </form> : null}
        </div>
        <div className="eip-collab-panel">
          <div className="eip-collab-panel-head"><h2>我的申請</h2><span>{data.requests.length} 筆</span></div>
          {data.requests.length ? data.requests.map((item) => <div className="eip-collab-request" key={item.id}><span className={`eip-collab-status ${item.status}`}>{item.status === "pending" && referenceTime - new Date(item.created_at).getTime() >= workflowTargetHours * 3600000 ? "超時待處理" : statusLabel[item.status]}</span><strong>{data.templates.find((template) => template.id === item.template_id)?.name || "流程申請"}</strong><small>{time(item.created_at)}</small>{item.status === "pending" ? <p>待辦處理目標：送出後 {workflowTargetHours} 小時；超時仍可繼續追蹤。</p> : null}{item.decision_note ? <p>簽核備註：{item.decision_note}</p> : null}<button type="button" className="eip-collab-inline-action" onClick={() => void showRequestHistory(item.id)}>查看處理歷程</button></div>) : <p className="eip-collab-empty">尚無新流程申請紀錄。</p>}
          {requestHistory ? <section className="eip-collab-history"><h3>申請處理歷程</h3><p><span>1</span> 已送出申請 · {time(requestHistory.item.created_at)}</p>{requestHistory.audit.map((entry, index) => <p key={index}><span>{index + 2}</span> {statusLabel[entry.new_status]} · {time(entry.created_at)}{entry.note ? ` · ${entry.note}` : ""}</p>)}{requestHistory.item.status === "pending" ? <p><span>…</span> 等待管理員簽核</p> : null}<button type="button" onClick={() => setRequestHistory(null)}>關閉</button></section> : null}
        </div>
      </div> : null}
    </section>
  );
}
