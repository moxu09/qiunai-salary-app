"use client";

import { Loader2 } from "lucide-react";
import ErpWelcome from "@/components/ErpWelcome";
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

  return <ErpWelcome organization="qiunai" />;
}
