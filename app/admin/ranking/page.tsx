"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";
import {
  dateTimeInputToTaipeiIso,
  getTaipeiDateTimeInput,
  getTaipeiMonthStartInput,
} from "@/lib/taipeiTime";

type Staff = {
  id: string;
  discord_id: string;
  discord_name: string | null;
  display_name: string | null;
  real_name: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
  commission_tier: string | null;
};

type SalaryOrder = {
  id: string;
  discord_id: string | null;
  staff_name: string | null;
  order_amount: number | null;
  staff_salary: number | null;
  bonus_amount: number | null;
  status: string | null;
  order_finished_at: string | null;
  paid_at: string | null;
  is_deleted: boolean | null;
};

type BonusItem = {
  id: string;
  discord_id: string;
  staff_name: string | null;
  title: string;
  amount: number;
  created_at: string;
};

type RankRow = {
  staff: Staff;
  orderCount: number;
  orderAmount: number;
  orderSalary: number;
  orderBonus: number;
  extraBonus: number;
  totalSalary: number;
  unpaidAmount: number;
};

export default function AdminRankingPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState("salary_desc");
  const [filter, setFilter] = useState({
    start: getMonthStartInput(),
    end: getNowInput(),
  });

  useEffect(() => {
    if (isAdmin) {
      loadAll();
    }
  }, [isAdmin]);

  const rows = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    let result: RankRow[] = staffList.map((staff) => {
      const staffOrders = orders.filter(
        (order) => order.discord_id === staff.discord_id
      );

      const staffBonuses = bonusList.filter(
        (bonus) => bonus.discord_id === staff.discord_id
      );

      const orderAmount = staffOrders.reduce(
        (sum, order) => sum + Number(order.order_amount || 0),
        0
      );

      const orderSalary = staffOrders.reduce(
        (sum, order) => sum + Number(order.staff_salary || 0),
        0
      );

      const orderBonus = staffOrders.reduce(
        (sum, order) => sum + Number(order.bonus_amount || 0),
        0
      );

      const extraBonus = staffBonuses.reduce(
        (sum, bonus) => sum + Number(bonus.amount || 0),
        0
      );

      const totalSalary = orderSalary + orderBonus + extraBonus;

      const unpaidAmount =
        staffOrders
          .filter((order) => order.status !== "已發薪")
          .reduce(
            (sum, order) =>
              sum +
              Number(order.staff_salary || 0) +
              Number(order.bonus_amount || 0),
            0
          ) + extraBonus;

      return {
        staff,
        orderCount: staffOrders.length,
        orderAmount,
        orderSalary,
        orderBonus,
        extraBonus,
        totalSalary,
        unpaidAmount,
      };
    });

    if (key) {
      result = result.filter((row) => {
        const text = [
          row.staff.discord_id,
          row.staff.discord_name,
          row.staff.display_name,
          row.staff.real_name,
          getStaffName(row.staff),
          getCommissionLabel(row.staff.commission_tier),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(key);
      });
    }

    if (sortMode === "salary_desc") {
      result.sort((a, b) => b.totalSalary - a.totalSalary);
    }

    if (sortMode === "salary_asc") {
      result.sort((a, b) => a.totalSalary - b.totalSalary);
    }

    if (sortMode === "order_amount_desc") {
      result.sort((a, b) => b.orderAmount - a.orderAmount);
    }

    if (sortMode === "order_amount_asc") {
      result.sort((a, b) => a.orderAmount - b.orderAmount);
    }

    if (sortMode === "order_count_desc") {
      result.sort((a, b) => b.orderCount - a.orderCount);
    }

    if (sortMode === "order_count_asc") {
      result.sort((a, b) => a.orderCount - b.orderCount);
    }

    return result;
  }, [staffList, orders, bonusList, keyword, sortMode]);

  const totals = useMemo(() => {
    return {
      staffCount: rows.length,
      orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
      totalSalary: rows.reduce((sum, row) => sum + row.totalSalary, 0),
      totalOrderAmount: rows.reduce((sum, row) => sum + row.orderAmount, 0),
    };
  }, [rows]);

  async function loadAll() {
    setLoading(true);

    const startIso = toIso(filter.start);
    const endIso = toIso(filter.end);

    let orderQuery = supabase
      .from("qiunai_salary_orders")
      .select(
        "id, discord_id, staff_name, order_amount, staff_salary, bonus_amount, status, order_finished_at, paid_at, is_deleted"
      )
      .or("is_deleted.eq.false,is_deleted.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) {
      orderQuery = orderQuery.gte("order_finished_at", startIso);
    }

    if (endIso) {
      orderQuery = orderQuery.lte("order_finished_at", endIso);
    }

    let bonusQuery = supabase
      .from("qiunai_staff_bonus")
      .select("id, discord_id, staff_name, title, amount, created_at")
      .order("created_at", { ascending: false });

    if (startIso) {
      bonusQuery = bonusQuery.gte("created_at", startIso);
    }

    if (endIso) {
      bonusQuery = bonusQuery.lte("created_at", endIso);
    }

    const [staffRes, orderRes, bonusRes] = await Promise.all([
      supabase
        .from("qiunai_staff")
        .select(
          "id, discord_id, discord_name, display_name, real_name, avatar_url, is_active, is_online, commission_tier"
        )
        .eq("is_active", true)
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
      console.error("讀取薪資訂單失敗:", orderRes.error);
      alert("讀取薪資訂單失敗");
      return;
    }

    if (bonusRes.error) {
      console.error("讀取獎金失敗:", bonusRes.error);
      alert("讀取獎金失敗");
      return;
    }

    setStaffList((staffRes.data || []) as Staff[]);
    setOrders((orderRes.data || []) as SalaryOrder[]);
    setBonusList((bonusRes.data || []) as BonusItem[]);
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200"
            >
              <ArrowLeft size={16} />
              回管理後台
            </Link>

            <p className="text-sm text-violet-300">Qiunai Admin</p>
            <h1 className="text-2xl font-bold">秋奈電競｜排行榜</h1>
          </div>

          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            重新整理
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">排行榜時間範圍</h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <Input
              label="開始時間"
              type="datetime-local"
              value={filter.start}
              onChange={(value) =>
                setFilter((prev) => ({ ...prev, start: value }))
              }
            />

            <Input
              label="結束時間"
              type="datetime-local"
              value={filter.end}
              onChange={(value) =>
                setFilter((prev) => ({ ...prev, end: value }))
              }
            />

            <label className="block">
              <span className="text-sm text-zinc-300">排序</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
              >
                <option value="salary_desc">薪水降冪：高到低</option>
                <option value="salary_asc">薪水升冪：低到高</option>
                <option value="order_amount_desc">接單金額降冪</option>
                <option value="order_amount_asc">接單金額升冪</option>
                <option value="order_count_desc">訂單數降冪</option>
                <option value="order_count_asc">訂單數升冪</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">搜尋陪陪</span>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <Search size={16} className="text-violet-300" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="名字 / Discord ID"
                  className="w-full bg-transparent text-white outline-none placeholder:text-zinc-600"
                />
              </div>
            </label>

            <button
              onClick={loadAll}
              disabled={loading}
              className="mt-6 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400 disabled:opacity-60"
            >
              套用查詢
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat title="顯示陪陪" value={`${totals.staffCount} 人`} />
          <Stat title="訂單數" value={`${totals.orderCount} 筆`} />
          <Stat
            title="接單金額"
            value={`$${totals.totalOrderAmount.toLocaleString()}`}
          />
          <Stat
            title="薪水總額"
            value={`$${totals.totalSalary.toLocaleString()}`}
          />
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">載入中...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              目前沒有排行榜資料
            </div>
          ) : (
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">排名</th>
                  <th className="px-4 py-3">陪陪</th>
                  <th className="px-4 py-3">檔位</th>
                  <th className="px-4 py-3">訂單數</th>
                  <th className="px-4 py-3">接單金額</th>
                  <th className="px-4 py-3">訂單薪資</th>
                  <th className="px-4 py-3">訂單獎金</th>
                  <th className="px-4 py-3">額外獎金</th>
                  <th className="px-4 py-3">總薪水</th>
                  <th className="px-4 py-3">未發薪</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.staff.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-violet-500/20 px-2 font-bold text-violet-200">
                        {index + 1}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.staff.avatar_url ? (
                          <img
                            src={row.staff.avatar_url}
                            alt=""
                            className="h-10 w-10 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-200">
                            <UserRound size={20} />
                          </div>
                        )}

                        <div>
                          <p className="font-bold">{getStaffName(row.staff)}</p>
                          <p className="text-xs text-zinc-500">
                            {row.staff.discord_id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {getCommissionLabel(row.staff.commission_tier)}
                    </td>

                    <td className="px-4 py-3">{row.orderCount} 筆</td>

                    <td className="px-4 py-3">
                      ${row.orderAmount.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-violet-300">
                      ${row.orderSalary.toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      ${row.orderBonus.toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      ${row.extraBonus.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-lg font-black text-violet-200">
                      ${row.totalSalary.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-yellow-300">
                      ${row.unpaidAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>

      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
      />
    </label>
  );
}

function getStaffName(staff: Staff) {
  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id
  );
}

function getCommissionLabel(value: string | null) {
  if (value === "rate_80") return "80%";
  if (value === "rate_85") return "85%";
  if (value === "rate_90") return "90%";
  if (value === "manager_95") return "95% 主管";
  return "自動";
}

function getNowInput() {
  return getTaipeiDateTimeInput();
}

function getMonthStartInput() {
  return `${getTaipeiMonthStartInput()}T00:00`;
}

function toIso(value: string) {
  if (!value) return null;
  return dateTimeInputToTaipeiIso(value);
}
