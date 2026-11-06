"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Installer = { platform: string; version: string; filename: string; size: number };
const platforms = [["macos-arm64", "macOS・Apple Silicon"], ["macos-x64", "macOS・Intel"], ["windows-x64", "Windows・64 位元"], ["android", "Android"]];

export default function StaffInstallerDownloads({ admin = false }: { admin?: boolean }) {
  const [files, setFiles] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [platform, setPlatform] = useState("windows-x64");
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const endpoint = `/api/deepnight/installers${admin ? "?admin=1" : ""}`;
  const token = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("請重新登入 EIP");
    return data.session.access_token;
  };
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "讀取安裝包失敗");
      setFiles(result.files); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "讀取安裝包失敗"); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  async function download(item: Installer) {
    setBusy(item.platform); setError("");
    try {
      const response = await fetch(`${endpoint}${admin ? "&" : "?"}platform=${item.platform}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || "下載失敗"); }
      const blob = await response.blob();
      if (!blob.size || blob.size !== Number(item.size)) throw new Error("下載內容不完整，請重新下載");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = item.filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "下載失敗"); }
    finally { setBusy(""); }
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy("upload"); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("platform", platform); body.set("version", version); body.set("file", file);
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "上傳失敗");
      setNotice("深夜員工端安裝包已發布。"); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "上傳失敗"); }
    finally { setBusy(""); }
  }
  return <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-black">深夜 HR App {admin ? "安裝包管理" : "下載"}</h1>
    <p className="mt-2 text-sm text-slate-600">依你的裝置選擇版本。Windows 直接下載 EXE；Mac 下載後解壓縮；Android 安裝 APK。</p>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 text-emerald-700">{notice}</p> : null}
    {admin ? <form onSubmit={(event) => void upload(event)} className="my-5 grid gap-4 rounded-2xl bg-sky-50 p-4 sm:grid-cols-2">
      <label>平台<select className="mt-2 w-full" value={platform} onChange={(event) => setPlatform(event.target.value)}>{platforms.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>版本號<input className="mt-2 w-full" required value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如 1.0.0" /></label>
      <label className="sm:col-span-2">安裝包（單檔最多 50 MB）<input className="mt-2 block" required type="file" accept={platform === "windows-x64" ? ".exe" : platform === "android" ? ".apk" : ".zip"} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <button disabled={Boolean(busy)} className="rounded-xl bg-sky-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy === "upload" ? "上傳中…" : "上傳並發布"}</button>
    </form> : null}
    {loading ? <p className="py-5">讀取安裝包中…</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{platforms.map(([key, label]) => {
      const item = files.find((entry) => entry.platform === key);
      return <article key={key} className="rounded-2xl border border-slate-200 p-4"><h2 className="font-bold">{label}</h2>{item ? <><p className="my-2 text-sm text-slate-600">v{item.version}・{(item.size / 1024 / 1024).toFixed(1)} MB</p><button disabled={Boolean(busy)} onClick={() => void download(item)} className="rounded-xl bg-sky-700 px-4 py-2 text-white disabled:opacity-50">{busy === key ? "下載中…" : "下載"}</button></> : <p className="mt-2 text-sm text-slate-500">尚未發布此平台安裝包</p>}</article>;
    })}</div>}
  </section>;
}
