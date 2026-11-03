"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  CalendarHeart,
  Coins,
  ChevronDown,
  Cpu,
  FileSpreadsheet,
  FolderDown,
  History,
  Settings,
  BookOpenText,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

const ERP_OWNER_DISCORD_ID = "847840193859682304";

type Organization = "deepnight" | "qiunai";
type AdminLink = {
  href: string;
  label: string;
  icon: typeof UsersRound;
};

type NotificationCounts = {
  payroll: number;
  approvals: number;
  workflowOverdue: number;
};

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  payroll: 0,
  approvals: 0,
  workflowOverdue: 0,
};

const SECTIONS = [
  { key: "staff", label: "員工管理", icon: UsersRound },
  { key: "salary", label: "訂單總覽", icon: FileSpreadsheet },
  { key: "payroll", label: "發薪模式", icon: WalletCards },
  { key: "ranking", label: "薪資排序", icon: BarChart3 },
  { key: "approvals", label: "簽核申請", icon: ClipboardCheck },
  { key: "workspace", label: "協作工作台", icon: BookOpenText },
  { key: "activities", label: "活動管理", icon: CalendarHeart },
  { key: "app-installers", label: "員工 App 安裝包", icon: FolderDown },
  { key: "device-audit", label: "電腦稽核", icon: Cpu },
  { key: "files", label: "資料下載", icon: FolderDown },
  { key: "accounting", label: "會計報表", icon: Coins },
  { key: "activity-logs", label: "異動日誌", icon: History },
  { key: "settings", label: "系統設定", icon: Settings },
] as const;

function organizationFromPath(pathname: string): Organization {
  return pathname.startsWith("/admin/department/qiunai")
    ? "qiunai"
    : "deepnight";
}

function sectionHref(organization: Organization, section: string) {
  if (organization === "qiunai") {
    return `/admin/department/qiunai/${section}`;
  }
  if (section === "ranking") return "/admin/salary-rank";
  return `/admin/${section}`;
}

function makeAdminLinks(organization: Organization): AdminLink[] {
  return SECTIONS.filter(({ key }) => organization === "deepnight" || key !== "app-installers").map(({ key, label, icon }) => ({
    href: sectionHref(organization, key),
    label,
    icon,
  }));
}

