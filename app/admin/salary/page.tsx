"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Gift,
  Plus,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

type Staff = {
  id: string;
  discord_id: string;
  discord_name: string | null;
  display_name: string | null;
  real_name: string | null;
  is_active: boolean;
};

type SalaryOrder = {
  id: string;
  order_id: string | null;
  discord_id: string;
  staff_name: string | null;
  customer_name: string | null;
  service_name: string | null;
  order_amount: number | null;
  staff_salary: number | null;
  bonus_amount: number | null;
  platform_income: number | null;
  platform_expense: number | null;
  status: string | null;
  paid_at: string | null;
  order_finished_at: string | null;
  created_at: string;
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

export default function AdminSalaryPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // 查詢預設：本月初～現在
  const [filter, setFilter] = useState({
    start: getMonthStartInput(),
    end: getNowInput(),
  });

  // 新增訂單預設：現在
  const [orderForm, setOrderForm] = useState({
    discord_id: "",
    customer_name: "",
    service_name: "",
    order_amount: "",
    staff_salary: "",
    bonus_amount: "0",
    order_finished_at: getNowInput(),
  });

  // 新增獎金預設：現在
  const [bonusForm, setBonusForm] = useState({
    discord_id: "",
    title: "",
    amount: "",
    note: "",
    created_at: getNowInput(),
  });

  // 發薪預設：上個月整個月，發薪時間現在
  const [payForm, setPayForm] = useState({
    discord_id: "all",
    start: getPreviousMonthStartInput(),
    end: getPreviousMonthEndInput(),
    paid_at: getNowInput(),
  });

  useEffect(() => {
    if (isAdmin) {
      loadAll();
    }
  }, [isAdmin]);

  const totals = useMemo(() => {
    const totalIncome = orders.reduce(
      (sum, order) =>
        sum + Number(order.platform_income || order.order_amount || 0),
      0
    );

    const orderExpense = orders.reduce((sum, order) => {
      const expense =
        Number(order.platform_expense || 0) ||
        Number(order.staff_salary || 0) + Number(order.bonus_amount || 0);

      return sum + expense;
    }, 0);

    const extraBonusTotal = bonusList.reduce(
      (sum, bonus) => sum + Number(bonus.amount || 0),
      0
    );

    const totalExpense = orderExpense + extraBonusTotal;

    const totalSalary = orders.reduce(
      (sum, order) => sum + Number(order.staff_salary || 0),
      0
    );

    const orderBonus = orders.reduce(
      (sum, order) => sum + Number(order.bonus_amount || 0),
      0
    );

    const totalBonus = orderBonus + extraBonusTotal;

    const unpaidCount = orders.filter(
      (order) => order.status !== "已發薪"
    ).length;

    return {
      totalIncome,
      totalExpense,
      profit: totalIncome - totalExpense,
      totalSalary,
      totalBonus,
      unpaidCount,
      orderCount: orders.length,
      bonusCount: bonusList.length,
    };
  }, [orders, bonusList]);

  async function loadAll() {
    setLoading(true);

    const startIso = toIso(filter.start);
    const endIso = toIso(filter.end);

    let orderQuery = supabase
      .from("qiunai_salary_orders")
      .select("*")
      .order("order_finished_at", { ascending: false });

    if (startIso) {
      orderQuery = orderQuery.gte("order_finished_at", startIso);
    }

    if (endIso) {
      orderQuery = orderQuery.lte("order_finished_at", endIso);
    }

    const { data: orderData, error: orderError } = await orderQuery;

    if (orderError) {
      console.error("讀取薪資訂單失敗:", orderError);
      alert("讀取薪資訂單失敗");
    }

    let bonusQuery = supabase
      .from("qiunai_staff_bonus")
      .select("*")
      .order("created_at", { ascending: false });

    if (startIso) {
      bonusQuery = bonusQuery.gte("created_at", startIso);
    }

    if (endIso) {
      bonusQuery = bonusQuery.lte("created_at", endIso);
    }

    const { data: bonusData, error: bonusError } = await bonusQuery;

    if (bonusError) {
      console.error("讀取獎金失敗:", bonusError);
      alert("讀取獎金失敗");
    }

    const { data: staffData, error: staffError } = await supabase
      .from("qiunai_staff")
      .select("id, discord_id, discord_name, display_name, real_name, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (staffError) {
      console.error("讀取員工資料失敗:", staffError);
      alert("讀取員工資料失敗");
    }

    setOrders((orderData || []) as SalaryOrder[]);
    setBonusList((bonusData || []) as BonusItem[]);
    setStaffList((staffData || []) as Staff[]);
    setLoading(false);
  }

  function getStaffNameByDiscordId(discordId: string) {
    const staff = staffList.find((item) => item.discord_id === discordId);

    return (
      staff?.display_name ||
      staff?.real_name ||
      staff?.discord_name ||
      discordId
    );
  }

  async function addOrder() {
    if (!orderForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    if (!orderForm.service_name.trim()) {
      alert("請輸入服務項目");
      return;
    }

    const orderAmount = Number(orderForm.order_amount);
    const staffSalary = Number(orderForm.staff_salary);
    const bonusAmount = Number(orderForm.bonus_amount || 0);

    if (!orderAmount || orderAmount <= 0) {
      alert("請輸入正確訂單金額");
      return;
    }

    if (Number.isNaN(staffSalary) || staffSalary < 0) {
      alert("請輸入正確員工薪資");
      return;
    }

    if (Number.isNaN(bonusAmount) || bonusAmount < 0) {
      alert("請輸入正確訂單獎金");
      return;
    }

    const finishedAt =
      toIso(orderForm.order_finished_at) || new Date().toISOString();

    const staffName = getStaffNameByDiscordId(orderForm.discord_id);

    const { error } = await supabase.from("qiunai_salary_orders").insert({
      order_id: `MANUAL-${Date.now()}`,
      discord_id: orderForm.discord_id,
      staff_name: staffName,
      customer_name: orderForm.customer_name || null,
      service_name: orderForm.service_name,
      order_amount: orderAmount,
      staff_salary: staffSalary,
      bonus_amount: bonusAmount,
      platform_income: orderAmount,
      platform_expense: staffSalary + bonusAmount,
      status: "未發薪",
      order_finished_at: finishedAt,
    });

    if (error) {
      console.error("新增訂單失敗:", error);
      alert("新增訂單失敗");
      return;
    }

    setOrderForm({
      discord_id: "",
      customer_name: "",
      service_name: "",
      order_amount: "",
      staff_salary: "",
      bonus_amount: "0",
      order_finished_at: getNowInput(),
    });

    alert("訂單已新增");
    await loadAll();
  }

  async function addBonus() {
    if (!bonusForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    if (!bonusForm.title.trim()) {
      alert("請輸入獎金名稱");
      return;
    }

    const amount = Number(bonusForm.amount);

    if (!amount || amount <= 0) {
      alert("請輸入正確獎金金額");
      return;
    }

    const staffName = getStaffNameByDiscordId(bonusForm.discord_id);
    const createdAt = toIso(bonusForm.created_at) || new Date().toISOString();

    const { error } = await supabase.from("qiunai_staff_bonus").insert({
      discord_id: bonusForm.discord_id,
      staff_name: staffName,
      title: bonusForm.title.trim(),
      amount,
      note: bonusForm.note || null,
      created_at: createdAt,
    });

    if (error) {
      console.error("新增獎金失敗:", error);
      alert("新增獎金失敗");
      return;
    }

    setBonusForm({
      discord_id: "",
      title: "",
      amount: "",
      note: "",
      created_at: getNowInput(),
    });

    alert("獎金已新增");
    await loadAll();
  }

  async function markPaid(order: SalaryOrder) {
    const paidAt = toIso(payForm.paid_at) || new Date().toISOString();

    const ok = confirm(
      `確定要將「${order.staff_name || order.discord_id}」這筆訂單標記為已發薪嗎？`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("qiunai_salary_orders")
      .update({
        status: "已發薪",
        paid_at: paidAt,
      })
      .eq("id", order.id);

    if (error) {
      console.error("標記發薪失敗:", error);
      alert("標記失敗");
      return;
    }

    alert("已標記為已發薪");
    await loadAll();
  }

  async function markRangePaid() {
    const startIso = toIso(payForm.start);
    const endIso = toIso(payForm.end);
    const paidAt = toIso(payForm.paid_at) || new Date().toISOString();

    if (!startIso || !endIso) {
      alert("請選擇發薪時間段");
      return;
    }

    const targetText =
      payForm.discord_id === "all"
        ? "全部員工"
        : getStaffNameByDiscordId(payForm.discord_id);

    const ok = confirm(
      `確定要將「${targetText}」在此時間段內的訂單標記為已發薪嗎？\n\n` +
        `訂單開始：${payForm.start}\n` +
        `訂單結束：${payForm.end}\n` +
        `發薪時間：${payForm.paid_at}`
    );

    if (!ok) return;

    let query = supabase
      .from("qiunai_salary_orders")
      .update({
        status: "已發薪",
        paid_at: paidAt,
      })
      .gte("order_finished_at", startIso)
      .lte("order_finished_at", endIso)
      .neq("status", "已發薪");

    if (payForm.discord_id !== "all") {
      query = query.eq("discord_id", payForm.discord_id);
    }

    const { error } = await query;

    if (error) {
      console.error("批次發薪失敗:", error);
      alert("批次發薪失敗");
      return;
    }

    alert("已完成批次發薪");
    await loadAll();
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
            <p className="text-sm text-violet-300">Qiunai Admin</p>
            <h1 className="text-2xl font-bold">秋奈電競｜薪資總表</h1>
          </div>

          <button
            onClick={loadAll}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
          >
            <RefreshCw size={16} />
            重新整理
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">時間範圍查詢</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            預設為本月 1 號 00:00 到現在，可自行調整。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
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

            <button
              onClick={loadAll}
              className="mt-6 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400"
            >
              套用時間範圍
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-7">
          <Stat title="訂單數" value={`${totals.orderCount} 筆`} />
          <Stat title="獎金筆數" value={`${totals.bonusCount} 筆`} />
          <Stat title="總收入" value={`$${totals.totalIncome.toLocaleString()}`} />
          <Stat title="總支出" value={`$${totals.totalExpense.toLocaleString()}`} />
          <Stat title="預估利潤" value={`$${totals.profit.toLocaleString()}`} />
          <Stat title="薪資" value={`$${totals.totalSalary.toLocaleString()}`} />
          <Stat title="未發薪" value={`${totals.unpaidCount} 筆`} />
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">新增訂單</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            完成時間預設為現在，可自行修改。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <SelectStaff
              label="員工"
              value={orderForm.discord_id}
              staffList={staffList}
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, discord_id: value }))
              }
            />

            <Input
              label="客人名稱"
              value={orderForm.customer_name}
              placeholder="可填 Discord 名稱或暱稱"
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, customer_name: value }))
              }
            />

            <Input
              label="服務項目"
              value={orderForm.service_name}
              placeholder="例如：特戰英豪娛樂陪玩"
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, service_name: value }))
              }
            />

            <Input
              label="完成時間"
              type="datetime-local"
              value={orderForm.order_finished_at}
              onChange={(value) =>
                setOrderForm((prev) => ({
                  ...prev,
                  order_finished_at: value,
                }))
              }
            />

            <Input
              label="訂單金額"
              type="number"
              value={orderForm.order_amount}
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, order_amount: value }))
              }
            />

            <Input
              label="員工薪資"
              type="number"
              value={orderForm.staff_salary}
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, staff_salary: value }))
              }
            />

            <Input
              label="訂單獎金"
              type="number"
              value={orderForm.bonus_amount}
              onChange={(value) =>
                setOrderForm((prev) => ({ ...prev, bonus_amount: value }))
              }
            />

            <button
              onClick={addOrder}
              className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400"
            >
              <Plus size={18} />
              新增訂單
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <Gift className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">新增員工獎金</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            獎金時間預設為現在，可自行修改。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <SelectStaff
              label="員工"
              value={bonusForm.discord_id}
              staffList={staffList}
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, discord_id: value }))
              }
            />

            <Input
              label="獎金名稱"
              value={bonusForm.title}
              placeholder="例如：活動獎金"
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, title: value }))
              }
            />

            <Input
              label="金額"
              type="number"
              value={bonusForm.amount}
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, amount: value }))
              }
            />

            <Input
              label="獎金時間"
              type="datetime-local"
              value={bonusForm.created_at}
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, created_at: value }))
              }
            />

            <Input
              label="備註"
              value={bonusForm.note}
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, note: value }))
              }
            />

            <button
              onClick={addBonus}
              className="md:col-span-5 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400"
            >
              <Plus size={18} />
              新增獎金
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-bold">發薪管理</h2>

          <p className="mt-2 text-sm text-zinc-400">
            預設為上個月整個月，可自行調整時間段。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <label className="block">
              <span className="text-sm text-zinc-300">發薪對象</span>

              <select
                value={payForm.discord_id}
                onChange={(e) =>
                  setPayForm((prev) => ({
                    ...prev,
                    discord_id: e.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
              >
                <option value="all">全部員工</option>

                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.discord_id}>
                    {getDisplayStaffName(staff)}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="訂單開始時間"
              type="datetime-local"
              value={payForm.start}
              onChange={(value) =>
                setPayForm((prev) => ({ ...prev, start: value }))
              }
            />

            <Input
              label="訂單結束時間"
              type="datetime-local"
              value={payForm.end}
              onChange={(value) =>
                setPayForm((prev) => ({ ...prev, end: value }))
              }
            />

            <Input
              label="發薪時間"
              type="datetime-local"
              value={payForm.paid_at}
              onChange={(value) =>
                setPayForm((prev) => ({ ...prev, paid_at: value }))
              }
            />

            <button
              onClick={markRangePaid}
              className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold hover:bg-emerald-400"
            >
              <CheckCircle2 size={18} />
              批次標記已發薪
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">載入中...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              此時間範圍內沒有薪資訂單
            </div>
          ) : (
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">完成時間</th>
                  <th className="px-4 py-3">員工</th>
                  <th className="px-4 py-3">客人</th>
                  <th className="px-4 py-3">服務</th>
                  <th className="px-4 py-3">訂單金額</th>
                  <th className="px-4 py-3">員工薪資</th>
                  <th className="px-4 py-3">獎金</th>
                  <th className="px-4 py-3">平台收入</th>
                  <th className="px-4 py-3">平台支出</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3">發薪日</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-white/10">
                    <td className="px-4 py-3 text-zinc-300">
                      {formatDateTime(order.order_finished_at)}
                    </td>

                    <td className="px-4 py-3">
                      <p>{order.staff_name || "未知員工"}</p>
                      <p className="text-xs text-zinc-500">
                        {order.discord_id}
                      </p>
                    </td>

                    <td className="px-4 py-3">{order.customer_name || "-"}</td>
                    <td className="px-4 py-3">{order.service_name || "-"}</td>

                    <td className="px-4 py-3">
                      ${Number(order.order_amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-violet-300">
                      ${Number(order.staff_salary || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      ${Number(order.bonus_amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      $
                      {Number(
                        order.platform_income || order.order_amount || 0
                      ).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      $
                      {Number(
                        order.platform_expense ||
                          Number(order.staff_salary || 0) +
                            Number(order.bonus_amount || 0)
                      ).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          order.status === "已發薪"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-yellow-500/20 text-yellow-300"
                        }`}
                      >
                        {order.status || "未發薪"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-zinc-300">
                      {order.paid_at ? formatDateTime(order.paid_at) : "-"}
                    </td>

                    <td className="px-4 py-3">
                      {order.status === "已發薪" ? (
                        <span className="text-xs text-zinc-500">已完成</span>
                      ) : (
                        <button
                          onClick={() => markPaid(order)}
                          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-semibold hover:bg-emerald-400"
                        >
                          <CheckCircle2 size={16} />
                          已發薪
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-bold">獎金明細</h2>
          </div>

          {bonusList.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              此時間範圍內沒有額外獎金
            </div>
          ) : (
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">時間</th>
                  <th className="px-4 py-3">員工</th>
                  <th className="px-4 py-3">獎金名稱</th>
                  <th className="px-4 py-3">金額</th>
                  <th className="px-4 py-3">備註</th>
                </tr>
              </thead>

              <tbody>
                {bonusList.map((bonus) => (
                  <tr key={bonus.id} className="border-t border-white/10">
                    <td className="px-4 py-3 text-zinc-300">
                      {formatDateTime(bonus.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <p>{bonus.staff_name || bonus.discord_id}</p>
                      <p className="text-xs text-zinc-500">
                        {bonus.discord_id}
                      </p>
                    </td>

                    <td className="px-4 py-3">{bonus.title}</td>

                    <td className="px-4 py-3 text-violet-300">
                      ${Number(bonus.amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">{bonus.note || "-"}</td>
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

function SelectStaff({
  label,
  value,
  onChange,
  staffList,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  staffList: Staff[];
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
      >
        <option value="">請選擇員工</option>

        {staffList.map((staff) => (
          <option key={staff.id} value={staff.discord_id}>
            {getDisplayStaffName(staff)}
          </option>
        ))}
      </select>
    </label>
  );
}

function getDisplayStaffName(staff: Staff) {
  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id
  );
}

function getNowInput() {
  return formatInputDate(new Date());
}

function getMonthStartInput() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return formatInputDate(date);
}

function getPreviousMonthStartInput() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  return formatInputDate(date);
}

function getPreviousMonthEndInput() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 0, 0);
  return formatInputDate(date);
}

function formatInputDate(date: Date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}