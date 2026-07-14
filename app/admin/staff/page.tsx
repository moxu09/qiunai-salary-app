"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, RefreshCw, Gamepad2, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SERVICE_OPTIONS, type ServiceOption } from "@/lib/serviceOptions";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

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

type StaffService = {
  id: string;
  discord_id: string;
  service_key: string;
  service_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminStaffPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffServiceMap, setStaffServiceMap] = useState<
    Record<string, string[]>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featuredSaving, setFeaturedSaving] = useState(false);

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
    return {
      total: staffList.length,
      online: staffList.filter((staff) => staff.is_online).length,
      active: staffList.filter((staff) => staff.is_active).length,
      canTakeOrder: staffList.filter((staff) => staff.can_take_order).length,
    };
  }, [staffList]);

  useEffect(() => {
    if (isAdmin) {
      loadStaff();
      loadFeatured();
    }
  }, [isAdmin]);

  async function loadStaff() {
    setLoading(true);

    const { data: staffData, error: staffError } = await supabase
      .from("qiunai_staff")
      .select("*")
      .order("created_at", { ascending: false });

    if (staffError) {
      console.error("讀取員工資料失敗:", staffError);
      alert("讀取員工資料失敗");
      setLoading(false);
      return;
    }

    const { data: serviceData, error: serviceError } = await supabase
      .from("qiunai_staff_services")
      .select("*")
      .eq("enabled", true);

    if (serviceError) {
      console.error("讀取員工可接遊戲失敗:", serviceError);
      alert("讀取員工可接遊戲失敗，請確認 qiunai_staff_services 資料表已建立");
    }

    const nextServiceMap: Record<string, string[]> = {};

    for (const row of (serviceData || []) as StaffService[]) {
      if (!nextServiceMap[row.discord_id]) {
        nextServiceMap[row.discord_id] = [];
      }

      nextServiceMap[row.discord_id].push(row.service_key);
    }

    const nextStaffList = (staffData || []) as Staff[];
    setStaffList(nextStaffList);
    setSelectedStaffId((current) =>
      current && nextStaffList.some((staff) => staff.id === current)
        ? current
        : nextStaffList[0]?.id || null
    );
    setStaffServiceMap(nextServiceMap);
    setLoading(false);
  }

  async function loadFeatured() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/qiunai/public-profile?admin=1", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.profiles)) {
      const month = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());
      setFeaturedIds(
        result.profiles
          .filter((profile: { is_featured?: boolean; featured_month?: string }) =>
            profile.is_featured && String(profile.featured_month || "").startsWith(month)
          )
          .map((profile: { discord_id: string }) => profile.discord_id)
      );
    }
  }

  function toggleFeatured(discordId: string) {
    setFeaturedIds((current) =>
      current.includes(discordId)
        ? current.filter((id) => id !== discordId)
        : [...current, discordId]
    );
  }

  async function saveFeatured() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setFeaturedSaving(true);
    const response = await fetch("/api/qiunai/public-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "set-featured", discordIds: featuredIds }),
    });
    const result = await response.json().catch(() => ({}));
    setFeaturedSaving(false);
    if (!response.ok || !result.ok) {
      alert(result.message || "儲存金榜名單失敗");
      return;
    }
    alert("本月金榜陪陪已更新");
  }

  function updateLocalStaff(
    id: string,
    key: keyof Staff,
    value: string | boolean | null
  ) {
    setStaffList((prev) =>
      prev.map((staff) =>
        staff.id === id
          ? ({
              ...staff,
              [key]: value,
            } as Staff)
          : staff
      )
    );
  }

  function toggleLocalService(discordId: string, serviceKey: string) {
    setStaffServiceMap((prev) => {
      const current = prev[discordId] || [];

      const next = current.includes(serviceKey)
        ? current.filter((key) => key !== serviceKey)
        : [...current, serviceKey];

      return {
        ...prev,
        [discordId]: next,
      };
    });
  }

  async function saveStaff(staff: Staff) {
    setSavingId(staff.id);
    const selectedServices = staffServiceMap[staff.discord_id] || [];
    const allowedServices = selectedServices.map((key) => {
      const option = SERVICE_OPTIONS.find((item) => item.key === key);
      return option ? `${option.group}${option.name}` : key;
    });

    const { error: staffError } = await supabase
      .from("qiunai_staff")
      .update({
        display_name: staff.display_name || null,
        real_name: staff.real_name || null,
        gender: staff.gender || null,
        birthday: staff.birthday || null,
        bank_name: staff.bank_name || null,
        bank_account: staff.bank_account || null,
        salary_channel_id: staff.salary_channel_id || null,
        allowed_services: allowedServices,
        is_online: !!staff.is_online,
        can_take_order: !!staff.can_take_order,
        is_active: !!staff.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staff.id);

    if (staffError) {
      console.error("儲存員工資料失敗:", staffError);
      alert("儲存員工資料失敗");
      setSavingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("qiunai_staff_services")
      .delete()
      .eq("discord_id", staff.discord_id);

    if (deleteError) {
      console.error("清除可接遊戲失敗:", deleteError);
      alert("員工資料已儲存，但可接遊戲更新失敗");
      setSavingId(null);
      return;
    }

    if (selectedServices.length > 0) {
      const rows = selectedServices.map((key) => {
        const option = SERVICE_OPTIONS.find((item) => item.key === key);

        return {
          discord_id: staff.discord_id,
          service_key: key,
          service_name: option ? `${option.group}｜${option.name}` : key,
          enabled: true,
          updated_at: new Date().toISOString(),
        };
      });

      const { error: insertError } = await supabase
        .from("qiunai_staff_services")
        .insert(rows);

      if (insertError) {
        console.error("新增可接遊戲失敗:", insertError);
        alert("員工資料已儲存，但可接遊戲新增失敗");
        setSavingId(null);
        return;
      }
    }

    setSavingId(null);
    alert("已儲存");
    await loadStaff();
  }

  if (adminLoading || !isAdmin) {
    return (
      <main className="qiunai-page flex items-center justify-center px-4">
        <div className="qiunai-card rounded-[32px] p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-pink-300 border-t-transparent" />
          <p className="text-sm text-[#8b5a8f]">檢查後台權限中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="qiunai-page admin-page">
      <div className="qiunai-glow left-[-90px] top-[-90px] h-72 w-72 bg-pink-300" />
      <div className="qiunai-glow right-[-100px] top-32 h-80 w-80 bg-purple-300" />
      <div className="qiunai-glow bottom-[-120px] left-1/2 h-80 w-80 -translate-x-1/2 bg-rose-200" />

      <header className="admin-page-header relative z-10 border border-pink-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-pink-500">Qiunai Admin</p>
            <h1 className="qiunai-title-gradient text-2xl font-black">
              秋奈電競｜員工管理
            </h1>
          </div>

          <button
            onClick={loadStaff}
            className="qiunai-soft-button flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            <RefreshCw size={16} />
            重新整理
          </button>
        </div>
      </header>

      <section className="admin-page-content relative z-10 mx-auto max-w-7xl">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="員工總數" value={`${totals.total} 人`} />
          <Stat title="上線中" value={`${totals.online} 人`} />
          <Stat title="可接單" value={`${totals.canTakeOrder} 人`} />
          <Stat title="啟用中" value={`${totals.active} 人`} />
        </div>

        <section className="qiunai-card mt-6 rounded-[28px] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-[#5b3768]">
                <Trophy size={20} className="text-amber-500" />
                本月金榜陪陪
              </h2>
              <p className="mt-1 text-sm text-[#8b5a8f]">
                可複選；儲存後這些陪陪會優先顯示在官網。
              </p>
            </div>
            <button onClick={saveFeatured} disabled={featuredSaving} className="qiunai-button px-5 py-2.5 text-sm font-bold">
              {featuredSaving ? "儲存中..." : "儲存金榜名單"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {staffList.filter((staff) => staff.is_active).map((staff) => (
              <label key={staff.discord_id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                featuredIds.includes(staff.discord_id)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-pink-100 bg-white text-[#7b4f85]"
              }`}>
                <input type="checkbox" checked={featuredIds.includes(staff.discord_id)} onChange={() => toggleFeatured(staff.discord_id)} />
                {staff.display_name || staff.real_name || staff.discord_name || staff.discord_id}
              </label>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="qiunai-card mt-6 rounded-[32px] p-8 text-center text-[#8b5a8f]">
            載入中...
          </div>
        ) : staffList.length === 0 ? (
          <div className="qiunai-card mt-6 rounded-[32px] p-8 text-center text-[#8b5a8f]">
            目前沒有員工資料
          </div>
        ) : (
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.85fr_1.4fr]">
            <aside className="qiunai-card self-start rounded-[28px] p-3 xl:sticky xl:top-5">
              <div className="border-b border-pink-100 px-3 pb-3 pt-2">
                <h2 className="text-lg font-black text-[#5b3768]">員工列表</h2>
                <p className="mt-1 text-xs font-semibold text-[#8b5a8f]">
                  選擇一位員工後，在右側編輯完整資料。
                </p>
              </div>
              <div className="mt-2 max-h-[720px] space-y-2 overflow-y-auto">
                {staffList.map((staff) => {
                  const active = selectedStaffId === staff.id;
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => setSelectedStaffId(staff.id)}
                      className={`flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition ${
                        active
                          ? "border-pink-300 bg-pink-50"
                          : "border-transparent bg-white hover:border-pink-100 hover:bg-pink-50/60"
                      }`}
                    >
                      {staff.avatar_url ? (
                        <img
                          src={staff.avatar_url}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-2xl border border-pink-100 object-cover"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-2xl bg-pink-100" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-[#5b3768]">
                          {staff.display_name ||
                            staff.real_name ||
                            staff.discord_name ||
                            "未知員工"}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#8b5a8f]">
                          {staff.discord_id}
                        </span>
                      </span>
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          staff.is_online ? "bg-emerald-400" : "bg-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="min-w-0">
              {staffList
                .filter((staff) => staff.id === selectedStaffId)
                .map((staff) => {
                  const selectedServices =
                    staffServiceMap[staff.discord_id] || [];

                  return (
                    <div
                      key={staff.id}
                      className="qiunai-card rounded-[34px] p-6"
                    >
                      <div className="flex flex-col gap-4 border-b border-pink-100 pb-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          {staff.avatar_url ? (
                            <img
                              src={staff.avatar_url}
                              alt=""
                              className="h-14 w-14 rounded-[22px] border border-pink-200 bg-white object-cover shadow-lg"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-[22px] bg-gradient-to-br from-pink-300 to-violet-300 shadow-lg" />
                          )}

                          <div>
                            <p className="text-lg font-black text-[#5b3768]">
                              {staff.display_name ||
                                staff.real_name ||
                                staff.discord_name ||
                                "未知員工"}
                            </p>

                            <p className="text-sm text-[#8b5a8f]">
                              Discord：{staff.discord_name || "未知"}
                            </p>

                            <p className="text-xs text-[#a36b9e]">
                              ID：{staff.discord_id}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => saveStaff(staff)}
                          disabled={savingId === staff.id}
                          className="qiunai-button flex items-center justify-center gap-2 px-5 py-3 font-bold"
                        >
                          <Save size={18} />
                          {savingId === staff.id ? "儲存中..." : "儲存此員工"}
                        </button>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <AdminInput
                          label="顯示名稱"
                          value={staff.display_name}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "display_name", value)
                          }
                        />

                        <AdminInput
                          label="真實姓名"
                          value={staff.real_name}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "real_name", value)
                          }
                        />

                        <label className="block">
                          <span className="text-sm font-semibold text-[#7b4f85]">
                            性別
                          </span>

                          <select
                            value={staff.gender || ""}
                            onChange={(e) =>
                              updateLocalStaff(
                                staff.id,
                                "gender",
                                e.target.value
                              )
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

                        <AdminInput
                          label="生日"
                          type="date"
                          value={staff.birthday}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "birthday", value)
                          }
                        />

                        <AdminInput
                          label="銀行名稱"
                          value={staff.bank_name}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "bank_name", value)
                          }
                        />

                        <AdminInput
                          label="銀行帳號"
                          value={staff.bank_account}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "bank_account", value)
                          }
                        />

                        <AdminInput
                          label="個人薪資頻道 ID"
                          value={staff.salary_channel_id}
                          placeholder="貼 Discord 頻道 ID"
                          onChange={(value) =>
                            updateLocalStaff(
                              staff.id,
                              "salary_channel_id",
                              value
                            )
                          }
                        />
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <CheckBox
                          label="目前上線"
                          checked={staff.is_online}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "is_online", value)
                          }
                        />

                        <CheckBox
                          label="允許接單"
                          checked={staff.can_take_order}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "can_take_order", value)
                          }
                        />

                        <CheckBox
                          label="啟用此員工"
                          checked={staff.is_active}
                          onChange={(value) =>
                            updateLocalStaff(staff.id, "is_active", value)
                          }
                        />
                      </div>

                      <div className="mt-6 rounded-[28px] border border-pink-200/70 bg-white/55 p-5">
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="text-pink-400" size={20} />
                          <h3 className="font-black text-[#5b3768]">
                            可接遊戲 / 服務
                          </h3>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-[#8b5a8f]">
                          後台可協助員工調整可接項目。英雄聯盟若要接
                          ARAM｜大神陪玩，需同時勾 ARAM 與大神陪玩。
                        </p>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {Object.entries(groupedServices).map(
                            ([groupName, services]) => (
                              <div
                                key={groupName}
                                className="rounded-[24px] border border-pink-100 bg-white/70 p-4"
                              >
                                <h4 className="font-black text-pink-500">
                                  {groupName}
                                </h4>

                                <div className="mt-3 space-y-2">
                                  {services.map((service) => (
                                    <label
                                      key={service.key}
                                      className="flex cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-pink-100 bg-white/70 px-3 py-2 transition hover:bg-pink-50"
                                    >
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={selectedServices.includes(
                                            service.key
                                          )}
                                          onChange={() =>
                                            toggleLocalService(
                                              staff.discord_id,
                                              service.key
                                            )
                                          }
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
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>
    </main>
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

function AdminInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
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

function CheckBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[20px] border border-pink-100 bg-white/65 px-4 py-3 transition hover:bg-pink-50">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-pink-400"
      />

      <span className="text-sm font-semibold text-[#6b4f71]">{label}</span>
    </label>
  );
}
