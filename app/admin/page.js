"use client";

import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Loader2,
  ReceiptText,
  Users,
  WalletCards,
  Settings,
  Trophy,
} from "lucide-react";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

export default function AdminHomePage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  if (adminLoading || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]">
        <div className="rounded-[28px] border border-pink-100 bg-white px-8 py-7 text-center shadow-sm shadow-pink-100">
          <Loader2 className="mx-auto animate-spin text-pink-500" size={34} />
          <p className="mt-4 text-sm font-semibold text-[#73516f]">
            檢查後台權限中...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fff7fb] px-5 py-6 text-[#3f2947]">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[36px] border border-pink-100 bg-white px-8 py-10 shadow-sm shadow-pink-100">
          <p className="text-sm font-black text-pink-600 md:text-lg">
            Qiunai Admin
          </p>
          <h1 className="mt-5 text-3xl font-black text-[#3f2947] md:text-4xl">
            秋奈電競｜管理後台
          </h1>
          <p className="mt-6 text-base font-semibold leading-8 text-[#80647d] md:text-lg">
            管理員可在這裡維護員工資料、薪資資料、系統通知與發薪設定。
          </p>
        </header>

        <section className="grid gap-7 md:grid-cols-2">
          <AdminCard
            href="/admin/staff"
            title="員工管理"
            desc="設定員工資料、上線狀態、可接服務、個人薪資頻道 ID。"
            icon={<Users size={38} />}
          />

          <AdminCard
            href="/admin/salary"
            title="薪資總表"
            desc="查看收入、支出、獎金、訂單薪資與發薪狀態。"
            icon={<WalletCards size={38} />}
          />

          <AdminCard
            href="/admin/ranking"
            title="員工薪資排序"
            desc="查看每位員工薪水總額，可依薪資升冪或降冪排序。"
            icon={<Trophy size={38} />}
          />

          <AdminCard
            href="/admin/payroll"
            title="發薪模式"
            desc="彙整有薪水要發的員工、薪水、獎金、銀行帳號與戶名。"
            icon={<Banknote size={38} />}
          />

          <AdminCard
            href="/admin/accounting"
            title="會計報表"
            desc="按月份匯出儲值預收、訂單收入、折扣、薪資與月結應收。"
            icon={<ReceiptText size={38} />}
          />

          <AdminCard
            href="/admin/settings"
            title="系統設定"
            desc="設定管理總報告頻道、發薪日與薪資通知相關設定。"
            icon={<Settings size={38} />}
          />
        </section>
      </div>
    </main>
  );
}

function AdminCard({ href, title, desc, icon }) {
  return (
    <Link
      href={href}
      className="group rounded-[36px] border border-pink-100 bg-white p-8 shadow-sm shadow-pink-100 transition hover:-translate-y-1 hover:border-pink-200 hover:shadow-md hover:shadow-pink-100"
    >
      <div className="flex min-h-[260px] flex-col justify-between">
        <div>
          <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-pink-50 text-pink-600">
            {icon}
          </div>
          <h2 className="mt-10 text-2xl font-black text-[#3f2947]">{title}</h2>
          <p className="mt-8 text-base font-semibold leading-8 text-[#80647d]">
            {desc}
          </p>
        </div>
        <div className="mt-6 flex justify-end text-pink-500 transition group-hover:translate-x-1">
          <ArrowRight size={30} />
        </div>
      </div>
    </Link>
  );
}
