"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ErpAuthLinkManager from "@/components/ErpAuthLinkManager";

export default function AuthConnectPage() {
  return (
    <Suspense fallback={<ConnectLoading />}>
      <ConnectContent />
    </Suspense>
  );
}

function ConnectContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") === "/admin" ? "/admin" : "/staff";

  return (
    <main className="qiunai-page flex min-h-screen items-center justify-center px-4 py-10">
      <div className="qiunai-glow left-[-80px] top-[-80px] h-64 w-64 bg-pink-300" />
      <div className="qiunai-glow right-[-70px] top-24 h-72 w-72 bg-purple-300" />
      <div className="relative z-10 flex w-full justify-center">
        <ErpAuthLinkManager
          organization="qiunai"
          mode="onboarding"
          nextPath={nextPath}
        />
      </div>
    </main>
  );
}

function ConnectLoading() {
  return (
    <main className="qiunai-page flex min-h-screen items-center justify-center text-sm font-semibold text-[#8b5a8f]">
      讀取登入連結設定中...
    </main>
  );
}
