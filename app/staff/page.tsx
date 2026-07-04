"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Save,
  LogOut,
  RefreshCw,
  CircleDot,
  Gamepad2,
  WalletCards,
  Heart,
  Sparkles,
  HandCoins,
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
  commission_tier: string | null;
  commission_note: string | null;
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
  salary_rate: number | null;
  salary_level: string | null;
  platform_income: number | null;
  platform_expense: number | null;
  status: string | null;
  paid_at: string | null;
  order_finished_at: string | null;
  is_deleted: boolean | null;
  wallet_settled_at?: string | null;
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

type SalaryWalletEntry = {
  id: string;
  entry_type: string;
  amount: number | string;
  source_label?: string | null;
  period_key?: string | null;
  created_at?: string | null;
};

type SalaryWithdrawRequest = {
  id: string;
  amount: number | string;
  status: string;
  reject_reason?: string | null;
  requested_at?: string | null;
  reviewed_at?: string | null;
};

type SalaryWalletData = {
  totals: {
    orderSalary: number;
    bonus: number;
    deposited: number;
    approvedWithdrawn: number;
    pendingWithdrawn: number;
    balance: number;
    available: number;
  };
  entries: SalaryWalletEntry[];
  requests: SalaryWithdrawRequest[];
  pendingRequest: SalaryWithdrawRequest | null;
  latestRequest: SalaryWithdrawRequest | null;
  withdrawWindow: {
    isOpen: boolean;
    note: string;
  };
};

const SERVICE_OPTIONS: ServiceOption[] = [
  { key: "valorant_god", name: "大神陪玩", group: "特戰英豪" },
  { key: "valorant_skill", name: "技術陪玩", group: "特戰英豪" },
  { key: "valorant_entertainment", name: "娛樂陪玩", group: "特戰英豪" },

  { key: "delta_pc", name: "電腦版", group: "三角洲行動" },
  { key: "delta_mobile", name: "手機版", group: "三角洲行動" },
  { key: "delta_entertainment", name: "娛樂", group: "三角洲行動" },
  { key: "delta_basic_guard", name: "基本單護", group: "三角洲行動" },
  { key: "delta_secret_double_guard", name: "機密雙護", group: "三角洲行動" },
  { key: "delta_attack_guard", name: "猛攻護航", group: "三角洲行動" },

  { key: "apex_god", name: "大神陪玩", group: "Apex" },
  { key: "apex_skill", name: "技術陪玩", group: "Apex" },
  { key: "apex_entertainment", name: "娛樂陪玩", group: "Apex" },

  { key: "lol_main", name: "英雄聯盟", group: "英雄聯盟", hint: "模式" },
  { key: "lol_aram", name: "ARAM", group: "英雄聯盟", hint: "模式" },
  { key: "lol_tft", name: "聯盟戰棋", group: "英雄聯盟", hint: "模式" },
  { key: "lol_god", name: "大神陪玩", group: "英雄聯盟", hint: "類型" },
  { key: "lol_skill", name: "技術陪玩", group: "英雄聯盟", hint: "類型" },
  { key: "lol_entertainment", name: "娛樂陪玩", group: "英雄聯盟", hint: "類型" },

  { key: "steam_roguelike", name: "肉鴿遊戲", group: "Steam" },
  { key: "steam_survival", name: "生存遊戲", group: "Steam" },
  { key: "steam_horror", name: "恐怖遊戲", group: "Steam" },
  { key: "steam_party", name: "派對遊戲", group: "Steam" },

  { key: "pubgm", name: "PUBG M", group: "其他項目" },
  { key: "naraka", name: "NARAKA", group: "其他項目" },
  { key: "minecraft", name: "Minecraft", group: "其他項目" },
  { key: "voice_chat", name: "語音聊天", group: "其他項目" },
  { key: "song_request", name: "點歌服務", group: "其他項目" },
];

