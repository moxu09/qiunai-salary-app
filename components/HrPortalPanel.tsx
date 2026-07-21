"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileImage, FilePenLine, Megaphone, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PortalTab } from "@/components/StaffPortalNav";

type RequestAttachment = { name: string; type: string; size: number; url?: string };
type RequestRow = { id: string; application_date: string; request_type: string; approval_category: string; status: string; review_result?: string | null; needed_date?: string | null; urgency?: string | null; form_data?: { details?: string; attachments?: RequestAttachment[] } };
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
  const [images, setImages] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

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
    try {
      setSubmitting(true);
      const { data } = await supabase.auth.getSession();
      const options = group === "welfare" ? WELFARE_TYPES : ADMIN_TYPES;
      const requestType = options.includes(type) ? type : options[0];
      const body = new FormData();
      body.append("requestGroup", group);
      body.append("requestType", requestType);
      body.append("urgency", urgency);
      body.append("neededDate", group === "administrative" ? neededDate : "");
      body.append("details", details);
      images.forEach((image) => body.append("images", image));
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(payload.message || "送出申請失敗");
        return;
      }
      setDetails("");
      setImages([]);
      setFileInputKey((value) => value + 1);
      alert("申請已送出，請至簽核分類查看結果");
      await load();
    } catch (error) {
      console.error("submit HR request failed", error);
      alert("送出申請失敗，請稍後重試");
    } finally {
      setSubmitting(false);
    }
  }

  function selectImages(files: FileList | null) {
    const selected = Array.from(files || []);
    if (selected.length > 5) {
      alert("最多只能上傳 5 張圖片");
      setFileInputKey((value) => value + 1);
      return;
    }
    const invalid = selected.find(
      (file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024
    );
    if (invalid) {
      alert("僅能上傳圖片，且每張不得超過 5 MB");
      setFileInputKey((value) => value + 1);
      return;
    }
    setImages(selected);
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
      <Field label="申請內容 / 補充說明（選填）" className="mt-5"><textarea rows={7} maxLength={10000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="可填寫申請原因與補充資料，也可以留空。" /></Field>
      <Field label="上傳圖片（選填）" className="mt-5">
        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 p-4">
          <input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple onChange={(event) => selectImages(event.target.files)} />
          <p className="mt-2 text-xs font-normal text-slate-500">最多 5 張，每張 5 MB；支援 JPG、PNG、WebP、GIF、HEIC。附件會在核准或駁回後自動刪除。</p>
          {images.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{images.map((image, index) => <div key={`${image.name}-${image.lastModified}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600"><FileImage size={16} className="shrink-0 text-violet-500"/><span className="min-w-0 flex-1 truncate">{image.name}</span><button type="button" aria-label={`移除 ${image.name}`} onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><X size={14}/></button></div>)}</div> : null}
        </div>
      </Field>
      <button type="button" onClick={() => submit(welfare ? "welfare" : "administrative")} disabled={submitting || (welfare && !eligible)} className="mt-5 w-full rounded-2xl bg-violet-600 px-5 py-3 font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "送出中…" : "送出申請"}</button>
    </section>;
  }

  if (category) return <section className="rounded-[28px] border border-violet-100 bg-white shadow-sm shadow-violet-100">
    <div className="flex flex-col gap-3 border-b border-violet-100 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="flex items-center gap-2 text-xl font-black"><CheckCircle2 size={21} className="text-violet-500"/>簽核紀錄</h2><p className="mt-1 text-sm text-slate-500">依月份顯示申請日期、申請項目與簽核結果。</p></div><Field label="顯示月份"><input type="month" value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} /></Field></div>
    {loading ? <p className="p-10 text-center text-sm text-slate-400">讀取中…</p> : visibleRequests.length ? <div className="overflow-x-auto"><table><thead><tr><th>申請日期</th><th>申請項目</th><th>需求日期</th><th>附件</th><th>簽核結果</th></tr></thead><tbody>{visibleRequests.map((item) => <tr key={item.id}><td>{item.application_date}</td><td>{item.request_type}</td><td>{item.needed_date || "-"}</td><td><AttachmentLinks attachments={item.form_data?.attachments}/></td><td><Status status={item.status}/><p className="mt-1 text-xs text-slate-500">{item.review_result || "-"}</p></td></tr>)}</tbody></table></div> : <p className="p-10 text-center text-sm text-slate-400">這個月份沒有申請紀錄</p>}
  </section>;
  return null;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block text-sm font-bold text-slate-600 ${className}`}>{label}<div className="mt-2 [&>input]:w-full [&>select]:w-full [&>textarea]:w-full">{children}</div></label>; }
function AttachmentLinks({ attachments = [] }: { attachments?: RequestAttachment[] }) { const visible = attachments.filter((item) => item.url); return visible.length ? <div className="flex flex-wrap gap-1">{visible.map((item, index) => <a key={`${item.name}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-600 hover:bg-violet-100"><FileImage size={12}/>圖片 {index + 1}</a>)}</div> : <span className="text-slate-400">-</span>; }
function Status({ status }: { status: string }) { const value = status === "approved" ? "已核准" : status === "rejected" ? "已駁回" : "待簽核"; return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{status === "pending" ? <Clock3 size={12}/> : <CheckCircle2 size={12}/>} {value}</span>; }