export default function CommonWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentOrganization = organizationFromPath(pathname);
  const { loading, access } = useErpAccess(currentOrganization, { redirectOnMissingSession: false, redirectOnAccessError: false });
  const supportOnly = access?.role === "customer_service";
  const auditOnly = access?.role === "audit_reviewer";
  const salaryHref = sectionHref(currentOrganization, "salary");
  const deviceAuditHref = sectionHref(currentOrganization, "device-audit");
  const fallbackHref = auditOnly ? deviceAuditHref : salaryHref;
  const allowedPath =
    (!supportOnly && !auditOnly) ||
    (supportOnly &&
      (pathname === salaryHref || pathname.startsWith(`${salaryHref}/`))) ||
    (auditOnly &&
      (pathname === deviceAuditHref ||
        pathname.startsWith(`${deviceAuditHref}/`)));
  const railContent = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const panel = railContent.current;
    if (!panel) return;
    const position = () => {
      const top = Math.min(0, window.innerHeight - panel.offsetHeight);
      panel.style.setProperty("--workspace-rail-top", `${top}px`);
    };
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    position();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [loading, access?.isAdmin, allowedPath]);
  const links = makeAdminLinks(currentOrganization).filter(
    (link) =>
      (!supportOnly && !auditOnly) ||
      (supportOnly && link.href === salaryHref) ||
      (auditOnly && link.href === deviceAuditHref),
  );
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;
  if (owner) {
    links.push({
      href: "/admin/finance-erp-installers",
      label: "財務 ERP 安裝包",
      icon: FolderDown,
    });
  }
  const company =
    currentOrganization === "qiunai" ? "秋奈電競" : "深夜不關燈";
  const [notificationCounts, setNotificationCounts] = useState(
    EMPTY_NOTIFICATION_COUNTS,
  );

  const loadNotificationCounts = useCallback(async () => {
    if (loading || !access?.isAdmin || supportOnly || auditOnly) {
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const response = await fetch(
      `/api/${currentOrganization}/admin-notifications`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) return;

    setNotificationCounts({
      payroll: Number(payload.payroll || 0),
      approvals: Number(payload.approvals || 0),
      workflowOverdue: Number(payload.workflowOverdue || 0),
    });
  }, [access?.isAdmin, auditOnly, currentOrganization, loading, supportOnly]);

  useEffect(() => {
    if (!loading && access && (!access.isAdmin || !allowedPath)) {
      router.replace(access.isAdmin ? fallbackHref : "/staff");
    }
  }, [access, allowedPath, fallbackHref, loading, router]);

  useEffect(() => {
    if (loading || !access?.isAdmin || supportOnly || auditOnly) return;

    const refresh = () => void loadNotificationCounts();
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("erp-notifications-changed", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("erp-notifications-changed", refresh);
    };
  }, [access?.isAdmin, auditOnly, loadNotificationCounts, loading, supportOnly]);

  if (!loading && !access) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <a className="rounded-xl bg-slate-800 px-6 py-4 font-bold text-white" href={`/admin-login?department=${currentOrganization}`}>重新登入 EIP</a>
    </main>;
  }
  if (loading || !access?.isAdmin || !allowedPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-500 shadow-sm">
          正在驗證共同 EIP 權限…
        </p>
      </main>
    );
  }

  return (
    <div className="common-workspace-shell admin-portal-shell">
      <aside className="admin-portal-sidebar workspace-rail">
        <div className="workspace-rail-content" ref={railContent}>
          <button type="button" className="workspace-menu-toggle" aria-controls="workspace-navigation" aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(open => !open)}>
            <span>{company} · EIP 導覽</span><ChevronDown size={18}/>
          </button>
          <div id="workspace-navigation" className={mobileMenuOpen ? "workspace-navigation is-open" : "workspace-navigation"}>
            <a
              href={owner && !supportOnly && !auditOnly ? "/admin" : fallbackHref}
              className="admin-portal-brand"
            >
              <p className="text-xs font-bold tracking-[0.18em]">共同 EIP 後台</p>
              <p className="mt-2 text-lg font-black">{company}</p>
              <p className="mt-2 text-xs font-bold text-slate-400">
                {ERP_ROLE_LABELS[access.role as keyof typeof ERP_ROLE_LABELS]}
              </p>
            </a>

            {owner ? (
              <div className="mx-3 mb-3 mt-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-2 lg:mt-0">
                <a
                  href="/admin"
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${
                    pathname === "/admin"
                      ? "bg-violet-500 text-white"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <Building2 size={14} />
                  兩家合併總覽
                </a>
                <a href="/admin/finance-erp-installers" className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${pathname === '/admin/finance-erp-installers' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                  <FolderDown size={14} />財務 ERP 下載
                </a>
              </div>
            ) : null}

            {owner ? <div className="mx-3 mb-3 flex flex-wrap gap-2 px-2 text-xs font-bold text-slate-200" aria-label="切換協作店家">
              <a href="/admin/workspace" aria-current={currentOrganization === "deepnight" ? "page" : undefined}>深夜協作</a>
              <a href="/admin/department/qiunai/workspace" aria-current={currentOrganization === "qiunai" ? "page" : undefined}>秋奈協作</a>
            </div> : null}
            <nav className="admin-portal-nav" aria-label="EIP 後台導覽">
              {links.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                const notificationCount = href.endsWith("/payroll")
                  ? notificationCounts.payroll
                  : href.endsWith("/approvals")
                    ? notificationCounts.approvals
                    : href.endsWith("/workspace")
                      ? notificationCounts.workflowOverdue
                    : 0;
                return (
                  <a
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`admin-portal-link flex items-center gap-3 text-sm font-bold transition ${
                      active ? "is-active" : ""
                    }`}
                  >
                    <Icon size={18} />
                    <span className="min-w-0 flex-1">{label}</span>
                    {notificationCount > 0 ? (
                      <span
                        aria-label={href.endsWith("/workspace") ? `${label}有 ${notificationCount} 筆超時流程` : `${label}有 ${notificationCount} 筆待處理`}
                        className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-black leading-none text-white shadow-sm shadow-red-950/30"
                      >
                        {notificationCount > 99 ? "99+" : notificationCount}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>
      <div className="admin-portal-content min-w-0">
        {children}
      </div>
    </div>
  );
}
