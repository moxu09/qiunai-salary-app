"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, RefreshCw, WalletCards, Save, UserRound, LockKeyhole, Landmark, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { linkedWithdrawalPlan, withdrawalBalances, withdrawalSourceAmounts } from "@/lib/hrLinkedWallet.mjs";
import { HR_DEPARTMENTS, HR_ROUTES, hrTabForPath, allocateWithdrawal } from "@/lib/hrRoutes.mjs";
import { HrThemeBanner, HrAppearancePanel, HrThemeDecorations } from "@/components/HrThemeProvider";
import HrCareerPanel from "@/components/HrCareerPanel";
import StaffPortalNav, { type PortalTab } from "@/components/StaffPortalNav";
import StaffCollaboration from "@/components/StaffCollaboration";
import StaffMessages from "@/components/StaffMessages";
import HrPortalPanel from "@/components/HrPortalPanel";
import ActivityPortal from "@/components/ActivityPortal";
import DeepnightStaffInstallerDownloads from "@/components/DeepnightStaffInstallerDownloads";
import StaffInstallerDownloads from "@/components/StaffInstallerDownloads";
import ErpAuthLinkManager from "@/components/ErpAuthLinkManager";
import StaffDeviceAuditPanel from "@/components/StaffDeviceAuditPanel";
import MonthSelect from "@/components/MonthSelect";
import { getTaipeiMonthInput, getTaipeiDateInput, formatTaipeiDateTime } from "@/lib/taipeiTime";

type DepartmentKey = "qiunai" | "deepnight";
type Staff = Record<string, unknown> & {
  discord_id: string;
  display_name?: string;
  discord_name?: string;
  avatar_url?: string;
  is_online?: boolean;
};
type Department = { key: DepartmentKey; staff: Staff };
type Session = { discordId: string; departments: Department[]; financeErpUrl?: string };
type Entry = {
  id: string;
  discord_id?: string;
  amount: number;
  source_label: string;
  settlement_date: string;
  created_at: string;
};
type Withdrawal = {
  id: string;
  discord_id?: string;
  amount: number;
  status: string;
  requested_at: string;
  destination?: string;
  service_fee?: number;
  payout_amount?: number;
  reject_reason?: string;
};
type Wallet = {
  totals: { available: number; deposited: number; pendingWithdrawn: number; balance: number };
  withdrawPolicy: { nextServiceFee: number; minimumAmount: number };
  withdrawWindow: { isOpen: boolean };
  requests: Withdrawal[];
  entries: Entry[];
  monthlySummaries: Array<{
    month: string;
    deposited: number;
    withdrawn: number;
    pendingWithdrawn: number;
  }>;
};
type WalletSource = { owner: string; available: number; serviceFee: number; pendingBank: boolean; bankReady: boolean };
type WalletDepartment = { key: DepartmentKey; wallet: Wallet; sources: WalletSource[]; bankOwner?: string | null };
type WithdrawalSource = Pick<WalletSource, "owner" | "serviceFee"> & { department: DepartmentKey; amount: number };
type AccountLink = { primary_id: string; alternate_id: string; verified_at: string | null };
type Order = {
  id: string;
  discord_id?: string;
  order_id?: string;
  order_no?: string;
  service_name?: string;
  service?: string;
  customer_name?: string;
  staff_salary: number;
  bonus_amount: number;
  order_amount: number;
  order_type?: string;
  order_finished_at?: string;
  created_at: string;
  status: string;
  review_decision?: string;
  review_reason?: string;
  reviewed_at?: string;
};
type Bonus = {
  id: string;
  discord_id?: string;
  title?: string;
  bonus_type?: string;
  description?: string;
  note?: string;
  amount: number;
  created_at: string;
};
type OrderDepartment = { key: DepartmentKey; orders: Order[]; bonuses: Bonus[] };
const money = (n: unknown) => `$${Number(n || 0).toLocaleString("zh-TW")}`;
const accountOf = (owner: string | undefined, primary: string) =>
  !owner || owner === primary ? "主帳號" : `小號 · ${owner.slice(-6)}`;
