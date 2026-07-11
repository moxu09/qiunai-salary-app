"use client";

import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Save, Settings } from "lucide-react";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settingId, setSettingId] = useState(null);
  const [form, setForm] = useState({
    report_channel_id: "",
    payday: "",
  });

  const { adminLoading, isAdmin } = useQiunaiAdminGuard();
  useEffect(() => {
    if (isAdmin) {
      loadSettings();
    }
  }, [isAdmin]);

  async function loadSettings() {
    setLoading(true);

    const { data, error } = await supabase
      .from("qiunai_salary_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
      alert("讀取設定失敗");
      setLoading(false);
      return;
    }

    if (data) {
      setSettingId(data.id);
      setForm({
        report_channel_id: data.report_channel_id || "",
        payday: data.payday || "",
      });
    }

    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);

    if (settingId) {
      const { error } = await supabase
        .from("qiunai_salary_settings")
        .update({
          report_channel_id: form.report_channel_id || null,
          payday: form.payday || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingId);

      setSaving(false);

      if (error) {
        console.error(error);
        alert("儲存失敗");
        return;
      }

      alert("設定已儲存");
      return;
    }

    const { data, error } = await supabase
      .from("qiunai_salary_settings")
      .insert({
        report_channel_id: form.report_channel_id || null,
        payday: form.payday || null,
      })
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error(error);
      alert("建立設定失敗");
      return;
    }

    setSettingId(data.id);
    alert("設定已建立");
  }
  if (adminLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
        <p className="text-sm text-zinc-300">檢查後台權限中...</p>
      </main>
    );
  }
  return (
    <main className="admin-page min-h-screen bg-[#fff7fb] text-[#3f2947]">
      <header className="admin-page-header border border-pink-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <div>
            <p className="text-sm text-violet-300">Qiunai Admin</p>
            <h1 className="text-2xl font-bold">秋奈電競｜系統設定</h1>
          </div>

          <div className="rounded-2xl bg-violet-500/20 p-3 text-violet-300">
            <Settings size={22} />
          </div>
        </div>
      </header>

      <section className="admin-page-content mx-auto max-w-7xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          {loading ? (
            <p className="text-zinc-400">載入中...</p>
          ) : (
            <>
              <h2 className="text-xl font-bold">每日報告設定</h2>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                這裡設定的是管理總報告頻道。每個員工自己的薪資通知頻道，
                請到「員工管理」裡面設定。
              </p>

              <div className="mt-6 grid gap-5">
                <Input
                  label="管理總報告頻道 ID"
                  value={form.report_channel_id}
                  placeholder="貼 Discord 頻道 ID"
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      report_channel_id: value,
                    }))
                  }
                />

                <Input
                  label="發薪日"
                  value={form.payday}
                  placeholder="例如：每月10號"
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      payday: value,
                    }))
                  }
                />
              </div>

              <button
                onClick={saveSettings}
                disabled={saving}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400 disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? "儲存中..." : "儲存設定"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Input({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
      />
    </label>
  );
}
