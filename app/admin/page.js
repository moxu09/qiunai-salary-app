"use client";

import Link from "next/link";
import { Users, WalletCards, Settings, Trophy } from "lucide-react";
import { useQiunaiAdminGuard } from "@/lib/useQiunaiAdminGuard";

export default function AdminHomePage() {
  const { adminLoading, isAdmin } = useQiunaiAdminGuard();

  if (adminLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
        <p className="text-sm text-zinc-300">檢查後台權限中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white">
      <section className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-violet-300">Qiunai Admin</p>
        <h1 className="mt-2 text-3xl font-bold">秋奈電競｜管理後台</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <AdminCard
            href="/admin/staff"
            title="員工管理"
            desc="設定員工資料、上線狀態、個人薪資頻道 ID"
            icon={<Users size={26} />}
          />

          <AdminCard
            href="/admin/salary"
            title="薪資總表"
            desc="查看收入、支出、獎金、發薪狀態"
            icon={<WalletCards size={26} />}
          />

          <AdminCard
            href="/admin/ranking"
            title="排行榜"
            desc="查看每位陪陪薪資排行，可依薪水升冪或降冪排序"
            icon={<Trophy size={26} />}
          />

          <AdminCard
            href="/admin/settings"
            title="系統設定"
            desc="設定管理總報告頻道與發薪日"
            icon={<Settings size={26} />}
          />
        </div>
      </section>
    </main>
  );
}

function AdminCard({ href, title, desc, icon }) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-violet-400/60 hover:bg-white/10"
    >
      <div className="text-violet-300">{icon}</div>
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{desc}</p>
    </Link>
  );
}