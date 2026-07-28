"use client";

import Link from "next/link";
import { useEffect } from "react";
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
            return (
              <Link
                key={href}
                href={href}
                className={`admin-portal-link ${active ? "is-active" : ""}`}
              >
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="admin-workspace-content">{children}</div>
    </div>
  );
}
