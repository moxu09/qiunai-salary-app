"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function EipAdminEntry() {
  const [state, setState] = useState({});

  useEffect(() => {
    let active = true;
    async function openAdmin() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        if (!data.session) {
          window.location.replace("/admin-login");
          return;
        }
        const response = await fetch("/api/eip-admin-entry", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        if (!active) return;
        if (result.redirect) window.location.replace(result.redirect);
        else setState({ departments: result.departments });
      } catch {
        if (active) setState({ error: "目前無法確認後台權限，請重試或重新登入。" });
      }
    }
    void openAdmin();
    return () => { active = false; };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">共同 EIP 後台</h1>
        {state.departments ? (
          <nav className="mt-5 grid gap-3" aria-label="選擇部門">
            {state.departments.map(({ key, label, href }) => (
              <a key={key} href={href} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold">
                進入{label}後台
              </a>
            ))}
          </nav>
        ) : state.error ? (
          <>
            <p className="mt-4" role="alert">{state.error}</p>
            <div className="mt-4 flex gap-5">
              <button type="button" onClick={() => window.location.reload()}>重試</button>
              <a href="/admin-login">回登入頁</a>
            </div>
          </>
        ) : <p className="mt-4" role="status">正在確認兩店後台權限…</p>}
      </section>
    </main>
  );
}
