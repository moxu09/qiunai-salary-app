"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  Coins,
  FileSpreadsheet,
  FolderDown,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

const COMMON_ERP_ORIGIN =
  process.env.NEXT_PUBLIC_COMMON_ERP_ORIGIN ||
  "https://salary.wearestilllhere.com";
const ERP_OWNER_DISCORD_ID = "847840193859682304";

type AdminLink = {
  href: string;
  label: string;
  icon: typeof UsersRound;
};

type NotificationCounts = {
  payroll: number;
  approvals: number;
};

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  payroll: 0,
  approvals: 0,
};

const ADMIN_LINKS: AdminLink[] = [
  { href: "/admin/staff", label: "員工管理", icon: UsersRound },
  { href: "/admin/salary", label: "訂單總覽", icon: FileSpreadsheet },
  { href: "/admin/payroll", label: "發薪模式", icon: WalletCards },
  { href: "/admin/ranking", label: "薪資排序", icon: BarChart3 },
  { href: "/admin/approvals", label: "簽核申請", icon: ClipboardCheck },
  { href: "/admin/files", label: "資料下載", icon: FolderDown },
  { href: "/admin/accounting", label: "會計報表", icon: Coins },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
];

export default function AdminShell({
  children,
  company,
  organization,
}: {
  children: React.ReactNode;
  company: string;
  rankingPath: string;
  organization: "deepnight" | "qiunai";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const { loading, access, refresh } = useErpAccess(organization, {
    redirectOnMissingSession: !embedded,
  });
  const supportOnly = access?.role === "customer_service";
  const allowedPath =
    !supportOnly ||
    pathname === "/admin/salary" ||
    pathname.startsWith("/admin/salary/");
  const links = ADMIN_LINKS.filter(
    (link) => !supportOnly || link.href === "/admin/salary",
  );
  const [notificationCounts, setNotificationCounts] = useState(
    EMPTY_NOTIFICATION_COUNTS,
  );

  const loadNotificationCounts = useCallback(async () => {
    if (embedded || loading || !access?.isAdmin || supportOnly) {
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const response = await fetch("/api/qiunai/admin-notifications", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) return;

    setNotificationCounts({
      payroll: Number(payload.payroll || 0),
      approvals: Number(payload.approvals || 0),
    });
  }, [access?.isAdmin, embedded, loading, supportOnly]);

  useEffect(() => {
    if (!embedded) return;

    const receiveSession = async (event: MessageEvent) => {
      if (
        event.origin !== COMMON_ERP_ORIGIN ||
        event.data?.type !== "ERP_COMMON_SESSION"
      ) {
        return;
      }
      const accessToken = String(event.data.accessToken || "");
      const refreshToken = String(event.data.refreshToken || "");
      if (!accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) await refresh();
    };

    window.addEventListener("message", receiveSession);
    window.parent.postMessage(
      { type: "ERP_COMMON_SESSION_REQUEST" },
      COMMON_ERP_ORIGIN,
    );
    return () => window.removeEventListener("message", receiveSession);
  }, [embedded, refresh]);

  useEffect(() => {
    if (!embedded) return;

    const forwardAdminNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href^='/admin']");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const path = new URL(anchor.href).pathname;
      const section =
        path === "/admin" ? "salary" : path.split("/").filter(Boolean)[1];
      if (
        ![
          "staff",
          "salary",
          "payroll",
          "ranking",
          "approvals",
          "files",
          "accounting",
          "settings",
        ].includes(section)
      ) {
        return;
      }

      event.preventDefault();
      window.parent.postMessage(
        { type: "ERP_COMMON_NAVIGATE", section },
        COMMON_ERP_ORIGIN,
      );
    };

    document.addEventListener("click", forwardAdminNavigation);
    return () => document.removeEventListener("click", forwardAdminNavigation);
  }, [embedded]);

  useEffect(() => {
    if (
      !embedded &&
      !loading &&
      access?.discordId === ERP_OWNER_DISCORD_ID
    ) {
      window.location.replace(
        `${COMMON_ERP_ORIGIN}/admin/department/qiunai/salary`,
      );
      return;
    }
    if (!loading && access && (!access.isAdmin || !allowedPath)) {
      router.replace(access.isAdmin ? "/admin/salary" : "/staff");
    }
  }, [access, allowedPath, embedded, loading, router]);

  useEffect(() => {
    if (loading || !access?.isAdmin || supportOnly) return;

    const refresh = () => {
      if (embedded) {
        window.parent.postMessage(
          { type: "ERP_NOTIFICATION_REFRESH" },
          COMMON_ERP_ORIGIN,
        );
        return;
      }
      void loadNotificationCounts();
    };

    if (!embedded) refresh();
    const intervalId = embedded ? null : window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("erp-notifications-changed", refresh);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("erp-notifications-changed", refresh);
    };
  }, [access?.isAdmin, embedded, loadNotificationCounts, loading, supportOnly]);

  if (loading || !access?.isAdmin || !allowedPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#80647d] shadow-sm">
          {embedded ? "正在連接共同 ERP 後台…" : "正在驗證 ERP 權限…"}
        </p>
      </main>
    );
  }

  if (embedded) {
    return <div className="admin-workspace-content min-h-screen">{children}</div>;
  }

  return (
    <div className="qiunai-admin-shell admin-workspace-shell">
      <aside className="admin-portal-nav">
        <Link href="/admin" className="admin-portal-brand">
          <p className="admin-portal-eyebrow">ERP</p>
          <p className="admin-portal-company">{company}</p>
          <p className="mt-2 text-xs font-bold text-pink-200">
            {ERP_ROLE_LABELS[access.role as keyof typeof ERP_ROLE_LABELS]}
          </p>
        </Link>
        <nav className="admin-portal-menu">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            const notificationCount = href === "/admin/payroll"
              ? notificationCounts.payroll
              : href === "/admin/approvals"
                ? notificationCounts.approvals
                : 0;
            return (
              <Link
                key={href}
                href={href}
                className={`admin-portal-link ${active ? "is-active" : ""}`}
              >
                <Icon size={19} />
                <span className="min-w-0 flex-1">{label}</span>
                {notificationCount > 0 ? (
                  <span
                    aria-label={`${label}有 ${notificationCount} 筆待處理`}
                    className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-black leading-none text-white shadow-sm shadow-red-950/30"
                  >
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="admin-workspace-content">{children}</div>
    </div>
  );
}
