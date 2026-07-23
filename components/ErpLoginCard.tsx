"use client";

import { FormEvent, useState } from "react";
import {
  Gamepad2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { maskErpPhone, normalizeErpPhone } from "@/lib/phoneAuth";

type Theme = "deepnight" | "qiunai";

type ErpLoginCardProps = {
  organization: Theme;
  nextPath?: "/staff" | "/admin";
  admin?: boolean;
};

type AuthLinkStatus = {
  discordLinked: boolean;
  googleReady: boolean;
  emailReady: boolean;
  phoneReady: boolean;
};

const CONTENT = {
  deepnight: {
    badge: "DeepNight ERP",
    title: "深夜不關燈 ERP",
    description:
      "登入後會依你的 ERP 權限顯示薪資、訂單、簽核與管理功能。",
    copyright: "© 深夜不關燈 We Are Still Here",
  },
  qiunai: {
    badge: "Qiunai Esports ERP",
    title: "秋奈電競 ERP",
    description:
      "登入後會依你的 ERP 權限顯示薪資、訂單、簽核與管理功能。",
    copyright: "© 秋奈電競 Qiunai Esports",
  },
} as const;

export default function ErpLoginCard({
  organization,
  nextPath = "/staff",
  admin = false,
}: ErpLoginCardProps) {
  const content = CONTENT[organization];
  const isQiunai = organization === "qiunai";
  const apiPath = `/api/${organization}/auth-links`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [pending, setPending] = useState<
    "discord" | "google" | "email" | "phone" | "phone-verify" | ""
  >("");
  const [message, setMessage] = useState("");

  async function loginWithOAuth(provider: "discord" | "google") {
    setPending(provider);
    setMessage("");
    const params = new URLSearchParams({
      next: nextPath,
      method: provider,
    });
    const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      setMessage(
        provider === "discord"
          ? `Discord 登入失敗：${error.message}`
          : `Google 登入失敗：${error.message}`
      );
      setPending("");
    }
  }

  async function loginWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      setMessage(`電子郵件登入失敗：${error?.message || "沒有取得登入狀態"}`);
      setPending("");
      return;
    }

    const response = await fetch(apiPath, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    const status = result.status as AuthLinkStatus | undefined;

    if (!response.ok || !status?.discordLinked || !status.emailReady) {
      await supabase.auth.signOut();
      setMessage(
        result.message ||
          "此電子郵件尚未從 Discord 首次登入後完成連結，請先使用 Discord 登入。"
      );
      setPending("");
      return;
    }

    window.location.assign(nextPath);
  }

  async function requestPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("phone");
    setMessage("");

    try {
      const normalizedPhone = normalizeErpPhone(phone);
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setPhone(normalizedPhone);
      setPhoneOtpSent(true);
    } catch (error) {
      setMessage(
        `電話登入失敗：${error instanceof Error ? error.message : "無法寄送驗證碼"}`
      );
    } finally {
      setPending("");
    }
  }

  async function verifyPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("phone-verify");
    setMessage("");

    try {
      const normalizedPhone = normalizeErpPhone(phone);
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: phoneOtp.trim(),
        type: "sms",
      });
      if (error || !data.session) {
        throw error || new Error("沒有取得登入狀態");
      }

      const response = await fetch(apiPath, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      const status = result.status as AuthLinkStatus | undefined;
      if (!response.ok || !status?.discordLinked || !status.phoneReady) {
        await supabase.auth.signOut();
        throw new Error(
          result.message ||
            "此電話尚未從 Discord 首次登入後完成連結，請先使用 Discord 登入。"
        );
      }

      window.location.assign(nextPath);
    } catch (error) {
      setMessage(
        `電話驗證失敗：${error instanceof Error ? error.message : "驗證碼無效"}`
      );
      setPending("");
    }
  }

  return (
    <main
      className={
        isQiunai
          ? "qiunai-page flex min-h-screen items-center justify-center px-4 py-10"
          : "flex min-h-screen items-center justify-center bg-[#eef7fd] px-4 py-10 text-slate-900"
      }
    >
      {isQiunai ? (
        <>
          <div className="qiunai-glow left-[-80px] top-[-80px] h-64 w-64 bg-pink-300" />
          <div className="qiunai-glow right-[-70px] top-24 h-72 w-72 bg-purple-300" />
          <div className="qiunai-glow bottom-[-90px] left-1/2 h-72 w-72 -translate-x-1/2 bg-rose-200" />
        </>
      ) : null}

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-5 flex justify-center">
          <div
            className={
              isQiunai
                ? "qiunai-card flex h-20 w-20 items-center justify-center rounded-[28px]"
                : "flex h-20 w-20 items-center justify-center rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100"
            }
          >
            <div
              className={
                isQiunai
                  ? "flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-300 via-fuchsia-300 to-violet-300 text-white shadow-lg"
                  : "flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300 via-sky-400 to-blue-500 text-white shadow-md shadow-sky-200"
              }
            >
              {admin ? <ShieldCheck size={30} /> : <Gamepad2 size={30} />}
            </div>
          </div>
        </div>

        <div
          className={
            isQiunai
              ? "qiunai-card rounded-[34px] p-7 sm:p-8"
              : "rounded-[30px] border border-sky-100 bg-white p-7 shadow-xl shadow-sky-100/70"
          }
        >
          <div className="text-center">
            <span
              className={
                isQiunai
                  ? "qiunai-badge inline-flex px-3 py-1 text-xs font-semibold"
                  : "inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700"
              }
            >
              {content.badge} · {admin ? "管理入口" : "員工入口"}
            </span>
            <h1
              className={
                isQiunai
                  ? "qiunai-title-gradient mt-5 text-4xl font-black tracking-tight"
                  : "mt-5 text-3xl font-black tracking-tight text-slate-900"
              }
            >
              {content.title}
            </h1>
            <p
              className={
                isQiunai
                  ? "mt-3 text-sm leading-7 text-[#6b4f71]"
                  : "mt-3 text-sm leading-7 text-slate-600"
              }
            >
              {content.description}
            </p>
          </div>

          <div
            className={
              isQiunai
                ? "mt-6 rounded-2xl border border-pink-200 bg-pink-50/80 px-4 py-3 text-sm font-bold leading-6 text-pink-700"
                : "mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800"
            }
          >
            第一次登入一定要使用 Discord。完成第一次登入並主動連結後，才可使用
            Google（Gmail）、電子郵件密碼或電話驗證碼登入。
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => loginWithOAuth("discord")}
              disabled={Boolean(pending)}
              className={
                isQiunai
                  ? "qiunai-button flex items-center justify-center gap-2 px-5 py-3.5 font-bold disabled:opacity-60"
                  : "flex items-center justify-center gap-2 rounded-full bg-[#5865f2] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:-translate-y-0.5 disabled:opacity-60"
              }
            >
              {pending === "discord" ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <MessageCircle size={18} />
              )}
              使用 Discord
            </button>

            <button
              type="button"
              onClick={() => loginWithOAuth("google")}
              disabled={Boolean(pending)}
              className={
                isQiunai
                  ? "flex items-center justify-center gap-2 rounded-full border border-pink-200 bg-white px-5 py-3.5 text-sm font-bold text-[#5b3768] transition hover:bg-pink-50 disabled:opacity-60"
                  : "flex items-center justify-center gap-2 rounded-full border border-sky-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-60"
              }
            >
              {pending === "google" ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <span className="text-base font-black text-[#4285f4]">G</span>
              )}
              使用 Google / Gmail
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400">
            <span className="h-px flex-1 bg-current opacity-20" />
            或使用已連結的電子郵件
            <span className="h-px flex-1 bg-current opacity-20" />
          </div>

          <form onSubmit={loginWithEmail} className="space-y-3">
            <label className="block">
              <span className="text-sm font-bold">電子郵件</span>
              <div className="relative mt-2">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={
                    isQiunai
                      ? "qiunai-input pl-11"
                      : "w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 pl-11 text-sm outline-none focus:border-sky-400"
                  }
                  placeholder="name@example.com"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-bold">密碼</span>
              <div className="relative mt-2">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={
                    isQiunai
                      ? "qiunai-input pl-11"
                      : "w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 pl-11 text-sm outline-none focus:border-sky-400"
                  }
                  placeholder="已連結電子郵件時設定的密碼"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={Boolean(pending)}
              className={
                isQiunai
                  ? "flex w-full items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                  : "flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
              }
            >
              {pending === "email" ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Mail size={18} />
              )}
              使用電子郵件登入
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400">
            <span className="h-px flex-1 bg-current opacity-20" />
            或使用已連結的電話
            <span className="h-px flex-1 bg-current opacity-20" />
          </div>

          {phoneOtpSent ? (
            <form onSubmit={verifyPhoneOtp} className="space-y-3">
              <p className="text-sm font-semibold">
                驗證碼已寄到 {maskErpPhone(phone)}
              </p>
              <label className="block">
                <span className="text-sm font-bold">6 位數簡訊驗證碼</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={phoneOtp}
                  onChange={(event) =>
                    setPhoneOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className={
                    isQiunai
                      ? "qiunai-input mt-2"
                      : "mt-2 w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                  }
                  placeholder="輸入驗證碼"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneOtpSent(false);
                    setPhoneOtp("");
                    setMessage("");
                  }}
                  disabled={Boolean(pending)}
                  className="rounded-full border border-slate-200 px-5 py-3.5 text-sm font-bold disabled:opacity-60"
                >
                  更換電話號碼
                </button>
                <button
                  type="submit"
                  disabled={Boolean(pending) || phoneOtp.length !== 6}
                  className={
                    isQiunai
                      ? "flex items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                      : "flex items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                  }
                >
                  {pending === "phone-verify" ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <ShieldCheck size={18} />
                  )}
                  驗證並登入
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={requestPhoneOtp} className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold">電話號碼</span>
                <div className="relative mt-2">
                  <Smartphone
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={
                      isQiunai
                        ? "qiunai-input pl-11"
                        : "w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 pl-11 text-sm outline-none focus:border-sky-400"
                    }
                    placeholder="0912345678"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={Boolean(pending)}
                className={
                  isQiunai
                    ? "flex w-full items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                    : "flex w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                }
              >
                {pending === "phone" ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Smartphone size={18} />
                )}
                傳送電話登入驗證碼
              </button>
            </form>
          )}

          {message ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {message}
            </p>
          ) : null}
        </div>

        <p
          className={
            isQiunai
              ? "mt-5 text-center text-xs text-[#a36b9e]"
              : "mt-5 text-center text-xs font-semibold text-slate-400"
          }
        >
          {content.copyright}
        </p>
      </div>
    </main>
  );
}
