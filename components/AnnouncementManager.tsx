"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { BellRing, Check, Edit3, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Announcement = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
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
  const [form, setForm] = useState({ title: "", content: "", isActive: true });

  const request = useCallback(async (method = "GET", body?: object) => {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`${apiPath}?admin=1`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session?.access_token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
    setForm({ title: "", content: "", isActive: true });
  }

  function edit(item: Announcement) {
    setEditingId(item.id);
    setForm({ title: item.title, content: item.content, isActive: item.is_active });
    document.getElementById("announcement-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      alert("請填寫公告標題與內容");
      return;
    }
    setWorking(true);
    try {
      await request(editingId ? "PATCH" : "POST", {
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        content: form.content,
        isActive: form.isActive,
      });
      reset();
      await load();
      alert(editingId ? "公告已更新" : "公告已發布");
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
          <p className="mt-2 text-sm leading-6 text-slate-500">發布後，員工會在個人資料的「公告事項」看到內容。</p>
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
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.content}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString("zh-TW")}</p>
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
