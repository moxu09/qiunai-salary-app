"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, Coins, FileSpreadsheet, Settings, UsersRound, WalletCards } from "lucide-react";

type AdminLink = { href: string; label: string; icon: typeof UsersRound };
const makeAdminLinks = (rankingPath: string): AdminLink[] => [
  { href: "/admin/staff", label: "員工管理", icon: UsersRound }, { href: "/admin/salary", label: "訂單總覽", icon: FileSpreadsheet },
  { href: "/admin/payroll", label: "發薪模式", icon: WalletCards }, { href: rankingPath, label: "薪資排序", icon: BarChart3 },
  { href: "/admin/approvals", label: "簽核申請", icon: ClipboardCheck }, { href: "/admin/accounting", label: "會計報表", icon: Coins },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
];

export default function AdminShell({ children, company, rankingPath }: { children: React.ReactNode; company: string; rankingPath: string }) {
  const pathname = usePathname();
  const links = makeAdminLinks(rankingPath);
  return <div className="qiunai-admin-shell admin-workspace-shell">
    <aside className="admin-portal-nav">
      <Link href="/admin" className="admin-portal-brand"><p className="admin-portal-eyebrow">ADMIN CENTER</p><p className="admin-portal-company">{company}</p></Link>
      <nav className="admin-portal-menu">{links.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`admin-portal-link ${active ? "is-active" : ""}`}><Icon size={19}/><span>{label}</span></Link>; })}</nav>
    </aside>
    <div className="admin-workspace-content">{children}</div>
  </div>;
}
