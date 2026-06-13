"use client";

import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RefreshCw, CheckCircle2, Gift, Plus } from "lucide-react";

export default function AdminSalaryPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [staffList, setStaffList] = useState([]);

  const [bonusForm, setBonusForm] = useState({
    discord_id: "",
    title: "",
    amount: "",
    note: "",
  });

  const { adminLoading, isAdmin } = useQiunaiAdminGuard();
  useEffect(() => {
    if (isAdmin) {
      loadAll();
    }
  }, [isAdmin]);

  const totals = useMemo(() => {
    const totalIncome = orders.reduce(
      (sum, order) => sum + Number(order.platform_income || order.order_amount || 0),
      0
    );

    const totalExpense = orders.reduce(
      (sum, order) =>
        sum +
        Number(order.platform_expense || order.staff_salary || 0) +
        Number(order.bonus_amount || 0),
      0
    );

    const totalSalary = orders.reduce(
      (sum, order) => sum + Number(order.staff_salary || 0),
      0
    );

    const totalBonus = orders.reduce(
      (sum, order) => sum + Number(order.bonus_amount || 0),
      0
    );

    const unpaidCount = orders.filter((order) => order.status !== "已發薪").length;

    return {
      totalIncome,
      totalExpense,
      profit: totalIncome - totalExpense,
      totalSalary,
      totalBonus,
      unpaidCount,
      orderCount: orders.length,
    };
  }, [orders]);

  async function loadAll() {
    setLoading(true);

    const { data: orderData, error: orderError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .order("order_finished_at", { ascending: false });

    if (orderError) {
      console.error(orderError);
      alert("讀取薪資訂單失敗");
    }

    const { data: staffData, error: staffError } = await supabase
      .from("qiunai_staff")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (staffError) {
      console.error(staffError);
      alert("讀取員工資料失敗");
    }

    setOrders(orderData || []);
    setStaffList(staffData || []);
    setLoading(false);
  }

  async function markPaid(order) {
    const ok = confirm(`確定要將「${order.staff_name || order.discord_id}」這筆訂單標記為已發薪嗎？`);

    if (!ok) return;

    const { error } = await supabase
      .from("qiunai_salary_orders")
      .update({
        status: "已發薪",
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) {
      console.error(error);
      alert("標記失敗");
      return;
    }

    await loadAll();
  }

  async function markStaffPaid(discordId) {
    const staff = staffList.find((item) => item.discord_id === discordId);

    const ok = confirm(
      `確定要將「${staff?.display_name || staff?.discord_name || discordId}」所有未發薪訂單標記為已發薪嗎？`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("qiunai_salary_orders")
      .update({
        status: "已發薪",
        paid_at: new Date().toISOString(),
      })
      .eq("discord_id", discordId)
      .neq("status", "已發薪");

    if (error) {
      console.error(error);
      alert("批次標記失敗");
      return;
    }

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

    const staff = staffList.find((item) => item.discord_id === bonusForm.discord_id);

    const { error } = await supabase.from("qiunai_staff_bonus").insert({
      discord_id: bonusForm.discord_id,
      staff_name: staff?.display_name || staff?.discord_name || null,
      title: bonusForm.title.trim(),
      amount,
      note: bonusForm.note || null,
    });

    if (error) {
      console.error(error);
      alert("新增獎金失敗");
      return;
    }

    setBonusForm({
      discord_id: "",
      title: "",
      amount: "",
      note: "",
    });

    alert("獎金已新增");
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
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Stat title="訂單數" value={`${totals.orderCount} 筆`} />
          <Stat title="總收入" value={`$${totals.totalIncome.toLocaleString()}`} />
          <Stat title="總支出" value={`$${totals.totalExpense.toLocaleString()}`} />
          <Stat title="預估利潤" value={`$${totals.profit.toLocaleString()}`} />
          <Stat title="薪資" value={`$${totals.totalSalary.toLocaleString()}`} />
          <Stat title="未發薪" value={`${totals.unpaidCount} 筆`} />
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2">
            <Gift className="text-violet-300" size={20} />
            <h2 className="text-xl font-bold">新增員工獎金</h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <select
              value={bonusForm.discord_id}
              onChange={(e) =>
                setBonusForm((prev) => ({
                  ...prev,
                  discord_id: e.target.value,
                }))
              }
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
            >
              <option value="">選擇員工</option>
              {staffList.map((staff) => (
                <option key={staff.id} value={staff.discord_id}>
                  {staff.display_name || staff.discord_name || staff.discord_id}
                </option>
              ))}
            </select>

            <Input
              value={bonusForm.title}
              placeholder="獎金名稱"
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, title: value }))
              }
            />

            <Input
              value={bonusForm.amount}
              placeholder="金額"
              type="number"
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, amount: value }))
              }
            />

            <Input
              value={bonusForm.note}
              placeholder="備註"
              onChange={(value) =>
                setBonusForm((prev) => ({ ...prev, note: value }))
              }
            />

            <button
              onClick={addBonus}
              className="flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400"
            >
              <Plus size={18} />
              新增獎金
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-bold">員工快速發薪</h2>

          <div className="mt-4 flex flex-wrap gap-3">
            {staffList.map((staff) => (
              <button
                key={staff.id}
                onClick={() => markStaffPaid(staff.discord_id)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
              >
                {staff.display_name || staff.discord_name || staff.discord_id}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">載入中...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              目前沒有薪資訂單
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
                      <p className="text-xs text-zinc-500">{order.discord_id}</p>
                    </td>

                    <td className="px-4 py-3">
                      {order.customer_name || "-"}
                    </td>

                    <td className="px-4 py-3">
                      {order.service_name || "-"}
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
                      ${Number(order.platform_income || order.order_amount || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3">
                      ${Number(order.platform_expense || order.staff_salary || 0).toLocaleString()}
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
      </section>
    </main>
  );
}

function Stat({ title, value }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Input({ value, onChange, placeholder = "", type = "text" }) {
  return (
    <input
      type={type}
      value={value || ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
    />
  );
}

function formatDateTime(value) {
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