"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import HrContractDeposit from "@/components/HrContractDeposit";
import { SignaturePad } from "@/components/EmploymentSigningFlow";
import { HR_PAYMENT_QR_MAX_BYTES, HR_QR_PROVIDERS, HR_SIGNER_IDENTITIES, HR_SIGNING_DOCUMENTS, taipeiSigningAge } from "@/lib/hrSigningDocuments.mjs";
import receivingBanks from "@/lib/taiwanReceivingBanks.json";
import { supabase } from "@/lib/supabase";

type Key = "employment-v22" | "manager-nda";
type Identity = keyof typeof HR_SIGNER_IDENTITIES;
const defaultForm = {
  realName: "", nationalId: "", contact: "", birthday: "", bankCode: "", bankHolder: "",
  bankAccount: "", address: "", guardianName: "", guardianContact: "", payeeName: "",
  qrProvider: "", cryptoChannel: "", walletAddress: "", confirmWalletAddress: "",
};
type Field = keyof typeof defaultForm;
const fieldLabels: Record<Field, string> = {
  realName: "乙方姓名", nationalId: "身分證字號", contact: "聯絡方式", birthday: "西元出生年月日",
  bankCode: "銀行代碼", bankHolder: "銀行戶名", bankAccount: "收款帳戶", address: "聯絡地址",
  guardianName: "法定代理人姓名", guardianContact: "法定代理人聯絡方式",
  payeeName: "收款人名稱", qrProvider: "收款方式", cryptoChannel: "加密貨幣通路",
  walletAddress: "錢包地址", confirmWalletAddress: "再次輸入錢包地址",
};
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900";
const actionClass = "rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50";
const lineBankCode = "824";
const lineBankInvitation = "https://www.linebank.com.tw/R/mgm-portal?campaignId=3&uid=bfXxqI";

function readPaymentQr(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("無法讀取收款碼，請重新選擇圖片"));
    reader.readAsDataURL(file);
  });
}

