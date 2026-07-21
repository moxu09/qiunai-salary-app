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
  return <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="sticky top-0 z-50 overflow-x-auto bg-[#17202d] px-3 py-3 text-white lg:h-screen lg:overflow-y-auto lg:px-4 lg:py-6">
      <Link href="/admin" className="hidden rounded-2xl bg-white/5 p-4 lg:block"><p className="text-xs font-bold tracking-[0.18em] text-slate-400">ADMIN CENTER</p><p className="mt-2 text-lg font-black">{company}</p></Link>
      <nav className="flex min-w-max gap-2 lg:mt-5 lg:min-w-0 lg:flex-col">{links.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${active ? "bg-violet-500 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon size={18}/>{label}</Link>; })}</nav>
    </aside>
    <div className="min-w-0">{children}</div>
  </div>;
}
