"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
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

export default function AdminStaffPage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    return {
      total: staffList.length,
      online: staffList.filter((staff) => staff.is_online).length,
      active: staffList.filter((staff) => staff.is_active).length,
    };
  }, [staffList]);

  async function loadStaff() {
    setLoading(true);

    const { data, error } = await supabase
      .from("qiunai_staff")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("讀取員工資料失敗:", error);
      alert("讀取員工資料失敗");
      setLoading(false);
      return;
    }

    setStaffList((data || []) as Staff[]);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      loadStaff();
    }
  }, [isAdmin]);

  function updateLocalStaff(
    id: string,
    key: keyof Staff,
    value: string | boolean | null
  ) {
    setStaffList((prev) =>
      prev.map((staff) =>
        staff.id === id
          ? {
              ...staff,
              [key]: value,
            }
          : staff
      )
    );
  }

  async function saveStaff(staff: Staff) {
    setSavingId(staff.id);

    const { error } = await supabase
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

    setSavingId(null);

    if (error) {
      console.error("儲存員工資料失敗:", error);
      alert("儲存失敗");
      return;
    }

    alert("已儲存");
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
        <div className="grid gap-4 md:grid-cols-3">
          <Stat title="員工總數" value={`${totals.total} 人`} />
          <Stat title="上線接單中" value={`${totals.online} 人`} />
          <Stat title="啟用中" value={`${totals.active} 人`} />
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">載入中...</div>
          ) : staffList.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              目前沒有員工資料
            </div>
          ) : (
            <table className="min-w-[1300px] w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">Discord</th>
                  <th className="px-4 py-3">顯示名稱</th>
                  <th className="px-4 py-3">真實姓名</th>
                  <th className="px-4 py-3">性別</th>
                  <th className="px-4 py-3">生日</th>
                  <th className="px-4 py-3">銀行</th>
                  <th className="px-4 py-3">銀行帳號</th>
                  <th className="px-4 py-3">個人薪資頻道 ID</th>
                  <th className="px-4 py-3">上線</th>
                  <th className="px-4 py-3">可接單</th>
                  <th className="px-4 py-3">啟用</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {staffList.map((staff) => (
                  <tr key={staff.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {staff.avatar_url ? (
                          <img
                            src={staff.avatar_url}
                            alt=""
                            className="h-9 w-9 rounded-full"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-white/10" />
                        )}

                        <div>
                          <p className="font-medium">
                            {staff.discord_name || "未知"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {staff.discord_id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
                        value={staff.display_name}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "display_name", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
                        value={staff.real_name}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "real_name", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={staff.gender || ""}
                        onChange={(e) =>
                          updateLocalStaff(staff.id, "gender", e.target.value)
                        }
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                      >
                        <option value="">未填</option>
                        <option value="女">女</option>
                        <option value="男">男</option>
                        <option value="其他">其他</option>
                        <option value="不公開">不公開</option>
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
                        type="date"
                        value={staff.birthday}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "birthday", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
                        value={staff.bank_name}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "bank_name", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
                        value={staff.bank_account}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "bank_account", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <AdminInput
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
                    </td>

                    <td className="px-4 py-3">
                      <CheckBox
                        checked={staff.is_online}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "is_online", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <CheckBox
                        checked={staff.can_take_order}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "can_take_order", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <CheckBox
                        checked={staff.is_active}
                        onChange={(value) =>
                          updateLocalStaff(staff.id, "is_active", value)
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => saveStaff(staff)}
                        disabled={savingId === staff.id}
                        className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 font-semibold hover:bg-violet-400 disabled:opacity-50"
                      >
                        <Save size={16} />
                        {savingId === staff.id ? "儲存中" : "儲存"}
                      </button>
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

function AdminInput({
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  value: string | null;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value || ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
    />
  );
}

function CheckBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 accent-violet-500"
    />
  );
}
