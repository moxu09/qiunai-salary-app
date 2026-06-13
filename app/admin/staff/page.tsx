"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, RefreshCw, Gamepad2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
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

type ServiceOption = {
  key: string;
  name: string;
  group: string;
  hint?: string;
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

export default function AdminStaffPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffServiceMap, setStaffServiceMap] = useState<Record<string, string[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

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

    for (const row of ((serviceData || []) as StaffService[])) {
      if (!nextServiceMap[row.discord_id]) {
        nextServiceMap[row.discord_id] = [];
      }

      nextServiceMap[row.discord_id].push(row.service_key);
    }

    setStaffList((staffData || []) as Staff[]);
    setStaffServiceMap(nextServiceMap);
    setLoading(false);
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

    const selectedServices = staffServiceMap[staff.discord_id] || [];

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
      <main className="flex min-h-screen items-center justify-center bg-[#0f0b1f] text-white">
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
            <h1 className="text-2xl font-bold">秋奈電競｜員工管理</h1>
          </div>

          <button
            onClick={loadStaff}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
          >
            <RefreshCw size={16} />
            重新整理
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="員工總數" value={`${totals.total} 人`} />
          <Stat title="上線中" value={`${totals.online} 人`} />
          <Stat title="可接單" value={`${totals.canTakeOrder} 人`} />
          <Stat title="啟用中" value={`${totals.active} 人`} />
        </div>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
            載入中...
          </div>
        ) : staffList.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
            目前沒有員工資料
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {staffList.map((staff) => {
              const selectedServices = staffServiceMap[staff.discord_id] || [];

              return (
                <div
                  key={staff.id}
                  className="rounded-3xl border border-white/10 bg-white/5 p-6"
                >
                  <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
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
                        <p className="font-bold">
                          {staff.display_name ||
                            staff.real_name ||
                            staff.discord_name ||
                            "未知員工"}
                        </p>

                        <p className="text-sm text-zinc-400">
                          Discord：{staff.discord_name || "未知"}
                        </p>

                        <p className="text-xs text-zinc-500">
                          ID：{staff.discord_id}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => saveStaff(staff)}
                      disabled={savingId === staff.id}
                      className="flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400 disabled:opacity-50"
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
                      <span className="text-sm text-zinc-300">性別</span>
                      <select
                        value={staff.gender || ""}
                        onChange={(e) =>
                          updateLocalStaff(staff.id, "gender", e.target.value)
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
                        updateLocalStaff(staff.id, "salary_channel_id", value)
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

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="text-violet-300" size={20} />
                      <h3 className="font-bold">可接遊戲 / 服務</h3>
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">
                      後台可協助員工調整可接項目。英雄聯盟若要接 ARAM｜大神陪玩，需同時勾 ARAM 與大神陪玩。
                    </p>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(groupedServices).map(
                        ([groupName, services]) => (
                          <div
                            key={groupName}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <h4 className="font-bold text-violet-200">
                              {groupName}
                            </h4>

                            <div className="mt-3 space-y-2">
                              {services.map((service) => (
                                <label
                                  key={service.key}
                                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/10"
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
                                      className="h-5 w-5 accent-violet-500"
                                    />

                                    <span className="text-sm">
                                      {service.name}
                                    </span>
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
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 hover:bg-white/10">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-violet-500"
      />

      <span className="text-sm">{label}</span>
    </label>
  );
}