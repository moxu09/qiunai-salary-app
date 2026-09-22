"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { BarChart3, BellRing, Check, Edit3, FileSignature, Loader2, Paperclip, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Announcement = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
  attachment_name?: string | null;
  requires_signature?: boolean;
  audience_discord_ids?: string[];
  signature_deadline?: string | null;
  signature_stats?: { signed: number; opened: number; records: Array<{ discord_id: string; status: string; signed_at?: string | null }> };
  is_poll?: boolean;
  poll_allow_multiple?: boolean;
  poll_options?: Array<{ id: string; label: string; vote_count: number }>;
  poll_voter_count?: number;
};

type NotificationResult = {
  targetCount: number;
  sentCount: number;
  failedCount: number;
  failures?: Array<{ discordId: string; reason: string }>;
  omittedFailureCount?: number;
  systemError?: string;
};

type Accent = "sky" | "pink" | "orange";

const styles: Record<Accent, { border: string; soft: string; text: string; button: string }> = {
  sky: { border: "border-sky-100", soft: "bg-sky-50", text: "text-sky-600", button: "bg-sky-500 hover:bg-sky-600" },
  pink: { border: "border-pink-100", soft: "bg-pink-50", text: "text-pink-600", button: "bg-pink-500 hover:bg-pink-600" },
  orange: { border: "border-orange-100", soft: "bg-orange-50", text: "text-orange-600", button: "bg-orange-500 hover:bg-orange-600" },
};