const nameOf = (key: string) => HR_DEPARTMENTS.find((d) => d.key === key)?.name || key;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "讀取失敗，請稍後重試";
const profileFields = [
  ["real_name", "真實姓名", "text"],
  ["phone", "員工電話", "tel"],
  ["gender", "性別", "text"],
  ["birthday", "生日", "date"],
  ["bank_name", "銀行名稱", "text"],
  ["bank_account", "銀行帳號", "text"],
] as const;
export async function hrFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("登入已失效，請重新登入");
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.message || "服務暫時無法使用");
  return result;
}
function Logos({ departments }: { departments: Department[] }) {
  return (
    <div className="hr-brand-logos" aria-label="所屬部門">
      {HR_DEPARTMENTS.map((d) => {
        const active = departments.some((m) => m.key === d.key);
        return (
          <div
            className={`hr-brand-logo ${active ? "is-member" : "is-inactive"}`}
            key={d.key}
            title={`${d.name}：${active ? "在職" : "未隸屬"}`}
          >
            <img src={d.logo} alt={`${d.name}（${active ? "在職" : "未隸屬"}）`} />
            <span className="hr-membership-dot" />
          </div>
        );
      })}
    </div>
  );
}
function Card({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="hr-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="hr-error">
      {children}
    </p>
  );
}
export default function UnifiedHrPortal() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = (hrTabForPath(pathname) || "workspace") as PortalTab;
  const authPath = activeTab === "knowledge" ? HR_ROUTES.knowledge : pathname;
  const [accountRevision, setAccountRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(activeTab === "messages");
  const [hrMonth, setHrMonth] = useState(getTaipeiMonthInput());
  const [canAudit, setCanAudit] = useState(false);
  const init = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace(`/?next=${encodeURIComponent(window.location.pathname || authPath)}`);
        return;
      }
      const result = await hrFetch("/api/hr/session");
      const { data: currentAuth } = await supabase.auth.getSession();
      if (currentAuth.session?.user.id !== data.session.user.id) return;
      if (!result.departments.length)
        throw Error("你目前沒有在職員工權限，請確認 Discord 身分組及入職資料");
      setSession(result);
      const access = await Promise.all(
        result.departments.map(async (d: Department) => {
          try {
            return await hrFetch(`/api/${d.key}/erp-access`);
          } catch {
            return null;
          }
        }),
      );
      setCanAudit(access.some((a) => a?.access?.role === "audit_reviewer"));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [authPath, router]);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    setChatOpen(activeTab === "messages");
  }, [activeTab]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSession(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }
  function select(tab: string) {
    const next = HR_ROUTES[tab as keyof typeof HR_ROUTES];
    if (next) router.push(next);
  }
  if (loading)
    return (
      <main className="qiunai-page hr-loading hr-unified">
        <RefreshCw className="animate-spin" />
        正在整合員工資料…
      </main>
    );
  if (error || !session)
    return (
      <main className="qiunai-page hr-loading hr-unified">
        <Card title="無法進入員工 HR">
          <Notice>{error || "讀取員工資料失敗"}</Notice>
          <button className="qiunai-button" onClick={() => void init()}>
            重新整理
          </button>
          <button className="qiunai-soft-button" onClick={() => void logout()}>
            重新登入
          </button>
        </Card>
      </main>
    );
  const employeeName =
    session.departments.map((d) => d.staff.display_name || d.staff.discord_name).find(Boolean) ||
    session.discordId;
  const departments = session.departments.map((d) => ({ key: d.key, name: nameOf(d.key) }));
  const collaboration = ["workspace", "calendar", "documents", "knowledge", "workflows"].includes(
    activeTab,
  );
  const personnel =
    activeTab === "profile" ||
    activeTab === "admin-service" ||
    activeTab === "welfare" ||
    activeTab.startsWith("approval-");
  return (
    <main className="qiunai-page staff-workspace hr-unified">
      <HrThemeDecorations />
      <header className="staff-workspace-header">
        <div className="hr-header-inner">
          <div>
            <p className="staff-portal-eyebrow">WE ARE STILL HERE · HR</p>
            <h1>員工工作台</h1>
            <p>{employeeName}</p>
          </div>
          <div className="hr-header-actions">
            <button className="qiunai-soft-button" onClick={() => void init()}>
              <RefreshCw size={16} />
              重新整理
            </button>
            <button className="qiunai-soft-button" onClick={() => void logout()}>
              <LogOut size={16} />
              登出
            </button>
          </div>
        </div>
      </header>
      <section className="staff-workspace-section">
        <div className="staff-portal-grid">
          <StaffPortalNav
            activeTab={activeTab}
            onSelect={select}
            employeeName={employeeName}
            company="秋奈 × 深夜"
            brand={<Logos departments={session.departments} />}
            showDeviceAudit={canAudit}
          />
          <div className="staff-main-column min-w-0">
            <HrThemeBanner />
            {activeTab === "appearance" ? <HrAppearancePanel /> : null}
            {collaboration ? (
              <StaffCollaboration
                organization="hr"
                section={
                  activeTab as "workspace" | "calendar" | "documents" | "knowledge" | "workflows"
                }
                employeeName={employeeName}
                onSelect={select}
                workspaceActions={session.financeErpUrl ? (
                  <a href={session.financeErpUrl} target="_blank" rel="noopener noreferrer">
                    <Landmark /> 財務 ERP <ArrowUpRight />
                  </a>
                ) : null}
              />
            ) : null}
            {activeTab === "profile" ? (
              <>
                <WalletPanel key={`${session.discordId}:${accountRevision}`} departments={session.departments} primary={session.discordId} />
                <AccountLinksPanel key={session.discordId} primary={session.discordId} onChanged={() => setAccountRevision((value) => value + 1)} />
                <HrCareerPanel />
                <ProfilePanel session={session} onSaved={init} />
              </>
            ) : null}
            {personnel ? (
              <HrPortalPanel
                activeTab={activeTab}
                apiPath="/api/hr/personnel"
                department="秋奈 × 深夜"
                departments={departments}
                staffName={employeeName}
                selectedMonth={hrMonth}
                onMonthChange={setHrMonth}
              />
            ) : null}
            {["orders", "tips", "bonuses", "deductions"].includes(activeTab) ? (
              <OrdersPanel tab={activeTab} primary={session.discordId} />
            ) : null}
            {activeTab === "activities" ? (
              <>
                <div className="hr-page-title">
                  <h1>活動報名</h1>
                  <p>所屬部門的活動在此一併顯示，報名與資格各自計算。</p>
                </div>
                {departments.map((d) => (
                  <Card key={d.key} title={d.name}>
                    <ActivityPortal organization={d.key} />
                  </Card>
                ))}
              </>
            ) : null}
            {activeTab === "downloads" ? (
              <Card title="App 下載">
                <p className="hr-note">網頁版 HR 已合併；現有安裝版仍使用原部門入口。</p>
                {session.departments.map((d) =>
                  d.key === "qiunai" ? (
                    <StaffInstallerDownloads key={d.key} />
                  ) : (
                    <DeepnightStaffInstallerDownloads key={d.key} />
                  ),
                )}
              </Card>
            ) : null}
            {activeTab === "device-audit" && canAudit ? <StaffDeviceAuditPanel /> : null}
            {activeTab === "messages" ? (
              <Card title="員工訊息">
                <p>兩家店的同事與對話一併顯示。</p>
                <button className="qiunai-button" onClick={() => setChatOpen(true)}>
                  開啟員工訊息
                </button>
              </Card>
            ) : null}
            <StaffMessages
              organization="hr"
              myDiscordId={session.discordId}
              open={chatOpen}
              onOpenChange={setChatOpen}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
function ProfilePanel({ session, onSaved }: { session: Session; onSaved: () => Promise<void> }) {
  const merged = useMemo(
    () =>
      Object.fromEntries(
        profileFields.map(([key]) => [
          key,
          String(
            [...session.departments]
              .sort((a, b) =>
                String(b.staff.updated_at || "").localeCompare(String(a.staff.updated_at || "")),
              )
              .map((d) => d.staff[key])
              .find((v) => v !== null && v !== undefined && v !== "") || "",
          ),
        ]),
      ),
    [session],
  );
  const [form, setForm] = useState(merged);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await hrFetch("/api/hr/profile", { method: "PATCH", body: JSON.stringify(form) });
      await onSaved();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card title="個人資料">
        <p className="hr-note">
          姓名、聯絡方式與銀行資料合併管理；官網介紹、邀請網址與填單區 ID 保留各店設定。
        </p>
        <form onSubmit={save}>
          <div className="hr-form-grid">
            {profileFields.map(([key, label, type]) => {
              const sources = session.departments.map(
                (d) => `${nameOf(d.key)}：${String(d.staff[key] || "未填")}`,
              );
              const conflict =
                new Set(session.departments.map((d) => String(d.staff[key] || ""))).size > 1;
              return (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    value={form[key]}
                    maxLength={100}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                  {conflict ? (
                    <small className="hr-note">原資料不同：{sources.join("；")}</small>
                  ) : null}
                </label>
              );
            })}
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <button className="qiunai-button hr-submit" disabled={busy}>
            <Save size={17} />
            {busy ? "儲存中…" : "儲存至所有所屬部門"}
          </button>
        </form>
      </Card>
      <DepartmentStatus departments={session.departments} />
      <Card title="登入方式與帳號連結">
        <ErpAuthLinkManager organization={session.departments[0].key} mode="profile" embedded />
      </Card>
    </>
  );
}
function DepartmentStatus({ departments }: { departments: Department[] }) {
  const [error, setError] = useState("");
  const [staff, setStaff] = useState(departments);
  const [busy, setBusy] = useState<string | null>(null);
  async function online(key: DepartmentKey, value: boolean) {
    setBusy(key);
    try {
      const result = await hrFetch(`/api/${key}/staff`, {
        method: "PATCH",
        body: JSON.stringify({ action: "set-online", isOnline: value }),
      });
      setStaff((old) => old.map((d) => (d.key === key ? { key, staff: result.staff } : d)));
      await hrFetch(`/api/${key}/public-profile`, {
        method: "POST",
        body: JSON.stringify({ isOnline: value }),
      });
      setError("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card title="部門工作狀態">
      <div className="hr-department-summary">
        {staff.map((d) => (
          <div key={d.key}>
            <strong>{nameOf(d.key)}</strong>
            <span className={d.staff.is_online ? "hr-online" : "hr-note"}>
              {d.staff.is_online ? "上線中" : "目前離線"}
            </span>
            <button
              className="qiunai-soft-button"
              disabled={busy !== null}
              onClick={() => void online(d.key, !d.staff.is_online)}
            >
              {busy === d.key ? "更新中…" : d.staff.is_online ? "切換為下線" : "切換為上線"}
            </button>
            <DepartmentProfileEditor department={d} />
          </div>
        ))}
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}
function AccountLinksPanel({ primary, onChanged }: { primary: string; onChanged: () => void }) {
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await hrFetch("/api/hr/accounts");
    setLinks(data.links);
  }, []);
  useEffect(() => {
    let current = true;
    void hrFetch("/api/hr/accounts").then(
      (data) => { if (current) setLinks(data.links); },
      (caught) => { if (current) setError(errorText(caught)); },
    ).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, []);
  const outgoing = links.filter((link) => link.primary_id === primary);
  const incoming = links.filter((link) => link.alternate_id === primary);
  const linkedAsAlternate = incoming.some((link) => link.verified_at);
  async function update(action: "request" | "confirm" | "remove", otherId: string) {
    if (action === "confirm" && !window.confirm(
      `確定 ${otherId} 是你本人的主帳號？綁定後，該帳號可以查看這個帳號的訂單、打賞、薪資與提領紀錄，也能代為申請提領或轉入 ASD。綁定期間，銀行提領會匯到主帳號的銀行帳戶。`,
    )) return;
    if (action === "remove" && !window.confirm("確定取消這筆綁定或申請？已入帳與已送出的提領紀錄會保留。")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await hrFetch("/api/hr/accounts", { method: "POST", body: JSON.stringify({ action, otherId }) });
      if (action === "request") setTarget("");
      setNotice(action === "request" ? "已送出。請在 24 小時內用小號登入 HR，在這裡確認。"
        : action === "confirm" ? "綁定成功。請用主帳號登入 HR 查看合併紀錄。"
        : "已取消綁定或申請。");
      onChanged();
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Discord 小號管理" id="linked-accounts">
      <p className="hr-note">你的 Discord ID：{primary}。每個主帳號最多綁定兩組小號，確認後會合併訂單、打賞和薪資錢包。</p>
      {incoming.map((link) => (
        <div key={link.primary_id} className="hr-department-summary">
          <div>
            <strong>{link.verified_at ? "已綁定的主帳號" : "收到小號綁定申請"}</strong>
            <span>{link.primary_id}</span>
            {!link.verified_at ? (
              <button className="qiunai-button" disabled={busy} onClick={() => void update("confirm", link.primary_id)}>
                確認是我的主帳號
              </button>
            ) : null}
            <button className="qiunai-soft-button" disabled={busy} onClick={() => void update("remove", link.primary_id)}>
              {link.verified_at ? "解除綁定" : "拒絕"}
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((link) => (
        <div key={link.alternate_id} className="hr-department-summary">
          <div>
            <strong>{link.alternate_id}</strong>
            <span>{link.verified_at ? "已綁定" : "等待小號登入確認"}</span>
            <button className="qiunai-soft-button" disabled={busy} onClick={() => void update("remove", link.alternate_id)}>
              {link.verified_at ? "解除綁定" : "取消申請"}
            </button>
          </div>
        </div>
      ))}
      {!linkedAsAlternate && outgoing.length < 2 ? (
        <form className="hr-wallet-form" onSubmit={(event) => { event.preventDefault(); void update("request", target.trim()); }}>
          <label className="hr-amount-label">
            小號 Discord ID（{outgoing.length} / 2）
            <input required inputMode="numeric" autoComplete="off" pattern="[0-9]{17,20}" maxLength={20}
              value={target} onChange={(event) => setTarget(event.target.value.trim())} disabled={busy} />
          </label>
          <button type="submit" className="qiunai-button hr-submit" disabled={busy || !/^[0-9]{17,20}$/.test(target) || target === primary}>
            送出綁定申請
          </button>
        </form>
      ) : null}
      {notice ? <p role="status" className="hr-success">{notice}</p> : null}
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}

export function WalletPanel({ departments, primary }: { departments: Department[]; primary: string }) {
  const [wallets, setWallets] = useState<WalletDepartment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"combined" | "separate">("combined");
  const [amount, setAmount] = useState("");
  const [separate, setSeparate] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<"bank" | "asd">("bank");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<{ payload: string; id: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await hrFetch("/api/hr/wallet");
      setWallets(result.departments);
      setError("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const available = wallets.reduce(
    (sum, d) => sum + Math.max(0, Math.floor(d.wallet.totals.available)),
    0,
  );
  const deposited = wallets.reduce((sum, d) => sum + Number(d.wallet.totals.deposited), 0);
  const pending = wallets.reduce((sum, d) => sum + Number(d.wallet.totals.pendingWithdrawn), 0);
  const balances: Record<string, number> = withdrawalBalances(wallets, destination);
  const amountLimit = Object.values(balances).reduce((sum, balance) => sum + balance, 0);
  let allocations: Record<string, number> = {};
  let validation = "";
  let plan: WithdrawalSource[] = [];
  try {
    allocations =
      mode === "combined"
        ? allocateWithdrawal(amount.trim() === "" ? amountLimit : Number(amount), balances)
        : Object.fromEntries(
            wallets.map((d) => [d.key, separate[d.key]?.trim() ? Number(separate[d.key]) : 0]),
          );
    if (
      Object.entries(allocations).some(
        ([key, value]) =>
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > Math.max(0, Math.floor(balances[key] || 0)),
      )
    )
      validation = "請輸入可提領範圍內的整數金額";
    if (!validation) plan = linkedWithdrawalPlan(wallets, allocations, destination);
  } catch (caught) {
    validation = errorText(caught);
  }
  const total = Object.values(allocations).reduce((sum, n) => sum + n, 0);
  const fees = destination === "bank" ? plan.reduce((sum, source) => sum + source.serviceFee, 0) : 0;
  const windowOpen = wallets
    .filter((d) => (allocations[d.key] || 0) > 0)
    .every((d) => d.wallet.withdrawWindow.isOpen);
  const bankOwner = wallets[0]?.bankOwner || null;
  const usesPrimaryBank = Boolean(bankOwner);
  const bankSources = wallets.flatMap((d) => d.sources).filter((source) => source.available >= 1);
  const pendingBank = bankSources.some((source) => source.pendingBank);
  const missingBank = bankSources.some((source) => !source.bankReady);
  const canSubmit =
    !loading &&
    !busy &&
    !error &&
    !validation &&
    total > 0 &&
    (destination === "asd" ||
      (windowOpen &&
        total > 1000 &&
        (mode !== "separate" || Object.values(allocations).every((n) => n === 0 || n > 1000))));
  async function submit() {
    if (!canSubmit) return;
    const summary = plan
      .map((source) =>
        `${nameOf(source.department)}・${accountOf(source.owner, primary)}：${money(source.amount)}${destination === "bank" ? `，手續費 ${money(source.serviceFee)}` : ""}`,
      ).join("\n");
    if (
      !window.confirm(
        `${destination === "bank" ? (usesPrimaryBank ? "確認將這筆提領匯到主帳號的銀行帳戶？" : "確認送出銀行提領申請？") : "確認轉入各來源帳號的 ASD 錢包？"}\n${summary}\n合計 ${money(total)}，${destination === "bank" ? "預計實領" : "轉入"} ${money(total - fees)}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      mode,
      destination,
      total: mode === "combined" ? total : null,
      amounts: mode === "separate" ? allocations : null,
      sources: withdrawalSourceAmounts(plan, destination),
      ...(destination === "bank" ? { bankOwner } : {}),
    };
    const serialized = JSON.stringify(payload);
    const storageKey = `hr-withdrawal:${primary}`;
    let saved = retry;
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") || retry;
    } catch {}
    const id = saved?.payload === serialized ? saved.id : crypto.randomUUID();
    setRetry({ payload: serialized, id });
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ payload: serialized, id }));
    } catch {}
    try {
      await hrFetch("/api/hr/wallet", {
        method: "POST",
        body: JSON.stringify({ ...payload, idempotencyKey: id }),
      });
      setRetry(null);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setAmount("");
      setSeparate({});
      setNotice(
        destination === "bank"
          ? "提領申請已一併送出，各部門分別簽核。"
          : "已轉入各來源帳號的 ASD 錢包。",
      );
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }
  const requests = wallets
    .flatMap((d) => d.wallet.requests.map((r) => ({ ...r, key: d.key })))
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  const entries = wallets
    .flatMap((d) => d.wallet.entries.map((e) => ({ ...e, key: d.key })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Card title="我的錢包">
      <div className="hr-wallet-totals">
        <div>
          <small>合計可提領</small>
          <strong>{money(available)}</strong>
        </div>
        <div>
          <small>累計入帳</small>
          <strong>{money(deposited)}</strong>
        </div>
        <div>
          <small>待審提領</small>
          <strong>{money(pending)}</strong>
        </div>
      </div>
      <div className="hr-department-summary">
        {wallets.map((d) => (
          <div key={d.key}>
            <strong>{nameOf(d.key)}</strong>
            <span>可提領 {money(d.wallet.totals.available)}</span>
          </div>
        ))}
      </div>
      {wallets.some((d) => d.sources.some((source) => source.owner !== primary)) ? (
        <p className="hr-note">已合併小號餘額。轉入 ASD 會入到各來源帳號。</p>
      ) : null}
      {usesPrimaryBank ? <p className="hr-note">銀行提領一律匯到主帳號的銀行帳戶。</p> : null}
      {loading ? <p className="hr-note">同步錢包中…</p> : null}
      {error ? (
        <Notice>
          {error}
          <button className="hr-inline" onClick={() => void load()}>
            重新讀取
          </button>
        </Notice>
      ) : null}
      {notice ? (
        <p role="status" className="hr-success">
          {notice}
        </p>
      ) : null}
      <section aria-labelledby="hr-withdrawal-rules" className="hr-history mb-4">
        <h3 id="hr-withdrawal-rules" className="mb-2 text-sm font-bold">
          薪資提領規則
        </h3>
        <div className="hr-note space-y-1">
          <p>每月 2 日 00:00 入帳上月 16 日至月底薪資；每月 17 日 00:00 入帳當月 1 日至 15 日薪資。</p>
          <p>客服底薪與客服接待件數薪資統一於次月 2 日 00:00 入帳。</p>
          <p>轉入 ASD 不限提領期間、金額，無需手續費並立即入帳，一個月限領 15 次。</p>
          <p>每月 5 日 09:00 至 25 日 15:30 開放提領。</p>
          <p>金額須高於 $1,000；本月首次免手續費，第二次起每次 $15。</p>
          <p>為配合政府及銀行作業需 3 到 7 個工作日，例假日不計。</p>
          <p className="pt-1 font-bold">提領日期計算如下：</p>
          <p>例：提領時間為 10 號 00:00～15:30，則計入 13 號發放。</p>
          <p>若提領時間為 10 號 15:31～23:59，則計入 14 號發放。</p>
          <p>若個人銀行、帳戶、戶名其中一項填寫不完整，則會導致薪資發放失敗，而繼續累積。</p>
        </div>
      </section>
      <div className="hr-wallet-form">
        <div className="hr-form-grid">
          <label>
            金額輸入方式
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="combined">合併輸入總金額</option>
              <option value="separate">分開輸入各部門金額</option>
            </select>
          </label>
          <label>
            申請方式
            <select
              value={destination}
              disabled={busy}
              onChange={(e) => setDestination(e.target.value as typeof destination)}
            >
              <option value="bank">銀行提領</option>
              <option value="asd">轉入 ASD 錢包</option>
            </select>
          </label>
        </div>
        {mode === "combined" ? (
          <label className="hr-amount-label">
            申請總金額
            <input
              type="number"
              min="1"
              step="1"
              max={amountLimit}
              placeholder={`留空申請全部 ${money(amountLimit)}`}
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />
            <small>依兩家店可提領餘額比例分配，各部門內再按帳號餘額分配。</small>
          </label>
        ) : (
          <div className="hr-form-grid">
            {wallets.map((d) => (
              <label key={d.key}>
                {nameOf(d.key)}申請金額
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={Math.max(0, balances[d.key] || 0)}
                  placeholder="不申請請留空或填 0"
                  value={separate[d.key] || ""}
                  disabled={busy}
                  onChange={(e) => setSeparate({ ...separate, [d.key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}
        {validation ? (
          <p className="hr-note">{validation}</p>
        ) : (
          <div className="hr-allocation">
            {plan.map((source) => (
              <p key={`${source.department}:${source.owner}`}>
                <span>{nameOf(source.department)} · {accountOf(source.owner, primary)}</span>
                <strong>{money(source.amount)}</strong>
                <small>{destination === "bank" ? `手續費 ${money(source.serviceFee)}` : "轉入此帳號的 ASD"}</small>
              </p>
            ))}
            <p>
              <span>合計</span>
              <strong>{money(total)}</strong>
              <small>
                預計{destination === "bank" ? "實領" : "轉入"} {money(total - fees)}
              </small>
            </p>
          </div>
        )}
        {destination === "bank" ? (
          <p className="hr-note">
            {pendingBank ? "已有銀行提領待審的帳號暫不列入分配。" : ""}{" "}
            {missingBank ? (usesPrimaryBank ? "請先在主帳號填寫銀行資料。" : "未填銀行資料的部門暫不列入分配。") : ""}
            {mode === "separate"
              ? "分開提領時，各部門申請金額須高於 1,000 元。"
              : "合併提領總額須高於 1,000 元。"}
          </p>
        ) : null}
        <button
          className="qiunai-button hr-submit"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {!canSubmit && !busy ? <LockKeyhole size={18} /> : <WalletCards size={18} />}
          {busy ? "處理中…" : loading ? "同步錢包中…" : destination === "bank" && !windowOpen ? "尚未開放提領" : destination === "bank" ? "送出提領申請" : "轉入 ASD 錢包"}
        </button>
      </div>
      <WithdrawalStatements departments={departments} />
      <details className="hr-history">
        <summary>提領紀錄（兩家店合併）</summary>
        <div className="hr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>部門</th>
                <th>方式</th>
                <th>申請金額</th>
                <th>手續費</th>
                <th>實領金額</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={`${r.key}-${r.id}`}>
                  <td>{formatTaipeiDateTime(r.requested_at)}</td>
                  <td>{nameOf(r.key)} · {accountOf(r.discord_id, primary)}</td>
                  <td>{r.destination === "asd" ? "ASD" : "銀行"}</td>
                  <td>{money(r.amount)}</td>
                  <td>{money(r.service_fee)}</td>
                  <td>{money(r.payout_amount ?? r.amount)}</td>
                  <td>
                    {(
                      { pending: "待審核", approved: "已核准", rejected: "已駁回" } as Record<
                        string,
                        string
                      >
                    )[r.status] || r.status}
                    {r.reject_reason ? <small>{r.reject_reason}</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!requests.length ? <p className="hr-note">尚無提領紀錄</p> : null}
        </div>
      </details>
      <details className="hr-history">
        <summary>最近入帳紀錄（兩家店合併）</summary>
        <div className="hr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>入帳日</th>
                <th>部門</th>
                <th>項目</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 120).map((e) => (
                <tr key={`${e.key}-${e.id}`}>
                  <td>{e.settlement_date}</td>
                  <td>{nameOf(e.key)} · {accountOf(e.discord_id, primary)}</td>
                  <td>{e.source_label}</td>
                  <td>{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length ? <p className="hr-note">尚無入帳紀錄</p> : null}
        </div>
      </details>
    </Card>
  );
}
function OrdersPanel({ tab, primary }: { tab: PortalTab; primary: string }) {
  const [month, setMonth] = useState(getTaipeiMonthInput());
  const [data, setData] = useState<OrderDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await hrFetch(`/api/hr/orders?month=${encodeURIComponent(month)}`);
      setData(result.departments);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);
  const isBonus = tab === "bonuses" || tab === "deductions";
  const title = (
    { orders: "訂單明細", tips: "打賞明細", bonuses: "獎金明細", deductions: "薪資扣項" } as Record<
      string,
      string
    >
  )[tab];
  return (
    <>
      <div className="hr-page-title">
        <h1>{title}</h1>
        <p>按部門顯示主帳號及已綁定小號的紀錄。</p>
        <div className="hr-order-tools">
          <label>
            查詢月份
            <MonthSelect value={month} onChange={setMonth} />
          </label>
          <label>
            搜尋
            <input
              value={search}
              placeholder="訂單編號、顧客或服務"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="qiunai-soft-button" onClick={() => void load()}>
            重新查詢
          </button>
        </div>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {loading ? (
        <p className="hr-note">讀取訂單中…</p>
      ) : !error ? (
        data.map((source) => {
          const department = source;
          const orders = (source?.orders || []).filter((o) => {
            const tip =
              o.order_type === "打賞" || String(o.service_name || o.service || "").includes("打賞");
            return (
              (tab === "tips" ? tip : !tip) &&
              (!search ||
                [o.order_id, o.order_no, o.customer_name, o.service_name, o.service].some((v) =>
                  String(v || "").includes(search),
                ))
            );
          });
          const bonuses = (source?.bonuses || []).filter(
            (b) =>
              (tab === "deductions" ? Number(b.amount) < 0 : Number(b.amount) >= 0) &&
              (!search ||
                [b.title, b.note, b.description, b.bonus_type].some((v) =>
                  String(v || "").includes(search),
                )),
          );
          return (
            <Card
              key={department.key}
              id={department.key}
              title={`${nameOf(department.key)} · ${title}`}
            >
              <div className="hr-order-stats">
                <span>{isBonus ? bonuses.length : orders.length} 筆</span>
                <strong>
                  合計{" "}
                  {money(
                    isBonus
                      ? bonuses.reduce((s, b) => s + Number(b.amount), 0)
                      : orders.reduce(
                          (s, o) => s + Number(o.staff_salary || 0) + Number(o.bonus_amount || 0),
                          0,
                        ),
                  )}
                </strong>
              </div>
              <div className="hr-table-scroll">
                {isBonus ? (
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>項目</th>
                        <th>說明</th>
                        <th>金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonuses.map((b) => (
                        <tr key={b.id}>
                          <td>{formatTaipeiDateTime(b.created_at)}</td>
                          <td>{b.title || b.bonus_type || "—"}<small>{accountOf(b.discord_id, primary)}</small></td>
                          <td>{b.note || b.description || "—"}</td>
                          <td>{money(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>完成時間</th>
                        <th>訂單編號</th>
                        <th>顧客</th>
                        <th>服務</th>
                        <th>訂單金額</th>
                        <th>薪資</th>
                        <th>獎金</th>
                        <th>入帳狀態</th>
                        <th>審核結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>{formatTaipeiDateTime(o.order_finished_at || o.created_at)}</td>
                          <td>{o.order_id || o.order_no || o.id}<small>{accountOf(o.discord_id, primary)}</small></td>
                          <td>{o.customer_name || "—"}</td>
                          <td>{o.service_name || o.service || "—"}</td>
                          <td>{money(o.order_amount)}</td>
                          <td>{money(o.staff_salary)}</td>
                          <td>{money(o.bonus_amount)}</td>
                          <td>{o.status}</td>
                          <td>
                            {o.review_decision === "approved"
                              ? "已通過"
                              : o.review_decision === "rejected"
                                ? "已駁回"
                                : "—"}
                            {o.review_reason ? <small>{o.review_reason}</small> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!(isBonus ? bonuses.length : orders.length) ? (
                  <p className="hr-note hr-empty">這個月份沒有{title}</p>
                ) : null}
              </div>
            </Card>
          );
        })
      ) : null}
    </>
  );
}

function DepartmentProfileEditor({ department }: { department: Department }) {
  const fields = [
    ["display_name", "此部門顯示名稱", "text"],
    ["avatar_url", "此部門官網頭像網址", "url"],
    ["intro", "此部門官網介紹", "text"],
    ["note", "此部門官網備註", "text"],
    ["invite_url", "此部門邀請網址", "url"],
  ] as const;
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map(([key]) => [
        key,
        String(
          (key === "display_name"
            ? department.staff.public_display_name
            : key === "avatar_url"
              ? department.staff.public_avatar_url
              : department.staff[key]) ||
            department.staff[key] ||
            "",
        ),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await hrFetch("/api/hr/department-profile", {
        method: "PATCH",
        body: JSON.stringify({ department: department.key, profile: form }),
      });
      setNotice(`${nameOf(department.key)}的官網與顯示資料已儲存`);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="hr-service-editor">
      <summary>官網與部門專屬資料</summary>
      <form onSubmit={save}>
        <div className="hr-form-grid">
          {fields.map(([key, label, type]) => (
            <label key={key}>
              {label}
              {key === "intro" || key === "note" ? (
                <textarea
                  rows={4}
                  maxLength={key === "intro" ? 1200 : 600}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              ) : (
                <input
                  type={type}
                  maxLength={key === "display_name" ? 100 : 1000}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              )}
            </label>
          ))}
          <label>
            填單區 ID
            <input
              readOnly
              value={String(
                department.staff.report_channel_id || department.staff.salary_channel_id || "",
              )}
              placeholder="尚未設定"
            />
            <small className="hr-note">保留此部門的設定，由管理員維護。</small>
          </label>
        </div>
        {error ? <Notice>{error}</Notice> : null}
        {notice ? (
          <p role="status" className="hr-success">
            {notice}
          </p>
        ) : null}
        <button className="qiunai-button hr-submit" disabled={busy}>
          {busy ? "儲存中…" : `只儲存${nameOf(department.key)}的專屬資料`}
        </button>
      </form>
    </details>
  );
}

function WithdrawalStatements({ departments }: { departments: Department[] }) {
  const [from, setFrom] = useState(`${getTaipeiMonthInput()}-01`);
  const [to, setTo] = useState(getTaipeiDateInput());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function download(key: DepartmentKey) {
    setBusy(key);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("請重新登入");
      const params = new URLSearchParams({ from, to, format: "pdf" });
      const response = await fetch(`/api/${key}/salary-wallet/statement?${params}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw Error(result.message || "下載薪資單失敗");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${nameOf(key)}-提領薪資單-${from}-${to}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }
  return (
    <details className="hr-history">
      <summary>下載提領薪資單</summary>
      <div className="hr-form-grid">
        <label>
          開始日期
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          結束日期
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="hr-header-actions">
        {departments.map((d) => (
          <button
            key={d.key}
            disabled={Boolean(busy) || !from || !to || from > to}
            className="qiunai-soft-button"
            onClick={() => void download(d.key)}
          >
            {busy === d.key ? "下載中…" : `下載${nameOf(d.key)}薪資單`}
          </button>
        ))}
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </details>
  );
}
