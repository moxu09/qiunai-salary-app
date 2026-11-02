import { hrAuth, hrFail } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export async function PATCH(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const body = await request.json();
    if (!departments.some((d) => d.key === body.department)) throw Error("沒有此部門的員工權限");
    const profile = {};
    for (const [key, max] of Object.entries({
      display_name: 100,
      avatar_url: 1000,
      intro: 1200,
      note: 600,
      invite_url: 1000,
    })) {
      const value = body.profile?.[key];
      if (typeof value !== "string" || value.length > max) throw Error("部門資料格式不正確");
      profile[key] = value.trim() || null;
    }
    for (const key of ["avatar_url", "invite_url"])
      if (profile[key] && !/^https?:\/\//i.test(profile[key]))
        throw Error("網址必須以 https:// 或 http:// 開頭");
    const { error } = await supabaseAdmin.rpc("hr_update_department_profile_atomic", {
      p_discord_id: discordId,
      p_organization: body.department,
      p_profile: profile,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return hrFail(error);
  }
}
