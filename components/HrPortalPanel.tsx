"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { CheckCircle2, Clock3, FilePenLine, Megaphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PortalTab } from "@/components/StaffPortalNav";

type RequestRow = { id: string; application_date: string; request_type: string; approval_category: string; status: string; review_result?: string | null; needed_date?: string | null; urgency?: string | null };
type Announcement = { id: string; title: string; content: string };
const ADMIN_TYPES = ["查掛津貼", "代支報銷", "離職申請書", "留職停薪申請書", "逾期補登單申請書", "證照津貼申請書", "過失報告書", "懲處決議書"];
const WELFARE_TYPES = ["生日禮金", "開工紅包", "肉粽補助", "月餅補助", "聖誕補助"];
const approvalMap: Partial<Record<PortalTab, string>> = { "approval-administrative": "administrative", "approval-reimbursement": "reimbursement", "approval-welfare": "welfare", "approval-leave": "leave", "approval-suspension": "suspension" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const money = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value || 0);

export default function HrPortalPanel({ activeTab, apiPath, department, staffName, selectedMonth, onMonthChange }: { activeTab: PortalTab; apiPath: string; department: string; staffName: string; selectedMonth: string; onMonthChange: (month: string) => void }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [priorSalary, setPriorSalary] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState(ADMIN_TYPES[0]);
  const [urgency, setUrgency] = useState("general");
  const [neededDate, setNeededDate] = useState(today());
  const [details, setDetails] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setLoading(true);
    const response = await fetch(`${apiPath}?month=${selectedMonth}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setRequests(payload.requests || []); setAnnouncements(payload.announcements || []); setPriorSalary(Number(payload.priorMonthSalary || 0)); setEligible(Boolean(payload.welfareEligible)); }
    setLoading(false);
  }, [apiPath, selectedMonth]);

  const loadEvent = useEffectEvent(load);
  useEffect(() => { void Promise.resolve().then(loadEvent); }, [selectedMonth]);

  const category = approvalMap[activeTab];
  const visibleRequests = useMemo(() => category ? requests.filter((item) => item.approval_category === category) : requests, [category, requests]);

  async function submit(group: "administrative" | "welfare") {
    setSubmitting(true);
    const { data } = await supabase.auth.getSession();
    const options = group === "welfare" ? WELFARE_TYPES : ADMIN_TYPES;
    const requestType = options.includes(type) ? type : options[0];
    const response = await fetch(apiPath, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ requestGroup: group, requestType, urgency, neededDate: group === "administrative" ? neededDate : null, details }) });
    const payload = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) { alert(payload.message || "送出申請失敗"); return; }
    setDetails(""); alert("申請已送出"); await load();
  }

  if (activeTab === "profile") return <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm shadow-violet-100">
    <h2 className="flex items-center gap-2 text-lg font-black"><Megaphone size={20} className="text-violet-500"/>公告事項</h2>
    <div className="mt-4 space-y-3">{announcements.length ? announcements.map((item) => <article key={item.id} className="rounded-2xl bg-violet-50 p-4"><p className="font-black text-violet-900">{item.title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.content}</p></article>) : <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">目前沒有公告</p>}</div>
  </section>;

  if (activeTab === "admin-service" || activeTab === "welfare") {
    const welfare = activeTab === "welfare";
    const typeOptions = welfare ? WELFARE_TYPES : ADMIN_TYPES;
    const selectedType = typeOptions.includes(type) ? type : typeOptions[0];
    return <section className="rounded-[28px] border border-violet-100 bg-white p-6 shadow-sm shadow-violet-100">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-violet-100 p-3 text-violet-600"><FilePenLine size={22}/></span><div><h2 className="text-xl font-black">{welfare ? "福利申請" : "行政服務申請"}</h2><p className="mt-1 text-sm text-slate-500">申請送出後，可至簽核分類查看結果。</p></div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="申請日期"><input value={today()} disabled /></Field><Field label="部門"><input value={department} disabled /></Field><Field label="員工暱稱"><input value={staffName} disabled /></Field>
        {!welfare && <><Field label="緊急程度"><select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="general">一般</option><option value="urgent">急件</option></select></Field><Field label="需求日期"><input type="date" min={today()} value={neededDate} onChange={(e) => setNeededDate(e.target.value)} /></Field></>}
        <Field label={welfare ? "福利項目" : "需求分類"}><select value={selectedType} onChange={(e) => setType(e.target.value)}>{typeOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
      </div>
      {welfare && <div className={`mt-5 rounded-2xl p-4 text-sm font-bold ${eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><p>前一個月薪資：{money(priorSalary)}</p><p className="mt-1">{eligible ? "符合超過 5,000 元的申請資格" : "前一個月薪資需超過 5,000 元才可申請"}</p></div>}
      <Field label="申請內容 / 補充說明" className="mt-5"><textarea rows={7} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="請直接填寫申請原因與所需資料；正式文件上傳後會依分類顯示對應欄位。" /></Field>
      <button type="button" onClick={() => submit(welfare ? "welfare" : "administrative")} disabled={submitting || (welfare && !eligible)} className="mt-5 w-full rounded-2xl bg-violet-600 px-5 py-3 font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "送出中…" : "送出申請"}</button>
    </section>;
  }

  if (category) return <section className="rounded-[28px] border border-violet-100 bg-white shadow-sm shadow-violet-100">
    <div className="flex flex-col gap-3 border-b border-violet-100 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="flex items-center gap-2 text-xl font-black"><CheckCircle2 size={21} className="text-violet-500"/>簽核紀錄</h2><p className="mt-1 text-sm text-slate-500">依月份顯示申請日期、申請項目與簽核結果。</p></div><Field label="顯示月份"><input type="month" value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} /></Field></div>
    {loading ? <p className="p-10 text-center text-sm text-slate-400">讀取中…</p> : visibleRequests.length ? <div className="overflow-x-auto"><table><thead><tr><th>申請日期</th><th>申請項目</th><th>需求日期</th><th>簽核結果</th></tr></thead><tbody>{visibleRequests.map((item) => <tr key={item.id}><td>{item.application_date}</td><td>{item.request_type}</td><td>{item.needed_date || "-"}</td><td><Status status={item.status}/><p className="mt-1 text-xs text-slate-500">{item.review_result || "-"}</p></td></tr>)}</tbody></table></div> : <p className="p-10 text-center text-sm text-slate-400">這個月份沒有申請紀錄</p>}
  </section>;
  return null;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block text-sm font-bold text-slate-600 ${className}`}>{label}<div className="mt-2 [&>input]:w-full [&>select]:w-full [&>textarea]:w-full">{children}</div></label>; }
function Status({ status }: { status: string }) { const value = status === "approved" ? "已核准" : status === "rejected" ? "已駁回" : "待簽核"; return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{status === "pending" ? <Clock3 size={12}/> : <CheckCircle2 size={12}/>} {value}</span>; }
