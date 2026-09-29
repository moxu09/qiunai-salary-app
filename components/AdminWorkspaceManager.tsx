"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpenText, CalendarDays, ClipboardCheck, FileText, Plus, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Field = { key: string; label: string; type: "text" | "textarea" | "date" | "choice"; required: boolean; options: string[] };
type Item = Record<string, unknown> & { id: string };
type Data = { events: Item[]; documents: Item[]; templates: Item[]; requests: Item[] };
type Kind = "event" | "document" | "template" | "decision";
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
  const [section, setSection] = useState<Kind>("event");
  const [form, setForm] = useState<Record<string, unknown>>(initial.event);
  const [editing, setEditing] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisions, setRevisions] = useState<Item[]>([]);
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
      const response = await fetch(`/api/${organization}/workspace?admin=1`, {
        cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "讀取失敗");
      setData({ events: result.events || [], documents: result.documents || [], templates: result.templates || [], requests: result.requests || [] });
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取失敗"); }
    finally { setLoading(false); }
  }, [organization]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  function choose(next: Kind) {
    setSection(next); setEditing(null); setRevisions([]);
    setForm(next === "decision" ? {} : { ...initial[next] });
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
    const note = window.prompt(status === "rejected" ? "請輸入未通過原因" : "簽核備註（可留空）");
    if (note === null) return;
    if (status === "rejected" && !note.trim()) { setError("未通過時請填寫原因"); return; }
    try { setBusy(true); await call("PATCH", { kind: "decision", id: item.id, status, note }); setNotice("已記錄簽核決定。"); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "簽核失敗"); }
    finally { setBusy(false); }
  }
  async function showRevisions(item: Item) {
    try {
      const result = await call("GET", undefined, `&revisions=${item.id}`);
      setRevisions(result.revisions || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "讀取修訂紀錄失敗"); }
  }
  const fields = (form.fields || []) as Field[];
  return <main className="eip-admin-workspace">
    <div className="eip-collab-hero"><div><p className="eip-collab-eyebrow">TEAM OPERATIONS</p><h1>協作工作台管理</h1><p>維護團隊日程、文件、知識庫與可配置的簽核表單。</p></div><button className="eip-collab-refresh" onClick={() => void refresh()}>重新整理</button></div>
    {error ? <p className="eip-collab-alert" role="alert">{error}</p> : null}
    {notice ? <p className="eip-collab-notice" role="status">{notice}</p> : null}
    <div className="eip-admin-workspace-tabs">
      {([["event", "團隊日程", CalendarDays], ["document", "文件／知識庫", BookOpenText], ["template", "流程設定", FileText], ["decision", "待辦簽核", ClipboardCheck]] as const).map(([kind, label, Icon]) =>
        <button key={kind} onClick={() => choose(kind)} className={section === kind ? "is-active" : ""}><Icon size={17} /> {label}</button>)}
    </div>
    {loading ? <p className="eip-collab-empty">正在讀取管理資料…</p> : null}
    {!loading && section !== "decision" ? <div className="eip-collab-columns">
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
    {!loading && section === "decision" ? <div className="eip-collab-panel"><div className="eip-collab-panel-head"><h2>申請紀錄與待辦</h2><span>不得簽核自己的申請</span></div>
      {data.requests.map((item) => {
        const template = data.templates.find((entry) => entry.id === item.template_id);
        const values = item.form_data && typeof item.form_data === "object" ? Object.entries(item.form_data as Record<string, unknown>) : [];
        return <article className="eip-collab-admin-item" key={item.id}><span>{String(item.created_at || "")} · {String(item.status === "pending" ? "待簽核" : item.status === "approved" ? "已核准" : "未通過")}</span><strong>{String(template?.name || "已停用流程")} · {String(item.applicant_name || "")}</strong><div className="eip-collab-answers">{values.map(([key, value]) => <p key={key}><b>{String((template?.fields as Field[] || []).find((field) => field.key === key)?.label || key)}：</b>{String(value)}</p>)}</div>{item.decision_note ? <p>簽核備註：{String(item.decision_note)}</p> : null}{item.status === "pending" ? <div><button disabled={busy} onClick={() => void decide(item, "approved")}>核准</button><button disabled={busy} onClick={() => void decide(item, "rejected")}>退回</button></div> : null}</article>;
      })}
      {!data.requests.length ? <p className="eip-collab-empty">目前沒有新流程申請。</p> : null}
    </div> : null}
  </main>;
}
