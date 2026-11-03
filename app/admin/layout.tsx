import { headers } from "next/headers";
import CommonWorkspaceShell from "@/components/CommonWorkspaceShell";
import { isSupervisorHost } from "@/lib/hrHostRouting.mjs";
import { Suspense } from "react";
import AdminShell from "@/components/AdminShell";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (isSupervisorHost((await headers()).get("host"))) {
    return <Suspense fallback={<p>正在載入共同 EIP 後台…</p>}><CommonWorkspaceShell>{children}</CommonWorkspaceShell></Suspense>;
  }
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]">
          <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#80647d] shadow-sm">
            正在載入 EIP 後台…
          </p>
        </main>
      }
    >
      <AdminShell
        company="秋奈電競陪玩 EIP"
        rankingPath="/admin/ranking"
        organization="qiunai"
      >
        {children}
      </AdminShell>
    </Suspense>
  );
}
