import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hrAuth, hrFail } from "@/lib/hrServer";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const { data: profiles, error } = await supabaseAdmin
      .from("salary_public_profiles")
      .select("app_key,display_name,avatar_url,intro,note,invite_url")
      .eq("discord_id", discordId)
      .in(
        "app_key",
        departments.map((d) => d.key),
      );
    if (error) throw error;
    departments.forEach((d) => {
      const profile = profiles.find((p) => p.app_key === d.key);
      d.staff = {
        ...d.staff,
        public_display_name: profile?.display_name || d.staff.display_name || "",
        public_avatar_url: profile?.avatar_url || d.staff.avatar_url || "",
        intro: profile?.intro || d.staff.public_intro || "",
        note: profile?.note || d.staff.public_note || "",
        invite_url: profile?.invite_url || "",
      };
    });
    return Response.json(
      { ok: true, discordId, departments },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
