"use client";

import { useState } from "react";
import { HR_CRYPTO_PAYOUT_TERMS } from "@/lib/hrCryptoPayout.mjs";

type Quote = {
  asset: string;
  grossTwd: string;
  feeTwd: string;
  netTwd: string;
  tokenAmount: string;
  rateTwd: string;
  source: string;
  updatedAt: string;
};

export default function HrCryptoPayoutQuote({ asset, endpoint, request }: {
  asset: string;
  endpoint: string;
  request: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function calculate() {
    if (busy || !asset || !/^[1-9][0-9]{0,14}$/.test(amount)) return;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const response = await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crypto-quote", asset, amountTwd: amount }),
      });
      setQuote((await response.json()).quote);
    } catch {
      setError("暫時無法取得即時匯率，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
    <p className="text-sm leading-relaxed text-slate-700">{HR_CRYPTO_PAYOUT_TERMS}</p>
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-bold">試算收款金額</summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">結算金額（NT$）
          <input value={amount} inputMode="numeric" maxLength={15} disabled={busy}
            onChange={(event) => { setAmount(event.target.value); setQuote(null); setError(""); }}
            className="mt-1 block w-44 rounded-lg border border-slate-300 p-2" />
        </label>
        <button type="button" onClick={() => void calculate()} disabled={busy || !asset || !/^[1-9][0-9]{0,14}$/.test(amount)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "查詢中…" : "以即時匯率試算"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-800" role="alert">{error}</p> : null}
      {quote ? <div className="mt-3 space-y-1 text-sm" role="status">
        <p>手續費 NT$ {quote.feeTwd}，扣除後 NT$ {quote.netTwd}</p>
        <p className="font-bold">預估實收 {quote.tokenAmount} {quote.asset}</p>
        <p className="text-slate-600">
          1 {quote.asset} ＝ NT$ {quote.rateTwd}，{quote.source} 行情更新於
          {" "}{new Date(quote.updatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
        </p>
      </div> : null}
    </details>
  </div>;
}
