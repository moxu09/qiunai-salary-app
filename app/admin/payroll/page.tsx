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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

const SALARY_WALLET_START_DATE =
  process.env.NEXT_PUBLIC_SALARY_WALLET_START_DATE || "2026-07-17";
const SALARY_WALLET_START_ISO = new Date(
  `${SALARY_WALLET_START_DATE}T00:00:00+08:00`
).toISOString();
const PAYROLL_WALLET_FILTER =
  `wallet_settled_at.is.null,wallet_settled_at.lt.${SALARY_WALLET_START_ISO}`;

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
  service_name: string | null;
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
  orderSalary: number;
  tipSalary: number;
  bonus: number;
  deduction: number;
  total: number;
  orderCount: number;
  tipCount: number;
  bonusCount: number;
  deductionCount: number;
  recordCount: number;
};

type WithdrawRequest = {
  id: string;
  discord_id: string;
  staff_name?: string | null;
  amount: number | string;
  status: string;
  reject_reason?: string | null;
  reviewed_at?: string | null;
  requested_at?: string | null;
};

export default function AdminPayrollPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [keyword, setKeyword] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
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
        orderSalary: 0,
        tipSalary: 0,
        bonus: 0,
        deduction: 0,
        total: 0,
        orderCount: 0,
        tipCount: 0,
        bonusCount: 0,
        deductionCount: 0,
        recordCount: 0,
      };

      rowMap.set(discordId, row);
      return row;
    }

    for (const order of orders) {
      const discordId = String(order.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, order.staff_name);
      const salary = Number(order.staff_salary || 0);

      if (isTipOrder(order)) {
        row.tipSalary += salary;
        row.tipCount += 1;
      } else {
        row.orderSalary += salary;
        row.orderCount += 1;
      }

      addBonusOrDeduction(row, order.bonus_amount);
    }

    for (const bonus of bonusList) {
      const discordId = String(bonus.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, bonus.staff_name);
      addBonusOrDeduction(row, bonus.amount);
    }

    let result = Array.from(rowMap.values())
      .map((row) => ({
        ...row,
        total: row.orderSalary + row.tipSalary + row.bonus - row.deduction,
        recordCount:
          row.orderCount + row.tipCount + row.bonusCount + row.deductionCount,
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
      orderSalary: rows.reduce((sum, row) => sum + row.orderSalary, 0),
      tipSalary: rows.reduce((sum, row) => sum + row.tipSalary, 0),
      bonus: rows.reduce((sum, row) => sum + row.bonus, 0),
      deduction: rows.reduce((sum, row) => sum + row.deduction, 0),
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }, [rows]);

  async function loadPayrollData() {
    setLoading(true);
    await loadWithdrawRequests();

    const startIso = toIso(filter.start);
    const endIso = toIsoEnd(filter.end);

    let orderQuery = supabase
      .from("qiunai_salary_orders")
      .select(
        "id, discord_id, staff_name, service_name, staff_salary, bonus_amount, status, order_finished_at, is_deleted, wallet_settled_at"
      )
      .or("is_deleted.eq.false,is_deleted.is.null")
      .or(PAYROLL_WALLET_FILTER)
      .or("status.neq.已發薪,status.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) orderQuery = orderQuery.gte("order_finished_at", startIso);
    if (endIso) orderQuery = orderQuery.lte("order_finished_at", endIso);

    let bonusQuery = supabase
      .from("qiunai_staff_bonus")
      .select("id, discord_id, staff_name, title, amount, note, created_at")
      .or(PAYROLL_WALLET_FILTER)
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

  async function loadWithdrawRequests() {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) return;

      const res = await fetch("/api/qiunai/salary-wallet/admin", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "讀取提領申請失敗");
      }

      setWithdrawRequests((payload.requests || []) as WithdrawRequest[]);
    } catch (error) {
      console.error("讀取提領申請失敗:", error);
      alert(error instanceof Error ? error.message : "讀取提領申請失敗");
    }
  }

  async function reviewWithdrawRequest(id: string, action: "approve" | "reject") {
    const reason =
      action === "reject"
        ? window.prompt("請輸入駁回理由")
        : "";

    if (action === "reject" && !reason?.trim()) {
      return;
    }

    setReviewingId(id);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        throw new Error("請重新登入");
      }

      const res = await fetch("/api/qiunai/salary-wallet/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id,
          action,
          reason,
        }),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "更新提領申請失敗");
      }

      await loadWithdrawRequests();
    } catch (error) {
      console.error("更新提領申請失敗:", error);
      alert(error instanceof Error ? error.message : "更新提領申請失敗");
    } finally {
      setReviewingId(null);
    }
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
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Stat title="待發人數" value={`${totals.staffCount} 人`} />
          <Stat title="訂單薪水" value={money(totals.orderSalary)} />
          <Stat title="打賞薪水" value={money(totals.tipSalary)} />
          <Stat title="獎金" value={money(totals.bonus)} />
          <Stat title="扣除" value={money(totals.deduction)} />
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
              薪資錢包提領申請
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              員工按下提領後會出現在這裡；同意後員工端會顯示申請成功，駁回會顯示理由。
            </p>
          </div>

          {withdrawRequests.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-400">
              目前沒有提領申請
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-white/5 text-zinc-300">
                  <tr>
                    <th className="px-4 py-3">申請時間</th>
                    <th className="px-4 py-3">員工</th>
                    <th className="px-4 py-3">金額</th>
                    <th className="px-4 py-3">狀態</th>
                    <th className="px-4 py-3">審核時間</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawRequests.map((request) => (
                    <tr key={request.id} className="border-t border-white/10">
                      <td className="px-4 py-3 text-zinc-300">
                        {formatDateTime(request.requested_at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">
                          {request.staff_name || request.discord_id}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {request.discord_id}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-bold text-violet-200">
                        {money(request.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getRequestStatusClass(
                            request.status
                          )}`}
                        >
                          {getRequestStatusText(
                            request.status,
                            request.reject_reason
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {formatDateTime(request.reviewed_at)}
                      </td>
                      <td className="px-4 py-3">
                        {request.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                reviewWithdrawRequest(request.id, "approve")
                              }
                              disabled={reviewingId === request.id}
                              className="inline-flex items-center gap-1 rounded-2xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-60"
                            >
                              <CheckCircle2 size={14} />
                              同意
                            </button>
                            <button
                              onClick={() =>
                                reviewWithdrawRequest(request.id, "reject")
                              }
                              disabled={reviewingId === request.id}
                              className="inline-flex items-center gap-1 rounded-2xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-400 disabled:opacity-60"
                            >
                              <XCircle size={14} />
                              駁回
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-white/5 text-zinc-300">
                  <tr>
                    <th className="px-4 py-3">名字</th>
                    <th className="px-4 py-3">銀行</th>
                    <th className="px-4 py-3">帳號</th>
                    <th className="px-4 py-3">戶名</th>
                    <th className="px-4 py-3">訂單薪水</th>
                    <th className="px-4 py-3">打賞薪水</th>
                    <th className="px-4 py-3">獎金</th>
                    <th className="px-4 py-3">扣除</th>
                    <th className="px-4 py-3">應發總額</th>
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
                      <td className="px-4 py-3">{money(row.orderSalary)}</td>
                      <td className="px-4 py-3">{money(row.tipSalary)}</td>
                      <td className="px-4 py-3 text-emerald-300">
                        {money(row.bonus)}
                      </td>
                      <td className="px-4 py-3 text-rose-300">
                        {money(row.deduction)}
                      </td>
                      <td className="px-4 py-3 font-bold text-violet-200">
                        {money(row.total)}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        <p className="font-bold text-zinc-200">
                          {row.recordCount}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {row.orderCount} 單 / {row.tipCount} 賞 /{" "}
                          {row.bonusCount + row.deductionCount} 獎扣
                        </p>
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRequestStatusText(status: string, rejectReason?: string | null) {
  if (status === "pending") return "申請中";
  if (status === "approved") return "申請成功，請稍等三個工作日";
  if (status === "rejected") return `申請遭駁回${rejectReason ? `：${rejectReason}` : ""}`;
  return status || "-";
}

function getRequestStatusClass(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-700";
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-zinc-100 text-zinc-600";
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

function isTipOrder(order: SalaryOrder) {
  return String(order.service_name || "").includes("打賞");
}

function addBonusOrDeduction(
  row: PayrollRow,
  value: number | string | null | undefined
) {
  const amount = Number(value || 0);

  if (amount > 0) {
    row.bonus += amount;
    row.bonusCount += 1;
  } else if (amount < 0) {
    row.deduction += Math.abs(amount);
    row.deductionCount += 1;
  }
}

function buildCopyText(rows: PayrollRow[]) {
  return rows
    .map((row, index) => {
      return [
        `${index + 1}. ${row.staffName}`,
        `戶名：${row.accountName}`,
        `銀行：${row.bankName || "-"}`,
        `帳號：${row.bankAccount || "-"}`,
        `訂單薪水：${money(row.orderSalary)}`,
        `打賞薪水：${money(row.tipSalary)}`,
        `獎金：${money(row.bonus)}`,
        `扣除：${money(row.deduction)}`,
        `應發總額：${money(row.total)}`,
        `筆數：${row.recordCount}`,
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
