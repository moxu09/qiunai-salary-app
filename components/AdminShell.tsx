"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ClipboardCheck, Coins, FileSpreadsheet, FolderDown, Settings, UsersRound, WalletCards } from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { useErpAccess } from "@/lib/useErpAccess";

type AdminLink = { href: string; label: string; icon: typeof UsersRound };
const makeAdminLinks = (rankingPath: string): AdminLink[] => [
  { href: "/admin/staff", label: "員工管理", icon: UsersRound }, { href: "/admin/salary", label: "訂單總覽", icon: FileSpreadsheet },
  { href: "/admin/payroll", label: "發薪模式", icon: WalletCards }, { href: rankingPath, label: "薪資排序", icon: BarChart3 },
  { href: "/admin/approvals", label: "簽核申請", icon: ClipboardCheck }, { href: "/admin/files", label: "資料下載", icon: FolderDown },
  { href: "/admin/accounting", label: "會計報表", icon: Coins },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
];

export default function AdminShell({ children, company, rankingPath, organization }: { children: React.ReactNode; company: string; rankingPath: string; organization: "deepnight" | "qiunai" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, access } = useErpAccess(organization);
  const supportOnly = access?.role === "customer_service";
  const allowedPath = !supportOnly || pathname === "/admin/salary" || pathname.startsWith("/admin/salary/");
  const links = makeAdminLinks(rankingPath).filter((link) => !supportOnly || link.href === "/admin/salary");
  useEffect(() => { if (!loading && access && (!access.isAdmin || !allowedPath)) router.replace(access.isAdmin ? "/admin/salary" : "/staff"); }, [access, allowedPath, loading, router]);
  if (loading || !access?.isAdmin || !allowedPath) return <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]"><p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#80647d] shadow-sm">正在驗證 ERP 權限…</p></main>;
  return <div className="qiunai-admin-shell admin-workspace-shell">
    <aside className="admin-portal-nav">
      <Link href={supportOnly ? "/admin/salary" : "/admin"} className="admin-portal-brand"><p className="admin-portal-eyebrow">ERP</p><p className="admin-portal-company">{company}</p><p className="mt-2 text-xs font-bold text-pink-200">{ERP_ROLE_LABELS[access.role as keyof typeof ERP_ROLE_LABELS]}</p></Link>
      <nav className="admin-portal-menu">{links.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`admin-portal-link ${active ? "is-active" : ""}`}><Icon size={19}/><span>{label}</span></Link>; })}</nav>
    </aside>
    <div className="admin-workspace-content">{children}</div>
  </div>;
}
