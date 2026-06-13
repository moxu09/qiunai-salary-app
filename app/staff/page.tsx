"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Save,
  LogOut,
  RefreshCw,
  CircleDot,
  Gamepad2,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
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

type StaffService = {
  id: string;
  discord_id: string;
  service_key: string;
  service_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ServiceOption = {
  key: string;
  name: string;
  group: string;
  hint?: string;
};

const SERVICE_OPTIONS: ServiceOption[] = [
  // 特戰英豪
  {
    key: "valorant_god",
    name: "大神陪玩",
    group: "特戰英豪",
  },
  {
    key: "valorant_skill",
    name: "技術陪玩",
    group: "特戰英豪",
  },
  {
    key: "valorant_entertainment",
    name: "娛樂陪玩",
    group: "特戰英豪",
  },

  // 三角洲行動
  {
    key: "delta_pc",
    name: "電腦版",
    group: "三角洲行動",
  },
  {
    key: "delta_mobile",
    name: "手機版",
    group: "三角洲行動",
  },
  {
    key: "delta_entertainment",
    name: "娛樂",
    group: "三角洲行動",
  },
  {
    key: "delta_basic_guard",
    name: "基本單護",
    group: "三角洲行動",
  },
  {
    key: "delta_secret_double_guard",
    name: "機密雙護",
    group: "三角洲行動",
  },
  {
    key: "delta_attack_guard",
    name: "猛攻護航",
    group: "三角洲行動",
  },

  // Apex
  {
    key: "apex_god",
    name: "大神陪玩",
    group: "Apex",
  },
  {
    key: "apex_skill",
    name: "技術陪玩",
    group: "Apex",
  },
  {
    key: "apex_entertainment",
    name: "娛樂陪玩",
    group: "Apex",
  },

  // 英雄聯盟
  {
    key: "lol_main",
    name: "英雄聯盟",
    group: "英雄聯盟",
    hint: "模式",
  },
  {
    key: "lol_aram",
    name: "ARAM",
    group: "英雄聯盟",
    hint: "模式",
  },
  {
    key: "lol_tft",
    name: "聯盟戰棋",
    group: "英雄聯盟",
    hint: "模式",
  },
  {
    key: "lol_god",
    name: "大神陪玩",
    group: "英雄聯盟",
    hint: "類型",
  },
  {
    key: "lol_skill",
    name: "技術陪玩",
    group: "英雄聯盟",
    hint: "類型",
  },
  {
    key: "lol_entertainment",
    name: "娛樂陪玩",
    group: "英雄聯盟",
    hint: "類型",
  },

  // Steam
  {
    key: "steam_roguelike",
    name: "肉鴿遊戲",
    group: "Steam",
  },
  {
    key: "steam_survival",
    name: "生存遊戲",
    group: "Steam",
  },
  {
    key: "steam_horror",
    name: "恐怖遊戲",
    group: "Steam",
  },
  {
    key: "steam_party",
    name: "派對遊戲",
    group: "Steam",
  },

  // 其他項目
  {
    key: "pubgm",
    name: "PUBG M",
    group: "其他項目",
  },
  {
    key: "naraka",
    name: "NARAKA",
    group: "其他項目",
  },
  {
    key: "minecraft",
    name: "Minecraft",
    group: "其他項目",
  },
  {
    key: "voice_chat",
    name: "語音聊天",
    group: "其他項目",
  },
  {
    key: "song_request",
    name: "點歌服務",
    group: "其他項目",
  },
];

export default function StaffPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [staff, setStaff] = useState<Staff | null>(null);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOnline, setSavingOnline] = useState(false);

  const [profileForm, setProfileForm] = useState({
    display_name: "",
    real_name: "",
    gender: "",
    birthday: "",
    bank_name: "",
    bank_account: "",
  });

  useEffect(() => {
    init();
  }, []);

  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceOption[]> = {};

    for (const service of SERVICE_OPTIONS) {
      if (!groups[service.group]) {
        groups[service.group] = [];
      }

      groups[service.group].push(service);
    }

    return groups;
  }, []);

  const totals = useMemo(() => {
    const totalSalary = orders.reduce(
      (sum, order) => sum + Number(order.staff_salary || 0),
      0
    );

    const orderBonus = orders.reduce(
      (sum, order) => sum + Number(order.bonus_amount || 0),
      0
    );

    const extraBonus = bonusList.reduce(
      (sum, bonus) => sum + Number(bonus.amount || 0),
      0
    );

    const totalBonus = orderBonus + extraBonus;

    const unpaidSalary = orders
      .filter((order) => order.status !== "已發薪")
      .reduce(
        (sum, order) =>
          sum +
          Number(order.staff_salary || 0) +
          Number(order.bonus_amount || 0),
        0
      );

    return {
      orderCount: orders.length,
      bonusCount: bonusList.length,
      totalSalary,
      totalBonus,
      totalIncome: totalSalary + totalBonus,
      unpaidSalary,
    };
  }, [orders, bonusList]);

  async function init() {
    setLoading(true);
    setPageError("");

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error("session error:", sessionError);
      setPageError("讀取登入狀態失敗，請重新登入。");
      setLoading(false);
      return;
    }

    if (!sessionData.session) {
      router.replace("/");
      return;
    }

    const user = sessionData.session.user;

    const discordId =
      user.user_metadata?.provider_id ||
      user.user_metadata?.sub ||
      user.identities?.[0]?.identity_data?.provider_id ||
      user.identities?.[0]?.identity_data?.sub ||
      user.identities?.[0]?.id;

    const discordName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.user_name ||
      user.user_metadata?.preferred_username ||
      user.email ||
      "Discord 使用者";

    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      user.identities?.[0]?.identity_data?.avatar_url ||
      user.identities?.[0]?.identity_data?.picture ||
      null;

    if (!discordId) {
      setPageError("讀取 Discord ID 失敗，請重新登入。");
      setLoading(false);
      return;
    }

    const ensureRes = await fetch("/api/qiunai/ensure-staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discord_id: String(discordId),
        discord_name: discordName,
        avatar_url: avatarUrl,
      }),
    });

    const ensureData = await ensureRes.json();

    if (!ensureRes.ok || !ensureData.ok) {
      setPageError(ensureData.message || "你目前沒有秋奈員工權限。");
      setLoading(false);
      return;
    }

    const staffData = ensureData.staff as Staff;

    setStaff(staffData);

    setProfileForm({
      display_name: staffData.display_name || "",
      real_name: staffData.real_name || "",
      gender: staffData.gender || "",
      birthday: staffData.birthday || "",
      bank_name: staffData.bank_name || "",
      bank_account: staffData.bank_account || "",
    });

    await loadSalaryData(staffData.discord_id);
    await loadStaffServices(staffData.discord_id);

    setLoading(false);
  }

  async function loadSalaryData(discordId: string) {
    const startIso = getMonthStartIso();
    const endIso = new Date().toISOString();

    const { data: orderData, error: orderError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .eq("discord_id", discordId)
      .gte("order_finished_at", startIso)
      .lte("order_finished_at", endIso)
      .order("order_finished_at", { ascending: false });

    if (orderError) {
      console.error("load salary orders error:", orderError);
    }

    const { data: bonusData, error: bonusError } = await supabase
      .from("qiunai_staff_bonus")
      .select("*")
      .eq("discord_id", discordId)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false });

    if (bonusError) {
      console.error("load bonus error:", bonusError);
    }

    setOrders((orderData || []) as SalaryOrder[]);
    setBonusList((bonusData || []) as BonusItem[]);
  }

  async function loadStaffServices(discordId: string) {
    const { data, error } = await supabase
      .from("qiunai_staff_services")
      .select("*")
      .eq("discord_id", discordId)
      .eq("enabled", true);

    if (error) {
      console.error("load staff services error:", error);
      return;
    }

    setSelectedServices(
      ((data || []) as StaffService[]).map((item) => item.service_key)
    );
  }

  function updateProfileField(key: string, value: string) {
    setProfileForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveProfile() {
    if (!staff) return;

    setSavingProfile(true);

    const { data, error } = await supabase
      .from("qiunai_staff")
      .update({
        display_name: profileForm.display_name || null,
        real_name: profileForm.real_name || null,
        gender: profileForm.gender || null,
        birthday: profileForm.birthday || null,
        bank_name: profileForm.bank_name || null,
        bank_account: profileForm.bank_account || null,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    setSavingProfile(false);

    if (error) {
      console.error("save profile error:", error);
      alert("儲存個人資料失敗");
      return;
    }

    setStaff(data as Staff);
    alert("個人資料已儲存");
  }

  async function toggleOnline() {
    if (!staff) return;

    setSavingOnline(true);

    const nextOnline = !staff.is_online;

    const { data, error } = await supabase
      .from("qiunai_staff")
      .update({
        is_online: nextOnline,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    setSavingOnline(false);

    if (error) {
      console.error("toggle online error:", error);
      alert("切換上線狀態失敗");
      return;
    }

    setStaff(data as Staff);
  }

  function toggleService(serviceKey: string) {
    setSelectedServices((prev) => {
      if (prev.includes(serviceKey)) {
        return prev.filter((key) => key !== serviceKey);
      }

      return [...prev, serviceKey];
    });
  }

  async function saveStaffServices() {
    if (!staff) return;

    setSavingServices(true);

    const { error: deleteError } = await supabase
      .from("qiunai_staff_services")
      .delete()
      .eq("discord_id", staff.discord_id);

    if (deleteError) {
      console.error("delete services error:", deleteError);
      alert("更新可接遊戲失敗");
      setSavingServices(false);
      return;
    }

    if (selectedServices.length > 0) {
      const rows = selectedServices.map((key) => {
        const option = SERVICE_OPTIONS.find((item) => item.key === key);

        return {
          discord_id: staff.discord_id,
          service_key: key,
          service_name: option
            ? `${option.group}｜${option.name}`
            : key,
          enabled: true,
          updated_at: new Date().toISOString(),
        };
      });

      const { error: insertError } = await supabase
        .from("qiunai_staff_services")
        .insert(rows);

      if (insertError) {
        console.error("insert services error:", insertError);
        alert("儲存可接遊戲失敗");
        setSavingServices(false);
        return;
      }
    }

    setSavingServices(false);
    alert("可接遊戲已儲存");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function refreshData() {
    if (!staff) return;

    await loadSalaryData(staff.discord_id);
    await loadStaffServices(staff.discord_id);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-300 border-t-transparent" />
          <p className="text-sm text-zinc-300">載入員工資料中...</p>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-xl font-bold">無法進入員工薪資網</h1>

          <p className="mt-4 whitespace-pre-wrap text-sm text-red-200">
            {pageError}
          </p>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.replace("/")}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              回登入頁
            </button>

            <button
              onClick={logout}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm hover:bg-red-400"
            >
              登出
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!staff) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white">
      <header className="border-b border-white/10 bg-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-4">
            {staff.avatar_url ? (
              <img
                src={staff.avatar_url}
                alt=""
                className="h-12 w-12 rounded-full border border-white/10"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/10" />
            )}

            <div>
              <p className="text-sm text-violet-300">Qiunai Staff</p>
              <h1 className="text-2xl font-bold">秋奈電競｜員工薪資中心</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {staff.display_name || staff.discord_name || staff.discord_id}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={refreshData}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
            >
              <RefreshCw size={16} />
              重新整理
            </button>

            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-sm hover:bg-red-400"
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="本月訂單" value={`${totals.orderCount} 筆`} />
          <Stat
            title="本月薪資"
            value={`$${totals.totalSalary.toLocaleString()}`}
          />
          <Stat
            title="本月獎金"
            value={`$${totals.totalBonus.toLocaleString()}`}
          />
          <Stat
            title="未發薪"
            value={`$${totals.unpaidSalary.toLocaleString()}`}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">接單狀態</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    客人選陪陪時會看到你的狀態。
                  </p>
                </div>

                <span
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                    staff.is_online
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-500/20 text-zinc-300"
                  }`}
                >
                  <CircleDot size={14} />
                  {staff.is_online ? "上線中" : "下線中"}
                </span>
              </div>

              <button
                onClick={toggleOnline}
                disabled={savingOnline}
                className={`mt-5 w-full rounded-2xl px-5 py-3 font-semibold disabled:opacity-50 ${
                  staff.is_online
                    ? "bg-zinc-600 hover:bg-zinc-500"
                    : "bg-emerald-500 hover:bg-emerald-400"
                }`}
              >
                {savingOnline
                  ? "更新中..."
                  : staff.is_online
                  ? "切換為下線"
                  : "切換為上線"}
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2">
                <WalletCards className="text-violet-300" size={20} />
                <h2 className="text-xl font-bold">個人資料</h2>
              </div>

              <div className="mt-5 space-y-4">
                <Input
                  label="顯示名稱"
                  value={profileForm.display_name}
                  onChange={(value) =>
                    updateProfileField("display_name", value)
                  }
                />

                <Input
                  label="真實姓名"
                  value={profileForm.real_name}
                  onChange={(value) => updateProfileField("real_name", value)}
                />

                <label className="block">
                  <span className="text-sm text-zinc-300">性別</span>

                  <select
                    value={profileForm.gender}
                    onChange={(e) =>
                      updateProfileField("gender", e.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                  >
                    <option value="">未填</option>
                    <option value="女">女</option>
                    <option value="男">男</option>
                    <option value="其他">其他</option>
                    <option value="不公開">不公開</option>
                  </select>
                </label>

                <Input
                  label="生日"
                  type="date"
                  value={profileForm.birthday}
                  onChange={(value) => updateProfileField("birthday", value)}
                />

                <Input
                  label="銀行名稱"
                  value={profileForm.bank_name}
                  onChange={(value) => updateProfileField("bank_name", value)}
                />

                <Input
                  label="銀行帳號"
                  value={profileForm.bank_account}
                  onChange={(value) =>
                    updateProfileField("bank_account", value)
                  }
                />

                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400 disabled:opacity-50"
                >
                  <Save size={18} />
                  {savingProfile ? "儲存中..." : "儲存個人資料"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2">
                <Gamepad2 className="text-violet-300" size={20} />
                <h2 className="text-xl font-bold">可接遊戲 / 服務</h2>
              </div>

              <p className="mt-2 text-sm text-zinc-400">
                請勾選你可以接的項目。客人下單對應項目時，系統會依這裡篩選員工。
              </p>

              <p className="mt-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                英雄聯盟類型需要同時勾「模式」和「陪玩類型」。
                例如：要接 ARAM｜大神陪玩，就要勾 ARAM + 大神陪玩。
              </p>

              <div className="mt-5 space-y-5">
                {Object.entries(groupedServices).map(([groupName, services]) => (
                  <div
                    key={groupName}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <h3 className="font-bold text-violet-200">{groupName}</h3>

                    <div className="mt-3 grid gap-3">
                      {services.map((service) => (
                        <label
                          key={service.key}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedServices.includes(service.key)}
                              onChange={() => toggleService(service.key)}
                              className="h-5 w-5 accent-violet-500"
                            />

                            <span className="text-sm">{service.name}</span>
                          </div>

                          {service.hint ? (
                            <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs text-violet-200">
                              {service.hint}
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={saveStaffServices}
                disabled={savingServices}
                className="mt-5 w-full rounded-2xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400 disabled:opacity-50"
              >
                {savingServices ? "儲存中..." : "儲存可接遊戲"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-xl font-bold">本月訂單</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  顯示本月 1 號到現在的訂單。
                </p>
              </div>

              {orders.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  目前沒有本月訂單
                </div>
              ) : (
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-white/10 text-zinc-300">
                    <tr>
                      <th className="px-4 py-3">完成時間</th>
                      <th className="px-4 py-3">客人</th>
                      <th className="px-4 py-3">服務</th>
                      <th className="px-4 py-3">訂單金額</th>
                      <th className="px-4 py-3">薪資</th>
                      <th className="px-4 py-3">獎金</th>
                      <th className="px-4 py-3">狀態</th>
                      <th className="px-4 py-3">發薪時間</th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-t border-white/10">
                        <td className="px-4 py-3 text-zinc-300">
                          {formatDateTime(order.order_finished_at)}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-xl font-bold">本月額外獎金</h2>
              </div>

              {bonusList.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  目前沒有額外獎金
                </div>
              ) : (
                <table className="min-w-[700px] w-full text-left text-sm">
                  <thead className="bg-white/10 text-zinc-300">
                    <tr>
                      <th className="px-4 py-3">時間</th>
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
          </div>
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

function getMonthStartIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return start.toISOString();
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