import { hrAuth, hrFail } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const headers = { "Cache-Control": "no-store" };

export async function GET(request) {
  try {
    const { discordId } = await hrAuth(request);
    const { data, error } = await supabaseAdmin.from("hr_account_links")
      .select("primary_id,alternate_id,created_at,verified_at")
      .or(`primary_id.eq.${discordId},alternate_id.eq.${discordId}`)
      .or(`verified_at.not.is.null,created_at.gt.${new Date(Date.now() - 86400_000).toISOString()}`)
      .order("created_at");
    if (error) throw error;
    return Response.json({ ok: true, links: data }, { headers });
  } catch (error) {
    return hrFail(error);
  }
}

export async function POST(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const { action, otherId } = await request.json();
    if (!["request", "confirm", "remove"].includes(action) ||
        typeof otherId !== "string" || !/^[0-9]{17,20}$/.test(otherId) || otherId === discordId)
      throw Error("請輸入另一個有效的 Discord ID");
    const { error } = await supabaseAdmin.rpc("hr_change_account_link", {
      p_actor: discordId,
      p_other: otherId,
      p_action: action,
      p_departments: departments.map(({ key }) => key),
    });
    if (error) throw error;
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return hrFail(error);
  }
}
