"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Gift,
  MinusCircle,
  Plus,
  CalendarDays,
  ClipboardList,
  Search,
  UserRound,
  WalletCards,
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
  commission_tier: string | null;
  commission_note: string | null;
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
  salary_rate: number | null;
  salary_level: string | null;
  platform_income: number | null;
  platform_expense: number | null;
  status: string | null;
  paid_at: string | null;
  order_finished_at: string | null;
  admin_note: string | null;
  is_deleted: boolean | null;
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
  const [editingOrder, setEditingOrder] = useState<SalaryOrder | null>(null);
  const [selectedDetailDiscordId, setSelectedDetailDiscordId] = useState("");

  const [filter, setFilter] = useState({
    start: getMonthStartInput(),
    end: getNowInput(),
  });

  const [orderForm, setOrderForm] = useState({
    discord_id: "",
    customer_name: "",
    service_name: "",
    order_amount: "",
    bonus_amount: "0",
    order_finished_at: getNowInput(),
  });

  const [bonusForm, setBonusForm] = useState({
    discord_id: "",
    title: "",
    amount: "",
    note: "",
    created_at: getNowInput(),
  });

  const [deductionForm, setDeductionForm] = useState({
    discord_id: "",
    amount: "",
    note: "",
    created_at: getNowInput(),
  });

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

  const staffSalarySummaries = useMemo(() => {
    return staffList.map((staff) => {
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

      const unpaidOrders = staffOrders.filter(
        (order) => order.status !== "已發薪"
      );

      const unpaidSalary =
        unpaidOrders.reduce(
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
        totalSalary: orderSalary + orderBonus + extraBonus,
        unpaidCount: unpaidOrders.length,
        unpaidSalary,
      };
    });
  }, [staffList, orders, bonusList]);

  const selectedDetailStaff = useMemo(() => {
    return (
      staffList.find((staff) => staff.discord_id === selectedDetailDiscordId) ||
      null
    );
  }, [staffList, selectedDetailDiscordId]);

  const selectedDetailSummary = useMemo(() => {
    return (
      staffSalarySummaries.find(
        (row) => row.staff.discord_id === selectedDetailDiscordId
      ) || null
    );
  }, [staffSalarySummaries, selectedDetailDiscordId]);

  const selectedDetailOrders = useMemo(() => {
    if (!selectedDetailDiscordId) return [];

    return orders.filter((order) => order.discord_id === selectedDetailDiscordId);
  }, [orders, selectedDetailDiscordId]);

  const selectedDetailBonuses = useMemo(() => {
    if (!selectedDetailDiscordId) return [];

    return bonusList.filter(
      (bonus) => bonus.discord_id === selectedDetailDiscordId
    );
  }, [bonusList, selectedDetailDiscordId]);

  async function loadAll() {
    setLoading(true);

    const startIso = toIso(filter.start);
    const endIso = toIso(filter.end);

    let orderQuery = supabase
      .from("qiunai_salary_orders")
      .select("*")
      .or("is_deleted.eq.false,is_deleted.is.null")
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
      .select(
        "id, discord_id, discord_name, display_name, real_name, is_active, commission_tier, commission_note"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (staffError) {
      console.error("讀取員工資料失敗:", staffError);
      alert("讀取員工資料失敗");
    }

    const nextStaffList = (staffData || []) as Staff[];

    setOrders((orderData || []) as SalaryOrder[]);
    setBonusList((bonusData || []) as BonusItem[]);
    setStaffList(nextStaffList);

    if (!selectedDetailDiscordId && nextStaffList.length > 0) {
      setSelectedDetailDiscordId(nextStaffList[0].discord_id);
    }

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

    const selectedStaff = staffList.find(
      (staff) => staff.discord_id === orderForm.discord_id
    );

    const orderAmount = Number(orderForm.order_amount);
    const salaryRate = getStaffSalaryRate(
      selectedStaff,
      orderForm.order_finished_at
    );
    const bonusAmount = Number(orderForm.bonus_amount || 0);
    const staffSalary = Math.round(orderAmount * (salaryRate / 100));

    if (!orderAmount || orderAmount <= 0) {
      alert("請輸入正確訂單金額");
      return;
    }

    if (Number.isNaN(salaryRate) || salaryRate <= 0) {
      alert("系統無法判斷此陪陪抽成檔位");
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
      salary_rate: salaryRate,
      salary_level: getStaffSalaryLevelLabel(
        selectedStaff,
        orderForm.order_finished_at
      ),
      platform_income: orderAmount,
      platform_expense: staffSalary + bonusAmount,
      status: "未發薪",
      order_finished_at: finishedAt,
      is_deleted: false,
    });

    if (error) {
      console.error("新增訂單失敗:", error);
      alert("新增訂單失敗");
      return;
    }

    setSelectedDetailDiscordId(orderForm.discord_id);

    setOrderForm({
      discord_id: "",
      customer_name: "",
      service_name: "",
      order_amount: "",
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

    setSelectedDetailDiscordId(bonusForm.discord_id);

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

  async function addDeduction() {
    if (!deductionForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    const amount = Number(deductionForm.amount);

    if (!amount || amount <= 0) {
      alert("請輸入正確扣除金額");
      return;
    }

    if (!deductionForm.note.trim()) {
      alert("請填寫扣除備註");
      return;
    }

    const staffName = getStaffNameByDiscordId(deductionForm.discord_id);
    const createdAt =
      toIso(deductionForm.created_at) || new Date().toISOString();

    const { error } = await supabase.from("qiunai_staff_bonus").insert({
      discord_id: deductionForm.discord_id,
      staff_name: staffName,
      title: "薪水扣除",
      amount: -Math.abs(amount),
      note: deductionForm.note.trim(),
      created_at: createdAt,
    });

    if (error) {
      console.error("新增薪水扣除失敗:", error);
      alert("新增薪水扣除失敗");
      return;
    }

    setSelectedDetailDiscordId(deductionForm.discord_id);

    setDeductionForm({
      discord_id: "",
      amount: "",
      note: "",
      created_at: getNowInput(),
    });

    alert("薪水扣除已新增");
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
      .or("is_deleted.eq.false,is_deleted.is.null")
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

  async function updateSalaryOrder(
    orderId: string,
    payload: {
      service_name?: string | null;
      customer_name?: string | null;
      order_amount?: number | null;
      bonus_amount?: number | null;
      salary_rate?: number | null;
      admin_note?: string | null;
    }
  ) {
    const orderAmount = Number(payload.order_amount || 0);
    const salaryRate = Number(payload.salary_rate || 80);
    const bonusAmount = Number(payload.bonus_amount || 0);
    const staffSalary = Math.round(orderAmount * (salaryRate / 100));

    if (!orderAmount || orderAmount <= 0) {
      alert("訂單金額錯誤");
      return false;
    }

    if (Number.isNaN(salaryRate) || salaryRate <= 0) {
      alert("抽成比例錯誤");
      return false;
    }

    if (Number.isNaN(bonusAmount) || bonusAmount < 0) {
      alert("訂單獎金錯誤");
      return false;
    }

    const { error } = await supabase
      .from("qiunai_salary_orders")
      .update({
        service_name: payload.service_name || null,
        customer_name: payload.customer_name || null,
        order_amount: orderAmount,
        bonus_amount: bonusAmount,
        salary_rate: salaryRate,
        staff_salary: staffSalary,
        platform_income: orderAmount,
        platform_expense: staffSalary + bonusAmount,
        salary_level: `後台手動修改 ${salaryRate}%`,
        admin_note: payload.admin_note || null,
        edited_at: new Date().toISOString(),
        edited_by: "admin",
      })
      .eq("id", orderId);

    if (error) {
      console.error("修改訂單失敗:", error);
      alert("修改訂單失敗");
      return false;
    }

    alert("已修改訂單");
    return true;
  }

  async function deleteSalaryOrder(orderId: string) {
    const reason = window.prompt("請輸入刪除原因：") || "後台刪除";

    const ok = window.confirm(
      "確定要刪除這筆薪資訂單嗎？刪除後陪陪端不會再看到。"
    );

    if (!ok) return false;

    const { error } = await supabase
      .from("qiunai_salary_orders")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_reason: reason,
        edited_at: new Date().toISOString(),
        edited_by: "admin",
      })
      .eq("id", orderId);

    if (error) {
      console.error("刪除訂單失敗:", error);
      alert("刪除訂單失敗");
      return false;
    }

    alert("已刪除訂單");
    return true;
  }

  async function updateStaffCommissionTier(staffId: string, tier: string) {
    const { error } = await supabase
      .from("qiunai_staff")
      .update({
        commission_tier: tier,
        commission_note: tier === "auto" ? "自動判定" : "後台手動設定",
      })
      .eq("id", staffId);

    if (error) {
      console.error("更新抽成檔位失敗:", error);
      alert("更新抽成檔位失敗");
      return;
    }

    alert("已更新抽成檔位");
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
          <Stat title="獎金 / 扣除" value={`${totals.bonusCount} 筆`} />
          <Stat title="總收入" value={`$${totals.totalIncome.toLocaleString()}`} />
          <Stat title="總支出" value={`$${totals.totalExpense.toLocaleString()}`} />
          <Stat title="預估利潤" value={`$${totals.profit.toLocaleString()}`} />
          <Stat title="薪資" value={`$${totals.totalSalary.toLocaleString()}`} />
          <Stat title="未發薪" value={`${totals.unpaidCount} 筆`} />
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <WalletCards className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">陪陪個人薪資明細</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            選擇單一陪陪後，可以查看此時間範圍內的訂單、薪資、獎金與未發薪。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_2fr]">
            <SearchableStaffSelect
              label="搜尋 / 選擇陪陪"
              value={selectedDetailDiscordId}
              staffList={staffList}
              onChange={setSelectedDetailDiscordId}
            />

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              {selectedDetailStaff && selectedDetailSummary ? (
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-200">
                      <UserRound size={22} />
                    </div>

                    <div>
                      <p className="text-lg font-black">
                        {getDisplayStaffName(selectedDetailStaff)}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {selectedDetailStaff.discord_id}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <MiniStat
                      title="訂單數"
                      value={`${selectedDetailSummary.orderCount} 筆`}
                    />
                    <MiniStat
                      title="接單金額"
                      value={`$${selectedDetailSummary.orderAmount.toLocaleString()}`}
                    />
                    <MiniStat
                      title="訂單薪資"
                      value={`$${selectedDetailSummary.orderSalary.toLocaleString()}`}
                    />
                    <MiniStat
                      title="獎金 / 扣除"
                      value={`$${(
                        selectedDetailSummary.orderBonus +
                        selectedDetailSummary.extraBonus
                      ).toLocaleString()}`}
                    />
                    <MiniStat
                      title="總薪資"
                      value={`$${selectedDetailSummary.totalSalary.toLocaleString()}`}
                    />
                    <MiniStat
                      title="未發薪"
                      value={`$${selectedDetailSummary.unpaidSalary.toLocaleString()}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-zinc-400">
                  請選擇一位陪陪
                </div>
              )}
            </div>
          </div>

          {selectedDetailStaff ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-white/10 p-4">
                  <h3 className="font-bold">此陪陪訂單明細</h3>
                </div>

                {selectedDetailOrders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">
                    此時間範圍內沒有訂單
                  </div>
                ) : (
                  <table className="min-w-[850px] w-full text-left text-sm">
                    <thead className="bg-white/10 text-zinc-300">
                      <tr>
                        <th className="px-4 py-3">完成時間</th>
                        <th className="px-4 py-3">客人</th>
                        <th className="px-4 py-3">服務</th>
                        <th className="px-4 py-3">金額</th>
                        <th className="px-4 py-3">薪資</th>
                        <th className="px-4 py-3">獎金</th>
                        <th className="px-4 py-3">狀態</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedDetailOrders.map((order) => (
                        <tr key={order.id} className="border-t border-white/10">
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDateTime(order.order_finished_at)}
                          </td>

                          <td className="px-4 py-3">
                            {order.customer_name || "-"}
                          </td>

                          <td className="px-4 py-3">
                            <p>{order.service_name || "-"}</p>

                            {order.admin_note ? (
                              <p className="mt-1 text-xs text-zinc-500">
                                備註：{order.admin_note}
                              </p>
                            ) : null}
                          </td>

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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-white/10 p-4">
                  <h3 className="font-bold">此陪陪額外獎金 / 薪水扣除</h3>
                </div>

                {selectedDetailBonuses.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">
                    此時間範圍內沒有額外獎金或薪水扣除
                  </div>
                ) : (
                  <table className="min-w-[650px] w-full text-left text-sm">
                    <thead className="bg-white/10 text-zinc-300">
                      <tr>
                        <th className="px-4 py-3">時間</th>
                        <th className="px-4 py-3">獎金名稱</th>
                        <th className="px-4 py-3">金額</th>
                        <th className="px-4 py-3">備註</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedDetailBonuses.map((bonus) => (
                        <tr key={bonus.id} className="border-t border-white/10">
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDateTime(bonus.created_at)}
                          </td>

                          <td className="px-4 py-3">{bonus.title}</td>

                          <td
                            className={`px-4 py-3 ${
                              Number(bonus.amount || 0) < 0
                                ? "text-red-300"
                                : "text-violet-300"
                            }`}
                          >
                            ${Number(bonus.amount || 0).toLocaleString()}
                          </td>

                          <td className="px-4 py-3">{bonus.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-bold">員工抽成檔位</h2>

          <p className="mt-2 text-sm text-zinc-400">
            九月前系統預設 90%，但後台手動設定會優先套用。九月後可設定 80%、85%、90% 或主管津貼 95%。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {staffList.map((staff) => (
              <div
                key={staff.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="font-bold">{getDisplayStaffName(staff)}</p>

                <p className="mt-1 text-xs text-zinc-500">
                  {staff.discord_id}
                </p>

                <label className="mt-3 block">
                  <span className="text-sm text-zinc-300">抽成檔位</span>

                  <select
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                    value={staff.commission_tier || "auto"}
                    onChange={(e) =>
                      updateStaffCommissionTier(staff.id, e.target.value)
                    }
                  >
                    <option value="auto">自動判定</option>
                    <option value="rate_80">80% 一般陪陪</option>
                    <option value="rate_85">85% 進階陪陪</option>
                    <option value="rate_90">90% 年度高階</option>
                    <option value="manager_95">95% 主管津貼</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">新增訂單</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            完成時間預設為現在，可自行修改。選擇陪陪後會自動套用她的個人抽成檔位。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <SearchableStaffSelect
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

            <div className="block">
              <span className="text-sm text-zinc-300">自動套用抽成</span>

              <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                {orderForm.discord_id ? (
                  (() => {
                    const selectedStaff = staffList.find(
                      (staff) => staff.discord_id === orderForm.discord_id
                    );

                    const salaryRate = getStaffSalaryRate(
                      selectedStaff,
                      orderForm.order_finished_at
                    );

                    return (
                      <>
                        <p className="font-bold text-violet-200">
                          {salaryRate}%
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {getStaffSalaryLevelLabel(
                            selectedStaff,
                            orderForm.order_finished_at
                          )}
                        </p>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <p className="font-bold text-zinc-400">請先選擇陪陪</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      選擇陪陪後會自動帶入她的抽成檔位
                    </p>
                  </>
                )}
              </div>
            </div>

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
            <SearchableStaffSelect
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

        <div className="mt-6 rounded-3xl border border-red-400/20 bg-red-500/5 p-6">
          <div className="flex items-center gap-2">
            <MinusCircle className="text-red-300" size={20} />
            <h2 className="text-xl font-bold">新增薪水扣除</h2>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            扣除金額請輸入正數，系統會以負數列入薪資明細。
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <SearchableStaffSelect
              label="員工"
              value={deductionForm.discord_id}
              staffList={staffList}
              onChange={(value) =>
                setDeductionForm((prev) => ({ ...prev, discord_id: value }))
              }
            />

            <Input
              label="扣除金額"
              type="number"
              value={deductionForm.amount}
              placeholder="例如：300"
              onChange={(value) =>
                setDeductionForm((prev) => ({ ...prev, amount: value }))
              }
            />

            <Input
              label="扣除時間"
              type="datetime-local"
              value={deductionForm.created_at}
              onChange={(value) =>
                setDeductionForm((prev) => ({ ...prev, created_at: value }))
              }
            />

            <Input
              label="備註"
              value={deductionForm.note}
              placeholder="例如：遲到、請假扣款、手動修正"
              onChange={(value) =>
                setDeductionForm((prev) => ({ ...prev, note: value }))
              }
            />

            <button
              onClick={addDeduction}
              className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-semibold hover:bg-red-400"
            >
              <MinusCircle size={18} />
              新增扣除
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
            <table className="min-w-[1350px] w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">完成時間</th>
                  <th className="px-4 py-3">員工</th>
                  <th className="px-4 py-3">客人</th>
                  <th className="px-4 py-3">服務</th>
                  <th className="px-4 py-3">訂單金額</th>
                  <th className="px-4 py-3">員工薪資</th>
                  <th className="px-4 py-3">抽成</th>
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
                      <button
                        onClick={() => setSelectedDetailDiscordId(order.discord_id)}
                        className="text-left hover:text-violet-300"
                      >
                        <p>{order.staff_name || "未知員工"}</p>
                        <p className="text-xs text-zinc-500">
                          {order.discord_id}
                        </p>
                      </button>
                    </td>

                    <td className="px-4 py-3">{order.customer_name || "-"}</td>
                    <td className="px-4 py-3">
                      <p>{order.service_name || "-"}</p>
                      {order.admin_note ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          備註：{order.admin_note}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      ${Number(order.order_amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-violet-300">
                      ${Number(order.staff_salary || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      <p>{order.salary_rate ? `${order.salary_rate}%` : "-"}</p>
                      <p className="text-xs text-zinc-500">
                        {order.salary_level || "-"}
                      </p>
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
                      <div className="flex flex-col gap-2">
                        {order.status === "已發薪" ? (
                          <span className="text-xs text-zinc-500">已完成</span>
                        ) : (
                          <button
                            onClick={() => markPaid(order)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-semibold hover:bg-emerald-400"
                          >
                            <CheckCircle2 size={16} />
                            已發薪
                          </button>
                        )}

                        <button
                          onClick={() => setEditingOrder(order)}
                          className="rounded-xl bg-blue-500 px-4 py-2 font-semibold hover:bg-blue-400"
                        >
                          修改細節
                        </button>

                        <button
                          onClick={async () => {
                            const ok = await deleteSalaryOrder(order.id);

                            if (ok) {
                              await loadAll();
                            }
                          }}
                          className="rounded-xl bg-red-500 px-4 py-2 font-semibold hover:bg-red-400"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-bold">獎金 / 扣除明細</h2>
          </div>

          {bonusList.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              此時間範圍內沒有額外獎金或薪水扣除
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
                      <button
                        onClick={() => setSelectedDetailDiscordId(bonus.discord_id)}
                        className="text-left hover:text-violet-300"
                      >
                        <p>{bonus.staff_name || bonus.discord_id}</p>
                        <p className="text-xs text-zinc-500">
                          {bonus.discord_id}
                        </p>
                      </button>
                    </td>

                    <td className="px-4 py-3">{bonus.title}</td>

                    <td
                      className={`px-4 py-3 ${
                        Number(bonus.amount || 0) < 0
                          ? "text-red-300"
                          : "text-violet-300"
                      }`}
                    >
                      ${Number(bonus.amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">{bonus.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#171026] p-6 text-white shadow-2xl">
              <h2 className="text-xl font-bold">修改薪資訂單</h2>

              <p className="mt-2 text-sm text-zinc-400">
                修改後會重新依照抽成比例計算員工薪資與平台支出。
              </p>

              <div className="mt-5 space-y-4">
                <Input
                  label="服務項目"
                  value={editingOrder.service_name || ""}
                  onChange={(value) =>
                    setEditingOrder({
                      ...editingOrder,
                      service_name: value,
                    })
                  }
                />

                <Input
                  label="客人名稱"
                  value={editingOrder.customer_name || ""}
                  onChange={(value) =>
                    setEditingOrder({
                      ...editingOrder,
                      customer_name: value,
                    })
                  }
                />

                <Input
                  label="訂單金額"
                  type="number"
                  value={String(editingOrder.order_amount || 0)}
                  onChange={(value) =>
                    setEditingOrder({
                      ...editingOrder,
                      order_amount: Number(value),
                    })
                  }
                />

                <Input
                  label="訂單獎金"
                  type="number"
                  value={String(editingOrder.bonus_amount || 0)}
                  onChange={(value) =>
                    setEditingOrder({
                      ...editingOrder,
                      bonus_amount: Number(value),
                    })
                  }
                />

                <label className="block">
                  <span className="text-sm text-zinc-300">抽成檔位</span>

                  <select
                    value={String(editingOrder.salary_rate || 80)}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        salary_rate: Number(e.target.value),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                  >
                    <option value="80">80% 一般陪陪</option>
                    <option value="85">85% 進階陪陪</option>
                    <option value="90">90% 年度高階</option>
                    <option value="95">95% 主管津貼</option>
                  </select>
                </label>

                <Input
                  label="後台備註"
                  value={editingOrder.admin_note || ""}
                  onChange={(value) =>
                    setEditingOrder({
                      ...editingOrder,
                      admin_note: value,
                    })
                  }
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={async () => {
                    const ok = await updateSalaryOrder(editingOrder.id, {
                      service_name: editingOrder.service_name,
                      customer_name: editingOrder.customer_name,
                      order_amount: Number(editingOrder.order_amount || 0),
                      bonus_amount: Number(editingOrder.bonus_amount || 0),
                      salary_rate: Number(editingOrder.salary_rate || 80),
                      admin_note: editingOrder.admin_note,
                    });

                    if (ok) {
                      setEditingOrder(null);
                      await loadAll();
                    }
                  }}
                  className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-bold hover:bg-emerald-400"
                >
                  儲存修改
                </button>

                <button
                  onClick={() => setEditingOrder(null)}
                  className="flex-1 rounded-xl bg-zinc-700 px-4 py-3 font-bold hover:bg-zinc-600"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
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

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-zinc-400">{title}</p>
      <p className="mt-2 text-lg font-black text-violet-200">{value}</p>
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

function SearchableStaffSelect({
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
  const selectedStaff =
    staffList.find((staff) => staff.discord_id === value) || null;

  const [keyword, setKeyword] = useState("");

  const filteredStaff = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    if (!key) return staffList.slice(0, 12);

    return staffList
      .filter((staff) => {
        const text = [
          staff.discord_id,
          staff.discord_name,
          staff.display_name,
          staff.real_name,
          getDisplayStaffName(staff),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(key);
      })
      .slice(0, 20);
  }, [keyword, staffList]);

  return (
    <div className="block">
      <span className="text-sm text-zinc-300">{label}</span>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3 focus-within:border-violet-400">
        <Search size={16} className="text-violet-300" />

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={
            selectedStaff
              ? `已選擇：${getDisplayStaffName(selectedStaff)}`
              : "輸入陪陪名字 / Discord ID"
          }
          className="w-full bg-transparent text-white outline-none placeholder:text-zinc-600"
        />
      </div>

      {selectedStaff ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-violet-200">
              {getDisplayStaffName(selectedStaff)}
            </p>
            <p className="text-xs text-zinc-500">{selectedStaff.discord_id}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange("");
              setKeyword("");
            }}
            className="rounded-lg border border-white/10 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            清除
          </button>
        </div>
      ) : null}

      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/30">
        {filteredStaff.length === 0 ? (
          <div className="px-4 py-4 text-sm text-zinc-500">
            找不到符合的陪陪
          </div>
        ) : (
          filteredStaff.map((staff) => (
            <button
              key={staff.id}
              type="button"
              onClick={() => {
                onChange(staff.discord_id);
                setKeyword("");
              }}
              className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0 hover:bg-white/10 ${
                value === staff.discord_id ? "bg-violet-500/20" : ""
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
                <UserRound size={18} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {getDisplayStaffName(staff)}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {staff.discord_name || staff.discord_id}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
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

function getStaffSalaryRate(
  staff: Staff | null | undefined,
  orderFinishedAt?: string
) {
  const sourceDate = orderFinishedAt ? new Date(orderFinishedAt) : new Date();
  const openingEnd = new Date("2026-09-01T00:00:00+08:00");

  if (staff?.commission_tier === "rate_80") return 80;
  if (staff?.commission_tier === "rate_85") return 85;
  if (staff?.commission_tier === "rate_90") return 90;
  if (staff?.commission_tier === "manager_95") return 95;

  if (sourceDate < openingEnd) {
    return 90;
  }

  return 80;
}

function getStaffSalaryLevelLabel(
  staff: Staff | null | undefined,
  orderFinishedAt?: string
) {
  const sourceDate = orderFinishedAt ? new Date(orderFinishedAt) : new Date();
  const openingEnd = new Date("2026-09-01T00:00:00+08:00");

  if (staff?.commission_tier === "rate_80") return "個人檔位 80%";
  if (staff?.commission_tier === "rate_85") return "個人檔位 85%";
  if (staff?.commission_tier === "rate_90") return "個人檔位 90%";
  if (staff?.commission_tier === "manager_95") return "主管津貼 95%";

  if (sourceDate < openingEnd) {
    return "開幕期預設 90%";
  }

  return "個人檔位 80%";
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
