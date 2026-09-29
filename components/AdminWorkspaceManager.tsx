"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BookOpenText, CalendarDays, ClipboardCheck, FileText, LayoutDashboard, Plus, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Field = { key: string; label: string; type: "text" | "textarea" | "date" | "choice"; required: boolean; options: string[] };
type Item = Record<string, unknown> & { id: string };
type Data = { events: Item[]; documents: Item[]; templates: Item[]; requests: Item[] };
type Kind = "overview" | "event" | "document" | "template" | "decision";
type RequestStatus = "pending" | "approved" | "rejected" | "all";
type AuditEntry = { old_status: string; new_status: string; actor_discord_id: string; note: string | null; created_at: string };
type RequestHistory = { item: Item; audit: AuditEntry[] };
const empty: Data = { events: [], documents: [], templates: [], requests: [] };
const dateInput = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
};
const blankField = (index: number): Field => ({ key: `field_${index}`, label: "", type: "text", required: true, options: [] });
const initial = {
  event: { title: "", details: "", location: "", startsAt: "", endsAt: "", isPublished: true },
  document: { documentType: "knowledge", category: "一般", title: "", body: "", isPublished: false },
  template: { name: "", description: "", approverRole: "manager", isActive: false, fields: [blankField(1)] as Field[] },
};
export default function AdminWorkspaceManager({ organization }: { organization: "qiunai" | "deepnight" }) {
  const [data, setData] = useState<Data>(empty);
  const [section, setSection] = useState<Kind>("overview");
  const [form, setForm] = useState<Record<string, unknown>>(initial.event);
  const [editing, setEditing] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisions, setRevisions] = useState<Item[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("pending");
  const [requestPage, setRequestPage] = useState(1);
  const [requestSummary, setRequestSummary] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [workspaceSummary, setWorkspaceSummary] = useState({ upcomingEvents: 0, publishedDocuments: 0, activeTemplates: 0 });
  const [requestPagination, setRequestPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [history, setHistory] = useState<RequestHistory | null>(null);
  async function call(method: "GET" | "POST" | "PATCH", payload?: unknown, suffix = "") {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) throw new Error("登入已過期，請重新登入");
    const response = await fetch(`/api/${organization}/workspace?admin=1${suffix}`, {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${auth.session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "操作失敗");
    return result;
  }
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("登入已過期，請重新登入");
      const response = await fetch(`/api/${organization}/workspace?admin=1&status=${requestStatus}&page=${requestPage}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "讀取失敗");
      setData({ events: result.events || [], documents: result.documents || [], templates: result.templates || [], requests: result.requests || [] });
      setRequestSummary(result.requestSummary || { pending: 0, approved: 0, rejected: 0 });
      setWorkspaceSummary(result.workspaceSummary || { upcomingEvents: 0, publishedDocuments: 0, activeTemplates: 0 });
      setRequestPagination(result.requestPagination || { page: 1, pageSize: 25, total: 0 });
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取失敗"); }
    finally { setLoading(false); }
  }, [organization, requestStatus, requestPage]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  function choose(next: Kind) {
    setSection(next); setEditing(null); setRevisions([]);
    if (next === "overview") { setRequestStatus("pending"); setRequestPage(1); }
    setForm(next === "decision" || next === "overview" ? {} : { ...initial[next] });
    setError(""); setNotice("");
  }
  function edit(kind: Kind, item: Item) {
    choose(kind); setEditing(item);
    if (kind === "event") setForm({ title: item.title, details: item.details, location: item.location, startsAt: dateInput(item.starts_at), endsAt: dateInput(item.ends_at), isPublished: item.is_published });
    if (kind === "document") setForm({ documentType: item.document_type, title: item.title, category: item.category, body: item.body, isPublished: item.is_published });
    if (kind === "template") setForm({ isActive: item.is_active });
  }
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setBusy(true); setError(""); setNotice("");
      const payload: Record<string, unknown> = { kind: section, ...form };
      if (section === "event") {
        payload.startsAt = new Date(`${String(form.startsAt)}:00+08:00`).toISOString();
        payload.endsAt = new Date(`${String(form.endsAt)}:00+08:00`).toISOString();
      }
      if (section === "template" && !editing) {
        payload.fields = (form.fields as Field[]).map((field) => ({
          ...field, options: field.type === "choice" ? field.options.map((value) => value.trim()).filter(Boolean) : [],
        }));
      }
      if (editing) payload.id = editing.id;
      await call(editing ? "PATCH" : "POST", payload);
      setNotice(editing ? "已儲存變更。" : "已建立；發布狀態依設定生效。");
      setEditing(null); setForm({ ...initial[section as keyof typeof initial] });
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "儲存失敗"); }
    finally { setBusy(false); }
  }
  async function decide(item: Item, status: "approved" | "rejected") {
    if (status === "rejected" && !decisionNote.trim()) { setError("退回時請填寫原因"); return; }
    try {
      setBusy(true); setError("");
      await call("PATCH", { kind: "decision", id: item.id, status, note: decisionNote.trim() });
      setNotice("已記錄簽核決定。"); setDecisionTarget(null); setDecisionNote(""); setHistory(null);
      if (requestStatus !== "all" && requestPage > 1 && data.requests.length === 1) {
        setRequestPage((page) => page - 1);
      } else {
        await refresh();
      }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "簽核失敗"); }
    finally { setBusy(false); }
  }
  async function showHistory(item: Item) {
    try {
      const result = await call("GET", undefined, `&audit=${item.id}`);
      setHistory({ item: result.item, audit: result.audit || [] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取簽核歷程失敗"); }
  }
  function changeStatus(status: RequestStatus) {
    setRequestStatus(status); setRequestPage(1); setDecisionTarget(null); setHistory(null);
  }
  async function showRevisions(item: Item) {
    try {
      const result = await call("GET", undefined, `&revisions=${item.id}`);
      setRevisions(result.revisions || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取修訂紀錄失敗"); }
  }
  const fields = (form.fields || []) as Field[];
  const totalPages = Math.max(1, Math.ceil(requestPagination.total / requestPagination.pageSize));
  const upcomingEvents = data.events.filter((item) => Boolean(item.is_published) && new Date(String(item.ends_at)).getTime() >= Date.now());
  return <main className="eip-admin-workspace">
    <div className="eip-collab-hero"><div><p className="eip-collab-eyebrow">TEAM OPERATIONS</p><h1>協作工作台</h1><p>從待辦簽核到日程、文件和流程設定，前後台同步處理。</p></div><button className="eip-collab-refresh" onClick={() => void refresh()}>重新整理</button></div>
    {error ? <p className="eip-collab-alert" role="alert">{error}</p> : null}
    {notice ? <p className="eip-collab-notice" role="status">{notice}</p> : null}
    <div className="eip-admin-workspace-tabs">
      {([["overview", "總覽", LayoutDashboard], ["decision", "簽核待辦", ClipboardCheck], ["event", "團隊日程", CalendarDays], ["document", "文件／知識庫", BookOpenText], ["template", "流程設定", FileText]] as const).map(([kind, label, Icon]) =>
        <button key={kind} onClick={() => choose(kind)} className={section === kind ? "is-active" : ""}><Icon size={17} /> {label}</button>)}
    </div>
    {loading ? <p className="eip-collab-empty">正在讀取管理資料…</p> : null}
    {!loading && section === "overview" ? <>
      <div className="eip-admin-overview-stats">
        <button onClick={() => choose("decision")}><ClipboardCheck size={21} /><strong>{requestSummary.pending}</strong><span>待處理簽核</span><ArrowRight size={16} /></button>
        <button onClick={() => choose("event")}><CalendarDays size={21} /><strong>{workspaceSummary.upcomingEvents}</strong><span>已發布近期日程</span><ArrowRight size={16} /></button>
        <button onClick={() => choose("document")}><BookOpenText size={21} /><strong>{workspaceSummary.publishedDocuments}</strong><span>已發布文件與知識</span><ArrowRight size={16} /></button>
        <button onClick={() => choose("template")}><FileText size={21} /><strong>{workspaceSummary.activeTemplates}</strong><span>開放中的流程</span><ArrowRight size={16} /></button>
      </div>
      <div className="eip-collab-columns">
        <section className="eip-collab-panel"><div className="eip-collab-panel-head"><h2>優先處理</h2><button onClick={() => choose("decision")}>進入簽核佇列 <ArrowRight size={15} /></button></div>
          {data.requests.slice(0, 5).map((item) => <button className="eip-admin-overview-row" key={item.id} onClick={() => choose("decision")}><span><strong>{String(item.applicant_name || "員工")}</strong><small>{String(data.templates.find((entry) => entry.id === item.template_id)?.name || "流程申請")} · {String(item.created_at || "").slice(0, 10)}</small></span><ArrowRight size={16} /></button>)}
          {!data.requests.length ? <p className="eip-collab-empty">{requestSummary.pending ? "本頁尚無待辦，請進入簽核佇列查看。" : "目前沒有待簽核申請。"}</p> : null}
        </section>
        <section className="eip-collab-panel"><div className="eip-collab-panel-head"><h2>團隊動態</h2><button onClick={() => choose("event")}>管理日程 <ArrowRight size={15} /></button></div>
          {upcomingEvents.slice(0, 4).map((item) => <div className="eip-collab-row" key={item.id}><span className="eip-collab-date">{String(item.starts_at || "").slice(0, 10)}</span><strong>{String(item.title || "")}</strong></div>)}
          {!upcomingEvents.length ? <p className="eip-collab-empty">尚無已發布的近期日程。</p> : null}
          <p className="eip-collab-helper">已核准 {requestSummary.approved} 筆 · 已退回 {requestSummary.rejected} 筆；數量由後端依組織統計。</p>
        </section>
      </div>
    </> : null}
    {!loading && section !== "decision" && section !== "overview" ? <div className="eip-collab-columns">
      <form className="eip-collab-panel eip-collab-form" onSubmit={(event) => void submit(event)}>
        <h2>{editing ? "編輯" : "新增"}{section === "event" ? "日程" : section === "document" ? "文章" : "流程"}</h2>
        {section === "event" ? <>
          <label>標題<input required maxLength={120} value={String(form.title || "")} onChange={(event) => update("title", event.target.value)} /></label>
          <div className="eip-collab-form-grid"><label>開始時間<input type="datetime-local" required value={String(form.startsAt || "")} onChange={(event) => update("startsAt", event.target.value)} /></label><label>結束時間<input type="datetime-local" required value={String(form.endsAt || "")} onChange={(event) => update("endsAt", event.target.value)} /></label></div>
          <label>地點<input maxLength={160} value={String(form.location || "")} onChange={(event) => update("location", event.target.value)} /></label>
          <label>說明<textarea maxLength={5000} value={String(form.details || "")} onChange={(event) => update("details", event.target.value)} /></label>
          <label className="eip-collab-check"><input type="checkbox" checked={Boolean(form.isPublished)} onChange={(event) => update("isPublished", event.target.checked)} /> 發布給員工</label>
        </> : section === "document" ? <>
          {!editing ? <label>類型<select value={String(form.documentType || "knowledge")} onChange={(event) => update("documentType", event.target.value)}><option value="knowledge">知識庫文章</option><option value="document">共享文件</option></select></label> : null}
          <label>標題<input required maxLength={120} value={String(form.title || "")} onChange={(event) => update("title", event.target.value)} /></label>
          <label>分類<input required maxLength={50} value={String(form.category || "")} onChange={(event) => update("category", event.target.value)} /></label>
          <label>內容<textarea required rows={12} maxLength={30000} value={String(form.body || "")} onChange={(event) => update("body", event.target.value)} /></label>
          <label className="eip-collab-check"><input type="checkbox" checked={Boolean(form.isPublished)} onChange={(event) => update("isPublished", event.target.checked)} /> 發布給員工</label>
          {editing ? <p className="eip-collab-helper">儲存時會保留前一版，可於右側查看修訂紀錄。</p> : null}
        </> : editing ? <>
          <p>已被使用的流程欄位保持不變；如需不同欄位，請停用此流程並建立新版。</p>
          <label className="eip-collab-check"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => update("isActive", event.target.checked)} /> 開放員工申請</label>
        </> : <>
          <label>流程名稱<input required maxLength={100} value={String(form.name || "")} onChange={(event) => update("name", event.target.value)} /></label>
          <label>說明<textarea maxLength={2000} value={String(form.description || "")} onChange={(event) => update("description", event.target.value)} /></label>
          <label>簽核權限<select value={String(form.approverRole || "manager")} onChange={(event) => update("approverRole", event.target.value)}><option value="manager">店經理／最高管理員</option><option value="owner">僅最高管理員</option></select></label>
          <div className="eip-collab-field-list"><h3>表單欄位</h3>{fields.map((field, index) => <div className="eip-collab-field" key={index}>
            <label>欄位代碼<input required pattern="[a-z][a-z0-9_]*" value={field.key} onChange={(event) => update("fields", fields.map((entry, i) => i === index ? { ...entry, key: event.target.value } : entry))} /></label>
            <label>顯示名稱<input required value={field.label} onChange={(event) => update("fields", fields.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /></label>
            <label>類型<select value={field.type} onChange={(event) => update("fields", fields.map((entry, i) => i === index ? { ...entry, type: event.target.value } : entry))}><option value="text">短文字</option><option value="textarea">長文字</option><option value="date">日期</option><option value="choice">單選</option></select></label>
            {field.type === "choice" ? <label>選項，每行一個<textarea value={field.options.join("\n")} onChange={(event) => update("fields", fields.map((entry, i) => i === index ? { ...entry, options: event.target.value.split("\n") } : entry))} /></label> : null}
            <label className="eip-collab-check"><input type="checkbox" checked={field.required} onChange={(event) => update("fields", fields.map((entry, i) => i === index ? { ...entry, required: event.target.checked } : entry))} /> 必填</label>
            {fields.length > 1 ? <button type="button" onClick={() => update("fields", fields.filter((_, i) => i !== index))}>移除欄位</button> : null}
          </div>)}<button type="button" disabled={fields.length >= 12} onClick={() => update("fields", [...fields, blankField(fields.length + 1)])}><Plus size={15} /> 新增欄位</button></div>
          <label className="eip-collab-check"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => update("isActive", event.target.checked)} /> 立即開放申請</label>
        </>}
        <div className="eip-collab-form-actions">{editing ? <button type="button" onClick={() => choose(section)}>取消編輯</button> : null}<button disabled={busy} type="submit"><Save size={15} /> {busy ? "儲存中…" : "儲存"}</button></div>
      </form>
      <div className="eip-collab-panel"><div className="eip-collab-panel-head"><h2>已建立項目</h2></div>
        {(section === "event" ? data.events : section === "document" ? data.documents : data.templates).map((item) =>
          <div className="eip-collab-admin-item" key={item.id}><span>{section === "event" ? String(item.starts_at || "") : section === "document" ? `${item.document_type === "knowledge" ? "知識" : "文件"} · v${item.version}` : String(item.approver_role === "owner" ? "最高管理員簽核" : "經理簽核")}</span><strong>{String(item.title || item.name || "")}</strong><small>{item.is_published || item.is_active ? "已發布" : "草稿／停用"}</small><div><button onClick={() => edit(section, item)}>編輯</button>{section === "document" ? <button onClick={() => void showRevisions(item)}>歷史版本</button> : null}</div></div>)}
        {revisions.length ? <div className="eip-collab-revisions"><h3>歷史版本</h3>{revisions.map((item) => <details key={String(item.version)}><summary>v{String(item.version)} · {String(item.title)} · {String(item.changed_at)}</summary><pre>{String(item.body)}</pre></details>)}</div> : null}
      </div>
    </div> : null}
    {!loading && section === "decision" ? <div className="eip-collab-panel"><div className="eip-collab-panel-head"><h2>簽核佇列</h2><span>不得簽核自己的申請 · 共 {requestPagination.total} 筆</span></div>
      <div className="eip-admin-request-filters">{([["pending", "待處理", requestSummary.pending], ["approved", "已核准", requestSummary.approved], ["rejected", "已退回", requestSummary.rejected], ["all", "全部", requestSummary.pending + requestSummary.approved + requestSummary.rejected]] as const).map(([status, label, count]) =>
        <button type="button" key={status} className={requestStatus === status ? "is-active" : ""} onClick={() => changeStatus(status)}>{label} <span>{count}</span></button>)}</div>
      {data.requests.map((item) => {
        const template = data.templates.find((entry) => entry.id === item.template_id);
        const values = item.form_data && typeof item.form_data === "object" ? Object.entries(item.form_data as Record<string, unknown>) : [];
        return <article className="eip-collab-admin-item" key={item.id}>
          <span>{String(item.created_at || "").slice(0, 16).replace("T", " ")} · {String(item.status === "pending" ? "待簽核" : item.status === "approved" ? "已核准" : "已退回")}</span>
          <strong>{String(template?.name || "流程申請")} · {String(item.applicant_name || "")}</strong>
          <div className="eip-collab-answers">{values.map(([key, value]) => <p key={key}><b>{String((template?.fields as Field[] || []).find((field) => field.key === key)?.label || key)}：</b>{String(value)}</p>)}</div>
          {item.decision_note ? <p>簽核備註：{String(item.decision_note)}</p> : null}
          <div><button type="button" onClick={() => void showHistory(item)}>處理歷程</button>{item.status === "pending" ? <>
            <button type="button" disabled={busy} onClick={() => { setDecisionTarget({ id: item.id, status: "approved" }); setDecisionNote(""); }}>核准</button>
            <button type="button" disabled={busy} onClick={() => { setDecisionTarget({ id: item.id, status: "rejected" }); setDecisionNote(""); }}>退回</button>
          </> : null}</div>
          {decisionTarget?.id === item.id ? <div className="eip-admin-decision-editor"><label>{decisionTarget.status === "rejected" ? "退回原因（必填）" : "簽核備註（選填）"}<textarea maxLength={2000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label><div><button type="button" disabled={busy} onClick={() => setDecisionTarget(null)}>取消</button><button type="button" disabled={busy} onClick={() => void decide(item, decisionTarget.status)}>{busy ? "處理中…" : "確認送出"}</button></div></div> : null}
        </article>;
      })}
      {!data.requests.length ? <p className="eip-collab-empty">此篩選條件目前沒有申請。</p> : null}
      <div className="eip-admin-pagination"><span>第 {requestPagination.page} / {totalPages} 頁</span><button type="button" disabled={requestPage <= 1} onClick={() => setRequestPage((page) => page - 1)}>上一頁</button><button type="button" disabled={requestPage >= totalPages} onClick={() => setRequestPage((page) => page + 1)}>下一頁</button></div>
      {history ? <section className="eip-admin-history"><h3>處理歷程 · {String(history.item.applicant_name || "員工")}</h3><p>申請建立：{String(history.item.created_at || "").replace("T", " ").slice(0, 16)}</p>{history.audit.map((entry, index) => <p key={index}>{entry.new_status === "approved" ? "已核准" : "已退回"} · {entry.created_at.replace("T", " ").slice(0, 16)}{entry.note ? ` · ${entry.note}` : ""}</p>)}<button type="button" onClick={() => setHistory(null)}>關閉歷程</button></section> : null}
    </div> : null}
  </main>;
}
