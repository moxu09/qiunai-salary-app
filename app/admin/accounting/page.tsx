"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatTaipeiDateTime, getTaipeiMonthInput } from "@/lib/taipeiTime";

type AccountingRow = {
  id: string;
  occurred_at: string;
  category: string;
  subject: string;
  amount: number;
  cash_amount: number;
  revenue_amount: number;
  expense_amount: number;
  discount_amount: number;
  liability_amount: number;
  receivable_amount: number;
  payment_method: string;
  customer_id: string;
  customer_name: string;
  staff_id: string;
  staff_name: string;
  order_id: string;
  order_no: string;
  source: string;
  note: string;
};

type Summary = {
  cashIn: number;
  cashOut: number;
  revenue: number;
  expense: number;
  discount: number;
  liability: number;
  receivable: number;
  net: number;
};

const emptySummary: Summary = {
  cashIn: 0,
  cashOut: 0,
  revenue: 0,
  expense: 0,
  discount: 0,
  liability: 0,
  receivable: 0,
  net: 0,
};

function getCurrentMonth() {
  return getTaipeiMonthInput();
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value: string) {
  return formatTaipeiDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: AccountingRow[]) {
  const headers = [
    "日期",
    "類型",
    "會計分類",
    "金額",
    "現金流入",
    "現金流出",
    "收入",
    "支出",
    "折扣",
    "預收異動",
    "月結應收",
    "付款方式",
    "客人",
    "員工",
    "訂單編號",
    "來源",
    "備註",
  ];
  const lines = rows.map((row) =>
    [
      row.occurred_at,
      row.category,
      row.subject,
      row.amount,
      Math.max(0, row.cash_amount),
      Math.abs(Math.min(0, row.cash_amount)),
      row.revenue_amount,
      row.expense_amount,
      row.discount_amount,
      row.liability_amount,
      row.receivable_amount,
      row.payment_method,
      row.customer_name || row.customer_id,
      row.staff_name || row.staff_id,
      row.order_no || row.order_id,
      row.source,
      row.note,
    ]
      .map(csvCell)
      .join(",")
  );

  return "\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\n");
}

export default function AccountingPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [rows, setRows] = useState<AccountingRow[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [ledgerMissing, setLedgerMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReportEffect = useEffectEvent(loadReport);

  useEffect(() => {
    loadReportEffect();
  }, []);

  const displayedRows = useMemo(() => rows.slice(0, 1000), [rows]);

  async function loadReport() {
    setLoading(true);
    setError("");

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;

      if (!token) {
        window.location.href = "/admin-login";
        return;
      }

      const res = await fetch(`/api/qiunai/accounting?month=${month}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "讀取會計報表失敗");
      }

      setRows(payload.rows || []);
      setSummary(payload.summary || emptySummary);
      setLedgerMissing(Boolean(payload.ledgerMissing));
    } catch (err: unknown) {
      console.error("load accounting report error:", err);
      setError(err instanceof Error ? err.message : "讀取會計報表失敗");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([buildCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qiunai-accounting-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="admin-page min-h-screen bg-[#fff7fb] text-[#3f2947]">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="admin-page-header rounded-[32px] border border-pink-100 bg-white p-7">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold text-violet-300"
          >
            <ArrowLeft size={16} />
            返回後台
          </Link>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black text-violet-300">Accounting</p>
              <h1 className="mt-2 text-3xl font-black">會計報表</h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">
                匯整儲值預收、訂單收入、薪資獎金、月結應收與提領付款。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-300"
              />
              <button
                onClick={loadReport}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <RefreshCw size={16} />
                )}
                重新整理
              </button>
              <button
                onClick={exportCsv}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0f0b1f] disabled:opacity-40"
              >
                <Download size={16} />
                匯出 CSV
              </button>
            </div>
          </div>
        </header>

        {ledgerMissing ? (
          <div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-sm font-bold leading-7 text-amber-100">
            尚未建立 accounting_ledger
            資料表。報表會先用現有訂單與薪資資料產生；
            儲值、月結繳費等新流水要先到 Supabase SQL Editor 執行
            <span className="mx-1 rounded bg-white/10 px-2 py-1">
              supabase/accounting_ledger.sql
            </span>
            後才會開始進表。
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-rose-300/30 bg-rose-300/10 px-5 py-4 text-sm font-bold text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Stat title="現金流入" value={money(summary.cashIn)} />
          <Stat title="現金流出" value={money(summary.cashOut)} />
          <Stat title="認列收入" value={money(summary.revenue)} />
          <Stat title="薪資/費用" value={money(summary.expense)} />
          <Stat title="優惠折扣" value={money(summary.discount)} />
          <Stat title="預收款異動" value={money(summary.liability)} />
          <Stat title="月結應收" value={money(summary.receivable)} />
          <Stat title="估算淨額" value={money(summary.net)} />
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-black">明細</h2>
            <p className="text-xs font-bold text-zinc-400">
              {rows.length.toLocaleString("zh-TW")} 筆
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead className="bg-white/5 text-xs font-black text-zinc-400">
                <tr>
                  <Th>日期</Th>
                  <Th>類型</Th>
                  <Th>分類</Th>
                  <Th>金額</Th>
                  <Th>現金流</Th>
                  <Th>收入</Th>
                  <Th>支出</Th>
                  <Th>預收 / 應收</Th>
                  <Th>對象</Th>
                  <Th>訂單</Th>
                  <Th>備註</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-6 py-12 text-center font-bold text-zinc-400"
                    >
                      讀取中...
                    </td>
                  </tr>
                ) : displayedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-6 py-12 text-center font-bold text-zinc-400"
                    >
                      這個月份沒有資料
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <Td>{formatDateTime(row.occurred_at)}</Td>
                      <Td>
                        <p className="font-black text-white">{row.category}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {row.source}
                        </p>
                      </Td>
                      <Td>{row.subject || "-"}</Td>
                      <Td>{money(row.amount)}</Td>
                      <Td>
                        <p className="text-emerald-300">
                          入 {money(Math.max(0, row.cash_amount))}
                        </p>
                        <p className="text-rose-300">
                          出 {money(Math.abs(Math.min(0, row.cash_amount)))}
                        </p>
                      </Td>
                      <Td>{money(row.revenue_amount)}</Td>
                      <Td>{money(row.expense_amount)}</Td>
                      <Td>
                        <p>預收 {money(row.liability_amount)}</p>
                        <p>應收 {money(row.receivable_amount)}</p>
                      </Td>
                      <Td>
                        <p>{row.customer_name || row.customer_id || "-"}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {row.staff_name || row.staff_id || ""}
                        </p>
                      </Td>
                      <Td>{row.order_no || row.order_id || "-"}</Td>
                      <Td>{row.note || row.payment_method || "-"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-black text-zinc-500">{title}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-4 align-top font-semibold text-zinc-300">
      {children}
    </td>
  );
}
