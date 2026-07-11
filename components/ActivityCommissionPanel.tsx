"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  appKey: "deepnight" | "qiunai" | "xy";
  accent?: "sky" | "pink" | "orange";
};

function toInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ActivityCommissionPanel({
  appKey,
  accent = "sky",
}: Props) {
  const [rate, setRate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void load();
  }, [appKey]);

  async function load() {
    const { data, error } = await supabase
      .from("salary_activity_commission_settings")
      .select("*")
      .eq("app_key", appKey)
      .maybeSingle();
    if (error) {
      console.error("load activity commission error", error);
      setLoaded(true);
      return;
    }
    setRate(data?.activity_rate == null ? "" : String(data.activity_rate));
    setStartsAt(toInput(data?.starts_at));
    setEndsAt(toInput(data?.ends_at));
    setLoaded(true);
  }

  const status = useMemo(() => {
    if (!rate || !startsAt || !endsAt) return "尚未設定";
    const now = Date.now();
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    if (now < start) return "尚未開始";
    if (now >= end) return "已結束";
    return "活動中";
  }, [rate, startsAt, endsAt]);

  async function save() {
    const numericRate = Number(rate);
    if (
      !Number.isFinite(numericRate) ||
      numericRate <= 0 ||
      numericRate > 100
    ) {
      alert("活動抽成請輸入 1 到 100");
      return;
    }
    if (!startsAt || !endsAt || new Date(startsAt) >= new Date(endsAt)) {
      alert("請輸入正確的活動開始與結束時間");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("salary_activity_commission_settings")
      .upsert({
        app_key: appKey,
        activity_rate: numericRate,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        updated_at: new Date().toISOString(),
      });
    setSaving(false);

    if (error) {
      console.error("save activity commission error", error);
      alert("活動抽成儲存失敗");
      return;
    }
    alert("活動抽成已設定");
  }

  const tones = {
    sky: "border-sky-100 shadow-sky-100 text-sky-600 bg-sky-500 hover:bg-sky-600",
    pink: "border-pink-100 shadow-pink-100 text-pink-600 bg-pink-500 hover:bg-pink-600",
    orange:
      "border-orange-100 shadow-orange-100 text-orange-600 bg-orange-500 hover:bg-orange-600",
  }[accent];

  if (!loaded) return null;

  return (
    <section
      className={`rounded-[30px] border bg-white p-6 shadow-sm ${tones
        .split(" ")
        .slice(0, 2)
        .join(" ")}`}
    >
      <div className="flex items-center gap-3">
        <CalendarClock size={22} className={tones.split(" ")[2]} />
        <div>
          <h2 className="text-lg font-black text-slate-900">活動抽成</h2>
          <p className="mt-1 text-sm text-slate-500">
            原抽成高於活動抽成者維持原抽成，其餘員工於活動期間套用活動抽成。
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-600">
            活動抽成 (%)
          </span>
          <input
            type="number"
            min="1"
            max="100"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-600">
            開始時間
          </span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-600">
            結束時間
          </span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-slate-600">目前狀態：{status}</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 ${tones
            .split(" ")
            .slice(3)
            .join(" ")}`}
        >
          <Save size={16} />
          {saving ? "儲存中..." : "確定活動抽成"}
        </button>
      </div>
    </section>
  );
}
