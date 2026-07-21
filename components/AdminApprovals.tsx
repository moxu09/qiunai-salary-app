"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
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

export default function AdminApprovals({ apiPath }: { apiPath: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setLoading(true);
    try {
      const response = await fetch(`${apiPath}?mode=admin&month=${month}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) alert(payload.message || "讀取簽核失敗");
      else setRows(payload.requests || []);
    } finally {
      setLoading(false);
    }
  }, [apiPath, month]);

  const loadEvent = useEffectEvent(load);
  useEffect(() => {
    void Promise.resolve().then(loadEvent);
  }, [month]);

  async function review(id: string, status: "approved" | "rejected") {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token || ""}`,
      },
      body: JSON.stringify({ id, status, reviewResult: result[id] }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) alert(payload.message || "簽核失敗");
    else await load();
  }

  const visible = category
    ? rows.filter((row) => row.approval_category === category)
    : rows;

  return (
    <main className="min-h-screen p-4 sm:p-7">
      <div className="mx-auto max-w-[1400px]">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-slate-900">簽核申請</h1>
          <p className="mt-2 text-sm text-slate-500">
            依月份與類別檢視行政、報銷、福利、請假及留職停薪申請。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-600">
              月份
              <input className="mt-2 w-full" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <label className="text-sm font-bold text-slate-600">
              簽核類別
              <select className="mt-2 w-full" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <p className="rounded-3xl bg-white p-10 text-center text-slate-400">讀取中…</p>
          ) : visible.length ? (
            visible.map((row) => (
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
                    <input value={result[row.id] || ""} onChange={(event) => setResult((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="簽核說明（選填）" />
                    <button onClick={() => review(row.id, "approved")} className="rounded-xl bg-emerald-500 px-5 py-2 font-black text-white">核准</button>
                    <button onClick={() => review(row.id, "rejected")} className="rounded-xl bg-rose-500 px-5 py-2 font-black text-white">駁回</button>
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
            <p className="rounded-3xl bg-white p-10 text-center text-slate-400">這個月份沒有申請資料</p>
          )}
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
