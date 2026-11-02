"use client";

import { useState } from "react";
import Link from "next/link";
import { HrSidebarArtwork } from "@/components/HrThemeProvider";
import { HR_ROUTES } from "@/lib/hrRoutes.mjs";
import {
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Coins,
  Cpu,
  FolderDown,
  Palette,
  FileText,
  Gift,
  HandCoins,
  HeartHandshake,
  MessageSquareText,
  ReceiptText,
  UserRound,
  WalletCards,
  CalendarHeart,
  LayoutDashboard,
  Menu,
  X,
  CalendarDays,
  BookOpenText,
  type LucideIcon,
} from "lucide-react";

export type PortalTab =
  | "workspace"
  | "calendar"
  | "documents"
  | "knowledge"
  | "workflows"
  | "messages"
  | "profile"
  | "admin-service"
  | "welfare"
  | "orders"
  | "tips"
  | "bonuses"
  | "deductions"
  | "device-audit"
  | "approval-administrative"
  | "approval-reimbursement"
  | "approval-welfare"
  | "approval-leave"
  | "approval-suspension"
  | "activities"
  | "downloads"
  | "appearance";

type PortalGroup = {
  title: string;
  icon: LucideIcon;
  items: ReadonlyArray<readonly [PortalTab, string, LucideIcon]>;
};

const groups: ReadonlyArray<PortalGroup> = [
  {
    title: "協作",
    icon: MessageSquareText,
    items: [
      ["workspace", "工作台", LayoutDashboard],
      ["calendar", "團隊日程", CalendarDays],
      ["documents", "共享文件", FileText],
      ["knowledge", "知識庫", BookOpenText],
      ["workflows", "流程中心", ClipboardCheck],
      ["activities", "活動報名", CalendarHeart],
    ],
  },
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
  {
    title: "資源",
    icon: FolderDown,
    items: [["downloads", "App 下載", FolderDown], ["appearance", "外觀主題", Palette]],
  },
];

type StaffPortalNavProps = {
  activeTab: PortalTab;
  onSelect: (tab: PortalTab) => void;
  employeeName: string;
  company: string;
  showDeviceAudit?: boolean;
  brand?: React.ReactNode;
};

export default function StaffPortalNav({
  activeTab,
  onSelect,
  employeeName,
  company,
  showDeviceAudit = false,
  brand,
}: StaffPortalNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.title, true])),
  );

  function toggleGroup(title: string) {
    setOpenGroups((current) => ({
      ...current,
      [title]: !(current[title] ?? true),
    }));
  }

  return (
    <aside className={`staff-portal-nav${mobileOpen ? " is-mobile-open" : ""}`}>
      <div className="staff-portal-brand">
        <p className="staff-portal-eyebrow">HR｜員工端</p>
        {brand || <p className="staff-portal-company">{company}</p>}
        <p className="staff-portal-name">{employeeName}</p>
      </div>

      <button
        type="button"
        className="staff-mobile-menu-toggle"
        aria-label={mobileOpen ? "收合功能選單" : "展開功能選單"}
        aria-expanded={mobileOpen}
        aria-controls="staff-portal-menu"
        onClick={() => {
          if (!mobileOpen)
            setOpenGroups(Object.fromEntries(groups.map((group) => [group.title, false])));
          setMobileOpen((current) => !current);
        }}
      >
        {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        <span>功能選單</span>
        <ChevronDown size={17} className="staff-mobile-menu-chevron" />
      </button>

      <nav id="staff-portal-menu" className="staff-portal-menu" aria-label="員工功能選單">
        {[
          ...groups,
          ...(showDeviceAudit
            ? [
                {
                  title: "稽核",
                  icon: Cpu,
                  items: [["device-audit", "電腦稽核", Cpu]] as const,
                },
              ]
            : []),
        ].map(({ title, icon: GroupIcon, items }) => {
          const isOpen = openGroups[title] ?? true;
          const regionId = `staff-portal-${title}`;

          return (
            <section key={title} className={`staff-portal-group ${isOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="staff-portal-group-title staff-portal-group-toggle"
                aria-expanded={isOpen}
                aria-controls={regionId}
                onClick={() => toggleGroup(title)}
              >
                <GroupIcon className="staff-portal-group-icon" size={17} />
                <span>{title}</span>
                <ChevronDown size={15} className="staff-portal-chevron ml-auto" />
              </button>

              <div
                id={regionId}
                className={`staff-portal-items-collapse ${isOpen ? "is-open" : ""}`}
              >
                <div className="staff-portal-items-inner">
                  <div className="staff-portal-items">
                    {items.map(([tab, label, Icon]) => (
                      <Link
                        key={tab}
                        href={HR_ROUTES[tab]}
                        onClick={(event) => {
                          event.preventDefault();
                          setMobileOpen(false);
                          onSelect(tab);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={`staff-portal-link ${activeTab === tab ? "is-active" : ""}`}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </nav>
      <HrSidebarArtwork />
    </aside>
  );
}
