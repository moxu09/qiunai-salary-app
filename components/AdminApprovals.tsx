"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Attachment = {
  name: string;
  type: string;
  size: number;
  url?: string;
};

type Row = {
  id: string;
  application_date: string;
  staff_name: string;
  department: string;
  request_type: string;
  approval_category: string;
  urgency: string;
  needed_date?: string | null;
  status: string;
  review_result?: string | null;
  reviewer_name?: string | null;
  reviewer_discord_id?: string | null;
  reviewed_at?: string | null;
  form_data?: { details?: string; attachments?: Attachment[] };
};

const categories = [
  ["", "全部簽核"],
  ["administrative", "行政服務簽核"],
  ["reimbursement", "報銷簽核"],
  ["welfare", "福利簽核"],
  ["leave", "請假單簽核"],
  ["suspension", "留職停薪簽核"],
];

type Status = "pending" | "approved" | "rejected" | "all";
type Summary = { pending: number; approved: number; rejected: number };

export default function AdminApprovals({ apiPath, embedded = false, onPendingChange }: { apiPath: string; embedded?: boolean; onPendingChange?: (count: number) => void }) {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<Status>("pending");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Summary>({ pending: 0, approved: 0, rejected: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("登入已過期，請重新登入");
      const query = new URLSearchParams({ mode: "admin", view: "inbox", status, category, page: String(page) });
      const response = await fetch(`${apiPath}?${query}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "讀取簽核失敗");
      setRows(payload.requests || []);
      setSummary(payload.summary || { pending: 0, approved: 0, rejected: 0 });
      setPagination(payload.pagination || { page, pageSize: 25, total: 0 });
      onPendingChange?.(payload.summary?.pending || 0);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取簽核失敗");
    } finally {
      setLoading(false);
    }
  }, [apiPath, status, category, page, onPendingChange]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function review(id: string, status: "approved" | "rejected") {
    if (status === "rejected" && !result[id]?.trim()) { setError("駁回時請填寫原因"); return; }
    try {
      setBusy(id); setError(""); setNotice("");
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("登入已過期，請重新登入");
      const response = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ id, status, reviewResult: result[id] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "簽核失敗");
      setNotice(payload.warning || (status === "approved" ? "申請已核准" : "申請已駁回"));
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
      else await load();
      setResult((current) => { const next = { ...current }; delete next[id]; return next; });
      window.dispatchEvent(new Event("erp-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "簽核失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={embedded ? "py-4" : "min-h-screen p-4 sm:p-7"}>
      <div className="mx-auto max-w-[1400px]">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-slate-900">行政與人事簽核</h1>
          <p className="mt-2 text-sm text-slate-500">
            跨月份處理行政、報銷、福利、請假及留職停薪申請；此處與原簽核頁使用同一筆資料。
          </p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="簽核狀態">
            {([ ["pending", "待處理", summary.pending], ["approved", "已核准", summary.approved], ["rejected", "已駁回", summary.rejected], ["all", "全部", summary.pending + summary.approved + summary.rejected] ] as const).map(([value, label, count]) =>
              <button key={value} type="button" onClick={() => { setStatus(value); setPage(1); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${status === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{label} {count}</button>)}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-600">
              簽核類別
              <select className="mt-2 w-full" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p> : null}
          {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{notice}</p> : null}
          {loading ? (
            <p className="rounded-3xl bg-white p-10 text-center text-slate-400">讀取中…</p>
          ) : rows.length ? (
            rows.map((row) => (
              <article key={row.id} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black tracking-widest text-violet-500">
                      {row.application_date} · {row.urgency === "急件" || row.urgency === "urgent" ? "急件" : "一般"}
                    </p>
                    <h2 className="mt-2 text-lg font-black">{row.request_type}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {row.staff_name}｜{row.department}{row.needed_date ? `｜需求日 ${row.needed_date}` : ""}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {row.form_data?.details || "未填申請內容"}
                    </p>
                    <AttachmentGallery attachments={row.form_data?.attachments} />
                  </div>
                  <span className={`h-fit rounded-full px-3 py-1 text-xs font-black ${row.status === "approved" ? "bg-emerald-50 text-emerald-700" : row.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    {row.status === "approved" ? "已核准" : row.status === "rejected" ? "已駁回" : "待簽核"}
                  </span>
                </div>
                {row.status === "pending" ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input value={result[row.id] || ""} onChange={(event) => setResult((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="簽核說明；駁回時必填原因" />
                    <button disabled={busy !== null} onClick={() => void review(row.id, "approved")} className="rounded-xl bg-emerald-500 px-5 py-2 font-black text-white disabled:opacity-50">核准</button>
                    <button disabled={busy !== null} onClick={() => void review(row.id, "rejected")} className="rounded-xl bg-rose-500 px-5 py-2 font-black text-white disabled:opacity-50">駁回</button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <p>簽核結果：{row.review_result || "-"}</p>
                    <p className="mt-1 font-bold text-slate-700">簽核人：{row.reviewer_name || "未知簽核人"}{row.reviewer_discord_id ? `（${row.reviewer_discord_id}）` : ""}</p>
                  </div>
                )}
              </article>
            ))
          ) : (
            <p className="rounded-3xl bg-white p-10 text-center text-slate-400">此篩選條件目前沒有申請資料</p>
          )}
          <div className="flex items-center justify-end gap-3 text-sm text-slate-600"><span>共 {pagination.total} 筆 · 第 {pagination.page} / {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} 頁</span><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一頁</button><button type="button" disabled={page * pagination.pageSize >= pagination.total} onClick={() => setPage((current) => current + 1)}>下一頁</button></div>
        </div>
      </div>
    </main>
  );
}

function AttachmentGallery({ attachments = [] }: { attachments?: Attachment[] }) {
  const visible = attachments.filter((attachment) => attachment.url);
  if (!visible.length) return <p className="mt-3 text-xs text-slate-400">未上傳圖片</p>;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {visible.map((attachment, index) => (
        <a key={`${attachment.name}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          <div className="flex aspect-square items-end bg-cover bg-center" style={{ backgroundImage: `url(${attachment.url})` }}>
            <span className="flex w-full items-center justify-between gap-2 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm">
              <span className="truncate">圖片 {index + 1}</span><ExternalLink size={13} className="shrink-0" />
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
