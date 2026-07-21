"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useEffectEvent, useMemo, useState } from "react";
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
  FileDown,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SERVICE_OPTIONS, type ServiceOption } from "@/lib/serviceOptions";
import StaffPortalNav, { type PortalTab } from "@/components/StaffPortalNav";
import HrPortalPanel from "@/components/HrPortalPanel";
import {
  formatTaipeiDateTime,
  getNextTaipeiMonthText,
  getTaipeiMonthInput,
  getTaipeiMonthText,
  getTaipeiYear,
  monthInputToTaipeiRange,
} from "@/lib/taipeiTime";

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
  order_type?: string | null;
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
  review_decision?: "approved" | "rejected" | null;
  reviewer_discord_id?: string | null;
  reviewer_name?: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
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
  service_fee?: number | string | null;
  welfare_fee?: number | string | null;
  payout_amount?: number | string | null;
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
    opensAt: string;
    closesAt: string;
  };
  withdrawPolicy: {
    minimumAmount: number;
    welfareFundRate: number;
    monthlyWithdrawalCount: number;
    nextServiceFee: number;
    processingNote: string;
  };
};

type WithdrawalStatementSummary = {
  requestCount: number;
  approvedCount: number;
  requestedAmount: number;
  welfareFee: number;
  serviceFee: number;
  payoutAmount: number;
};

type WithdrawalStatementData = {
  range: { from: string; to: string };
  requests: SalaryWithdrawRequest[];
  summary: WithdrawalStatementSummary;
};

