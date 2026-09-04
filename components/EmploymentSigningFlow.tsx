"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSignature, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Organization = "deepnight" | "qiunai";
type Signing = {
  status: string;
  organization: Organization;
  discordId: string;
  discordName: string;
  contractVersion: string;
  pageCount: number;
  expiresAt: string;
  readConfirmedAt?: string | null;
  signedAt?: string | null;
  activatedAt?: string | null;
  prefill?: {
    real_name?: string;
    gender?: string;
    birthday?: string;
    bank_name?: string;
    bank_account?: string;
  };
  demo?: boolean;
};

const BRAND = {
  deepnight: { name: "深夜不關燈", accent: "#2563eb", soft: "#eff6ff" },
  qiunai: { name: "秋奈電競", accent: "#db2777", soft: "#fdf2f8" },
};

function ageFromBirthday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function SignaturePad({ label, onChange }: { label: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  function context() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#111827";
    return ctx;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = context();
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(next.x, next.y);
    drawing.current = true;
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const next = point(event);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    hasInk.current = true;
  }

  function end() {
    drawing.current = false;
    if (hasInk.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange("");
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">{label} <span className="text-rose-600">＊必填</span></span>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900">
          <RotateCcw size={14} /> 清除重簽
        </button>
      </div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white shadow-inner">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-4 bg-contain bg-center bg-no-repeat opacity-[0.07]" style={{ backgroundImage: "url('/employment/deepnight-logo.png')" }} />
          <span className="rotate-[-12deg] text-center text-sm font-black tracking-widest text-amber-800/15">僅供深夜不關燈工作室營運使用</span>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={260}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="relative z-10 h-40 w-full touch-none bg-transparent"
          aria-label={label}
          aria-required="true"
        />
      </div>
      <p className="mt-2 text-xs font-bold text-slate-500"><span className="text-rose-600">請使用正楷簽名。</span> 請使用滑鼠、手指或觸控筆在框內親自簽署；未完成簽名無法送出。</p>
    </div>
  );
}

export default function EmploymentSigningFlow({ token, organization }: { token: string; organization: Organization }) {
  const brand = BRAND[organization];
  const apiPath = `/api/${organization}/employment-signing`;
  const [signing, setSigning] = useState<Signing | null>(null);
  const [hasDiscordSession, setHasDiscordSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reachedBottom, setReachedBottom] = useState(false);
  const loadedPages = useRef(new Set<number>());
  const [confirmed, setConfirmed] = useState(false);
  const [stage, setStage] = useState<"review" | "form" | "complete">("review");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [guardianSignatureDataUrl, setGuardianSignatureDataUrl] = useState("");
  const [form, setForm] = useState({
    realName: "",
    nationalId: "",
    contact: "",
    gender: "",
    birthday: "",
    bankName: "",
    bankAccount: "",
    guardianName: "",
    guardianNationalId: "",
    guardianContact: "",
  });
  const age = useMemo(() => ageFromBirthday(form.birthday), [form.birthday]);
  const isMinor = age !== null && age < 18;
  const signaturesComplete = Boolean(
    signatureDataUrl && (!isMinor || guardianSignatureDataUrl),
  );

  useEffect(() => {
    void (async () => {
      try {
        const authResult = await supabase.auth.getSession();
        const session = authResult.data.session;
        const response = await fetch(`${apiPath}?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
          headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.signing) throw new Error(data.message || "讀取簽署邀請失敗");
        setHasDiscordSession(Boolean(session));
        setSigning(data.signing);
        if (data.signing.prefill) {
          const prefill = data.signing.prefill;
          setForm((current) => ({
            ...current,
            realName: prefill.real_name || current.realName,
            gender: prefill.gender || current.gender,
            birthday: prefill.birthday || current.birthday,
            bankName: prefill.bank_name || current.bankName,
            bankAccount: prefill.bank_account || current.bankAccount,
          }));
        }
        if (["signed", "activated"].includes(data.signing.status)) setStage("complete");
        else if (data.signing.status === "read") setStage("form");
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "讀取簽署邀請失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [apiPath, token]);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function confirmRead() {
    if (!reachedBottom || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "儲存閱讀確認失敗");
      setSigning(data.signing);
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session && !data.signing?.demo) {
        await discordLogin();
        return;
      }
      setHasDiscordSession(Boolean(authData.session));
      setStage("form");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "儲存閱讀確認失敗");
    } finally {
      setBusy(false);
    }
  }

  async function discordLogin() {
    const next = `/employment-sign/${token}`;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}&method=discord`;
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo },
    });
    if (loginError) setError(`Discord 登入失敗：${loginError.message}`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!signatureDataUrl) throw new Error("請完成乙方手寫簽名");
      if (isMinor && !guardianSignatureDataUrl) throw new Error("未滿 18 歲需完成法定代理人手寫簽名");
      const { data } = await supabase.auth.getSession();
      if (!data.session && !signing?.demo) {
        await discordLogin();
        return;
      }
      const response = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          token,
          ...form,
          signatureDataUrl,
          guardianSignatureDataUrl: isMinor ? guardianSignatureDataUrl : "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401 && /登入/.test(result.message || "")) {
        await supabase.auth.signOut();
        await discordLogin();
        return;
      }
      if (!response.ok || !result.signing) throw new Error(result.message || "完成契約簽署失敗");
      setSigning(result.signing);
      setStage("complete");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "完成契約簽署失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-500" size={36} /></main>;
  if (error && !signing) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><div className="max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl"><h1 className="text-2xl font-black text-rose-700">無法開啟簽署文件</h1><p className="mt-4 leading-7 text-slate-600">{error}</p></div></main>;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold" style={{ color: brand.accent }}>{brand.name}｜線上入職文件</p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">陪陪承攬合作契約書</h1>
              <p className="mt-2 text-sm text-slate-500">契約版本 {signing?.contractVersion}｜受邀人 {signing?.discordName}（{signing?.discordId}）</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold" style={{ background: brand.soft, color: brand.accent }}><ShieldCheck size={18} /> Discord 身分綁定＋電子簽署稽核</div>
          </div>
        </header>

        {error ? <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 font-bold text-rose-700">{error}</p> : null}

        {stage === "review" ? (
          <section className="mt-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">第一步：詳閱完整文件</h2><p className="mt-1 text-sm text-slate-500">請向下閱讀全部 8 頁，抵達最後一頁後才可開始填寫。</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${reachedBottom ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{reachedBottom ? "已閱讀至末頁" : "尚未抵達末頁"}</span></div>
            <div
              onScroll={(event) => {
                const node = event.currentTarget;
                if (
                  loadedPages.current.size === (signing?.pageCount || 8) &&
                  node.scrollTop + node.clientHeight >= node.scrollHeight - 80
                ) setReachedBottom(true);
              }}
              className="h-[72vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-200 p-2 sm:p-5"
            >
              {Array.from({ length: signing?.pageCount || 8 }, (_, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={`/employment/contract-v1.1-pages/page-${index + 1}.png`} alt={`契約第 ${index + 1} 頁`} onLoad={() => loadedPages.current.add(index)} className="mx-auto mb-4 h-auto w-full max-w-[850px] bg-white shadow-md last:mb-0" />
              ))}
            </div>
            <label className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${reachedBottom ? "cursor-pointer border-slate-200" : "cursor-not-allowed border-slate-100 opacity-50"}`}>
              <input type="checkbox" checked={confirmed} disabled={!reachedBottom} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5" />
              <span className="font-bold leading-7">我確認已詳閱全部內容，並同意使用電子文件及電子簽章完成本契約。</span>
            </label>
            <button type="button" onClick={confirmRead} disabled={!reachedBottom || !confirmed || busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ background: brand.accent }}>{busy ? <Loader2 className="animate-spin" size={20} /> : <FileSignature size={20} />} 已詳閱全部內容，開始填寫資料</button>
          </section>
        ) : null}

        {stage === "form" && !hasDiscordSession && !signing?.demo ? (
          <section className="mt-6 rounded-3xl bg-white p-6 text-center shadow-sm sm:p-10">
            <ShieldCheck className="mx-auto" size={48} style={{ color: brand.accent }} />
            <h2 className="mt-4 text-2xl font-black">先驗證受邀 Discord 帳號</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">驗證成功後才會開啟資料與簽名欄位，避免填寫完成後因登入跳轉而需要重新輸入。</p>
            <button type="button" onClick={discordLogin} disabled={busy} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-lg font-black text-white disabled:opacity-50" style={{ background: brand.accent }}><ShieldCheck size={20} /> 使用 Discord 驗證後開始填寫</button>
          </section>
        ) : null}

        {stage === "form" && (hasDiscordSession || signing?.demo) ? (
          <form onSubmit={submit} className="mt-6 space-y-6 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
            <div><h2 className="text-xl font-black">第二步：填寫資料並手寫簽名</h2><p className="mt-2 text-sm leading-6 text-slate-500">Discord 名稱與 ID 已由邀請固定帶入。身分證字號、聯絡方式與手寫簽名只會保存在最終簽署 PDF；EIP 僅帶入現有個人資料欄位。</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Discord 名稱" value={signing?.discordName || ""} disabled />
              <Input label="Discord ID" value={signing?.discordId || ""} disabled />
              <Input label="真實姓名" value={form.realName} onChange={(v) => update("realName", v)} required />
              <Input label="身分證字號" value={form.nationalId} onChange={(v) => update("nationalId", v)} required autoComplete="off" />
              <Input label="聯絡方式" value={form.contact} onChange={(v) => update("contact", v)} required placeholder="手機號碼" />
              <Select label="性別" value={form.gender} onChange={(v) => update("gender", v)} options={["男", "女", "其他", "不透露"]} />
              <Input label="生日" type="date" value={form.birthday} onChange={(v) => update("birthday", v)} required />
              <Input label="銀行名稱" value={form.bankName} onChange={(v) => update("bankName", v)} required />
              <Input label="銀行帳號" value={form.bankAccount} onChange={(v) => update("bankAccount", v)} required inputMode="numeric" />
            </div>
            {isMinor ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-black text-amber-900">未滿 18 歲：法定代理人資料</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Input label="法定代理人姓名" value={form.guardianName} onChange={(v) => update("guardianName", v)} required /><Input label="法定代理人身分證字號" value={form.guardianNationalId} onChange={(v) => update("guardianNationalId", v)} required autoComplete="off" /><Input label="法定代理人聯絡方式" value={form.guardianContact} onChange={(v) => update("guardianContact", v)} required /></div><div className="mt-5"><SignaturePad label="法定代理人手寫簽名" onChange={setGuardianSignatureDataUrl} /></div></div> : null}
            <SignaturePad label="乙方手寫簽名" onChange={setSignatureDataUrl} />
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4"><input type="checkbox" required className="mt-1 h-5 w-5" /><span className="text-sm font-bold leading-7">本人確認上述資料正確、簽名由本人親自完成，並同意系統保存 Discord 身分驗證、閱讀確認、手寫簽名、簽署時間及文件完整性稽核紀錄。</span></label>
            {!signaturesComplete ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">請先完成所有必填手寫簽名，才能送出契約。</p> : null}
            <button type="submit" disabled={busy || !signaturesComplete} className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ background: brand.accent }}>{busy ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />} 驗證 Discord 並完成簽署</button>
          </form>
        ) : null}

        {stage === "complete" ? (
          <section className="mt-6 rounded-3xl bg-white p-8 text-center shadow-sm sm:p-12"><CheckCircle2 className="mx-auto text-emerald-500" size={64} /><h2 className="mt-5 text-3xl font-black">{signing?.demo ? "測試簽署完成" : "契約簽署完成"}</h2><p className="mx-auto mt-4 max-w-2xl leading-8 text-slate-600">{signing?.demo ? "這是隔離測試流程，不會產生正式文件、寫入 EIP 或啟用員工檔案。" : `已附電子簽署稽核紀錄的文件已自動存入 EIP「資料下載－員工專區」。你的資料目前為待啟用狀態，第一次登入 ${brand.name} EIP 後才會正式啟用人員檔案。`}</p>{signing?.signedAt ? <p className="mt-5 text-sm font-bold text-slate-500">完成時間：{new Date(signing.signedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p> : null}</section>
        ) : null}
      </div>
    </main>
  );
}

function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange?: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block"><span className="text-sm font-bold text-slate-700">{label}</span><input {...props} value={value} onChange={(event) => onChange?.(event.target.value)} data-no-translate className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-500" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block"><span className="text-sm font-bold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} required data-no-translate className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500"><option value="">請選擇</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
