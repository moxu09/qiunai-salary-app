import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeErpRequest,
  erpErrorResponse,
} from "@/lib/erpAccess";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";
const STAFF_TABLE = "qiunai_staff";

function optionalText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function selfServicePatch(action, body) {
  if (action === "update-profile") {
    const profile = body.profile && typeof body.profile === "object"
      ? body.profile
      : {};
    const birthday = optionalText(profile.birthday, 10);
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      throw new Error("生日格式錯誤");
    }
    return {
      display_name: optionalText(profile.displayName, 100),
      avatar_url: optionalText(profile.avatarUrl, 1000),
      real_name: optionalText(profile.realName, 100),
      phone: optionalText(profile.phone, 30),
      gender: optionalText(profile.gender, 30),
      birthday,
      bank_name: optionalText(profile.bankName, 100),
      bank_account: optionalText(profile.bankAccount, 100),
      public_intro: optionalText(profile.intro, 1200),
      public_note: optionalText(profile.note, 600),
    };
  }
  if (action === "set-online") {
    if (typeof body.isOnline !== "boolean") {
      throw new Error("上線狀態格式錯誤");
    }
    return { is_online: body.isOnline };
  }
  if (action === "set-services") {
    if (!Array.isArray(body.allowedServices) || body.allowedServices.length > 50) {
      throw new Error("可接服務格式錯誤");
    }
    return {
      allowed_services: Array.from(new Set(
        body.allowedServices
          .map((value) => optionalText(value, 100))
          .filter(Boolean),
      )),
    };
  }
  return null;
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const ownPatch = selfServicePatch(action, body);

    if (ownPatch) {
      const auth = await getAuthUserFromRequest(supabaseAdmin, request);
      const { data: staff, error } = await supabaseAdmin
        .from(STAFF_TABLE)
        .update({ ...ownPatch, updated_at: new Date().toISOString() })
        .eq("discord_id", auth.discordId)
        .select("*")
        .single();
      if (error) throw error;
      if (action === "update-profile") {
        const { error: profileError } = await supabaseAdmin
          .from("salary_public_profiles")
          .upsert({
            app_key: ORGANIZATION,
            discord_id: auth.discordId,
            display_name: staff.display_name || staff.discord_name || "秋奈陪陪",
            avatar_url: staff.avatar_url || null,
            intro: staff.public_intro || null,
            note: staff.public_note || null,
            is_online: Boolean(staff.is_online),
            can_take_order: staff.can_take_order !== false,
            is_active: staff.is_active !== false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "app_key,discord_id" });
        if (profileError) throw profileError;
      }
      return NextResponse.json({ ok: true, staff });
    }

    await authorizeErpRequest(
      supabaseAdmin,
      request,
      ORGANIZATION,
      "canViewAllAdmin",
    );
    const staffId = String(body.staffId || "").trim();
    const discordId = String(body.discordId || "").trim();
    if (!["archive", "restore"].includes(action)) {
      throw new Error("員工封存操作不正確");
    }
    if (!staffId || !discordId) {
      throw new Error("缺少要更新的員工資料");
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from(STAFF_TABLE)
      .select("id, discord_id, discord_name, display_name, real_name")
      .eq("id", staffId)
      .eq("discord_id", discordId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) throw new Error("找不到要更新的員工");

    const archived = action === "archive";
    const staffPatch = archived
      ? {
          is_active: false,
          is_online: false,
          can_take_order: false,
          updated_at: new Date().toISOString(),
        }
      : {
          is_active: true,
          updated_at: new Date().toISOString(),
        };
    const { error: updateError } = await supabaseAdmin
      .from(STAFF_TABLE)
      .update(staffPatch)
      .eq("id", staffId)
      .eq("discord_id", discordId);
    if (updateError) throw updateError;

    const profilePatch = archived
      ? {
          is_active: false,
          is_online: false,
          can_take_order: false,
          is_featured: false,
          featured_month: null,
          updated_at: new Date().toISOString(),
        }
      : {
          is_active: true,
          updated_at: new Date().toISOString(),
        };
    const { error: profileError } = await supabaseAdmin
      .from("salary_public_profiles")
      .update(profilePatch)
      .eq("app_key", ORGANIZATION)
      .eq("discord_id", discordId);
    if (profileError) throw profileError;

    return NextResponse.json({
      ok: true,
      archived,
      staff: {
        id: staff.id,
        discordId: staff.discord_id,
        name:
          staff.display_name ||
          staff.real_name ||
          staff.discord_name ||
          staff.discord_id,
      },
    });
  } catch (error) {
    return erpErrorResponse(error, "更新員工資料失敗");
  }
}
