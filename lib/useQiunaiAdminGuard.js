"use client";
import { useErpAccess } from "@/lib/useErpAccess";

export function useQiunaiAdminGuard() {
  const { loading, isAdmin, access, refresh } = useErpAccess("qiunai");
  return { adminLoading: loading, isAdmin, admin: access?.assignment || access?.legacyAdmin || null, access, refresh };
}
