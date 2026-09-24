"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { CalendarHeart, Download, Loader2, Pencil, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import { groupActivityResponses } from "@/lib/qiunaiActivityGroups";
import { supabase } from "@/lib/supabase";

type Guest = { slot: number; guest_name: string; guest_phone: string };
type ResponseRow = {
  id: string;
  response_status: "attending" | "not_attending" | "distance";
  staff_nickname?: string | null;
  staff_real_name?: string | null;
  staff_phone?: string | null;
  selected_option_id?: string | null;
  guests: Guest[];
};
type Activity = {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  starts_at: string;
  response_deadline: string;
  is_published: boolean;
  min_completed_orders: number;
  min_employment_days: number;
  allow_not_attending: boolean;
  allow_distance: boolean;
  eligibility_note?: string | null;
  participant_note?: string | null;
  options: Array<{ id: string; label: string; note?: string | null }>;
  responses: ResponseRow[];
  stats: { attending: number; not_attending: number; distance: number };
};
type FormOption = { id?: string; label: string; note: string };

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const blank = () => ({
  title: "",
  description: "",
  location: "",
  startsAt: "",
  responseDeadline: "",
  minCompletedOrders: 0,
  minEmploymentDays: 0,
  eligibilityNote: "",
  participantNote: "",
  allowNotAttending: true,
  allowDistance: true,
  isPublished: true,
  options: [{ label: "", note: "" }] as FormOption[],
});

