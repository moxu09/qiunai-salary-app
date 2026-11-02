import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
export const HR_CONFIG = {
  qiunai: {
    origin: "https://qiunai-salary-app-production.up.railway.app",
    staff: "qiunai_staff",
    orders: "qiunai_salary_orders",
    bonuses: "qiunai_staff_bonus",
  },
  deepnight: {
    origin: "https://salary.wearestilllhere.com",
    staff: "players",
    orders: "play_orders",
    bonuses: "players_bonus",
  },
};
const membershipChecks = new Map();
export async function hrAuth(request) {
  const auth = await getAuthUserFromRequest(supabaseAdmin, request);
  const departments = [];
  for (const [key, config] of Object.entries(HR_CONFIG)) {
    const { data, error } = await supabaseAdmin
      .from(config.staff)
      .select("*")
      .eq("discord_id", auth.discordId)
      .maybeSingle();
    if (error) throw error;
    if (data?.is_active !== false) {
      let staff = data;
      const cacheKey = `${auth.discordId}:${key}`;
      const previous = membershipChecks.get(cacheKey);
      let verified = previous && previous.expires > Date.now() ? previous.ok : null;
      if (verified === null) {
        const response = await fetch(`${config.origin}/api/${key}/ensure-staff`, {
          method: "POST",
          headers: {
            Authorization: request.headers.get("authorization"),
            "Content-Type": "application/json",
          },
          body: "{}",
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status >= 500)
          throw Object.assign(
            Error(`${key === "qiunai" ? "秋奈" : "深夜"}員工身分驗證暫時無法使用`),
            { status: 503 },
          );
        verified = response.ok && result.ok === true;
        if (verified) staff = result.staff || result.player || data;
        membershipChecks.set(cacheKey, { ok: verified, expires: Date.now() + 60000 });
        if (membershipChecks.size > 5000)
          membershipChecks.delete(membershipChecks.keys().next().value);
      }
      if (verified && staff) departments.push({ key, staff });
    }
  }
  if (!departments.length) throw Object.assign(Error("你目前沒有在職員工權限"), { status: 403 });
  return { ...auth, departments };
}
export function hrFail(error) {
  const status = Number(error?.status) || 400;
  return Response.json(
    {
      ok: false,
      message:
        status >= 500 ? "服務暫時無法使用，請稍後重試" : error?.message || "讀取 HR 資料失敗",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function allRows(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
