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
const SERVICE_TABLE = "qiunai_staff_services";

export async function DELETE(request) {
  try {
    await authorizeErpRequest(
      supabaseAdmin,
      request,
      ORGANIZATION,
      "canViewAllAdmin",
    );
    const body = await request.json().catch(() => ({}));
    const staffId = String(body.staffId || "").trim();
    const discordId = String(body.discordId || "").trim();
    if (!staffId || !discordId) {
      throw new Error("缺少要刪除的員工資料");
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from(STAFF_TABLE)
      .select("id, discord_id, discord_name, display_name, real_name")
      .eq("id", staffId)
      .eq("discord_id", discordId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) throw new Error("找不到要刪除的員工");

    const { error: serviceError } = await supabaseAdmin
      .from(SERVICE_TABLE)
      .delete()
      .eq("discord_id", discordId);
    if (serviceError) throw serviceError;

    const { error: profileError } = await supabaseAdmin
      .from("salary_public_profiles")
      .delete()
      .eq("app_key", ORGANIZATION)
      .eq("discord_id", discordId);
    if (profileError) throw profileError;

    const { error: deleteError } = await supabaseAdmin
      .from(STAFF_TABLE)
      .delete()
      .eq("id", staffId)
      .eq("discord_id", discordId);
    if (deleteError) throw deleteError;

    return NextResponse.json({
      ok: true,
      deleted: {
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
    return erpErrorResponse(error, "刪除員工失敗");
  }
}
