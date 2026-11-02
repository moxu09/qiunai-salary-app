import { hrAuth, hrFail } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serviceOptionsFor, serviceRecord } from "@/lib/hrServiceOptions";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const key = new URL(request.url).searchParams.get("department");
    if (!departments.some((d) => d.key === key)) throw Error("無權讀取此部門");
    const { data, error } = await supabaseAdmin
      .from(key === "qiunai" ? "qiunai_staff_services" : "players_services")
      .select("service_key")
      .eq("discord_id", discordId)
      .eq("enabled", true);
    if (error) throw error;
    return Response.json(
      { ok: true, keys: data.map((d) => d.service_key) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
export async function PATCH(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const body = await request.json();
    if (
      !departments.some((d) => d.key === body.department) ||
      !Array.isArray(body.keys) ||
      body.keys.length > 50 ||
      body.keys.some((k) => !serviceOptionsFor(body.department).some((o) => o.key === k))
    )
      throw Error("部門或服務項目無效");
    const services = [...new Set(body.keys)].map((key) => serviceRecord(body.department, key));
    const { error } = await supabaseAdmin.rpc("hr_update_services_atomic", {
      p_discord_id: discordId,
      p_organization: body.department,
      p_services: services,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return hrFail(error);
  }
}
