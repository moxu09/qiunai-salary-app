"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type LogRow = {
  id: number;
  category: "order" | "money" | "system";
  table_name: string;
  record_id: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
};

const FIELDS = ["status", "order_no", "order_id", "discord_id", "user_id", "amount", "price", "final_price", "order_amount", "staff_salary", "salary_rate", "coins", "balance", "service_fee", "payout_amount", "discount_amount"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
const time = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const valueText = (value: unknown) => value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function AdminActivityLog({ organization }: { organization: "deepnight" | "qiunai" }) {
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("請重新登入");
      const response = await fetch(`/api/${organization}/activity-logs?date=${date}&category=${category}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || "讀取異動日誌失敗");
      setRows(payload.rows || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "讀取異動日誌失敗");
    } finally { setLoading(false); }
  }, [category, date, organization]);

  const loadEffect = useEffectEvent(load);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadEffect(); }, 0);
    return () => window.clearTimeout(timer);
  }, [category, date]);

  return <main className="min-h-screen bg-[#fff7fb] p-4 text-[#3f2947] sm:p-7"><div className="mx-auto max-w-6xl space-y-5">
    <header><p className="text-xs font-black tracking-[.2em] text-pink-500">DAILY AUDIT LOG</p><h1 className="mt-2 text-2xl font-black">每日異動日誌</h1><p className="mt-2 text-sm font-semibold text-[#80647d]">訂單、薪資、提領與錢包餘額的所有異動。</p></header>
    <section className="grid gap-3 rounded-3xl border border-pink-100 bg-white p-4 shadow-sm sm:grid-cols-[220px_220px_auto]">
      <label className="text-xs font-black">日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-pink-100 px-3 py-2.5"/></label>
      <label className="text-xs font-black">類型<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 block w-full rounded-xl border border-pink-100 px-3 py-2.5"><option value="all">全部</option><option value="order">訂單</option><option value="money">金錢</option><option value="system">系統</option></select></label>
      <button type="button" onClick={() => void load()} disabled={loading} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16}/>{loading ? "讀取中" : "重新整理"}</button>
    </section>
    {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">{error}</p> : null}
    {loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-pink-500"/></div> : rows.length === 0 ? <p className="rounded-3xl bg-white p-10 text-center font-bold text-[#aa8aa4]">這一天尚無異動紀錄</p> : <section className="space-y-3">{rows.map((row) => {
      const changed = FIELDS.filter((field) => row.old_data?.[field] !== row.new_data?.[field] && (field in (row.old_data || {}) || field in (row.new_data || {})));
      return <article key={row.id} className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center gap-2"><time className="font-mono text-xs font-black text-[#80647d]">{time(row.changed_at)}</time><span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.category === "money" ? "bg-emerald-50 text-emerald-700" : "bg-pink-50 text-pink-700"}`}>{row.category === "money" ? "金錢" : row.category === "order" ? "訂單" : "系統"}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">{row.operation === "INSERT" ? "新增" : row.operation === "UPDATE" ? "修改" : "刪除"}</span><strong className="text-sm">{row.table_name}{row.record_id ? ` #${row.record_id}` : ""}</strong></div>{row.actor_id ? <p className="mt-2 text-xs font-semibold text-[#80647d]">關聯帳號：{row.actor_id}</p> : null}{changed.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{changed.map((field) => <div key={field} className="rounded-xl bg-[#fff7fb] px-3 py-2 text-xs"><b>{field}</b><p className="mt-1 break-all"><span className="text-red-500 line-through">{valueText(row.old_data?.[field])}</span><span className="mx-2">→</span><span className="font-bold text-emerald-700">{valueText(row.new_data?.[field])}</span></p></div>)}</div> : null}</article>;
    })}</section>}
  </div></main>;
}