export default function AdminActivityManager() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printActivityId, setPrintActivityId] = useState("");

  const request = useCallback(async (method = "GET", body?: object, suffix = "?admin=1") => {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/qiunai/activities${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session?.access_token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || "活動操作失敗");
    return payload;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setActivities((await request()).activities || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "讀取活動失敗");
    } finally {
      setLoading(false);
    }
  }, [request]);
  const loadEvent = useEffectEvent(load);
  useEffect(() => {
    void Promise.resolve().then(loadEvent);
  }, []);

  function setField<K extends keyof ReturnType<typeof blank>>(
    key: K,
    value: ReturnType<typeof blank>[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function setOption(index: number, key: keyof FormOption, value: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, itemIndex) =>
        itemIndex === index ? { ...option, [key]: value } : option,
      ),
    }));
  }
  function edit(activity: Activity) {
    setEditingId(activity.id);
    setForm({
      title: activity.title,
      description: activity.description || "",
      location: activity.location || "",
      startsAt: localDateTime(activity.starts_at),
      responseDeadline: localDateTime(activity.response_deadline),
      minCompletedOrders: activity.min_completed_orders,
      minEmploymentDays: activity.min_employment_days,
      eligibilityNote: activity.eligibility_note || "",
      participantNote: activity.participant_note || "",
      allowNotAttending: activity.allow_not_attending !== false,
      allowDistance: activity.allow_distance !== false,
      isPublished: activity.is_published,
      options: activity.options.length
        ? activity.options.map((option) => ({ id: option.id, label: option.label, note: option.note || "" }))
        : [{ label: "", note: "" }],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(blank());
  }
  async function save() {
    if (!form.title.trim() || !form.startsAt) return alert("請填寫活動名稱與開始時間");
    const starts = new Date(form.startsAt);
    const deadline = form.responseDeadline
      ? new Date(form.responseDeadline)
      : new Date(starts.getTime() - 86400000);
    setBusy(true);
    try {
      await request(editingId ? "PATCH" : "POST", {
        ...form,
        ...(editingId ? { action: "edit", id: editingId } : {}),
        startsAt: starts.toISOString(),
        responseDeadline: deadline.toISOString(),
        options: form.options.filter((item) => item.label.trim()),
      });
      cancelEdit();
      await load();
      alert(editingId ? "活動已更新" : "活動已發布");
    } catch (error) {
      alert(error instanceof Error ? error.message : "儲存活動失敗");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(activity: Activity) {
    setBusy(true);
    try {
      await request("PATCH", {
        action: "publish",
        id: activity.id,
        isPublished: !activity.is_published,
      });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "更新活動失敗");
    } finally {
      setBusy(false);
    }
  }
  async function remove(activity: Activity) {
    if (!confirm(`確定刪除「${activity.title}」？`)) return;
    setBusy(true);
    try {
      await request("DELETE", { id: activity.id });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "刪除活動失敗");
    } finally {
      setBusy(false);
    }
  }
  async function download(activity: Activity) {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/qiunai/activities/${activity.id}/export`, {
      headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return alert(payload.message || "下載 Excel 失敗");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activity.title}-活動回覆名單.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function print(activityId: string) {
    setPrintActivityId(activityId);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        window.print();
        setPrintActivityId("");
      }),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
          <CalendarHeart className="text-pink-500" />
          {editingId ? "編輯活動" : "發布活動"}
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="活動名稱">
            <input
              value={form.title}
              maxLength={120}
              onChange={(e) => setField("title", e.target.value)}
            />
          </Field>
          <Field label="地點">
            <input value={form.location} onChange={(e) => setField("location", e.target.value)} />
          </Field>
          <Field label="活動開始時間">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setField("startsAt", e.target.value)}
            />
          </Field>
          <Field label="回覆截止時間（最晚為活動前 24 小時）">
            <input
              type="datetime-local"
              value={form.responseDeadline}
              onChange={(e) => setField("responseDeadline", e.target.value)}
            />
          </Field>
          <Field label="最低完成訂單數">
            <input
              type="number"
              min="0"
              value={form.minCompletedOrders}
              onChange={(e) => setField("minCompletedOrders", Number(e.target.value))}
            />
          </Field>
          <Field label="最低到職天數">
            <input
              type="number"
              min="0"
              value={form.minEmploymentDays}
              onChange={(e) => setField("minEmploymentDays", Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="活動內容" className="mt-4">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </Field>
        <Field label="參與門檻補充說明" className="mt-4">
          <textarea
            rows={2}
            value={form.eligibilityNote}
            onChange={(e) => setField("eligibilityNote", e.target.value)}
          />
        </Field>
        <Field label="參與者備註" className="mt-4">
          <textarea
            rows={2}
            value={form.participantNote}
            onChange={(e) => setField("participantNote", e.target.value)}
            placeholder="會顯示在參與選項下方"
          />
        </Field>
        <div className="mt-5 rounded-2xl bg-pink-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-slate-700">參與分類（例如北部、中部、南部）</p>
            <button
              type="button"
              disabled={form.options.length >= 20}
              onClick={() => setField("options", [...form.options, { label: "", note: "" }])}
              className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-pink-600"
            >
              <Plus size={14} />
              新增選項
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {form.options.map((option, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                <input
                  value={option.label}
                  onChange={(e) => setOption(index, "label", e.target.value)}
                  placeholder={`選項 ${index + 1}`}
                />
                <input
                  value={option.note}
                  onChange={(e) => setOption(index, "note", e.target.value)}
                  placeholder="選項下方備註（選填）"
                />
                <button
                  type="button"
                  disabled={form.options.length <= 1}
                  onClick={() =>
                    setField(
                      "options",
                      form.options.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="rounded-xl bg-rose-50 p-2 text-rose-600 disabled:opacity-30"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-pink-100 p-4">
          <p className="text-sm font-black text-slate-700">其他回覆選項（預設開啟）</p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm font-bold text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.allowNotAttending} onChange={(e) => setField("allowNotAttending", e.target.checked)} />
              不參與
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.allowDistance} onChange={(e) => setField("allowDistance", e.target.checked)} />
              因地區無法參與
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">關閉後員工不能再選該回覆，既有回覆仍保留在名單中。</p>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => setField("isPublished", e.target.checked)}
          />
          {editingId ? "顯示給符合資格的員工" : "發布後立即顯示給符合資格的員工"}
        </label>
        <div className="mt-5 flex gap-3">
          {editingId && (
            <button type="button" disabled={busy} onClick={cancelEdit} className="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700 disabled:opacity-40">
              取消編輯
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-500 px-5 py-3 font-black text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : editingId ? <Pencil size={18} /> : <Plus size={18} />}
            {editingId ? "儲存活動變更" : "發布活動"}
          </button>
        </div>
      </section>
      <section className="rounded-[30px] border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">活動回覆統計</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-pink-50 p-2 text-pink-600"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {activities.map((activity) => (
            <article key={activity.id} className="rounded-2xl border border-pink-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-black text-slate-900">{activity.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(activity.starts_at).toLocaleString("zh-TW")}｜截止{" "}
                    {new Date(activity.response_deadline).toLocaleString("zh-TW")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit(activity)}
                    className="inline-flex items-center gap-1 rounded-xl bg-pink-50 px-3 py-2 text-xs font-black text-pink-700 disabled:opacity-40"
                  >
                    <Pencil size={14} />編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => void download(activity)}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"
                  >
                    <Download size={14} />
                    下載 Excel
                  </button>
                  <button
                    type="button"
                  onClick={() => print(activity.id)}
                    className="inline-flex items-center gap-1 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700"
                  >
                    <Printer size={14} />
                    列印
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(activity)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                  >
                    {activity.is_published ? "停止發布" : "重新發布"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(activity)}
                    className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600"
                  >
                    刪除
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Stat
                  label="參與"
                  count={activity.stats.attending}
                  names={activity.responses
                    .filter((item) => item.response_status === "attending")
                    .map((item) => item.staff_nickname || "未命名")}
                />
                <Stat
                  label="不參與"
                  count={activity.stats.not_attending}
                  names={activity.responses
                    .filter((item) => item.response_status === "not_attending")
                    .map((item) => item.staff_nickname || "未命名")}
                />
                <Stat
                  label="因地區無法參與"
                  count={activity.stats.distance}
                  names={activity.responses
                    .filter((item) => item.response_status === "distance")
                    .map((item) => item.staff_nickname || "未命名")}
                />
              </div>
              <div
                className={`activity-print-area mt-5 overflow-x-auto ${printActivityId === activity.id ? "is-printing" : ""}`}
              >
                <h4 className="hidden text-center text-lg font-black print:block">{activity.title}－活動回覆名單</h4>
                {groupActivityResponses(activity).map((group) => (
                  <section key={group.key} className="mb-5 break-inside-avoid">
                    <h5 className="mb-2 rounded-lg bg-pink-50 px-3 py-2 font-black text-slate-800">
                      {group.label}：{group.responses.length} 人
                    </h5>
                    <table className="min-w-[920px] text-left text-sm">
                      <thead><tr>
                        <th>員工暱稱</th><th>員工名字</th><th>員工電話</th>
                        <th>員工親友1</th><th>親友電話</th><th>員工親友2</th><th>親友電話</th>
                      </tr></thead>
                      <tbody>
                        {group.responses.length ? group.responses.map((item) => {
                          const first = item.guests.find((guest) => guest.slot === 1);
                          const second = item.guests.find((guest) => guest.slot === 2);
                          return <tr key={item.id}>
                            <td>{item.staff_nickname || "-"}</td><td>{item.staff_real_name || "-"}</td>
                            <td>{item.staff_phone || "-"}</td><td>{first?.guest_name || "-"}</td>
                            <td>{first?.guest_phone || "-"}</td><td>{second?.guest_name || "-"}</td>
                            <td>{second?.guest_phone || "-"}</td>
                          </tr>;
                        }) : <tr><td colSpan={7} className="text-slate-400">尚無回覆</td></tr>}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body * {
            visibility: hidden !important;
          }
          .activity-print-area.is-printing,
          .activity-print-area.is-printing * {
            visibility: visible !important;
          }
          .activity-print-area.is-printing {
            position: absolute;
            inset: 0;
            width: 100%;
            font-size: 12pt !important;
            overflow: visible !important;
          }
          .activity-print-area.is-printing table {
            min-width: 0 !important;
            width: 100%;
          }
          .activity-print-area.is-printing th,
          .activity-print-area.is-printing td {
            border: 1px solid #222;
            padding: 6px;
          }
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-bold text-slate-600 ${className}`}>
      {label}
      <div className="mt-2 [&>input]:w-full [&>textarea]:w-full">{children}</div>
    </label>
  );
}
function Stat({ label, count, names }: { label: string; count: number; names: string[] }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="font-black text-slate-800">
        {label}：{count} 人
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {names.length ? names.join("、") : "尚無名單"}
      </p>
    </div>
  );
}
