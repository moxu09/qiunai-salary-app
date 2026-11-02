import { hrAuth, hrFail } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export async function PATCH(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const body = await request.json();
    const profile = {};
    const fields = {
      real_name: 100,
      phone: 30,
      gender: 30,
      birthday: 10,
      bank_name: 100,
      bank_account: 100,
    };
    for (const [key, max] of Object.entries(fields)) {
      if (typeof body[key] !== "string" || body[key].length > max)
        throw Error("個人資料格式不正確");
      profile[key] = body[key].trim() || null;
    }
    if (profile.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthday))
      throw Error("生日格式錯誤");
    profile._organizations = departments.map((d) => d.key);
    const { error } = await supabaseAdmin.rpc("hr_update_profile_atomic", {
      p_discord_id: discordId,
      p_profile: profile,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return hrFail(error);
  }
}
