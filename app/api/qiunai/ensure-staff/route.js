import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();

    const { discord_id, discord_name, avatar_url } = body;

    if (!discord_id) {
      return NextResponse.json(
        { ok: false, message: "缺少 Discord ID" },
        { status: 400 }
      );
    }

    const guildId = process.env.QIUNAI_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const allowedRoleIds = String(process.env.QIUNAI_STAFF_ROLE_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!guildId || !botToken || allowedRoleIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "秋奈身分組檢查環境變數尚未設定完整，請確認 DISCORD_BOT_TOKEN、QIUNAI_GUILD_ID、QIUNAI_STAFF_ROLE_IDS。",
        },
        { status: 500 }
      );
    }

    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discord_id}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        cache: "no-store",
      }
    );

    if (memberRes.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          message: "你目前不在秋奈電競伺服器內，無法使用薪資網。",
        },
        { status: 403 }
      );
    }

    if (!memberRes.ok) {
      const errorText = await memberRes.text();
      console.error("[Discord member fetch failed]", errorText);

      return NextResponse.json(
        {
          ok: false,
          message:
            "檢查 Discord 身分組失敗，請確認機器人是否在伺服器內，且 Token 正確。",
        },
        { status: 500 }
      );
    }

    const member = await memberRes.json();
    const userRoleIds = member.roles || [];

    const hasAllowedRole = userRoleIds.some((roleId) =>
      allowedRoleIds.includes(roleId)
    );

    if (!hasAllowedRole) {
      return NextResponse.json(
        {
          ok: false,
          message: "你尚未擁有秋奈員工身分組，無法使用薪資網。",
        },
        { status: 403 }
      );
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from("qiunai_staff")
      .select("*")
      .eq("discord_id", discord_id)
      .maybeSingle();

    if (findError) {
      console.error("[ensure staff find error]", findError);

      return NextResponse.json(
        { ok: false, message: "讀取員工資料失敗" },
        { status: 500 }
      );
    }

    if (existing) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("qiunai_staff")
        .update({
          discord_name,
          avatar_url,
          role_checked: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("discord_id", discord_id)
        .select("*")
        .single();

      if (updateError) {
        console.error("[ensure staff update error]", updateError);

        return NextResponse.json(
          { ok: false, message: "更新員工資料失敗" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        staff: updated,
      });
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("qiunai_staff")
      .insert({
        discord_id,
        discord_name,
        avatar_url,
        display_name: discord_name,
        role_checked: true,
        is_active: true,
        is_online: false,
        can_take_order: true,
      })
      .select("*")
      .single();

    if (createError) {
      console.error("[ensure staff create error]", createError);

      return NextResponse.json(
        { ok: false, message: "自動建立秋奈員工資料失敗" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      staff: created,
    });
  } catch (error) {
    console.error("[ensure-staff error]", error);

    return NextResponse.json(
      { ok: false, message: "系統錯誤，請稍後再試" },
      { status: 500 }
    );
  }
}
