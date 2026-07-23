import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAuthUserFromBearer,
  getDiscordIdFromUser,
  getDiscordProfileFromUser,
} from "@/lib/erpAuthLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function getDiscordAvatarUrl(discordUser) {
  const userId = discordUser?.id;
  const avatar = discordUser?.avatar;
  if (!userId || !avatar) return null;
  const ext = String(avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}`;
}

export async function POST(request) {
  try {
    const user = await getAuthUserFromBearer(supabaseAdmin, request);
    const discordId = getDiscordIdFromUser(user);

    if (!discordId) {
      return json(
        {
          ok: false,
          message:
            "首次登入必須使用 Discord，且登入帳號需保留 Discord 綁定。",
        },
        403
      );
    }

    const guildId = process.env.QIUNAI_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const allowedRoleIds = String(process.env.QIUNAI_STAFF_ROLE_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!guildId || !botToken || allowedRoleIds.length === 0) {
      return json(
        {
          ok: false,
          message:
            "秋奈身分組檢查環境變數尚未設定完整，請確認 DISCORD_BOT_TOKEN、QIUNAI_GUILD_ID、QIUNAI_STAFF_ROLE_IDS。",
        },
        500
      );
    }

    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        cache: "no-store",
      }
    );

    if (memberRes.status === 404) {
      return json(
        { ok: false, message: "你目前不在秋奈電競伺服器內，無法使用 ERP。" },
        403
      );
    }

    if (!memberRes.ok) {
      const errorText = await memberRes.text();
      console.error("[Discord member fetch failed]", errorText);
      return json(
        {
          ok: false,
          message:
            "檢查 Discord 身分組失敗，請確認機器人是否在伺服器內，且 Token 正確。",
        },
        500
      );
    }

    const member = await memberRes.json();
    const userRoleIds = Array.isArray(member.roles) ? member.roles : [];
    const hasAllowedRole = userRoleIds.some((roleId) =>
      allowedRoleIds.includes(roleId)
    );

    if (!hasAllowedRole) {
      return json(
        { ok: false, message: "你尚未擁有秋奈員工身分組，無法使用 ERP。" },
        403
      );
    }

    const discordUser = member.user || {};
    const profile = getDiscordProfileFromUser(user);
    const discordName =
      discordUser.username || profile.name || discordId;
    const displayName =
      member.nick || discordUser.global_name || discordName || discordId;
    const avatarUrl =
      getDiscordAvatarUrl(discordUser) || profile.avatarUrl || null;

    const { data: existing, error: findError } = await supabaseAdmin
      .from("qiunai_staff")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (findError) {
      console.error("[ensure staff find error]", findError);
      return json({ ok: false, message: "讀取員工資料失敗" }, 500);
    }

    const now = new Date().toISOString();
    if (existing) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("qiunai_staff")
        .update({
          discord_name: discordName,
          display_name: existing.display_name || displayName,
          avatar_url: avatarUrl,
          role_checked: true,
          is_active: true,
          updated_at: now,
        })
        .eq("discord_id", discordId)
        .select("*")
        .single();

      if (updateError) {
        console.error("[ensure staff update error]", updateError);
        return json({ ok: false, message: "更新員工資料失敗" }, 500);
      }

      return json({ ok: true, staff: updated });
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("qiunai_staff")
      .insert({
        discord_id: discordId,
        discord_name: discordName,
        avatar_url: avatarUrl,
        display_name: displayName,
        role_checked: true,
        is_active: true,
        is_online: false,
        can_take_order: true,
      })
      .select("*")
      .single();

    if (createError) {
      console.error("[ensure staff create error]", createError);
      return json({ ok: false, message: "自動建立秋奈員工資料失敗" }, 500);
    }

    return json({ ok: true, staff: created });
  } catch (error) {
    console.error("[ensure-staff error]", error);
    return json(
      { ok: false, message: error?.message || "系統錯誤，請稍後再試" },
      Number(error?.status || 500)
    );
  }
}
