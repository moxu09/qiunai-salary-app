"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Loading text="登入確認中..." />}>
      <CallbackInner />
    </Suspense>
  );
}

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          setErrorText(`OAuth 錯誤：${errorDescription || error}`);
          return;
        }

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error("exchangeCodeForSession error:", exchangeError);
            setErrorText(`交換登入資料失敗：${exchangeError.message}`);
            return;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("getSession error:", sessionError);
          setErrorText(`讀取 session 失敗：${sessionError.message}`);
          return;
        }

        if (!data.session) {
          console.error("沒有取得 session");
          setErrorText(
            "沒有取得登入 session。通常是 Supabase Redirect URL 沒設定，或 Discord OAuth 回調網址沒設定好。"
          );
          return;
        }

        const destination =
          searchParams.get("next") === "/admin" ? "/admin" : "/staff";
        const mode = searchParams.get("mode") || "";
        const method = searchParams.get("method") || "discord";
        const token = data.session.access_token;

        async function getLinkStatus() {
          const response = await fetch("/api/qiunai/auth-links", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.status) {
            throw new Error(result.message || "驗證 ERP 登入方式失敗");
          }
          return result.status;
        }

        async function postLinkAction(action) {
          const response = await fetch("/api/qiunai/auth-links", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.status) {
            throw new Error(result.message || "更新 ERP 登入方式失敗");
          }
          return result.status;
        }

        if (mode === "link-google") {
          await postLinkAction("enable_google");
          router.replace(destination);
          return;
        }

        if (mode === "email-confirm") {
          const status = await getLinkStatus();
          router.replace(
            status.emailReady
              ? destination
              : `/auth/connect?next=${encodeURIComponent(destination)}`
          );
          return;
        }

        if (method === "google") {
          const status = await getLinkStatus();
          if (!status.discordLinked || !status.googleReady) {
            await supabase.auth.signOut();
            setErrorText(
              "此 Google 帳號尚未從 Discord 首次登入後完成連結。請先使用 Discord 登入，再到個人資料連結 Google。"
            );
            return;
          }
          router.replace(destination);
          return;
        }

        const status = await postLinkAction("record_discord_login");
        router.replace(
          status.needsOnboarding
            ? `/auth/connect?next=${encodeURIComponent(destination)}`
            : destination
        );
      } catch (err) {
        console.error("callback unexpected error:", err);
        setErrorText(err?.message || "未知登入錯誤");
      }
    }

    handleCallback();
  }, [router, searchParams]);

  if (errorText) {
    return (
      <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center px-4">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-xl font-bold">登入失敗</h1>

          <p className="mt-4 whitespace-pre-wrap text-sm text-red-200">
            {errorText}
          </p>

          <button
            onClick={() => router.replace("/")}
            className="mt-6 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            回登入頁
          </button>
        </div>
      </main>
    );
  }

  return <Loading text="登入確認中..." />;
}

function Loading({ text }) {
  return (
    <main className="min-h-screen bg-[#0f0b1f] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-300 border-t-transparent" />
        <p className="text-sm text-zinc-300">{text}</p>
      </div>
    </main>
  );
}
