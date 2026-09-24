"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { CalendarDays, Loader2, MapPin, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Guest = { name: string; phone: string };
type ActivityOption = { id: string; label: string; note?: string | null };
type Activity = {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  starts_at: string;
  response_deadline: string;
  eligibility_note?: string | null;
  participant_note?: string | null;
  allow_not_attending?: boolean;
  allow_distance?: boolean;
  locked: boolean;
  eligibility: {
    eligible: boolean;
    reasons: string[];
    completedOrders: number;
    employmentDays: number;
  };
  options: ActivityOption[];
  response?: {
    response_status: "attending" | "not_attending" | "distance";
    selected_option_id?: string | null;
    guests?: Array<{ guest_name: string; guest_phone: string }>;
  } | null;
};

async function authToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("登入已過期，請重新登入");
  return data.session.access_token;
}

export default function ActivityPortal() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/qiunai/activities", {
        headers: { Authorization: `Bearer ${await authToken()}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "讀取活動失敗");
      setActivities(payload.activities || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "讀取活動失敗");
    } finally {
      setLoading(false);
    }
  }, []);
  const loadEvent = useEffectEvent(load);
  useEffect(() => {
    void Promise.resolve().then(loadEvent);
  }, []);

  if (loading)
    return (
      <section className="rounded-[28px] border border-violet-100 bg-white p-10 text-center text-sm text-slate-400">
        <Loader2 className="mx-auto mb-2 animate-spin" />
        讀取活動中…
      </section>
    );
  if (!activities.length)
    return (
      <section className="rounded-[28px] border border-violet-100 bg-white p-10 text-center text-sm text-slate-400">
        目前沒有已發布的活動
      </section>
    );
  return (
    <div className="space-y-5">
      {activities.map((activity) => (
        <ActivityForm key={activity.id} activity={activity} onSaved={load} />
      ))}
    </div>
  );
}

function ActivityForm({ activity, onSaved }: { activity: Activity; onSaved: () => Promise<void> }) {
  const existing = activity.response;
  const [status, setStatus] = useState(existing?.response_status || "");
  const [optionId, setOptionId] = useState(existing?.selected_option_id || "");
  const [guests, setGuests] = useState<Guest[]>(
    (existing?.guests || []).map((guest) => ({ name: guest.guest_name, phone: guest.guest_phone })),
  );
  const [busy, setBusy] = useState(false);
  const statuses = [
    ["attending", "參與"],
    ...(activity.allow_not_attending !== false ? [["not_attending", "不參與"]] : []),
    ...(activity.allow_distance !== false ? [["distance", "因地區無法參與"]] : []),
  ];
  const canSubmit =
    activity.eligibility.eligible &&
    !activity.locked &&
    statuses.some(([value]) => value === status) &&
    (status !== "attending" || !activity.options.length || optionId);

  function updateGuest(index: number, field: keyof Guest, value: string) {
    setGuests((current) =>
      current.map((guest, itemIndex) =>
        itemIndex === index ? { ...guest, [field]: value } : guest,
      ),
    );
  }
  async function submit() {
    if (!canSubmit) return;
    if (guests.some((guest) => !guest.name.trim() || !guest.phone.trim()))
      return alert("親友姓名與電話都必須填寫");
    setBusy(true);
    try {
      const response = await fetch("/api/qiunai/activities", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await authToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "respond",
          activityId: activity.id,
          status,
          optionId: status === "attending" ? optionId : null,
          guests: status === "attending" ? guests : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "送出活動回覆失敗");
      await onSaved();
      alert("活動回覆已儲存");
    } catch (error) {
      alert(error instanceof Error ? error.message : "送出活動回覆失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm shadow-violet-100 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">{activity.title}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {activity.description}
          </p>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-black ${activity.locked ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}
        >
          {activity.locked ? "已截止" : existing ? "已回覆，可修改" : "報名中"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <CalendarDays size={16} className="text-violet-500" />
          活動時間：{new Date(activity.starts_at).toLocaleString("zh-TW")}
        </p>
        {activity.location ? (
          <p className="flex items-center gap-2">
            <MapPin size={16} className="text-violet-500" />
            地點：{activity.location}
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <Users size={16} className="text-violet-500" />
          回覆截止：{new Date(activity.response_deadline).toLocaleString("zh-TW")}
        </p>
      </div>
      {!activity.eligibility.eligible ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <p>目前不符合參與門檻</p>
          {activity.eligibility.reasons.map((reason) => (
            <p key={reason} className="mt-1 font-normal">
              {reason}
            </p>
          ))}
        </div>
      ) : null}
      {activity.eligibility_note ? (
        <p className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm leading-6 text-violet-800">
          參與門檻說明：{activity.eligibility_note}
        </p>
      ) : null}
      <fieldset
        disabled={!activity.eligibility.eligible || activity.locked || busy}
        className="mt-5 grid gap-3 sm:grid-cols-3"
      >
        <legend className="sr-only">參與狀態</legend>
        {statuses.map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-2xl border p-4 text-center text-sm font-black ${status === value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}
          >
            <input
              type="radio"
              name={`activity-${activity.id}`}
              value={value}
              checked={status === value}
              onChange={() => setStatus(value as typeof status)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {status && !statuses.some(([value]) => value === status) ? (
        <p className="mt-3 text-sm font-bold text-amber-700">原本選擇的回覆已關閉，請重新選擇。</p>
      ) : null}
      {status === "attending" ? (
        <div className="mt-5 space-y-4">
          {activity.options.length ? (
            <fieldset>
              <legend className="text-sm font-black text-slate-700">活動選項</legend>
              <div className="mt-2 grid gap-2">
                {activity.options.map((option) => (
                  <label key={option.id} className="rounded-2xl border border-slate-200 p-3">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <input
                        type="radio"
                        name={`option-${activity.id}`}
                        checked={optionId === option.id}
                        onChange={() => setOptionId(option.id)}
                      />
                      {option.label}
                    </span>
                    {option.note ? (
                      <span className="mt-1 block pl-6 text-xs leading-5 text-slate-500">
                        {option.note}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {activity.participant_note ? (
            <p className="rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-800">
              {activity.participant_note}
            </p>
          ) : null}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-800">自費攜帶親友</p>
                <p className="mt-1 text-xs text-slate-500">每位員工最多新增兩位親友。</p>
              </div>
              <button
                type="button"
                disabled={guests.length >= 2 || activity.locked}
                onClick={() => setGuests((current) => [...current, { name: "", phone: "" }])}
                className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-40"
              >
                <Plus size={14} />
                新增親友
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {guests.map((guest, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    value={guest.name}
                    onChange={(event) => updateGuest(index, "name", event.target.value)}
                    placeholder={`親友 ${index + 1} 姓名`}
                    maxLength={100}
                  />
                  <input
                    value={guest.phone}
                    onChange={(event) => updateGuest(index, "phone", event.target.value)}
                    placeholder="親友電話"
                    maxLength={30}
                  />
                  <button
                    type="button"
                    aria-label={`移除親友 ${index + 1}`}
                    onClick={() =>
                      setGuests((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="rounded-xl bg-rose-50 p-2 text-rose-600"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-900">
            <p>
              若填完要取消需於一個月前取消，否則會扣除取消人數的訂金，訂金視不同活動廠商會有所變動。
            </p>
            <p className="mt-2">
              員工家屬僅提供同行之便利，不提供保管財物、個人物品、去程及回程安全等其他服務。
            </p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={!canSubmit || busy}
        onClick={() => void submit()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        {activity.locked ? "已截止，無法修改" : existing ? "更新活動回覆" : "送出活動回覆"}
      </button>
    </section>
  );
}