export default function StaffPage() {
  const router = useRouter();
  const defaultStatementRange = getDefaultStatementRange();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [staff, setStaff] = useState<Staff | null>(null);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [allSalaryOrders, setAllSalaryOrders] = useState<SalaryOrder[]>([]);
  const [reviewedOrders, setReviewedOrders] = useState<SalaryOrder[]>([]);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOnline, setSavingOnline] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementDownloading, setStatementDownloading] = useState(false);
  const [statementFrom, setStatementFrom] = useState(
    defaultStatementRange.from
  );
  const [statementTo, setStatementTo] = useState(defaultStatementRange.to);
  const [statementData, setStatementData] =
    useState<WithdrawalStatementData | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [salaryWallet, setSalaryWallet] = useState<SalaryWalletData | null>(
    null
  );
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthInput());
  const [activeTab, setActiveTab] = useState<PortalTab>("profile");

  const [profileForm, setProfileForm] = useState({
    display_name: "",
    avatar_url: "",
    intro: "",
    invite_url: "",
    real_name: "",
    gender: "",
    birthday: "",
    bank_name: "",
    bank_account: "",
  });

  const initEffect = useEffectEvent(init);

  useEffect(() => {
    initEffect();
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

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const isTip = order.order_type === "打賞" || String(order.service_name || "").includes("打賞");
    return activeTab === "tips" ? isTip : !isTip;
  }), [activeTab, orders]);
  const visibleBonuses = useMemo(() => bonusList.filter((bonus) => activeTab === "deductions" ? Number(bonus.amount || 0) < 0 : Number(bonus.amount || 0) >= 0), [activeTab, bonusList]);
  const isOrderTab = activeTab === "orders" || activeTab === "tips" || activeTab === "bonuses" || activeTab === "deductions";

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

    const openingEnd = new Date("2026-09-01T00:00:00+08:00");
    const now = new Date();

    const totalOrderAmount = allSalaryOrders.reduce(
      (sum, order) => sum + Number(order.order_amount || 0),
      0
    );

    const thisYear = getTaipeiYear();

    const thisYearSalary = allSalaryOrders
      .filter((order) => {
        const sourceDate = order.order_finished_at || order.created_at;
        const year = getTaipeiYear(sourceDate);

        return year === thisYear;
      })
      .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);

    const previousYear = thisYear - 1;

    const previousYearSalary = allSalaryOrders
      .filter((order) => {
        const sourceDate = order.order_finished_at || order.created_at;
        const year = getTaipeiYear(sourceDate);

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
        manualRate === 95 ? "主管津貼 95%" : `後台設定 ${manualRate}%`;
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
      avatar_url: staffData.avatar_url || "",
      intro: "",
      invite_url: "",
      real_name: staffData.real_name || "",
      gender: staffData.gender || "",
      birthday: staffData.birthday || "",
      bank_name: staffData.bank_name || "",
      bank_account: staffData.bank_account || "",
    });

    const publicProfileRes = await fetch("/api/qiunai/public-profile", {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      cache: "no-store",
    });
    const publicProfileData = await publicProfileRes.json().catch(() => ({}));
    if (publicProfileRes.ok && publicProfileData.profile) {
      setProfileForm((current) => ({
        ...current,
        avatar_url: publicProfileData.profile.avatar_url || current.avatar_url,
        intro: publicProfileData.profile.intro || "",
        invite_url: publicProfileData.profile.invite_url || "",
      }));
    }

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

    const { data: reviewData, error: reviewError } = await supabase
      .from("qiunai_salary_orders")
      .select("*")
      .eq("discord_id", discordId)
      .not("reviewed_at", "is", null)
      .gte("reviewed_at", startIso)
      .lte("reviewed_at", endIso)
      .order("reviewed_at", { ascending: false });

    if (reviewError) {
      console.error("load order reviews error:", reviewError);
      setReviewedOrders([]);
    } else {
      setReviewedOrders((reviewData || []) as SalaryOrder[]);
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

    const available = Math.floor(Number(salaryWallet.totals.available || 0));
    const amountNumber = Number(withdrawAmount || 0);
    const amount = Math.floor(amountNumber);

    if (
      !Number.isFinite(amountNumber) ||
      amount < salaryWallet.withdrawPolicy.minimumAmount
    ) {
      alert("提領金額必須高於 1,000 元");
      return;
    }

    if (amount > available) {
      alert(`提領金額不能超過可提領薪資 $${available.toLocaleString()}`);
      return;
    }

    const serviceFee = salaryWallet.withdrawPolicy.nextServiceFee;
    const welfareFee =
      Math.round(
        amount * salaryWallet.withdrawPolicy.welfareFundRate * 100
      ) / 100;
    const payoutAmount = amount - serviceFee - welfareFee;

    if (
      !confirm(
        `確定要申請提領 $${amount.toLocaleString()}？\n福利金：$${welfareFee.toLocaleString()}\n手續費：$${serviceFee.toLocaleString()}\n實際匯款：$${payoutAmount.toLocaleString()}`
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
        body: JSON.stringify({ amount }),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "送出提領申請失敗");
      }

      setSalaryWallet(payload.wallet as SalaryWalletData);
      setWithdrawAmount("");
      alert("提領申請已送出");
    } catch (error: unknown) {
      console.error("request withdraw error:", error);
      alert(error instanceof Error ? error.message : "送出提領申請失敗");
    } finally {
      setWithdrawing(false);
    }
  }

  async function loadWithdrawalStatement() {
    if (!statementFrom || !statementTo) {
      alert("請選擇開始與結束日期");
      return;
    }

    setStatementLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error("請重新登入");

      const params = new URLSearchParams({
        from: statementFrom,
        to: statementTo,
        format: "json",
      });
      const res = await fetch(
        `/api/qiunai/salary-wallet/statement?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "查詢提領紀錄失敗");
      }

      setStatementData(payload as WithdrawalStatementData);
    } catch (error: unknown) {
      console.error("load withdrawal statement error:", error);
      alert(error instanceof Error ? error.message : "查詢提領紀錄失敗");
    } finally {
      setStatementLoading(false);
    }
  }

  async function downloadWithdrawalStatement() {
    setStatementDownloading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error("請重新登入");

      const params = new URLSearchParams({
        from: statementFrom,
        to: statementTo,
        format: "pdf",
      });
      const res = await fetch(
        `/api/qiunai/salary-wallet/statement?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "匯出提領薪資單失敗");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `秋奈電競陪玩-提領薪資單-${statementFrom}-${statementTo}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("download withdrawal statement error:", error);
      alert(error instanceof Error ? error.message : "匯出提領薪資單失敗");
    } finally {
      setStatementDownloading(false);
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
        avatar_url: profileForm.avatar_url || null,
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

    try {
      await syncPublicProfile({
        displayName: profileForm.display_name,
        avatarUrl: profileForm.avatar_url,
        intro: profileForm.intro,
        inviteUrl: profileForm.invite_url,
      });
    } catch (syncError) {
      console.error("sync public profile error:", syncError);
      setStaff(data as Staff);
      alert("薪資資料已儲存，但官網介紹同步失敗，請稍後再試");
      return;
    }

    setStaff(data as Staff);
    alert("個人資料已儲存");
  }

  async function syncPublicProfile(payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登入已過期");
    const response = await fetch("/api/qiunai/public-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "官網同步失敗");
    }
    return result.profile;
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
    await syncPublicProfile({ isOnline: nextOnline }).catch((syncError) => {
      console.error("sync online status error:", syncError);
    });
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
    const allowedServices = selectedServices.map((key) =>
      getAllowedServiceNameByKey(key)
    );
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
    await syncPublicProfile({
      games: Array.from(
        new Set(
          selectedServices
            .map((key) => SERVICE_OPTIONS.find((item) => item.key === key)?.group)
            .filter(Boolean)
        )
      ),
    }).catch((syncError) => {
      console.error("sync public games error:", syncError);
    });
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
    <main className="qiunai-page staff-workspace">
      <div className="qiunai-glow left-[-90px] top-[-90px] h-72 w-72 bg-pink-300" />
      <div className="qiunai-glow right-[-100px] top-32 h-80 w-80 bg-purple-300" />
      <div className="qiunai-glow bottom-[-120px] left-1/2 h-80 w-80 -translate-x-1/2 bg-rose-200" />

      <header className="staff-workspace-header relative z-10 border-b border-pink-200/50 bg-white/45 backdrop-blur-xl">
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

      <section id="overview" className="staff-workspace-section relative z-10 scroll-mt-24">
        <div className="staff-portal-grid">
          <StaffPortalNav activeTab={activeTab} onSelect={setActiveTab} employeeName={staff.display_name || staff.discord_name || staff.discord_id} company="秋奈電競陪玩" />

          <div className="staff-main-column min-w-0">
        <HrPortalPanel activeTab={activeTab} apiPath="/api/qiunai/hr" department="秋奈電競陪玩" staffName={staff.display_name || staff.discord_name || staff.discord_id} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
        <div className={activeTab === "profile" ? "mt-6 grid gap-4 md:grid-cols-4" : "hidden"}>
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
          <Card id="wallet" className={activeTab === "profile" ? "" : "hidden"}>
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
                  每月 5 日 00:00 入帳上月 16 日至月底薪資；每月 20 日 00:00 入帳當月 1 日至 15 日薪資。
                </p>
              </div>

              <div className="flex w-full flex-col items-stretch gap-2 sm:max-w-xs sm:items-end">
                <label className="w-full text-xs font-bold text-[#8b5a8f]">
                  提領金額
                  <input
                    type="number"
                    min="1001"
                    step="1"
                    inputMode="numeric"
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    placeholder={
                      salaryWallet
                        ? `最多 $${Number(
                            salaryWallet.totals.available || 0
                          ).toLocaleString()}`
                        : "輸入金額"
                    }
                    className="qiunai-input mt-1"
                  />
                </label>

                <button
                  onClick={requestWithdraw}
                  disabled={
                    withdrawing ||
                    walletLoading ||
                    !salaryWallet ||
                    !salaryWallet.withdrawWindow.isOpen ||
                    !!salaryWallet.pendingRequest ||
                    Number(salaryWallet.totals.available || 0) <= 0 ||
                    Number(withdrawAmount || 0) < 1001
                  }
                  className="qiunai-button w-full px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {withdrawing ? "申請中..." : "提領"}
                </button>
                <div className="space-y-1 text-xs font-semibold text-[#8b5a8f]">
                  <p>每月 5 日 09:00 至 25 日 15:30 開放提領。</p>
                  <p>金額須高於 $1,000；本月首次免手續費，第二次起每次 $15。</p>
                  <p>依法扣除提領金額 0.2% 福利金，銀行作業需 0 到 3 個工作日。</p>
                  {salaryWallet ? (
                    <p className="font-black text-pink-600">
                      本月下一次提領手續費：$
                      {salaryWallet.withdrawPolicy.nextServiceFee.toLocaleString()}
                    </p>
                  ) : null}
                </div>
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
                    value={`$${Number(
                      salaryWallet.totals.balance || 0
                    ).toLocaleString()}`}
                  />
                  <WalletStat
                    title="訂單薪水"
                    value={`$${Number(
                      salaryWallet.totals.orderSalary || 0
                    ).toLocaleString()}`}
                  />
                  <WalletStat
                    title="獎金 / 扣除"
                    value={`$${Number(
                      salaryWallet.totals.bonus || 0
                    ).toLocaleString()}`}
                  />
                  <WalletStat
                    title="使用的薪水"
                    value={`$${Number(
                      salaryWallet.totals.approvedWithdrawn || 0
                    ).toLocaleString()}`}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-pink-100 bg-pink-50/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-black text-[#5b3768]">提領狀態</p>
                    <p className="mt-1 text-sm text-[#8b5a8f]">
                      可提領：$
                      {Number(
                        salaryWallet.totals.available || 0
                      ).toLocaleString()}
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

                <div className="mt-4 rounded-[24px] border border-pink-100 bg-white/90 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 font-black text-[#5b3768]">
                        <FileDown size={18} className="text-pink-500" />
                        提領薪資單
                      </h3>
                      <p className="mt-1 text-sm text-[#8b5a8f]">
                        選擇提領申請時間，查詢自己的紀錄並匯出 PDF。
                      </p>
                    </div>

                    <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-[150px_150px_auto_auto]">
                      <label className="text-xs font-bold text-[#8b5a8f]">
                        開始日期
                        <input
                          type="date"
                          value={statementFrom}
                          onChange={(event) => {
                            setStatementFrom(event.target.value);
                            setStatementData(null);
                          }}
                          className="qiunai-input mt-1"
                        />
                      </label>
                      <label className="text-xs font-bold text-[#8b5a8f]">
                        結束日期
                        <input
                          type="date"
                          value={statementTo}
                          onChange={(event) => {
                            setStatementTo(event.target.value);
                            setStatementData(null);
                          }}
                          className="qiunai-input mt-1"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={loadWithdrawalStatement}
                        disabled={statementLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-pink-100 px-4 py-2.5 text-sm font-black text-pink-700 hover:bg-pink-200 disabled:opacity-50"
                      >
                        <Search size={16} />
                        {statementLoading ? "查詢中..." : "查詢"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadWithdrawalStatement}
                        disabled={!statementData || statementDownloading}
                        className="qiunai-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FileDown size={16} />
                        {statementDownloading ? "產生中..." : "匯出 PDF"}
                      </button>
                    </div>
                  </div>

                  {statementData ? (
                    <div className="mt-4">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <WalletStat
                          title="提領申請"
                          value={`${statementData.summary.requestCount} 筆`}
                        />
                        <WalletStat
                          title="已核准"
                          value={`${statementData.summary.approvedCount} 筆`}
                        />
                        <WalletStat
                          title="福利金 / 手續費"
                          value={statementMoney(
                            statementData.summary.welfareFee +
                              statementData.summary.serviceFee
                          )}
                        />
                        <WalletStat
                          title="已核准實際匯款"
                          value={statementMoney(statementData.summary.payoutAmount)}
                        />
                      </div>

                      <div className="mt-3 overflow-x-auto rounded-[18px] border border-pink-100">
                        <table className="min-w-[820px]">
                          <thead>
                            <tr>
                              <th>申請時間</th>
                              <th>申請金額</th>
                              <th>福利金</th>
                              <th>手續費</th>
                              <th>實際匯款</th>
                              <th>狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statementData.requests.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-[#a36b9e]">
                                  此時間段沒有提領紀錄
                                </td>
                              </tr>
                            ) : (
                              statementData.requests.map((request) => (
                                <tr key={request.id}>
                                  <td>{formatDateTime(request.requested_at)}</td>
                                  <td>{statementMoney(request.amount)}</td>
                                  <td>{statementMoney(request.welfare_fee)}</td>
                                  <td>{statementMoney(request.service_fee)}</td>
                                  <td className="font-black text-pink-600">
                                    {request.status === "rejected"
                                      ? "-"
                                      : statementMoney(
                                          Number(
                                            request.payout_amount ||
                                              Number(request.amount || 0) -
                                                Number(request.welfare_fee || 0) -
                                                Number(request.service_fee || 0)
                                          )
                                        )}
                                  </td>
                                  <td>
                                    <span
                                      className={`rounded-full px-3 py-1 text-xs font-bold ${getRequestStatusClass(
                                        request
                                      )}`}
                                    >
                                      {getRequestStatusText(request)}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>

              </>
            ) : null}
          </Card>
        </div>

        <div className={isOrderTab ? "mt-6" : "hidden"}>
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

        <div className={activeTab === "profile" ? "mt-6" : "hidden"}>
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
                  85% 依累積接單金額判定；90%
                  依今年薪資進度，達標後隔年整年適用。
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

        <div className={activeTab === "profile" ? "mt-6 grid gap-6 lg:grid-cols-[420px_1fr]" : "mt-6 block"}>
          <div className="space-y-6">
            <Card className={activeTab === "profile" ? "" : "hidden"}>
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

            <Card id="profile" className={activeTab === "profile" ? "" : "hidden"}>
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
                  label="官網頭像網址"
                  type="url"
                  value={profileForm.avatar_url}
                  onChange={(value) => updateProfileField("avatar_url", value)}
                />

                <label className="block">
                  <span className="text-sm font-semibold text-[#7b4f85]">
                    官網自我介紹
                  </span>
                  <textarea
                    rows={4}
                    value={profileForm.intro}
                    onChange={(event) =>
                      updateProfileField("intro", event.target.value)
                    }
                    placeholder="介紹你的個性、擅長遊戲與陪玩風格"
                    className="qiunai-input mt-2"
                  />
                </label>

                <Input
                  label="專屬邀請連結"
                  type="url"
                  value={profileForm.invite_url}
                  onChange={(value) => updateProfileField("invite_url", value)}
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

            <Card id="games" className={activeTab === "profile" ? "" : "hidden"}>
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
                英雄聯盟類型需要同時勾「模式」和「陪玩類型」。 例如：要接
                ARAM｜大神陪玩，就要勾 ARAM + 大神陪玩。
              </p>

              <div className="mt-5 space-y-5">
                {Object.entries(groupedServices).map(
                  ([groupName, services]) => (
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
                  )
                )}
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
            <Card noPadding className="hidden">
              <div className="border-b border-pink-100 p-5">
                <h2 className="text-xl font-black text-[#5b3768]">
                  訂單審核紀錄
                </h2>
                <p className="mt-1 text-sm text-[#8b5a8f]">
                  核准與駁回都會顯示審核人及審核時間。
                </p>
              </div>

              {reviewedOrders.length === 0 ? (
                <div className="p-8 text-center text-[#a36b9e]">
                  這個月份尚無審核紀錄
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-pink-50 text-[#8b5a8f]">
                      <tr>
                        <th className="px-4 py-3">審核時間</th>
                        <th className="px-4 py-3">服務</th>
                        <th className="px-4 py-3">結果</th>
                        <th className="px-4 py-3">審核人</th>
                        <th className="px-4 py-3">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewedOrders.map((order) => (
                        <tr
                          key={`review-${order.id}`}
                          className="border-t border-pink-100"
                        >
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {formatDateTime(order.reviewed_at)}
                          </td>
                          <td className="px-4 py-3 text-[#5b3768]">
                            {order.service_name || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                order.review_decision === "approved"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-rose-100 text-rose-600"
                              }`}
                            >
                              {order.review_decision === "approved"
                                ? "已核准"
                                : "已駁回"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#5b3768]">
                            <p className="font-bold">
                              {order.reviewer_name || "未知審核人"}
                            </p>
                            {order.reviewer_discord_id ? (
                              <p className="mt-1 text-xs text-[#a36b9e]">
                                {order.reviewer_discord_id}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-[#8b5a8f]">
                            {order.review_reason || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card noPadding className={activeTab === "orders" || activeTab === "tips" ? "" : "hidden"}>
              <div className="border-b border-pink-100 p-5">
                <h2 className="text-xl font-black text-[#5b3768]">
                  {formatMonthLabel(selectedMonth)}訂單
                </h2>
                <p className="mt-1 text-sm text-[#8b5a8f]">
                  顯示所選月份的薪資訂單。
                </p>
              </div>

              {visibleOrders.length === 0 ? (
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
                      {visibleOrders.map((order) => (
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
                              {order.salary_rate
                                ? `${order.salary_rate}%`
                                : "-"}
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
                                order.status === "已發薪" ||
                                order.wallet_settled_at
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

            <Card noPadding className={activeTab === "bonuses" || activeTab === "deductions" ? "" : "hidden"}>
              <div className="border-b border-pink-100 p-5">
                <h2 className="text-xl font-black text-[#5b3768]">
                  {formatMonthLabel(selectedMonth)}獎金 / 扣除
                </h2>
              </div>

              {visibleBonuses.length === 0 ? (
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
                      {visibleBonuses.map((bonus) => (
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
        </div>
        </div>
      </section>
    </main>
  );
}

function Card({
  children,
  noPadding = false,
  id,
  className = "",
}: {
  children: React.ReactNode;
  noPadding?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`qiunai-card overflow-hidden rounded-[32px] ${className} ${
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

  if (key === "hok_entertain") return "王者榮耀娛樂";
  if (key === "hok_skill") return "王者榮耀技術";

  if (key === "identity_v_entertain") return "第五人格娛樂";
  if (key === "identity_v_rank_4") return "第五人格四階";
  if (key === "identity_v_rank_5") return "第五人格五階";
  if (key === "identity_v_rank_6") return "第五人格六階";
  if (key === "identity_v_rank_7") return "第五人格七階";

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
  return getNextTaipeiMonthText(dateText);
}

function getMonthText(date: Date) {
  return getTaipeiMonthText(date);
}

function getCurrentMonthInput() {
  return getTaipeiMonthInput();
}

function getDefaultStatementRange() {
  const month = getCurrentMonthInput();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return { from: `${month}-01`, to: today };
}

function statementMoney(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function getMonthRange(monthText: string) {
  return monthInputToTaipeiRange(monthText);
}

function formatMonthLabel(monthText: string) {
  if (!monthText) return "所選月份";

  const [yearText, monthTextValue] = monthText.split("-");
  const month = Number(monthTextValue);

  if (!yearText || !month) return "所選月份";

  return `${yearText} 年 ${month} 月`;
}

function formatDateTime(value?: string | null) {
  return formatTaipeiDateTime(value, { hour12: true });
}

function getRequestStatusText(request?: SalaryWithdrawRequest | null) {
  if (!request) return "尚未申請";
  if (request.status === "pending") return "申請中";
  if (request.status === "approved") return "申請成功，請稍等 0 到 3 個工作日";
  if (request.status === "rejected") {
    return `申請遭駁回${
      request.reject_reason ? `，原因是${request.reject_reason}` : ""
    }`;
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
