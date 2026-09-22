"use client";

import { useState } from "react";
import { Download, Loader2, MonitorDown, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";

const installers = [
  { platform: "macos-arm64", label: "macOS・Apple Silicon", detail: "M 系列晶片 Mac", size: "44.3 MB", mobile: false },
  { platform: "macos-x64", label: "macOS・Intel", detail: "Intel 處理器 Mac", size: "46.8 MB", mobile: false },
  { platform: "windows-x64", label: "Windows・64 位元", detail: "Windows x64 電腦", size: "44.3 MB", mobile: false },
  { platform: "android", label: "Android", detail: "解壓 ZIP 後安裝 APK", size: "44.5 MB", mobile: true },
] as const;

export default function StaffInstallerDownloads() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function download(platform: string) {
    setDownloading(platform);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("登入已失效，請重新登入");
      const response = await fetch(`/api/qiunai/installers?platform=${encodeURIComponent(platform)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.message || "建立下載連結失敗");
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "下載失敗，請稍後再試");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-pink-100 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-3 text-xl font-black text-[#3f2947]">
        <MonitorDown size={24} className="text-pink-500" />秋奈 EIP App 下載
      </h2>
      <p className="mt-2 text-sm text-[#80647d]">選擇與裝置相符的版本。檔案為 ZIP，下載後先解壓縮再開啟。</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {installers.map((installer) => (
          <div key={installer.platform} className="flex items-center gap-4 rounded-2xl border border-pink-100 bg-pink-50/50 p-4">
            <div className="rounded-xl bg-white p-3 text-pink-500">
              {installer.mobile ? <Smartphone size={22} /> : <MonitorDown size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-[#3f2947]">{installer.label}</h3>
              <p className="text-xs text-[#80647d]">{installer.detail}・{installer.size}</p>
            </div>
            <button
              type="button"
              onClick={() => void download(installer.platform)}
              disabled={downloading !== null}
              className="qiunai-button inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black disabled:opacity-50"
            >
              {downloading === installer.platform ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              下載
            </button>
          </div>
        ))}
      </div>
      {error ? <p role="alert" className="mt-4 text-sm font-bold text-rose-600">{error}</p> : null}
    </section>
  );
}
