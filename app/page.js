"use client";

import { supabase } from "@/lib/supabase";

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
    <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-violet-500/20 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm text-violet-300">Qiunai Esports</p>

        <h1 className="mt-2 text-3xl font-bold">秋奈電競薪資網</h1>

        <p className="mt-4 text-sm leading-6 text-zinc-300">
          請使用 Discord 登入。系統會自動確認你是否擁有秋奈員工身分組，
          符合資格後會自動建立薪資資料。
        </p>

        <button
          onClick={loginWithDiscord}
          className="mt-8 w-full rounded-2xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400"
        >
          使用 Discord 登入
        </button>

        <p className="mt-5 text-center text-xs text-zinc-500">
          秋奈電競專用薪資系統
        </p>
      </div>
    </main>
  );
}