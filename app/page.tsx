"use client";

import { supabase } from "@/lib/supabase";
import { Sparkles, Heart, Gamepad2 } from "lucide-react";

export default function LoginPage() {
  async function loginWithDiscord() {
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error(error);
      alert("Discord 登入失敗");
    }
  }

  return (
    <main className="qiunai-page flex items-center justify-center px-4 py-10">
      <div className="qiunai-glow left-[-80px] top-[-80px] h-64 w-64 bg-pink-300" />
      <div className="qiunai-glow right-[-70px] top-24 h-72 w-72 bg-purple-300" />
      <div className="qiunai-glow bottom-[-90px] left-1/2 h-72 w-72 -translate-x-1/2 bg-rose-200" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <div className="qiunai-card flex h-20 w-20 items-center justify-center rounded-[28px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-300 via-fuchsia-300 to-violet-300 text-white shadow-lg">
              <Gamepad2 size={30} />
            </div>
          </div>
        </div>

        <div className="qiunai-card rounded-[34px] p-8">
          <div className="flex items-center justify-center gap-2">
            <span className="qiunai-badge px-3 py-1 text-xs font-semibold">
              Qiunai Esports
            </span>

            <span className="qiunai-badge flex items-center gap-1 px-3 py-1 text-xs font-semibold">
              <Sparkles size={13} />
              員工入口
            </span>
          </div>

          <div className="mt-6 text-center">
            <h1 className="qiunai-title-gradient text-4xl font-black tracking-tight">
              秋奈電競 ERP
            </h1>

            <p className="mt-4 text-sm leading-7 text-[#6b4f71]">
              使用 Discord 登入後，系統會自動確認你的秋奈員工身分組，
              符合資格後即可查看薪資、獎金、接單狀態與可接遊戲。
            </p>
          </div>

          <button
            onClick={loginWithDiscord}
            className="qiunai-button mt-8 flex w-full items-center justify-center gap-2 px-5 py-4 text-base font-bold"
          >
            <Heart size={18} fill="currentColor" />
            使用 Discord 登入
          </button>

          <div className="mt-6 rounded-3xl border border-pink-200/70 bg-white/50 p-4 text-center">
            <p className="text-xs leading-6 text-[#8b5a8f]">
              甜甜接單，安心發薪。
              <br />
              秋奈電競員工 ERP
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[#a36b9e]">
          © 秋奈電競 Qiunai Esports
        </p>
      </div>
    </main>
  );
}
