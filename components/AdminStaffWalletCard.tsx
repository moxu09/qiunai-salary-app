"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";

type WalletEntry = {
  id: string;
  entry_type?: string | null;
  amount?: number | null;
  source_label?: string | null;
  settlement_date?: string | null;
  created_at?: string | null;
};

type WithdrawRequest = {
  id: string;
  amount?: number | null;
  payout_amount?: number | null;
  destination?: "bank" | "asd" | null;
  status?: string | null;
  requested_at?: string | null;
};

type WalletSummary = {
  totals: {
    orderSalary: number;
    bonus: number;
    deposited: number;
    approvedWithdrawn: number;
    pendingWithdrawn: number;
    balance: number;
    available: number;
  };
  entries?: WalletEntry[];
  requests?: WithdrawRequest[];
};

function money(value?: number | null) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function entryTypeLabel(value?: string | null) {
  if (value === "order_salary") return "訂單薪資";
  if (value === "order_bonus") return "訂單獎金";
  if (value === "staff_bonus") return "員工獎金";
  return "錢包入帳";
}

function requestStatusLabel(value?: string | null) {
  if (value === "approved") return "已通過";
  if (value === "rejected") return "已駁回";
  return "待審核";
}

export default function AdminStaffWalletCard({
  discordId,
  staffName,
  apiPath,
}: {
  discordId: string;
  staffName: string;
  apiPath: string;
}) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("登入已過期，請重新登入");

      const response = await fetch(
        `${apiPath}?discordId=${encodeURIComponent(discordId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "讀取陪陪錢包失敗");
      }

      setWallet(payload.wallet as WalletSummary);
    } catch (loadError) {
      setWallet(null);
      setError(
        loadError instanceof Error ? loadError.message : "讀取陪陪錢包失敗",
      );
    } finally {
      setLoading(false);
    }
  }, [apiPath, discordId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWallet(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWallet]);

  return (
    <section className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-black text-emerald-900">
            <WalletCards size={20} />
            陪陪錢包
          </h3>
          <p className="mt-1 text-sm text-emerald-700">
            {staffName}｜Discord ID：{discordId}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWallet()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          重新整理錢包
        </button>
      </div>

      {loading && !wallet ? (
        <p className="mt-5 text-sm font-semibold text-emerald-700">
          讀取陪陪錢包中...
        </p>
      ) : error ? (
        <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : wallet ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WalletStat title="錢包餘額" value={money(wallet.totals.balance)} />
            <WalletStat
              title="目前可提領"
              value={money(wallet.totals.available)}
            />
            <WalletStat
              title="累積入帳"
              value={money(wallet.totals.deposited)}
            />
            <WalletStat
              title="待審核提領"
              value={money(wallet.totals.pendingWithdrawn)}
            />
            <WalletStat
              title="訂單薪資"
              value={money(wallet.totals.orderSalary)}
            />
            <WalletStat title="獎金" value={money(wallet.totals.bonus)} />
            <WalletStat
              title="已核准提領"
              value={money(wallet.totals.approvedWithdrawn)}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <WalletList title="最近入帳紀錄">
              {(wallet.entries || []).slice(0, 8).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 border-b border-emerald-100 py-3 last:border-none"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">
                      {entry.source_label || entryTypeLabel(entry.entry_type)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {entryTypeLabel(entry.entry_type)}｜{" "}
                      {formatDate(entry.created_at || entry.settlement_date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-black text-emerald-700">
                    +{money(entry.amount)}
                  </span>
                </li>
              ))}
              {!wallet.entries?.length ? (
                <li className="py-4 text-sm text-slate-500">目前沒有入帳紀錄</li>
              ) : null}
            </WalletList>

            <WalletList title="最近提領紀錄">
              {(wallet.requests || []).slice(0, 8).map((request) => (
                <li
                  key={request.id}
                  className="flex items-start justify-between gap-4 border-b border-emerald-100 py-3 last:border-none"
                >
                  <span>
                    <span className="block text-sm font-bold text-slate-800">
                      {request.destination === "asd"
                        ? "已轉入本人 ASD"
                        : requestStatusLabel(request.status)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {formatDate(request.requested_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black text-slate-800">
                      {money(request.amount)}
                    </span>
                    {request.status === "approved" ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        {request.destination === "asd" ? "轉入" : "實付"}{" "}
                        {money(request.payout_amount)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
              {!wallet.requests?.length ? (
                <li className="py-4 text-sm text-slate-500">目前沒有提領紀錄</li>
              ) : null}
            </WalletList>
          </div>
        </>
      ) : null}
    </section>
  );
}

function WalletStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
      <p className="text-xs font-bold text-emerald-700">{title}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function WalletList({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4">
      <h4 className="font-black text-slate-900">{title}</h4>
      <ul className="mt-2">{children}</ul>
    </div>
  );
}