export default function StaffPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [staff, setStaff] = useState<Staff | null>(null);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [allSalaryOrders, setAllSalaryOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOnline, setSavingOnline] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [salaryWallet, setSalaryWallet] = useState<SalaryWalletData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthInput());

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
      .filter((order) => order.status !== "已發薪" && !order.wallet_settled_at)
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

  const commissionInfo = useMemo(() => {
    if (!staff) {
      return {
        currentRate: 80,
        currentLabel: "尚未判定",
        totalOrderAmount: 0,
        thisYearSalary: 0,
        progress85: 0,
        progress90: 0,
        remaining85: 10000,
        remaining90: 100000,
      };
    }

    const now = new Date();
    const openingEnd = new Date("2026-09-01T00:00:00+08:00");

    const totalOrderAmount = allSalaryOrders.reduce(
      (sum, order) => sum + Number(order.order_amount || 0),
      0
    );

    const thisYear = now.getFullYear();

    const thisYearSalary = allSalaryOrders
      .filter((order) => {
        const sourceDate = order.order_finished_at || order.created_at;
        const year = new Date(sourceDate).getFullYear();

        return year === thisYear;
      })
      .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);

    const previousYear = thisYear - 1;

    const previousYearSalary = allSalaryOrders
      .filter((order) => {
        const sourceDate = order.order_finished_at || order.created_at;
        const year = new Date(sourceDate).getFullYear();

        return year === previousYear;
      })
      .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);

    const progress85 = Math.min(
      100,
      Math.round((totalOrderAmount / 10000) * 100)
    );

    const progress90 = Math.min(
      100,
      Math.round((thisYearSalary / 100000) * 100)
    );

    let currentRate = 80;
    let currentLabel = "九月後預設 80%";
    const manualRate = getManualCommissionRate(staff.commission_tier);

    if (manualRate) {
      currentRate = manualRate;
      currentLabel =
        manualRate === 95
          ? "主管津貼 95%"
          : `後台設定 ${manualRate}%`;
    } else if (now < openingEnd) {
      currentRate = 90;
      currentLabel = "開幕期預設 90%";
    } else {
      if (previousYearSalary >= 100000) {
        currentRate = 90;
        currentLabel = "去年薪資達標｜今年 90%";
      } else if (is85ActiveThisMonth(allSalaryOrders)) {
        currentRate = 85;
        currentLabel = "累積接單滿 10,000｜85%";
      }
    }

    const latestOrderWithRate = [...allSalaryOrders]
      .filter((order) => order.salary_rate)
      .sort(
        (a, b) =>
          new Date(b.order_finished_at || b.created_at).getTime() -
          new Date(a.order_finished_at || a.created_at).getTime()
      )[0];

    if (
      latestOrderWithRate &&
      staff.commission_tier === "auto" &&
      now >= openingEnd
    ) {
      currentRate = Number(latestOrderWithRate.salary_rate || currentRate);
      currentLabel = latestOrderWithRate.salary_level || currentLabel;
    }

    return {
      currentRate,
      currentLabel,
      totalOrderAmount,
      thisYearSalary,
      progress85,
      progress90,
      remaining85: Math.max(0, 10000 - totalOrderAmount),
      remaining90: Math.max(0, 100000 - thisYearSalary),
    };
  }, [staff, allSalaryOrders]);

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

    await loadSalaryWallet();
    await loadSalaryData(staffData.discord_id);
    await loadStaffServices(staffData.discord_id);

    setLoading(false);
  }

  async function loadSalaryData(discordId: string) {
    const { startIso, endIso } = getMonthRange(selectedMonth);

    const { data: orderData, error: orderError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .eq("discord_id", discordId)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .gte("order_finished_at", startIso)
      .lte("order_finished_at", endIso)
      .order("order_finished_at", { ascending: false });

    if (orderError) {
      console.error("load salary orders error:", orderError);
    }

    const { data: allOrderData, error: allOrderError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .eq("discord_id", discordId)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .order("order_finished_at", { ascending: false });

    if (allOrderError) {
      console.error("load all salary orders error:", allOrderError);
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
    setAllSalaryOrders((allOrderData || []) as SalaryOrder[]);
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

  async function loadSalaryWallet() {
    setWalletLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) return;

      const res = await fetch("/api/qiunai/salary-wallet", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "讀取薪資錢包失敗");
      }

      setSalaryWallet(payload.wallet as SalaryWalletData);
    } catch (error: unknown) {
      console.error("load salary wallet error:", error);
      alert(error instanceof Error ? error.message : "讀取薪資錢包失敗");
    } finally {
      setWalletLoading(false);
    }
  }

  async function requestWithdraw() {
    if (!salaryWallet) return;

    if (
      !confirm(
        `確定要申請提領 $${Number(
          salaryWallet.totals.available || 0
        ).toLocaleString()}？`
      )
    ) {
      return;
    }

    setWithdrawing(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        throw new Error("請重新登入");
      }

      const res = await fetch("/api/qiunai/salary-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "送出提領申請失敗");
      }

      setSalaryWallet(payload.wallet as SalaryWalletData);
      alert("提領申請已送出");
    } catch (error: unknown) {
      console.error("request withdraw error:", error);
      alert(error instanceof Error ? error.message : "送出提領申請失敗");
    } finally {
      setWithdrawing(false);
    }
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
    const allowedServices =
      selectedServices.map((key) => getAllowedServiceNameByKey(key));
    const { error: updateStaffError } = await supabase
      .from("qiunai_staff")
      .update({
        allowed_services: allowedServices,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id);
    if (updateStaffError) {
      console.error("update allowed_services error:", updateStaffError);
      alert("更新可接服務失敗");
      setSavingServices(false);
      return;
    }
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
        return {
          discord_id: staff.discord_id,
          service_key: key,
          service_name: getAllowedServiceNameByKey(key),
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

    await loadSalaryWallet();
    await loadSalaryData(staff.discord_id);
    await loadStaffServices(staff.discord_id);
  }

  if (loading) {
    return (
      <main className="qiunai-page flex items-center justify-center px-4">
        <div className="qiunai-card rounded-[32px] p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-pink-300 border-t-transparent" />
          <p className="text-sm text-[#8b5a8f]">載入員工資料中...</p>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="qiunai-page flex items-center justify-center px-4">
        <div className="qiunai-card w-full max-w-lg rounded-[32px] p-6">
          <h1 className="text-xl font-black text-rose-600">
            無法進入員工薪資網
          </h1>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-rose-500">
            {pageError}
          </p>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.replace("/")}
              className="qiunai-soft-button px-4 py-2 text-sm font-semibold"
            >
              回登入頁
            </button>

            <button
              onClick={logout}
              className="rounded-2xl bg-rose-400 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
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
    <main className="qiunai-page">
      <div className="qiunai-glow left-[-90px] top-[-90px] h-72 w-72 bg-pink-300" />
      <div className="qiunai-glow right-[-100px] top-32 h-80 w-80 bg-purple-300" />
      <div className="qiunai-glow bottom-[-120px] left-1/2 h-80 w-80 -translate-x-1/2 bg-rose-200" />

      <header className="relative z-10 border-b border-pink-200/50 bg-white/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {staff.avatar_url ? (
              <img
                src={staff.avatar_url}
                alt=""
                className="h-14 w-14 rounded-[22px] border border-pink-200 bg-white object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-pink-300 to-violet-300 text-white shadow-lg">
                <Heart size={24} fill="currentColor" />
              </div>
            )}

            <div>
              <p className="flex items-center gap-1 text-sm font-semibold text-pink-500">
                <Sparkles size={14} />
                Qiunai Staff
              </p>
              <h1 className="qiunai-title-gradient text-2xl font-black">
                秋奈電競｜員工薪資中心
              </h1>
              <p className="mt-1 text-sm text-[#8b5a8f]">
                {staff.display_name || staff.discord_name || staff.discord_id}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={refreshData}
              className="qiunai-soft-button flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              <RefreshCw size={16} />
              重新整理
            </button>

            <button
              onClick={logout}
              className="rounded-[18px] bg-rose-400 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200/70 hover:bg-rose-500"
            >
              <span className="flex items-center gap-2">
                <LogOut size={16} />
                登出
              </span>
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="月份訂單" value={`${totals.orderCount} 筆`} />
          <Stat
            title="月份薪資"
            value={`$${totals.totalSalary.toLocaleString()}`}
          />
          <Stat
            title="獎金 / 扣除"
            value={`$${totals.totalBonus.toLocaleString()}`}
          />
          <Stat
            title="未發薪"
            value={`$${totals.unpaidSalary.toLocaleString()}`}
          />
        </div>

        <div className="mt-6">
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-pink-500">
                  <HandCoins size={18} />
                  薪資錢包
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#5b3768]">
                  可累積提領的薪資餘額
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8b5a8f]">
                  每月 17 號入帳 1-15 號薪水；每月 2 號入帳上月 16-月底薪水。
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <button
                  onClick={requestWithdraw}
                  disabled={
                    withdrawing ||
                    walletLoading ||
                    !salaryWallet ||
                    !salaryWallet.withdrawWindow.isOpen ||
                    !!salaryWallet.pendingRequest ||
                    Number(salaryWallet.totals.available || 0) <= 0
                  }
                  className="qiunai-button px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {withdrawing ? "申請中..." : "提領"}
                </button>
                <p className="text-xs font-semibold text-[#a36b9e]">
                  每月 2 到 10 號可以提領，提領需要三個工作天。
                </p>
              </div>
            </div>

            {walletLoading && !salaryWallet ? (
              <div className="mt-5 rounded-[24px] bg-pink-50 px-4 py-5 text-center text-sm font-semibold text-pink-500">
                讀取薪資錢包中...
              </div>
            ) : salaryWallet ? (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <WalletStat
                    title="錢包餘額"
                    value={`$${Number(salaryWallet.totals.balance || 0).toLocaleString()}`}
                  />
                  <WalletStat
                    title="訂單薪水"
                    value={`$${Number(salaryWallet.totals.orderSalary || 0).toLocaleString()}`}
                  />
                  <WalletStat
                    title="獎金 / 扣除"
                    value={`$${Number(salaryWallet.totals.bonus || 0).toLocaleString()}`}
                  />
                  <WalletStat
                    title="使用的薪水"
                    value={`$${Number(salaryWallet.totals.approvedWithdrawn || 0).toLocaleString()}`}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-pink-100 bg-pink-50/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-black text-[#5b3768]">提領狀態</p>
                    <p className="mt-1 text-sm text-[#8b5a8f]">
                      可提領：$
                      {Number(salaryWallet.totals.available || 0).toLocaleString()}
                      {salaryWallet.totals.pendingWithdrawn > 0
                        ? `，申請中：$${Number(
                            salaryWallet.totals.pendingWithdrawn || 0
                          ).toLocaleString()}`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${getRequestStatusClass(
                      salaryWallet.latestRequest
                    )}`}
                  >
                    {getRequestStatusText(salaryWallet.latestRequest)}
                  </span>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left text-sm">
                    <thead className="bg-pink-50 text-[#8b5a8f]">
                      <tr>
                        <th className="px-4 py-3">時間</th>
                        <th className="px-4 py-3">項目</th>
                        <th className="px-4 py-3">期別</th>
                        <th className="px-4 py-3">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryWallet.entries.slice(0, 8).map((entry) => (
                        <tr key={entry.id} className="border-t border-pink-100">
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {formatDateTime(entry.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#5b3768]">
                              {formatEntryType(entry.entry_type)}
                            </p>
                            <p className="text-xs text-[#a36b9e]">
                              {entry.source_label || "-"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {entry.period_key || "-"}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              Number(entry.amount || 0) < 0
                                ? "text-red-500"
                                : "text-pink-500"
                            }`}
                          >
                            ${Number(entry.amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <Input
                label="薪資月份"
                type="month"
                value={selectedMonth}
                onChange={setSelectedMonth}
              />

              <button
                onClick={refreshData}
                className="qiunai-button flex items-center justify-center gap-2 px-5 py-3 font-bold"
              >
                <RefreshCw size={16} />
                查詢月份
              </button>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="flex items-center gap-1 text-sm font-semibold text-pink-500">
                  <Sparkles size={14} />
                  我的抽成檔位
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <p className="qiunai-title-gradient text-5xl font-black">
                    {commissionInfo.currentRate}%
                  </p>

                  <p className="pb-2 text-sm font-semibold text-[#8b5a8f]">
                    {commissionInfo.currentLabel}
                  </p>
                </div>

                <p className="mt-3 text-sm leading-6 text-[#8b5a8f]">
                  85% 依累積接單金額判定；90% 依今年薪資進度，達標後隔年整年適用。
                </p>
              </div>

              <div className="grid flex-1 gap-4 lg:max-w-2xl">
                <ProgressBlock
                  title="升級 85% 進度"
                  percent={commissionInfo.progress85}
                  current={commissionInfo.totalOrderAmount}
                  target={10000}
                  note={
                    commissionInfo.remaining85 === 0
                      ? "已達 10,000，依規則下個月開始可進入 85%"
                      : `還差 $${commissionInfo.remaining85.toLocaleString()}`
                  }
                />

                <ProgressBlock
                  title="升級隔年 90% 進度"
                  percent={commissionInfo.progress90}
                  current={commissionInfo.thisYearSalary}
                  target={100000}
                  note={
                    commissionInfo.remaining90 === 0
                      ? "今年薪資已達 100,000，隔年可適用 90%"
                      : `還差 $${commissionInfo.remaining90.toLocaleString()}`
                  }
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#5b3768]">
                    接單狀態
                  </h2>
                  <p className="mt-1 text-sm text-[#8b5a8f]">
                    客人選陪陪時會看到你的狀態。
                  </p>
                </div>

                <span
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
                    staff.is_online
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  <CircleDot size={14} />
                  {staff.is_online ? "上線中" : "下線中"}
                </span>
              </div>

              <button
                onClick={toggleOnline}
                disabled={savingOnline}
                className={`mt-5 w-full rounded-[22px] px-5 py-3 font-bold text-white shadow-lg disabled:opacity-50 ${
                  staff.is_online
                    ? "bg-zinc-400 shadow-zinc-200 hover:bg-zinc-500"
                    : "bg-emerald-400 shadow-emerald-100 hover:bg-emerald-500"
                }`}
              >
                {savingOnline
                  ? "更新中..."
                  : staff.is_online
                  ? "切換為下線"
                  : "切換為上線"}
              </button>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <WalletCards className="text-pink-400" size={20} />
                <h2 className="text-xl font-black text-[#5b3768]">個人資料</h2>
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
                  <span className="text-sm font-semibold text-[#7b4f85]">
                    性別
                  </span>

                  <select
                    value={profileForm.gender}
                    onChange={(e) =>
                      updateProfileField("gender", e.target.value)
                    }
                    className="qiunai-input mt-2"
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
                  className="qiunai-button flex w-full items-center justify-center gap-2 px-5 py-3 font-bold"
                >
                  <Save size={18} />
                  {savingProfile ? "儲存中..." : "儲存個人資料"}
                </button>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <Gamepad2 className="text-pink-400" size={20} />
                <h2 className="text-xl font-black text-[#5b3768]">
                  可接遊戲 / 服務
                </h2>
              </div>

              <p className="mt-2 text-sm leading-6 text-[#8b5a8f]">
                請勾選你可以接的項目。客人下單對應項目時，系統會依這裡篩選員工。
              </p>

              <p className="mt-3 rounded-[22px] border border-pink-200 bg-pink-50/80 px-4 py-3 text-sm leading-6 text-pink-600">
                英雄聯盟類型需要同時勾「模式」和「陪玩類型」。
                例如：要接 ARAM｜大神陪玩，就要勾 ARAM + 大神陪玩。
              </p>

              <div className="mt-5 space-y-5">
                {Object.entries(groupedServices).map(([groupName, services]) => (
                  <div
                    key={groupName}
                    className="rounded-[26px] border border-pink-200/70 bg-white/55 p-4"
                  >
                    <h3 className="font-black text-pink-500">{groupName}</h3>

                    <div className="mt-3 grid gap-3">
                      {services.map((service) => (
                        <label
                          key={service.key}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-[20px] border border-pink-100 bg-white/70 px-4 py-3 transition hover:bg-pink-50"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedServices.includes(service.key)}
                              onChange={() => toggleService(service.key)}
                              className="h-5 w-5 accent-pink-400"
                            />

                            <span className="text-sm font-semibold text-[#6b4f71]">
                              {service.name}
                            </span>
                          </div>

                          {service.hint ? (
                            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-500">
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
                className="qiunai-button mt-5 w-full px-5 py-3 font-bold"
              >
                {savingServices ? "儲存中..." : "儲存可接遊戲"}
              </button>
            </Card>
          </div>

          <div className="space-y-6">
            <Card noPadding>
              <div className="border-b border-pink-100 p-5">
                <h2 className="text-xl font-black text-[#5b3768]">
                  {formatMonthLabel(selectedMonth)}訂單
                </h2>
                <p className="mt-1 text-sm text-[#8b5a8f]">
                  顯示所選月份的薪資訂單。
                </p>
              </div>

              {orders.length === 0 ? (
                <div className="p-8 text-center text-[#a36b9e]">
                  目前沒有這個月份的訂單
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-left text-sm">
                    <thead className="bg-pink-50 text-[#8b5a8f]">
                      <tr>
                        <th className="px-4 py-3">完成時間</th>
                        <th className="px-4 py-3">客人</th>
                        <th className="px-4 py-3">服務</th>
                        <th className="px-4 py-3">訂單金額</th>
                        <th className="px-4 py-3">薪資</th>
                        <th className="px-4 py-3">抽成</th>
                        <th className="px-4 py-3">獎金</th>
                        <th className="px-4 py-3">狀態</th>
                        <th className="px-4 py-3">發薪時間</th>
                      </tr>
                    </thead>

                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-t border-pink-100">
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {formatDateTime(order.order_finished_at)}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            {order.customer_name || "-"}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            {order.service_name || "-"}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            ${Number(order.order_amount || 0).toLocaleString()}
                          </td>

                          <td className="px-4 py-3 font-bold text-pink-500">
                            ${Number(order.staff_salary || 0).toLocaleString()}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            <p>
                              {order.salary_rate ? `${order.salary_rate}%` : "-"}
                            </p>
                            <p className="text-xs text-[#a36b9e]">
                              {order.salary_level || ""}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            ${Number(order.bonus_amount || 0).toLocaleString()}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                order.status === "已發薪"
                                  || order.wallet_settled_at
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-yellow-100 text-yellow-600"
                              }`}
                            >
                              {order.wallet_settled_at
                                ? "已入錢包"
                                : order.status || "未發薪"}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {order.wallet_settled_at
                              ? formatDateTime(order.wallet_settled_at)
                              : order.paid_at
                              ? formatDateTime(order.paid_at)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card noPadding>
              <div className="border-b border-pink-100 p-5">
                <h2 className="text-xl font-black text-[#5b3768]">
                  {formatMonthLabel(selectedMonth)}獎金 / 扣除
                </h2>
              </div>

              {bonusList.length === 0 ? (
                <div className="p-8 text-center text-[#a36b9e]">
                  目前沒有這個月份的獎金或扣除
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[700px] w-full text-left text-sm">
                    <thead className="bg-pink-50 text-[#8b5a8f]">
                      <tr>
                        <th className="px-4 py-3">時間</th>
                        <th className="px-4 py-3">獎金名稱</th>
                        <th className="px-4 py-3">金額</th>
                        <th className="px-4 py-3">備註</th>
                      </tr>
                    </thead>

                    <tbody>
                      {bonusList.map((bonus) => (
                        <tr key={bonus.id} className="border-t border-pink-100">
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {formatDateTime(bonus.created_at)}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            {bonus.title}
                          </td>

                          <td
                            className={`px-4 py-3 font-bold ${
                              Number(bonus.amount || 0) < 0
                                ? "text-red-500"
                                : "text-pink-500"
                            }`}
                          >
                            ${Number(bonus.amount || 0).toLocaleString()}
                          </td>

                          <td className="px-4 py-3 text-[#5b3768]">
                            {bonus.note || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({
  children,
  noPadding = false,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div
      className={`qiunai-card overflow-hidden rounded-[32px] ${
        noPadding ? "" : "p-6"
      }`}
    >
      {children}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="qiunai-card rounded-[28px] p-5">
      <p className="text-sm font-semibold text-[#8b5a8f]">{title}</p>
      <p className="qiunai-title-gradient mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function WalletStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-pink-100 bg-pink-50/70 px-4 py-3">
      <p className="text-xs font-bold text-pink-500">{title}</p>
      <p className="mt-2 text-xl font-black text-[#5b3768]">{value}</p>
    </div>
  );
}

function ProgressBlock({
  title,
  percent,
  current,
  target,
  note,
}: {
  title: string;
  percent: number;
  current: number;
  target: number;
  note: string;
}) {
  return (
    <div className="rounded-[24px] border border-pink-200/70 bg-white/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black text-[#5b3768]">{title}</p>
        <p className="text-sm font-bold text-pink-500">{percent}%</p>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-pink-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pink-300 via-fuchsia-300 to-violet-300"
          style={{
            width: `${percent}%`,
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8b5a8f]">
        <span>
          ${Number(current || 0).toLocaleString()} / $
          {Number(target || 0).toLocaleString()}
        </span>

        <span>{note}</span>
      </div>
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
      <span className="text-sm font-semibold text-[#7b4f85]">{label}</span>

      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="qiunai-input mt-2"
      />
    </label>
  );
}
function getAllowedServiceNameByKey(key: string) {
  if (key === "valorant_god") return "特戰英豪大神陪玩";
  if (key === "valorant_skill") return "特戰英豪技術陪玩";
  if (key === "valorant_entertainment") return "特戰英豪娛樂陪玩";

  if (key === "delta_pc") return "三角洲行動電腦版";
  if (key === "delta_mobile") return "三角洲行動手機版";
  if (key === "delta_entertainment") return "三角洲行動娛樂陪玩";
  if (key === "delta_basic_guard") return "三角洲行動基本單護";
  if (key === "delta_secret_double_guard") return "三角洲行動機密雙護";
  if (key === "delta_attack_guard") return "三角洲行動猛攻護航";

  if (key === "apex_god") return "Apex大神陪玩";
  if (key === "apex_skill") return "Apex技術陪玩";
  if (key === "apex_entertainment") return "Apex娛樂陪玩";

  if (key === "lol_main") return "英雄聯盟";
  if (key === "lol_aram") return "ARAM";
  if (key === "lol_tft") return "聯盟戰棋";
  if (key === "lol_god") return "英雄聯盟大神陪玩";
  if (key === "lol_skill") return "英雄聯盟技術陪玩";
  if (key === "lol_entertainment") return "英雄聯盟娛樂陪玩";

  if (key === "steam_roguelike") return "Steam肉鴿遊戲";
  if (key === "steam_survival") return "Steam生存遊戲";
  if (key === "steam_horror") return "Steam恐怖遊戲";
  if (key === "steam_party") return "Steam派對遊戲";

  if (key === "pubgm") return "PUBG M";
  if (key === "naraka") return "NARAKA";
  if (key === "minecraft") return "Minecraft";
  if (key === "voice_chat") return "語音聊天";
  if (key === "song_request") return "點歌服務";

  return key;
}
function getManualCommissionRate(tier: string | null) {
  if (tier === "rate_80") return 80;
  if (tier === "rate_85") return 85;
  if (tier === "rate_90") return 90;
  if (tier === "manager_95") return 95;

  return null;
}

function is85ActiveThisMonth(orders: SalaryOrder[]) {
  const sortedOrders = [...orders].sort(
    (a, b) =>
      new Date(a.order_finished_at || a.created_at).getTime() -
      new Date(b.order_finished_at || b.created_at).getTime()
  );

  let total = 0;
  let firstReachDate: string | null = null;

  for (const order of sortedOrders) {
    total += Number(order.order_amount || 0);

    if (total >= 10000) {
      firstReachDate = order.order_finished_at || order.created_at;
      break;
    }
  }

  if (!firstReachDate) return false;

  const reachNextMonth = getNextMonthText(firstReachDate);
  const currentMonth = getMonthText(new Date());

  return currentMonth >= reachNextMonth;
}

function getNextMonthText(dateText: string) {
  const date = new Date(dateText);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthText(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(monthText: string) {
  const [yearText, monthValueText] = monthText.split("-");
  const year = Number(yearText);
  const monthValue = Number(monthValueText);
  const source =
    Number.isInteger(year) && Number.isInteger(monthValue) && monthValue >= 1
      ? new Date(year, monthValue - 1, 1)
      : new Date();

  const start = new Date(source.getFullYear(), source.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(source.getFullYear(), source.getMonth() + 1, 0, 23, 59, 59);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function formatMonthLabel(monthText: string) {
  if (!monthText) return "所選月份";

  const [yearText, monthTextValue] = monthText.split("-");
  const month = Number(monthTextValue);

  if (!yearText || !month) return "所選月份";

  return `${yearText} 年 ${month} 月`;
}

function formatDateTime(value?: string | null) {
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

function formatEntryType(type: string) {
  if (type === "order_salary") return "訂單薪水";
  if (type === "order_bonus") return "訂單獎金";
  if (type === "staff_bonus") return "獎金 / 扣除";
  return "薪資明細";
}

function getRequestStatusText(request?: SalaryWithdrawRequest | null) {
  if (!request) return "尚未申請";
  if (request.status === "pending") return "申請中";
  if (request.status === "approved") return "申請成功，請稍等三個工作日";
  if (request.status === "rejected") {
    return `申請遭駁回${request.reject_reason ? `，原因是${request.reject_reason}` : ""}`;
  }
  return request.status || "尚未申請";
}

function getRequestStatusClass(request?: SalaryWithdrawRequest | null) {
  if (!request) return "bg-zinc-100 text-zinc-500";
  if (request.status === "pending") return "bg-yellow-100 text-yellow-600";
  if (request.status === "approved") return "bg-emerald-100 text-emerald-600";
  if (request.status === "rejected") return "bg-rose-100 text-rose-600";
  return "bg-zinc-100 text-zinc-500";
}
