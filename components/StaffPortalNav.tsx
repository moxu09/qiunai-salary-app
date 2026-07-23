"use client";

import { useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Coins,
  FileText,
  Gift,
  HandCoins,
  HeartHandshake,
  ReceiptText,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type PortalTab =
  | "profile"
  | "admin-service"
  | "welfare"
  | "orders"
  | "tips"
  | "bonuses"
  | "deductions"
  | "approval-administrative"
  | "approval-reimbursement"
  | "approval-welfare"
  | "approval-leave"
  | "approval-suspension";

type PortalGroup = {
  title: string;
  icon: LucideIcon;
  items: ReadonlyArray<readonly [PortalTab, string, LucideIcon]>;
};

const groups: ReadonlyArray<PortalGroup> = [
  {
    title: "人事",
    icon: UserRound,
    items: [
      ["profile", "個人資料", UserRound],
      ["admin-service", "行政服務申請", FileText],
      ["welfare", "福利申請", HeartHandshake],
    ],
  },
  {
    title: "訂單",
    icon: BriefcaseBusiness,
    items: [
      ["orders", "訂單明細", ReceiptText],
      ["tips", "打賞明細", HandCoins],
      ["bonuses", "獎金明細", Gift],
      ["deductions", "薪資扣項", Coins],
    ],
  },
  {
    title: "簽核",
    icon: ClipboardCheck,
    items: [
      ["approval-administrative", "行政服務簽核", BadgeCheck],
      ["approval-reimbursement", "報銷簽核", WalletCards],
      ["approval-welfare", "福利簽核", HeartHandshake],
      ["approval-leave", "請假單簽核", FileText],
      ["approval-suspension", "留職停薪簽核", ClipboardCheck],
    ],
  },
];

type StaffPortalNavProps = {
  activeTab: PortalTab;
  onSelect: (tab: PortalTab) => void;
  employeeName: string;
  company: string;
};

export default function StaffPortalNav({
  activeTab,
  onSelect,
  employeeName,
  company,
}: StaffPortalNavProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.title, true]))
  );

  function toggleGroup(title: string) {
    setOpenGroups((current) => ({
      ...current,
      [title]: !current[title],
    }));
  }

  return (
    <aside className="staff-portal-nav">
      <div className="staff-portal-brand">
        <p className="staff-portal-eyebrow">ERP｜員工端</p>
        <p className="staff-portal-company">{company}</p>
        <p className="staff-portal-name">{employeeName}</p>
      </div>

      <nav className="staff-portal-menu">
        {groups.map(({ title, icon: GroupIcon, items }) => {
          const isOpen = openGroups[title];
          const regionId = `staff-portal-${title}`;

          return (
            <section
              key={title}
              className={`staff-portal-group ${isOpen ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="staff-portal-group-title staff-portal-group-toggle"
                aria-expanded={isOpen}
                aria-controls={regionId}
                onClick={() => toggleGroup(title)}
              >
                <GroupIcon className="staff-portal-group-icon" size={17} />
                <span>{title}</span>
                <ChevronDown
                  size={15}
                  className="staff-portal-chevron ml-auto"
                />
              </button>

              <div
                id={regionId}
                className={`staff-portal-items-collapse ${
                  isOpen ? "is-open" : ""
                }`}
              >
                <div className="staff-portal-items-inner">
                  <div className="staff-portal-items">
                    {items.map(([tab, label, Icon]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          onSelect(tab);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={`staff-portal-link ${
                          activeTab === tab ? "is-active" : ""
                        }`}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
