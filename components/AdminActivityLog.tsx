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

const FIELD_LABELS: Record<string, string> = {
  status: "狀態", order_no: "訂單編號", order_id: "訂單 ID",
  discord_id: "Discord ID", user_id: "使用者 ID", staff_name: "員工姓名",
  customer_name: "客人姓名", service: "服務內容", service_name: "服務內容",
  amount: "金額", price: "原價", original_price: "折扣前金額",
  final_price: "實付金額", order_amount: "訂單金額", staff_salary: "員工薪資",
  salary_rate: "抽成比例", salary_level: "抽成說明", commission_tier: "指定抽成",
  bonus_amount: "訂單獎金", coins: "ASD 餘額", balance: "餘額",
  service_fee: "手續費", payout_amount: "實際入帳金額", welfare_fee: "福利金",
  discount_amount: "折扣金額", paid: "是否付款", paid_at: "付款時間",
  salary_paid: "是否發薪", salary_paid_at: "發薪時間", destination: "提領目的地",
  entry_type: "錢包項目", entry_label: "錢包說明", points: "客服點數",
  app_key: "所屬 ERP", reviewed_by: "審核人", reviewed_at: "審核時間",
  review_note: "審核備註", rejection_reason: "拒絕原因", note: "備註",
  order_finished_at: "訂單完成時間", requested_at: "申請時間",
};
const TABLE_LABELS: Record<string, string> = {
  play_orders: "深夜訂單", qiunai_salary_orders: "秋奈訂單",
  salary_wallet_entries: "薪資錢包", salary_withdraw_requests: "薪資提領",
  players_bonus: "深夜獎金／扣薪", qiunai_staff_bonus: "秋奈獎金／扣薪",
  customer_service_order_points: "客服服務點數", salary_activity_commission_settings: "活動抽成設定",
  players: "深夜員工", qiunai_staff: "秋奈員工", erp_role_assignments: "ERP 權限",
};
const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "edited_at", "deleted_at", "avatar_url", "bank_account", "bank_account_name", "bank_name"]);
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
      const before = row.old_data || {};
      const after = row.new_data || {};
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((field) => !HIDDEN_FIELDS.has(field))
        .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        .sort((a, b) => (FIELD_LABELS[a] ? 0 : 1) - (FIELD_LABELS[b] ? 0 : 1) || a.localeCompare(b));
      return <article key={row.id} className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center gap-2"><time className="font-mono text-xs font-black text-[#80647d]">{time(row.changed_at)}</time><span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.category === "money" ? "bg-emerald-50 text-emerald-700" : "bg-pink-50 text-pink-700"}`}>{row.category === "money" ? "金錢" : row.category === "order" ? "訂單" : "系統"}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">{row.operation === "INSERT" ? "新增" : row.operation === "UPDATE" ? "修改" : "刪除"}</span><strong className="text-sm">{TABLE_LABELS[row.table_name] || row.table_name}{row.record_id ? ` #${row.record_id}` : ""}</strong></div>{row.actor_id ? <p className="mt-2 text-xs font-semibold text-[#80647d]">關聯帳號：{row.actor_id}</p> : null}{changed.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{changed.map((field) => <div key={field} className="rounded-xl bg-[#fff7fb] px-3 py-2 text-xs"><b>{FIELD_LABELS[field] || field}</b><p className="mt-1 break-all"><span className="text-red-500 line-through">{valueText(row.old_data?.[field])}</span><span className="mx-2">→</span><span className="font-bold text-emerald-700">{valueText(row.new_data?.[field])}</span></p></div>)}</div> : <p className="mt-3 text-xs font-semibold text-[#aa8aa4]">沒有可顯示的業務欄位變更</p>}</article>;
    })}</section>}
  </div></main>;
}
