import { Suspense } from "react";
import AdminShell from "@/components/AdminShell";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]">
          <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#80647d] shadow-sm">
            正在載入 ERP 後台…
          </p>
        </main>
      }
    >
      <AdminShell
        company="秋奈電競陪玩 ERP"
        rankingPath="/admin/ranking"
        organization="qiunai"
      >
        {children}
      </AdminShell>
    </Suspense>
  );
}
