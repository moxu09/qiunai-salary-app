"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error(error);
        router.replace("/");
        return;
      }

      if (!data.session) {
        router.replace("/");
        return;
      }

      router.replace("/staff");
    }

    handleCallback();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-300 border-t-transparent" />
        <p className="text-sm text-zinc-300">登入確認中...</p>
      </div>
    </main>
  );
}