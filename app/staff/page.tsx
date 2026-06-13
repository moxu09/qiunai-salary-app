"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Power,
  Save,
  UserRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Staff = {
  id: string;
  discord_id: string;
  discord_name: string | null;
  avatar_url: string | null;
  display_name: string | null;
  real_name: string | null;
  gender: string | null;
  birthday: string | null;
  bank_name: string | null;
  bank_account: string | null;
  salary_channel_id: string | null;
  is_online: boolean;
  can_take_order: boolean;
  role_checked: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export default function StaffPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pageError, setPageError] = useState("");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);

  const [form, setForm] = useState({
    display_name: "",
    real_name: "",
    gender: "",
    birthday: "",
    bank_name: "",
    bank_account: "",
  });

  const totalOrderAmount = useMemo(() => {
    return orders.reduce(
      (sum, item) => sum + Number(item.order_amount || 0),
      0
    );
  }, [orders]);

  const totalSalary = useMemo(() => {
    return orders.reduce(
      (sum, item) => sum + Number(item.staff_salary || 0),
      0
    );
  }, [orders]);

  const totalBonus = useMemo(() => {
    const orderBonus = orders.reduce(
      (sum, item) => sum + Number(item.bonus_amount || 0),
      0
    );

    const extraBonus = bonusList.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    return orderBonus + extraBonus;
  }, [orders, bonusList]);

  const finalSalary = totalSalary + totalBonus;

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    setPageError("");

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error("getSession error:", sessionError);
      setPageError(`讀取登入資料失敗：${sessionError.message}`);
      setLoading(false);
      return;
    }

    if (!sessionData.session) {
      router.replace("/");
      return;
    }

    const user: any = sessionData.session.user;

    const discordId =
      user.user_metadata?.provider_id ||
      user.user_metadata?.sub ||
      user.identities?.[0]?.identity_data?.provider_id ||
      user.identities?.[0]?.identity_data?.sub ||
      user.identities?.[0]?.id;

    const discordName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      user.email ||
      "未知使用者";

    const avatarUrl = user.user_metadata?.avatar_url || null;

    if (!discordId) {
      console.error("user metadata:", user);
      setPageError("讀取 Discord ID 失敗，請確認 Supabase Discord 登入資料。");
      setLoading(false);
      return;
    }

    const staffData = await ensureStaff({
      discordId,
      discordName,
      avatarUrl,
    });

    if (!staffData) {
      setLoading(false);
      return;
    }

    setStaff(staffData);

    setForm({
      display_name: staffData.display_name || "",
      real_name: staffData.real_name || "",
      gender: staffData.gender || "",
      birthday: staffData.birthday || "",
      bank_name: staffData.bank_name || "",
      bank_account: staffData.bank_account || "",
    });

    await loadSalaryData(discordId);

    setLoading(false);
  }

  async function ensureStaff({
    discordId,
    discordName,
    avatarUrl,
  }: {
    discordId: string;
    discordName: string;
    avatarUrl: string | null;
  }) {
    const res = await fetch("/api/qiunai/ensure-staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discord_id: discordId,
        discord_name: discordName,
        avatar_url: avatarUrl,
      }),
    });

    const result = await res.json();

    if (!result.ok) {
      console.error("ensure-staff failed:", result);
      setPageError(result.message || "你目前沒有權限使用秋奈薪資網");
      return null;
    }

    return result.staff as Staff;
  }

  async function loadSalaryData(discordId: string) {
    const { data: orderData, error: orderError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .eq("discord_id", discordId)
      .order("order_finished_at", { ascending: false });

    if (orderError) {
      console.error("load orders error:", orderError);
    }

    const { data: bonusData, error: bonusError } = await supabase
      .from("qiunai_staff_bonus")
      .select("*")
      .eq("discord_id", discordId)
      .order("created_at", { ascending: false });

    if (bonusError) {
      console.error("load bonus error:", bonusError);
    }

    setOrders((orderData || []) as SalaryOrder[]);
    setBonusList((bonusData || []) as BonusItem[]);
  }

  async function saveProfile() {
    if (!staff) return;

    setSaving(true);

    const { data, error } = await supabase
      .from("qiunai_staff")
      .update({
        display_name: form.display_name,
        real_name: form.real_name,
        gender: form.gender,
        birthday: form.birthday || null,
        bank_name: form.bank_name,
        bank_account: form.bank_account,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("save profile error:", error);
      alert("儲存失敗");
      return;
    }

    setStaff(data as Staff);
    alert("資料已儲存");
  }

  async function toggleOnline(nextOnline: boolean) {
    if (!staff) return;

    const { data, error } = await supabase
      .from("qiunai_staff")
      .update({
        is_online: nextOnline,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    if (error) {
      console.error("toggle online error:", error);
      alert("狀態更新失敗");
      return;
    }

    setStaff(data as Staff);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-300 border-t-transparent" />
          <p className="text-sm text-zinc-300">載入秋奈薪資資料中...</p>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <h1 className="text-xl font-bold">無法進入員工薪資中心</h1>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-red-200">
            {pageError}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => init()}
              className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400"
            >
              重新檢查
            </button>

            <button
              onClick={logout}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              登出
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <h1 className="text-xl font-bold">找不到員工資料</h1>
          <p className="mt-3 text-sm text-zinc-300">
            請確認你是否使用正確的 Discord 帳號登入。
          </p>

          <button
            onClick={logout}
            className="mt-6 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            重新登入
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white">
      <header className="border-b border-white/10 bg-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <div>
            <p className="text-sm text-violet-300">Qiunai Esports</p>
            <h1 className="text-2xl font-bold">秋奈電競｜薪資中心</h1>
          </div>

          <button
            onClick={logout}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            登出
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="本期總薪資"
            value={`$${finalSalary.toLocaleString()}`}
            icon={<WalletCards size={22} />}
          />

          <StatCard
            title="接單薪資"
            value={`$${totalSalary.toLocaleString()}`}
            icon={<UserRound size={22} />}
          />

          <StatCard
            title="獎金"
            value={`$${totalBonus.toLocaleString()}`}
            icon={<CalendarDays size={22} />}
          />

          <StatCard
            title="訂單數"
            value={`${orders.length} 筆`}
            icon={<Power size={22} />}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">個人資料</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  請確認資料正確，後台會依此處理薪轉。
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  staff.is_online
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-500/20 text-zinc-300"
                }`}
              >
                {staff.is_online ? "上線接單中" : "下線停止接單"}
              </span>
            </div>

            <div className="mt-5 grid gap-4">
              <Input
                label="顯示名稱"
                value={form.display_name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, display_name: value }))
                }
              />

              <Input
                label="真實姓名"
                value={form.real_name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, real_name: value }))
                }
              />

              <label className="block">
                <span className="text-sm text-zinc-300">性別</span>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, gender: e.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-violet-400"
                >
                  <option value="">請選擇</option>
                  <option value="女">女</option>
                  <option value="男">男</option>
                  <option value="其他">其他</option>
                  <option value="不公開">不公開</option>
                </select>
              </label>

              <Input
                label="生日"
                type="date"
                value={form.birthday}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, birthday: value }))
                }
              />

              <Input
                label="薪轉銀行"
                value={form.bank_name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, bank_name: value }))
                }
              />

              <Input
                label="銀行帳號"
                value={form.bank_account}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, bank_account: value }))
                }
              />
            </div>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? "儲存中..." : "儲存個人資料"}
            </button>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => toggleOnline(true)}
                className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-400"
              >
                上線接單
              </button>

              <button
                onClick={() => toggleOnline(false)}
                className="rounded-2xl bg-zinc-700 px-4 py-3 font-semibold text-white hover:bg-zinc-600"
              >
                下線停止接單
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold">我的接單紀錄</h2>
            <p className="mt-1 text-sm text-zinc-400">
              這裡會顯示你在秋奈電競完成的訂單與薪資。
            </p>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/10 text-zinc-300">
                  <tr>
                    <th className="px-4 py-3">日期</th>
                    <th className="px-4 py-3">服務</th>
                    <th className="px-4 py-3">金額</th>
                    <th className="px-4 py-3">薪資</th>
                    <th className="px-4 py-3">狀態</th>
                  </tr>
                </thead>

                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-zinc-400"
                      >
                        目前還沒有接單紀錄
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="border-t border-white/10">
                        <td className="px-4 py-3 text-zinc-300">
                          {formatDate(order.order_finished_at)}
                        </td>

                        <td className="px-4 py-3">
                          {order.service_name || "未命名服務"}
                        </td>

                        <td className="px-4 py-3">
                          ${Number(order.order_amount || 0).toLocaleString()}
                        </td>

                        <td className="px-4 py-3 text-violet-300">
                          ${Number(order.staff_salary || 0).toLocaleString()}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                            {order.status || "未發薪"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-2xl bg-black/20 p-4 text-sm text-zinc-300">
              <p>訂單總額：${totalOrderAmount.toLocaleString()}</p>
              <p className="mt-1">接單薪資：${totalSalary.toLocaleString()}</p>
              <p className="mt-1">獎金總額：${totalBonus.toLocaleString()}</p>
              <p className="mt-1 font-bold text-violet-300">
                合計薪資：${finalSalary.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{title}</p>
        <div className="text-violet-300">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>

      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-violet-400"
      />
    </label>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}