export default function AnnouncementManager({ apiPath, accent }: { apiPath: string; accent: Accent }) {
  const theme = styles[accent];
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState({ title: "", content: "", isActive: true, requiresSignature: false, audienceDiscordIds: "", signatureDeadline: "", isPoll: false, pollAllowMultiple: false, pollOptions: ["", ""] });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const request = useCallback(async (method = "GET", body?: object | FormData) => {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`${apiPath}?admin=1`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session?.access_token || ""}`,
        ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || "公告操作失敗");
    return payload;
  }, [apiPath]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await request();
      setAnnouncements(payload.announcements || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "讀取公告失敗");
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadEvent = useEffectEvent(load);
  useEffect(() => {
    void Promise.resolve().then(loadEvent);
  }, []);

  function reset() {
    setEditingId("");
    setForm({ title: "", content: "", isActive: true, requiresSignature: false, audienceDiscordIds: "", signatureDeadline: "", isPoll: false, pollAllowMultiple: false, pollOptions: ["", ""] });
    setAttachment(null);
    setFileInputKey((value) => value + 1);
  }

  function edit(item: Announcement) {
    setEditingId(item.id);
    setForm({ title: item.title, content: item.content, isActive: item.is_active, requiresSignature: Boolean(item.requires_signature), audienceDiscordIds: (item.audience_discord_ids || []).join("\n"), signatureDeadline: item.signature_deadline ? item.signature_deadline.slice(0, 16) : "", isPoll: Boolean(item.is_poll), pollAllowMultiple: Boolean(item.poll_allow_multiple), pollOptions: item.poll_options?.map((option) => option.label) || ["", ""] });
    document.getElementById("announcement-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      alert("請填寫公告標題與內容");
      return;
    }
    if (!editingId && form.requiresSignature && !attachment) {
      alert("要求簽署時必須上傳 PDF 文件");
      return;
    }
    if (attachment && form.requiresSignature && attachment.type !== "application/pdf" && !attachment.name.toLowerCase().endsWith(".pdf")) {
      alert("簽署文件僅支援 PDF 格式");
      return;
    }
    const pollOptions = form.pollOptions.map((item) => item.trim()).filter(Boolean);
    if (form.isPoll && pollOptions.length < 2) {
      alert("投票至少需要兩個選項");
      return;
    }
    setWorking(true);
    try {
      const signatureDeadline = form.signatureDeadline ? new Date(form.signatureDeadline).toISOString() : "";
      let notification: NotificationResult | null = null;
      if (editingId) {
        await request("PATCH", { id: editingId, title: form.title, content: form.content, isActive: form.isActive, audienceDiscordIds: form.audienceDiscordIds, signatureDeadline, isPoll: form.isPoll, pollAllowMultiple: form.pollAllowMultiple, pollOptions });
      } else {
        const body = new FormData();
        body.append("title", form.title); body.append("content", form.content);
        body.append("isActive", String(form.isActive)); body.append("requiresSignature", String(form.requiresSignature));
        body.append("audienceDiscordIds", form.audienceDiscordIds); body.append("signatureDeadline", signatureDeadline);
        body.append("isPoll", String(form.isPoll)); body.append("pollAllowMultiple", String(form.pollAllowMultiple)); body.append("pollOptions", JSON.stringify(pollOptions));
        if (attachment) body.append("file", attachment);
        const payload = await request("POST", body);
        notification = payload.notification || null;
      }
      reset();
      await load();
      alert(editingId ? "公告已更新" : formatNotificationResult(notification, form.isActive));
    } catch (error) {
      alert(error instanceof Error ? error.message : "儲存公告失敗");
    } finally {
      setWorking(false);
    }
  }

  async function remove(item: Announcement) {
    if (!window.confirm(`確定刪除公告「${item.title}」？`)) return;
    setWorking(true);
    try {
      await request("DELETE", { id: item.id });
      if (editingId === item.id) reset();
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "刪除公告失敗");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={`rounded-[30px] border bg-white p-5 shadow-sm sm:p-6 ${theme.border}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <BellRing size={20} className={theme.text} />
            員工公告管理
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">發布後，員工會在個人資料的「公告事項」看到內容；立即顯示的公告也會由官方機器人逐一私訊在職員工。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${theme.soft} ${theme.text}`}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />重新整理
        </button>
      </div>

      <div id="announcement-editor" className={`mt-5 rounded-2xl border p-4 ${theme.border} ${theme.soft}`}>
        <div className="grid min-w-0 gap-4">
          <label className="block min-w-0 text-sm font-bold text-slate-600">
            公告標題
            <input value={form.title} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="例如：本月發薪與提領時間公告" className="mt-2 w-full" />
          </label>
          {!editingId ? <label className="block min-w-0 text-sm font-bold text-slate-600">
            公告附件（要求簽署時限 PDF）
            <input key={fileInputKey} type="file" accept={form.requiresSignature ? ".pdf,application/pdf" : ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp"} onChange={(event) => setAttachment(event.target.files?.[0] || null)} className="mt-2 w-full" />
          </label> : itemAttachmentHint(announcements.find((item) => item.id === editingId))}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 p-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={form.requiresSignature} disabled={Boolean(editingId)} onChange={(event) => setForm((current) => ({ ...current, requiresSignature: event.target.checked }))} />
            <span><span className="block">要求員工詳閱後手寫簽署</span><span className="mt-1 block text-xs font-normal text-slate-500">簽署後的 PDF 會存入「資料下載－員工相關」。</span></span>
          </label>
          {form.requiresSignature ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0 text-sm font-bold text-slate-600">指定簽署對象（選填）<textarea value={form.audienceDiscordIds} rows={4} onChange={(event) => setForm((current) => ({ ...current, audienceDiscordIds: event.target.value }))} placeholder="每行一個 Discord ID；留空代表全體員工" className="mt-2 w-full" /></label>
            <label className="block min-w-0 text-sm font-bold text-slate-600">簽署期限（選填）<input type="datetime-local" value={form.signatureDeadline} onChange={(event) => setForm((current) => ({ ...current, signatureDeadline: event.target.value }))} className="mt-2 w-full" /><span className="mt-2 block text-xs font-normal text-slate-500">逾期後仍可簽署，但會標示逾期。</span></label>
          </div> : null}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 p-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={form.isPoll} onChange={(event) => setForm((current) => ({ ...current, isPoll: event.target.checked }))} />
            <span><span className="block">這是一則投票公告</span><span className="mt-1 block text-xs font-normal text-slate-500">員工可直接在公告內完成投票，預設為單選。</span></span>
          </label>
          {form.isPoll ? <div className="rounded-2xl border border-pink-100 bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-700">投票選項</p>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={form.pollAllowMultiple} onChange={(event) => setForm((current) => ({ ...current, pollAllowMultiple: event.target.checked }))}/>允許複選</label>
            </div>
            <div className="mt-3 space-y-2">{form.pollOptions.map((option, index) => <div key={index} className="flex gap-2"><input value={option} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, pollOptions: current.pollOptions.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`選項 ${index + 1}`} className="min-w-0 flex-1"/><button type="button" disabled={form.pollOptions.length <= 2} onClick={() => setForm((current) => ({ ...current, pollOptions: current.pollOptions.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-xl bg-rose-50 px-3 text-rose-600 disabled:opacity-30"><X size={16}/></button></div>)}</div>
            <button type="button" disabled={form.pollOptions.length >= 20} onClick={() => setForm((current) => ({ ...current, pollOptions: [...current.pollOptions, ""] }))} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-pink-50 px-3 py-2 text-xs font-black text-pink-600"><Plus size={14}/>新增選項</button>
          </div> : null}
          <label className="block min-w-0 text-sm font-bold text-slate-600">
            公告內容
            <textarea value={form.content} maxLength={5000} rows={6} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="輸入要通知員工的完整內容" className="mt-2 w-full" />
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
            立即顯示給員工
          </label>
          <div className="flex flex-col gap-2 min-[380px]:flex-row">
            <button type="button" onClick={() => void save()} disabled={working} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 font-black text-white disabled:opacity-50 ${theme.button}`}>
              {working ? <Loader2 size={17} className="animate-spin" /> : editingId ? <Check size={17} /> : <Plus size={17} />}
              {editingId ? "儲存公告修改" : "發布公告"}
            </button>
            {editingId ? <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 px-5 py-3 font-black text-slate-700"><X size={17} />取消編輯</button> : null}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">讀取公告中…</p> : announcements.length ? announcements.map((item) => (
          <article key={item.id} className={`min-w-0 rounded-2xl border p-4 ${theme.border}`}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-black text-slate-900">{item.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "顯示中" : "已停用"}</span>
                  {item.attachment_name ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700"><Paperclip size={12}/>{item.attachment_name}</span> : null}
                  {item.requires_signature ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700"><FileSignature size={12}/>需簽署</span> : null}
                  {item.is_poll ? <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-black text-pink-700"><BarChart3 size={12}/>{item.poll_allow_multiple ? "複選投票" : "單選投票"}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.content}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString("zh-TW")}</p>
                {item.requires_signature ? <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><p className="flex items-center gap-1"><Users size={13}/>對象：{item.audience_discord_ids?.length ? `${item.audience_discord_ids.length} 位指定員工` : "全體員工"}｜已簽 {item.signature_stats?.signed || 0} 人｜已開啟 {item.signature_stats?.opened || 0} 人</p>{item.signature_deadline ? <p className="mt-1">期限：{new Date(item.signature_deadline).toLocaleString("zh-TW")}</p> : null}</div> : null}
                {item.is_poll ? <div className="mt-3 rounded-xl bg-pink-50 px-3 py-3 text-xs font-bold text-slate-600"><p className="mb-2">已投票 {item.poll_voter_count || 0} 人</p>{item.poll_options?.map((option) => <div key={option.id} className="flex justify-between border-t border-pink-100 py-1.5"><span>{option.label}</span><span>{option.vote_count} 票</span></div>)}</div> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => edit(item)} className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-black sm:flex-none ${theme.soft} ${theme.text}`}><Edit3 size={14} />編輯</button>
                <button type="button" onClick={() => void remove(item)} disabled={working} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 disabled:opacity-50 sm:flex-none"><Trash2 size={14} />刪除</button>
              </div>
            </div>
          </article>
        )) : <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">目前尚未發布公告</p>}
      </div>
    </section>
  );
}

function itemAttachmentHint(item?: Announcement) {
  return item?.attachment_name ? <p className="rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-slate-600">目前附件：{item.attachment_name}。為保存簽署證據，已發布文件不能直接替換；請建立新版公告。</p> : null;
}

function formatNotificationResult(result: NotificationResult | null, isActive: boolean) {
  if (!isActive) return "公告已建立但尚未啟用，因此未發送員工私訊。";
  if (!result) return "公告已發布，但沒有取得機器人私訊結果。";
  if (result.systemError) return `公告已發布，但機器人私訊未完成：${result.systemError}`;
  const summary = `公告已發布。機器人私訊成功 ${result.sentCount}/${result.targetCount} 人。`;
  if (!result.failedCount) return summary;
  const details = (result.failures || []).map((item) => `${item.discordId}：${item.reason}`).join("\n");
  const omitted = result.omittedFailureCount ? `\n另有 ${result.omittedFailureCount} 筆未列出。` : "";
  return `${summary}\n失敗 ${result.failedCount} 人：\n${details}${omitted}`;
}
