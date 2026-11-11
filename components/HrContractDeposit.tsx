"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { loadHrThemeEcpay } from "@/components/HrThemeShop";

type Method = "ecpay" | "jkopay";
type Checkout = {
  method: Method;
  tradeNo: string;
  status: "preparing" | "ready" | "processing" | "paid";
  amount: number;
  token?: string;
  url?: string;
};
type Deposit = { required: boolean; paidAt: string | null; methods: Method[]; payment: Checkout | null };
const endpoint = "/api/hr/contract-deposit";
const names = { ecpay: "綠界站內付", jkopay: "街口支付" };
const button = "rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50";

export default function HrContractDeposit({
  request, paidAt,
}: {
  request: (url: string, options?: RequestInit) => Promise<Response>;
  paidAt: string | null;
}) {
  const [state, setState] = useState<Deposit | null>(null);
  const [method, setMethod] = useState<Method>("ecpay");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readyToken, setReadyToken] = useState("");
  const [error, setError] = useState("");
  const payment = state?.payment;
  const token = payment?.method === "ecpay" ? payment.token : undefined;
  const selected = state?.methods.includes(method) ? method : state?.methods[0];

  useEffect(() => {
    let active = true;
    const options = new URLSearchParams(location.search);
    const returned = options.get("deposit") === "returned";
    const start = returned
      ? request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) })
      : request(endpoint);
    void start.then((response) => response.json())
      .then((result: Deposit) => { if (active) setState(result); })
      .catch((caught) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void loadHrThemeEcpay("Prod").then((sdk) => new Promise<void>((resolve, reject) => {
      if (!active) return resolve();
      sdk.initialize("Prod", 0, (initError) => {
        if (!active) return resolve();
        if (initError) return reject(Error(initError));
        sdk.createPayment(token, sdk.Language.zhTW, (sdkError) => sdkError ? reject(Error(sdkError)) : resolve(), "V2");
      });
    })).then(() => { if (active) setReadyToken(token); })
      .catch((caught) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [token]);

  async function run(body: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const response = await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.redirect) {
        window.location.assign(result.redirect);
        return;
      }
      setState((previous) => previous && { ...previous, ...result });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法確認保證金付款狀態");
      const response = await request(endpoint).catch(() => null);
      if (response) setState(await response.json());
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    const sdk = window.ECPay;
    if (!payment || !sdk || busy) return;
    setBusy(true);
    setError("");
    try {
      const payToken = await new Promise<string>((resolve, reject) => {
        sdk.getPayToken((info, sdkError) => {
          if (sdkError) return reject(Error(sdkError));
          if (info?.MerchantTradeNo !== payment.tradeNo || !info.PayToken) return reject(Error("綠界付款單已變更，請重新查詢"));
          resolve(info.PayToken);
        });
      });
      await run({ action: "submit", tradeNo: payment.tradeNo, payToken });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能取得綠界付款代碼");
    } finally {
      setBusy(false);
    }
  }

  function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !confirmed || busy) return;
    void run({ action: "start", method: selected, email });
  }

  if (paidAt || state?.paidAt) return <section className="space-y-2" aria-label="履約保證金">
    <p role="status">履約保證金 NT$1,000 已確認入帳。</p>
    <Link href="/collaboration/workspace" className="font-bold underline">前往 HR 工作台</Link>
  </section>;

  return <section className="space-y-4 rounded-xl border border-slate-300 p-4" aria-label="履約保證金">
    <h2 className="text-lg font-bold">履約保證金 NT$1,000</h2>
    <p>契約已簽署。付款確認後，系統會開通契約資格。</p>
    {error ? <p role="alert" className="text-rose-800">{error}</p> : null}
    {state && !state.methods.length && !payment ? <p role="status">目前付款服務尚未開放，請聯繫客服。</p> : null}
    {payment?.url ? <a href={payment.url} className={button}>開啟街口付款</a> : null}
    {payment?.method === "jkopay" && state?.methods.includes("jkopay") ? (
      <button type="button" className="ml-2 font-bold underline disabled:opacity-50" disabled={busy}
        onClick={() => void run({ action: "start", method: "jkopay" })}>更新街口付款連結</button>
    ) : null}
    {token ? <>
      <div id="ECPayPayment" />
      <button type="button" className={button} disabled={readyToken !== token || busy} onClick={() => void pay()}>確認綠界付款 NT$1,000</button>
    </> : null}
    {payment?.status === "processing" || payment?.status === "preparing" ? (
      <p role="status">付款狀態確認中，請勿重複繳款。</p>
    ) : null}
    {selected && (!payment || (payment.method === "ecpay" && payment.status === "ready")) ? (
      <form onSubmit={begin} className="space-y-3">
        <label className="block">付款方式
          <select className="ml-2 rounded border p-2" value={selected} disabled={busy} onChange={(event) => {
            setMethod(event.target.value as Method);
            setConfirmed(false);
          }}>
            {state?.methods.map((option) => <option value={option} key={option}>{names[option]}</option>)}
          </select>
        </label>
        {selected === "ecpay" ? <label className="block">付款電子郵件
          <input type="email" autoComplete="email" maxLength={100} required className="ml-2 rounded border p-2" value={email}
            onChange={(event) => setEmail(event.target.value)} />
        </label> : null}
        <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />確認繳交 NT$1,000 履約保證金</label>
        <button className={button} disabled={!confirmed || busy}>建立{names[selected]}付款</button>
      </form>
    ) : null}
    <button type="button" className="font-bold underline disabled:opacity-50" disabled={busy}
      onClick={() => void run({ action: "check" })}>查詢付款結果</button>
  </section>;
}
