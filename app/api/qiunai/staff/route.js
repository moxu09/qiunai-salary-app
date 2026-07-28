import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeErpRequest,
  erpErrorResponse,
} from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";
const STAFF_TABLE = "qiunai_staff";

export async function PATCH(request) {
  try {
    await authorizeErpRequest(
      supabaseAdmin,
      request,
      ORGANIZATION,
      "canViewAllAdmin",
    );
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
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
    return erpErrorResponse(error, "更新員工封存狀態失敗");
  }
}
