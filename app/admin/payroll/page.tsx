"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clipboard,
  RefreshCw,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

type Staff = {
  id: string;
  discord_id: string;
  discord_name: string | null;
  display_name: string | null;
  real_name: string | null;
  bank_name: string | null;
  bank_account: string | null;
  is_active: boolean | null;
};

type SalaryOrder = {
  id: string;
  discord_id: string | null;
  staff_name: string | null;
  staff_salary: number | null;
  bonus_amount: number | null;
  status: string | null;
  order_finished_at: string | null;
  is_deleted: boolean | null;
};

type BonusItem = {
  id: string;
  discord_id: string;
  staff_name: string | null;
  title: string;
  amount: number;
  note: string | null;
  created_at: string;
};

type PayrollRow = {
  discordId: string;
  staffName: string;
  accountName: string;
  bankName: string;
  bankAccount: string;
  salary: number;
  bonus: number;
  total: number;
  orderCount: number;
  bonusCount: number;
};

export default function AdminPayrollPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState({
    start: getMonthStartInput(),
    end: getNowInput(),
  });

  useEffect(() => {
    if (isAdmin) {
      loadPayrollData();
    }
  }, [isAdmin]);

  const rows = useMemo(() => {
    const staffMap = new Map<string, Staff>();

    for (const staff of staffList) {
      if (staff.discord_id) {
        staffMap.set(staff.discord_id, staff);
      }
    }

    const rowMap = new Map<string, PayrollRow>();

    function ensureRow(discordId: string, fallbackName?: string | null) {
      const staff = staffMap.get(discordId);
      const existing = rowMap.get(discordId);

      if (existing) return existing;

      const row: PayrollRow = {
        discordId,
        staffName: getStaffName(staff, fallbackName),
        accountName: getAccountName(staff, fallbackName),
        bankName: staff?.bank_name || "",
        bankAccount: staff?.bank_account || "",
        salary: 0,
        bonus: 0,
        total: 0,
        orderCount: 0,
        bonusCount: 0,
      };

      rowMap.set(discordId, row);
      return row;
    }

    for (const order of orders) {
      const discordId = String(order.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, order.staff_name);
      row.salary += Number(order.staff_salary || 0);
      row.bonus += Number(order.bonus_amount || 0);
      row.orderCount += 1;
    }

    for (const bonus of bonusList) {
      const discordId = String(bonus.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, bonus.staff_name);
      row.bonus += Number(bonus.amount || 0);
      row.bonusCount += 1;
    }

    let result = Array.from(rowMap.values())
      .map((row) => ({
        ...row,
        total: row.salary + row.bonus,
      }))
      .filter((row) => row.total > 0);

    const key = keyword.trim().toLowerCase();

    if (key) {
      result = result.filter((row) =>
        [
          row.discordId,
          row.staffName,
          row.accountName,
          row.bankName,
          row.bankAccount,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(key)
      );
    }

    return result.sort((a, b) => b.total - a.total);
  }, [staffList, orders, bonusList, keyword]);

  const totals = useMemo(() => {
    return {
      staffCount: rows.length,
      salary: rows.reduce((sum, row) => sum + row.salary, 0),
      bonus: rows.reduce((sum, row) => sum + row.bonus, 0),
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }, [rows]);

  async function loadPayrollData() {
    setLoading(true);

    const startIso = toIso(filter.start);
    const endIso = toIsoEnd(filter.end);

    let orderQuery = supabase
      .from("qiunai_salary_orders")
      .select(
        "id, discord_id, staff_name, staff_salary, bonus_amount, status, order_finished_at, is_deleted"
      )
      .or("is_deleted.eq.false,is_deleted.is.null")
      .or("status.neq.已發薪,status.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) orderQuery = orderQuery.gte("order_finished_at", startIso);
    if (endIso) orderQuery = orderQuery.lte("order_finished_at", endIso);

    let bonusQuery = supabase
      .from("qiunai_staff_bonus")
      .select("id, discord_id, staff_name, title, amount, note, created_at")
      .order("created_at", { ascending: false });

    if (startIso) bonusQuery = bonusQuery.gte("created_at", startIso);
    if (endIso) bonusQuery = bonusQuery.lte("created_at", endIso);

    const [staffRes, orderRes, bonusRes] = await Promise.all([
      supabase
        .from("qiunai_staff")
        .select(
          "id, discord_id, discord_name, display_name, real_name, bank_name, bank_account, is_active"
        )
        .order("created_at", { ascending: false }),
      orderQuery,
      bonusQuery,
    ]);

    setLoading(false);

    if (staffRes.error) {
      console.error("讀取員工失敗:", staffRes.error);
      alert("讀取員工失敗");
      return;
    }

    if (orderRes.error) {
      console.error("讀取待發薪訂單失敗:", orderRes.error);
      alert("讀取待發薪訂單失敗");
      return;
    }

    if (bonusRes.error) {
      console.error("讀取獎金失敗:", bonusRes.error);
      alert("讀取獎金 / 扣除失敗");
      return;
    }

    setStaffList((staffRes.data || []) as Staff[]);
    setOrders((orderRes.data || []) as SalaryOrder[]);
    setBonusList((bonusRes.data || []) as BonusItem[]);
  }

  async function copyPayrollList() {
    if (!rows.length) {
      alert("目前沒有可複製的發薪資料");
      return;
    }

    await navigator.clipboard.writeText(buildCopyText(rows));
    alert("已複製發薪清單");
  }

  if (adminLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
        <p className="text-sm text-zinc-300">檢查後台權限中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white">
      <header className="border-b border-white/10 bg-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200"
            >
              <ArrowLeft size={16} />
              回管理後台
            </Link>

            <p className="text-sm text-violet-300">Qiunai Payroll</p>
            <h1 className="text-2xl font-bold">秋奈電競｜發薪模式</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={copyPayrollList}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10"
            >
              <Clipboard size={16} />
              複製清單
            </button>

            <button
              onClick={loadPayrollData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              重新整理
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="待發人數" value={`${totals.staffCount} 人`} />
          <Stat title="薪水" value={money(totals.salary)} />
          <Stat title="獎金 / 扣除" value={money(totals.bonus)} />
          <Stat title="應發總額" value={money(totals.total)} />
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="開始日期">
              <input
                type="date"
                value={filter.start}
                onChange={(event) =>
                  setFilter((prev) => ({ ...prev, start: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"
              />
            </Field>

            <Field label="結束日期">
              <input
                type="date"
                value={filter.end}
                onChange={(event) =>
                  setFilter((prev) => ({ ...prev, end: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"
              />
            </Field>

            <Field label="搜尋">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <Search size={16} className="text-violet-300" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="姓名、銀行、帳號"
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-500"
                />
              </div>
            </Field>

            <div className="flex items-end">
              <button
                onClick={loadPayrollData}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-60"
              >
                <CalendarDays size={16} />
                查詢
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Banknote size={20} className="text-violet-300" />
              待發薪清單
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              只顯示指定區間內應發金額大於 0 的員工。
            </p>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-400">
              讀取中...
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-400">
              目前沒有需要發薪的員工
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-white/5 text-zinc-300">
                  <tr>
                    <th className="px-4 py-3">名字</th>
                    <th className="px-4 py-3">銀行</th>
                    <th className="px-4 py-3">帳號</th>
                    <th className="px-4 py-3">戶名</th>
                    <th className="px-4 py-3">薪水</th>
                    <th className="px-4 py-3">獎金 / 扣除</th>
                    <th className="px-4 py-3">應發</th>
                    <th className="px-4 py-3">筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.discordId} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{row.staffName}</p>
                        <p className="text-xs text-zinc-500">{row.discordId}</p>
                      </td>
                      <td className="px-4 py-3">{row.bankName || "-"}</td>
                      <td className="px-4 py-3">{row.bankAccount || "-"}</td>
                      <td className="px-4 py-3">{row.accountName}</td>
                      <td className="px-4 py-3">{money(row.salary)}</td>
                      <td
                        className={`px-4 py-3 ${
                          row.bonus < 0 ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {money(row.bonus)}
                      </td>
                      <td className="px-4 py-3 font-bold text-violet-200">
                        {money(row.total)}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {row.orderCount} 單 / {row.bonusCount} 筆
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function getNowInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function getMonthStartInput() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = start.getTimezoneOffset();
  const local = new Date(start.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function toIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

function toIsoEnd(value: string) {
  if (!value) return null;
  return new Date(`${value}T23:59:59`).toISOString();
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function getStaffName(staff?: Staff | null, fallback?: string | null) {
  return (
    staff?.display_name ||
    staff?.real_name ||
    staff?.discord_name ||
    fallback ||
    staff?.discord_id ||
    "未知員工"
  );
}

function getAccountName(staff?: Staff | null, fallback?: string | null) {
  return staff?.real_name || staff?.display_name || fallback || "-";
}

function buildCopyText(rows: PayrollRow[]) {
  return rows
    .map((row, index) => {
      return [
        `${index + 1}. ${row.staffName}`,
        `戶名：${row.accountName}`,
        `銀行：${row.bankName || "-"}`,
        `帳號：${row.bankAccount || "-"}`,
        `薪水：${money(row.salary)}`,
        `獎金/扣除：${money(row.bonus)}`,
        `應發：${money(row.total)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-violet-300">{title}</p>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-zinc-300">
        {label}
      </span>
      {children}
    </label>
  );
}
