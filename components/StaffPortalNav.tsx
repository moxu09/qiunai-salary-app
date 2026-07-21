"use client";

import { BadgeCheck, BriefcaseBusiness, ChevronDown, ClipboardCheck, Coins, FileText, Gift, HandCoins, HeartHandshake, ReceiptText, UserRound, WalletCards } from "lucide-react";

export type PortalTab = "profile" | "admin-service" | "welfare" | "orders" | "tips" | "bonuses" | "deductions" | "approval-administrative" | "approval-reimbursement" | "approval-welfare" | "approval-leave" | "approval-suspension";

const groups = [
  { title: "人事", icon: UserRound, items: [["profile", "個人資料", UserRound], ["admin-service", "行政服務申請", FileText], ["welfare", "福利申請", HeartHandshake]] },
  { title: "訂單", icon: BriefcaseBusiness, items: [["orders", "訂單明細", ReceiptText], ["tips", "打賞明細", HandCoins], ["bonuses", "獎金明細", Gift], ["deductions", "薪資扣項", Coins]] },
  { title: "簽核", icon: ClipboardCheck, items: [["approval-administrative", "行政服務簽核", BadgeCheck], ["approval-reimbursement", "報銷簽核", WalletCards], ["approval-welfare", "福利簽核", HeartHandshake], ["approval-leave", "請假單簽核", FileText], ["approval-suspension", "留職停薪簽核", ClipboardCheck]] },
] as const;

export default function StaffPortalNav({ activeTab, onSelect, employeeName, company }: { activeTab: PortalTab; onSelect: (tab: PortalTab) => void; employeeName: string; company: string }) {
  return <aside className="sticky top-4 z-20 self-start overflow-x-auto rounded-[28px] bg-[#24134d] p-3 text-white shadow-xl shadow-violet-200/60 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto lg:p-5">
    <div className="hidden lg:block"><p className="text-xs font-semibold tracking-[0.2em] text-violet-200">STAFF CENTER</p><p className="mt-2 text-xl font-black">{company}</p><p className="mt-1 truncate text-sm text-violet-200">{employeeName}</p></div>
    <nav className="flex min-w-max gap-3 lg:mt-7 lg:min-w-0 lg:flex-col">
      {groups.map(({ title, icon: GroupIcon, items }) => <section key={title} className="rounded-2xl bg-white/5 p-2 lg:bg-transparent lg:p-0">
        <p className="mb-2 flex items-center gap-2 px-2 text-xs font-black tracking-[0.18em] text-violet-200"><GroupIcon size={15}/>{title}<ChevronDown size={13} className="ml-auto hidden lg:block"/></p>
        <div className="flex gap-1 lg:flex-col">{items.map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => { onSelect(tab); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${activeTab === tab ? "bg-violet-500 text-white shadow-lg shadow-violet-950/20" : "text-violet-100 hover:bg-white/10"}`}><Icon size={17}/>{label}</button>)}</div>
      </section>)}
    </nav>
  </aside>;
}

