"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import {
  CheckCircle2,
  Link2,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { maskErpPhone, normalizeErpPhone } from "@/lib/phoneAuth";

type Organization = "deepnight" | "qiunai";

type AuthLinkStatus = {
  discordLinked: boolean;
  googleLinked: boolean;
  googleEnabled: boolean;
  googleReady: boolean;
  emailEnabled: boolean;
  emailReady: boolean;
  email: string;
  currentEmail: string;
  pendingEmail: string;
  emailConfirmationPending: boolean;
  phoneEnabled: boolean;
  phoneReady: boolean;
  phone: string;
  currentPhone: string;
  pendingPhone: string;
  phoneConfirmationPending: boolean;
  onboardingCompleted: boolean;
  needsOnboarding: boolean;
};

type Props = {
  organization: Organization;
  mode?: "onboarding" | "profile";
  nextPath?: "/staff" | "/admin";
  embedded?: boolean;
};

async function getSessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error("登入已失效，請重新使用 Discord 登入");
  }
  return data.session.access_token;
}

export default function ErpAuthLinkManager({
  organization,
  mode = "profile",
  nextPath = "/staff",
  embedded = false,
}: Props) {
  const isQiunai = organization === "qiunai";
  const apiPath = `/api/${organization}/auth-links`;
  const [status, setStatus] = useState<AuthLinkStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeCode, setChangeCode] = useState("");
  const [reauthSent, setReauthSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneChangeCode, setPhoneChangeCode] = useState("");
  const [phoneReauthSent, setPhoneReauthSent] = useState(false);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function loadStatus() {
    const token = await getSessionToken();
    const response = await fetch(apiPath, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.status) {
      throw new Error(result.message || "讀取登入方式失敗");
    }
    setStatus(result.status);
    setEmail(result.status.email || result.status.currentEmail || "");
    setPhone(result.status.phone || result.status.currentPhone || "");
  }

  const loadStatusEffect = useEffectEvent(loadStatus);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatusEffect().catch((error) => setErrorText(error.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function postAction(action: string, extra = {}) {
    const token = await getSessionToken();
    const response = await fetch(apiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.status) {
      throw new Error(result.message || "更新登入方式失敗");
    }
    setStatus(result.status);
    return result.status as AuthLinkStatus;
  }

  async function connectGoogle() {
    setPending("google");
    setMessage("");
    setErrorText("");
    try {
      if (status?.googleLinked) {
        await postAction("enable_google");
        setMessage("Google / Gmail 已綁定，可直接用來登入。");
        return;
      }

      const params = new URLSearchParams({
        mode: "link-google",
        next: nextPath,
      });
      const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Google 帳號連結失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function connectEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorText("");

    const normalizedEmail = email.trim().toLowerCase();
    const changingEmail = Boolean(
      status?.emailEnabled &&
        status.email &&
        normalizedEmail !== status.email.toLowerCase()
    );
    if (!normalizedEmail.includes("@")) {
      setErrorText("請輸入有效的電子郵件地址");
      return;
    }
    if (
      password.length < 10 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setErrorText("密碼至少 10 碼，且必須同時包含英文字母與數字");
      return;
    }
    if (password !== confirmPassword) {
      setErrorText("兩次輸入的密碼不一致");
      return;
    }
    if (changingEmail && (!reauthSent || changeCode.trim().length < 6)) {
      setErrorText("更換已綁定的電子郵件前，請先寄送並輸入信箱驗證碼");
      return;
    }

    setPending("email");
    try {
      const attributes: { email?: string; password: string; nonce?: string } = {
        password,
      };
      if (normalizedEmail !== status?.currentEmail) {
        attributes.email = normalizedEmail;
      }
      if (changingEmail) attributes.nonce = changeCode.trim();
      const params = new URLSearchParams({
        mode: "email-confirm",
        next: nextPath,
      });
      const emailRedirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
      const { error } = await supabase.auth.updateUser(attributes, {
        emailRedirectTo,
      });
      if (error) throw error;

      const nextStatus = await postAction("enable_email", {
        email: normalizedEmail,
      });
      setPassword("");
      setConfirmPassword("");
      setChangeCode("");
      setReauthSent(false);
      setMessage(
        nextStatus.emailReady
          ? "電子郵件與密碼已綁定，可直接用來登入。"
          : "密碼已設定，請依信件完成電子郵件驗證後再使用電子郵件登入。"
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "電子郵件連結失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function sendChangeCode() {
    setPending("reauth");
    setMessage("");
    setErrorText("");
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      setReauthSent(true);
      setMessage(
        `驗證碼已寄到目前綁定信箱 ${status?.currentEmail || status?.email || ""}。`
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "寄送更換驗證碼失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function sendPhoneChangeCode() {
    setPending("phone-reauth");
    setMessage("");
    setErrorText("");
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      setPhoneReauthSent(true);
      setMessage(
        `更換電話的驗證碼已寄到 ${status?.currentEmail || status?.email || "目前信箱"}。`
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "寄送更換電話驗證碼失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function requestPhoneLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorText("");

    try {
      const normalizedPhone = normalizeErpPhone(phone);
      const changingPhone = Boolean(
        status?.phoneEnabled &&
          status.phone &&
          normalizedPhone !== status.phone
      );
      if (
        changingPhone &&
        (!phoneReauthSent || phoneChangeCode.trim().length < 6)
      ) {
        throw new Error("更換已綁定電話前，請先完成目前信箱驗證");
      }

      setPending("phone");
      const attributes: { phone: string; nonce?: string } = {
        phone: normalizedPhone,
      };
      if (changingPhone) attributes.nonce = phoneChangeCode.trim();
      const { error } = await supabase.auth.updateUser(attributes);
      if (error) throw error;

      await postAction("enable_phone", { phone: normalizedPhone });
      setPhone(normalizedPhone);
      setPhoneOtp("");
      setPhoneOtpSent(true);
      setMessage(`簡訊驗證碼已寄到 ${maskErpPhone(normalizedPhone)}。`);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "電話連結失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function confirmPhoneLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("phone-verify");
    setMessage("");
    setErrorText("");
    try {
      const normalizedPhone = normalizeErpPhone(phone);
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: phoneOtp.trim(),
        type: "phone_change",
      });
      if (error) throw error;

      const nextStatus = await postAction("enable_phone", {
        phone: normalizedPhone,
      });
      setPhoneOtp("");
      setPhoneOtpSent(false);
      setPhoneChangeCode("");
      setPhoneReauthSent(false);
      setMessage(
        nextStatus.phoneReady
          ? "電話已綁定，可直接使用簡訊驗證碼登入。"
          : "電話驗證已送出，請稍後重新整理確認狀態。"
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "電話驗證失敗"
      );
    } finally {
      setPending("");
    }
  }

  async function finishOnboarding() {
    setPending("finish");
    setMessage("");
    setErrorText("");
    try {
      await postAction("complete_onboarding");
      window.location.assign(nextPath);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "完成登入設定失敗"
      );
      setPending("");
    }
  }

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={
            isQiunai
              ? "rounded-2xl bg-pink-100 p-3 text-pink-600"
              : "rounded-2xl bg-sky-100 p-3 text-sky-600"
          }
        >
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black">
            {mode === "onboarding" ? "連結其他登入方式" : "ERP 登入方式"}
          </h2>
          <p className="mt-1 text-sm leading-6 opacity-70">
            Discord 是你的主要員工身分。Google、電子郵件與電話只會連結到同一個帳號，不會另外建立薪資或錢包。
          </p>
        </div>
      </div>

      {!status && !errorText ? (
        <div className="mt-5 flex items-center gap-2 text-sm opacity-70">
          <LoaderCircle className="animate-spin" size={18} />
          讀取登入方式中...
        </div>
      ) : null}

      {status ? (
        <div className="mt-5 space-y-5">
          <div
            className={
              isQiunai
                ? "rounded-2xl border border-pink-100 bg-pink-50/70 p-4"
                : "rounded-2xl border border-sky-100 bg-sky-50/70 p-4"
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-black">
                  <span className="text-lg font-black text-[#4285f4]">G</span>
                  Google / Gmail
                </p>
                <p className="mt-1 text-xs leading-5 opacity-65">
                  {status.googleReady
                    ? "已連結，可直接使用 Google 登入。"
                    : status.googleLinked
                      ? "帳號已連結，完成確認後即可直接登入。"
                      : "連結你的 Google 帳號作為快速登入方式。"}
                </p>
              </div>
              <button
                type="button"
                onClick={connectGoogle}
                disabled={status.googleReady || Boolean(pending)}
                className={
                  isQiunai
                    ? "inline-flex items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-4 py-2.5 text-sm font-bold text-white disabled:bg-emerald-100 disabled:text-emerald-700"
                    : "inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-emerald-100 disabled:text-emerald-700"
                }
              >
                {pending === "google" ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : status.googleReady ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Link2 size={16} />
                )}
                {status.googleReady ? "已綁定" : "連結 Google"}
              </button>
            </div>
          </div>

          <form
            onSubmit={connectEmail}
            className={
              isQiunai
                ? "rounded-2xl border border-pink-100 bg-pink-50/70 p-4"
                : "rounded-2xl border border-sky-100 bg-sky-50/70 p-4"
            }
          >
            <div className="flex items-center gap-2 font-black">
              <Mail size={18} />
              電子郵件與密碼
              {status.emailReady ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                  已綁定
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 opacity-65">
              {status.emailConfirmationPending
                ? `等待 ${status.email} 完成信箱驗證。你也可以重新設定。`
                : status.emailReady
                  ? `目前登入信箱：${status.email}`
                  : "第一次連結電子郵件時必須設定密碼。"}
            </p>

            {status.emailEnabled &&
            email.trim().toLowerCase() !== status.email.toLowerCase() ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold leading-5 text-amber-800">
                  你正在更換已綁定帳號。系統會先把驗證碼寄到目前信箱，驗證通過後才會送出新信箱驗證。
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={changeCode}
                    onChange={(event) => setChangeCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="輸入郵件驗證碼"
                    className={
                      isQiunai
                        ? "qiunai-input"
                        : "rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                    }
                  />
                  <button
                    type="button"
                    onClick={sendChangeCode}
                    disabled={Boolean(pending)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pending === "reauth" ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Mail size={16} />
                    )}
                    {reauthSent ? "重新寄送驗證碼" : "寄送驗證碼"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="電子郵件"
                className={
                  isQiunai
                    ? "qiunai-input"
                    : "rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                }
              />
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="新密碼（至少 10 碼）"
                className={
                  isQiunai
                    ? "qiunai-input"
                    : "rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                }
              />
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次輸入新密碼"
                className={
                  isQiunai
                    ? "qiunai-input sm:col-start-2"
                    : "rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400 sm:col-start-2"
                }
              />
            </div>
            <button
              type="submit"
              disabled={Boolean(pending)}
              className={
                isQiunai
                  ? "mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  : "mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              }
            >
              {pending === "email" ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Mail size={16} />
              )}
              {status.emailEnabled ? "重新設定電子郵件登入" : "連結電子郵件登入"}
            </button>
          </form>

          <form
            onSubmit={phoneOtpSent ? confirmPhoneLink : requestPhoneLink}
            className={
              isQiunai
                ? "rounded-2xl border border-pink-100 bg-pink-50/70 p-4"
                : "rounded-2xl border border-sky-100 bg-sky-50/70 p-4"
            }
          >
            <div className="flex items-center gap-2 font-black">
              <Smartphone size={18} />
              電話驗證碼登入
              {status.phoneReady ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                  已綁定
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 opacity-65">
              {status.phoneConfirmationPending
                ? `等待 ${maskErpPhone(status.phone)} 完成簡訊驗證。`
                : status.phoneReady
                  ? `目前登入電話：${maskErpPhone(status.phone)}`
                  : "綁定後可使用一次性簡訊驗證碼登入；不會建立新的員工帳號。"}
            </p>

            {!phoneOtpSent ? (
              <>
                {status.phoneEnabled &&
                phone &&
                phone.trim() !== status.phone ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold leading-5 text-amber-800">
                      更換已綁定電話前，系統會先把驗證碼寄到目前信箱，再把簡訊驗證碼寄到新電話。
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={phoneChangeCode}
                        onChange={(event) =>
                          setPhoneChangeCode(
                            event.target.value.replace(/\D/g, "").slice(0, 8)
                          )
                        }
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="輸入信箱驗證碼"
                        className={
                          isQiunai
                            ? "qiunai-input"
                            : "rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                        }
                      />
                      <button
                        type="button"
                        onClick={sendPhoneChangeCode}
                        disabled={Boolean(pending)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {pending === "phone-reauth" ? (
                          <LoaderCircle className="animate-spin" size={16} />
                        ) : (
                          <Mail size={16} />
                        )}
                        {phoneReauthSent ? "重新寄送" : "寄送信箱驗證碼"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0912345678"
                    className={
                      isQiunai
                        ? "qiunai-input"
                        : "rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                    }
                  />
                  <button
                    type="submit"
                    disabled={Boolean(pending)}
                    className={
                      isQiunai
                        ? "inline-flex items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                        : "inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    }
                  >
                    {pending === "phone" ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Smartphone size={16} />
                    )}
                    {status.phoneEnabled ? "更換並寄送驗證碼" : "寄送驗證碼"}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
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
                  placeholder="輸入 6 位數簡訊驗證碼"
                  className={
                    isQiunai
                      ? "qiunai-input"
                      : "rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                  }
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhoneOtpSent(false);
                    setPhoneOtp("");
                  }}
                  disabled={Boolean(pending)}
                  className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-bold disabled:opacity-60"
                >
                  重填電話
                </button>
                <button
                  type="submit"
                  disabled={Boolean(pending) || phoneOtp.length !== 6}
                  className={
                    isQiunai
                      ? "inline-flex items-center justify-center gap-2 rounded-full bg-[#4b2d5a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      : "inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  }
                >
                  {pending === "phone-verify" ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  完成電話綁定
                </button>
              </div>
            )}
          </form>

          {message ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-700">
              {message}
            </p>
          ) : null}
          {errorText ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {errorText}
            </p>
          ) : null}

          {mode === "onboarding" ? (
            <button
              type="button"
              onClick={finishOnboarding}
              disabled={Boolean(pending)}
              className={
                isQiunai
                  ? "qiunai-button flex w-full items-center justify-center gap-2 px-5 py-3.5 font-bold disabled:opacity-60"
                  : "flex w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
              }
            >
              {pending === "finish" ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              {status.googleReady || status.emailEnabled || status.phoneEnabled
                ? "完成設定並進入 ERP"
                : "暫時不要連結，進入 ERP"}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (embedded) return <div className="pt-1">{content}</div>;

  return (
    <section
      className={
        isQiunai
          ? "qiunai-card w-full max-w-2xl rounded-[34px] p-6 text-[#4b2d5a] sm:p-8"
          : "w-full max-w-2xl rounded-[30px] border border-sky-100 bg-white p-6 text-slate-900 shadow-xl shadow-sky-100/70 sm:p-8"
      }
    >
      {content}
    </section>
  );
}