async function request(url: string, options?: RequestInit) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const session = await Promise.race([
    supabase.auth.getSession().then(({ data, error }) => error ? null : data.session),
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5_000); }),
  ]).finally(() => clearTimeout(timer));
  if (!session) throw Object.assign(Error("請先使用 Discord 登入"), { status: 401 });
  const response = await fetch(url, {
    ...options, cache: "no-store", signal: AbortSignal.timeout(35_000),
    headers: { Authorization: `Bearer ${session.access_token}`, ...options?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw Object.assign(Error(payload.message || "簽署服務暫時無法使用"), { status: response.status });
  }
  return response;
}

export default function HrDocumentSigning({ documentKey }: { documentKey: Key }) {
  const document = HR_SIGNING_DOCUMENTS[documentKey];
  const endpoint = `/api/hr/document-signing?document=${documentKey}`;
  const nda = documentKey === "manager-nda";
  const [form, setForm] = useState(defaultForm);
  const [identity, setIdentity] = useState<Identity | "">("");
  const [prefilledId, setPrefilledId] = useState<{ identity: Identity; value: string } | null>(null);
  const [paymentQr, setPaymentQr] = useState<File | null>(null);
  const [sameBankHolder, setSameBankHolder] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [guardianSignatureDataUrl, setGuardianSignatureDataUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPaidAt, setDepositPaidAt] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfOpened, setPdfOpened] = useState(false);
  const age = taipeiSigningAge(form.birthday);
  const minor = !nda && age !== null && age < 18;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const info = await (await request(endpoint)).json();
      setSignedAt(info.signedAt);
      setDepositRequired(Boolean(info.depositRequired));
      setDepositPaidAt(info.depositPaidAt || null);
      if (info.prefill) {
        const { identity: storedIdentity, nationalId, ...fields } = info.prefill;
        setForm({ ...defaultForm, ...fields });
        if (Object.hasOwn(HR_SIGNER_IDENTITIES, storedIdentity)) {
          setPrefilledId({ identity: storedIdentity, value: nationalId || "" });
        }
        setSameBankHolder(!fields.bankHolder || fields.bankHolder === fields.realName);
      }
      setNeedsLogin(false);
    } catch (caught) {
      setNeedsLogin((caught as { status?: number })?.status === 401);
      setError(caught instanceof Error ? caught.message : "讀取待簽文件失敗");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function login() {
    setBusy(true);
    const next = `/collaboration/contract-signing?document=${documentKey}`;
    const callback = new URL("/auth/callback", location.origin);
    callback.searchParams.set("method", "discord");
    callback.searchParams.set("next", next);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "discord", options: { redirectTo: callback.href },
      });
      if (oauthError) throw oauthError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discord 登入失敗");
      setBusy(false);
    }
  }

  async function openPdf() {
    setBusy(true);
    setError("");
    try {
      const response = await request(`${endpoint}&view=${signedAt ? "signed" : "source"}`);
      setPdfUrl(URL.createObjectURL(await response.blob()));
      setPdfOpened(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法開啟 PDF");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !identity) return;
    setBusy(true);
    setError("");
    try {
      const { realName, nationalId, contact, address, birthday, guardianName, guardianContact, bankCode,
        bankHolder, bankAccount, qrProvider, payeeName, cryptoChannel, walletAddress, confirmWalletAddress } = form;
      let details;
      if (nda) {
        details = { address };
      } else {
        let payout;
        if (identity === "tw") {
          payout = { bankCode, bankHolder, bankAccount, sameBankHolder };
        } else if (identity === "cn_hk_mo") {
          if (!paymentQr) throw Error("請上傳收款碼");
          payout = { payeeName, qrProvider, paymentQrDataUrl: await readPaymentQr(paymentQr) };
        } else {
          if (walletAddress.trim() !== confirmWalletAddress.trim()) throw Error("兩次輸入的錢包地址不一致");
          payout = { cryptoChannel, walletAddress, confirmWalletAddress };
        }
        details = { birthday, ...payout, ...(minor ? { guardianName, guardianContact, guardianSignatureDataUrl } : {}) };
      }
      const response = await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, realName, nationalId, contact, confirmed, signatureDataUrl, ...details }),
      });
      const signed = await response.json();
      setSignedAt(signed.signedAt);
      setDepositRequired(Boolean(signed.depositRequired));
      setDepositPaidAt(signed.depositPaidAt || null);
      setPdfUrl("");
      setSignatureDataUrl("");
      setGuardianSignatureDataUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送出簽署失敗");
    } finally {
      setBusy(false);
    }
  }

  function input(field: Field, type = "text", max = 50) {
    const label = field === "nationalId" && identity ? HR_SIGNER_IDENTITIES[identity].idLabel :
      nda && field === "contact" ? "聯絡電話" : fieldLabels[field];
    return <label>{label}<input className={inputClass} type={type} maxLength={max}
      required value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
        <Link className="text-sm font-bold underline" href="/collaboration/workspace">返回 HR 工作台</Link>
        <h1 className="text-2xl font-black">{document.title}</h1>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p> : null}
        {loading ? <p role="status">正在讀取簽署待辦…</p> : null}
        {!loading && needsLogin ? <button className={actionClass} disabled={busy} onClick={() => void login()}>使用 Discord 登入</button> : null}
        {!loading && !needsLogin && error && !signedAt && !pdfOpened && !form.realName ? (
          <button className={actionClass} disabled={busy} onClick={() => void load()}>重新讀取</button>
        ) : null}
        {!loading && !needsLogin && (!error || pdfOpened || form.realName || signedAt) ? (
          <>
            {signedAt ? <p role="status">已完成簽署</p> : null}
            {signedAt && depositRequired && !nda ? <HrContractDeposit request={request} paidAt={depositPaidAt} /> : null}
            {!signedAt ? <label className="block">簽署身分
              <select className={inputClass} value={identity} disabled={busy} onChange={(event) => {
                const value = event.target.value as Identity | "";
                setIdentity(value);
                setForm({ ...form, nationalId: value === prefilledId?.identity ? prefilledId.value : "" });
                setPaymentQr(null);
                setSignatureDataUrl("");
                setGuardianSignatureDataUrl("");
                setConfirmed(false);
                setError("");
              }}>
                <option value="">請選擇簽署身分</option>
                {Object.entries(HR_SIGNER_IDENTITIES).map(([value, { title }]) =>
                  <option key={value} value={value}>{title}</option>)}
              </select>
            </label> : null}
            <button type="button" className={actionClass} disabled={busy || (!signedAt && !identity)} onClick={() => void openPdf()}>
              {signedAt ? "開啟已簽署 PDF" : "讀取完整 PDF"}
            </button>
            {pdfUrl ? <div className="space-y-2">
              <a className="inline-block font-bold underline" href={pdfUrl} target="_blank" rel="noreferrer">在新分頁閱讀 PDF</a>
              <iframe className="h-96 w-full rounded-lg border border-slate-200" title={document.title} src={pdfUrl} />
            </div> : null}
            {!signedAt && pdfOpened && identity ? (
              <form key={identity} onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {input("realName")}{input("nationalId", "text", 30)}{input("contact", "text", 30)}
                  {nda ? input("address", "text", 150) : input("birthday", "date", 10)}
                  {!nda && identity === "tw" ? (
                    <>
                      <div className="sm:col-span-2">
                        <label>收款銀行<select className={inputClass} required value={form.bankCode}
                          onChange={(event) => setForm({ ...form, bankCode: event.target.value })}>
                          <option value="">請選擇銀行</option>
                          <option value={lineBankCode}>824　LINE Bank 連線商業銀行（推薦薪轉戶）</option>
                          {Object.entries(receivingBanks).filter(([code]) => code !== lineBankCode)
                            .sort(([a], [b]) => a.localeCompare(b)).map(([code, bank]) => (
                              <option key={code} value={code}>{code}　{bank}</option>
                            ))}
                        </select></label>
                        <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm leading-relaxed text-slate-800">
                          <a href={lineBankInvitation} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                            LINE Bank 邀請開戶
                          </a>
                          <p className="mt-1">台幣開戶享手機跨行轉帳免手續費，每月最高 50 次。外幣開戶享美元匯美國全額到行手續費新臺幣 150 元起，符合條件的約定帳號單筆最高可匯 10 萬美元。另有最長 10 年期信貸及免年費聯名信用卡。優惠依 LINE Bank 公告及適用條件為準。</p>
                        </div>
                      </div>
                      <label>銀行代碼<input className={inputClass} readOnly value={form.bankCode} /></label>
                      <div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={sameBankHolder}
                          onChange={(event) => setSameBankHolder(event.target.checked)} /> 銀行戶名同本人</label>
                        {sameBankHolder ? <label>銀行戶名<input className={inputClass} readOnly value={form.realName} /></label> : input("bankHolder")}
                      </div>
                      {input("bankAccount")}
                    </>
                  ) : null}
                  {!nda && identity === "cn_hk_mo" ? <>
                    {input("payeeName")}
                    <label>收款方式<select className={inputClass} required value={form.qrProvider}
                      onChange={(event) => setForm({ ...form, qrProvider: event.target.value })}>
                      <option value="">請選擇收款方式</option>
                      {Object.entries(HR_QR_PROVIDERS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                    </select></label>
                    <label className="sm:col-span-2">上傳收款碼<input type="file" className={inputClass}
                      required accept="image/png,image/jpeg" onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && (file.size > HR_PAYMENT_QR_MAX_BYTES || !["image/png", "image/jpeg"].includes(file.type))) {
                          event.target.value = "";
                          setPaymentQr(null);
                          setError("請上傳不超過 768 KB 的 PNG 或 JPEG 收款碼");
                          return;
                        }
                        setPaymentQr(file);
                        setError("");
                      }} /><span className="text-sm text-slate-600">PNG 或 JPEG，最大 768 KB。</span></label>
                  </> : null}
                  {!nda && identity === "foreign" ? <>
                    <label className="sm:col-span-2">加密貨幣通路<input className={inputClass} required maxLength={60}
                      placeholder="請填寫幣種及收款網路" value={form.cryptoChannel}
                      onChange={(event) => setForm({ ...form, cryptoChannel: event.target.value })} /></label>
                    {input("walletAddress", "text", 160)}{input("confirmWalletAddress", "text", 160)}
                  </> : null}
                </div>
                {!nda ? <label className="flex items-center gap-2">
                  <input type="checkbox" checked={age !== null && !minor} disabled />
                  {minor ? "履約保證金不適用於未成年乙方" : "成年乙方須於簽署後繳交 NT$1,000 履約保證金"}
                </label> : null}
                <SignaturePad label={nda ? "資訊接受方手寫簽名" : "乙方手寫簽名"} onChange={setSignatureDataUrl} />
                {minor ? <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">{input("guardianName")}{input("guardianContact", "text", 70)}</div>
                  <SignaturePad label="法定代理人手寫簽名" onChange={setGuardianSignatureDataUrl} />
                </div> : null}
                <label className="flex items-center gap-2"><input type="checkbox" required checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)} /> 我已詳閱完整文件並同意以電子方式簽署</label>
                <button className={actionClass} disabled={busy || !confirmed || !signatureDataUrl || (minor && !guardianSignatureDataUrl)}>
                  {busy ? "處理中…" : "確認送出簽署"}
                </button>
              </form>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
