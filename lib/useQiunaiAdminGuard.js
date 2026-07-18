"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useQiunaiAdminGuard() {
  const router = useRouter();

  const [adminLoading, setAdminLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [admin, setAdmin] = useState(null);

  async function checkAdmin() {
    setAdminLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      alert("請先登入");
      router.replace("/");
      return;
    }

    const user = sessionData.session.user;
    const discordId = user.user_metadata?.provider_id;

    if (!discordId) {
      alert("讀取 Discord ID 失敗，請重新登入");
      await supabase.auth.signOut();
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("qiunai_admins")
      .select("*")
      .eq("discord_id", discordId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error(error);
      alert("檢查後台權限失敗");
      router.replace("/staff");
      return;
    }

    if (!data) {
      alert("你沒有秋奈後台權限");
      router.replace("/staff");
      return;
    }

    setAdmin(data);
    setIsAdmin(true);
    setAdminLoading(false);
  }

  const checkAdminEffect = useEffectEvent(checkAdmin);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void checkAdminEffect(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return {
    adminLoading,
    isAdmin,
    admin,
  };
}
