import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const body = await request.json().catch(() => ({}));
    const announcementId = String(body.announcementId || "").trim();
    const optionIds = [...new Set((Array.isArray(body.optionIds) ? body.optionIds : []).map(String).filter(Boolean))];
    if (!announcementId || !optionIds.length) throw new Error("請選擇投票選項");

    const { data: announcement, error } = await supabaseAdmin.from("salary_announcements")
      .select("id,is_active,is_poll,poll_allow_multiple,starts_at,ends_at,audience_discord_ids")
      .eq("id", announcementId).eq("organization_code", "qiunai").maybeSingle();
    if (error) throw error;
    if (!announcement?.is_active || !announcement.is_poll) throw new Error("這個投票目前無法作答");
    const now = Date.now();
    if (announcement.starts_at && new Date(announcement.starts_at).getTime() > now) throw new Error("投票尚未開始");
    if (announcement.ends_at && new Date(announcement.ends_at).getTime() < now) throw new Error("投票已截止");
    if (announcement.audience_discord_ids?.length && !announcement.audience_discord_ids.includes(discordId)) throw new Error("你不在這個投票的對象名單中");
    if (!announcement.poll_allow_multiple && optionIds.length !== 1) throw new Error("這個投票只能選一個選項");

    const { data: validOptions, error: optionError } = await supabaseAdmin.from("salary_poll_options")
      .select("id").eq("announcement_id", announcementId).in("id", optionIds);
    if (optionError) throw optionError;
    if ((validOptions || []).length !== optionIds.length) throw new Error("投票選項不正確，請重新整理");

    const { error: deleteError } = await supabaseAdmin.from("salary_poll_votes")
      .delete().eq("announcement_id", announcementId).eq("discord_id", discordId);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabaseAdmin.from("salary_poll_votes").insert(
      optionIds.map((optionId) => ({ announcement_id: announcementId, option_id: optionId, discord_id: discordId, updated_at: new Date().toISOString() })),
    );
    if (insertError) throw insertError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "投票失敗" }, { status: 400 });
  }
}
