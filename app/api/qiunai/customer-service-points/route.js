import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";
import { getTaipeiMonthInput, monthInputToTaipeiRange } from "@/lib/taipeiTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
    const url = new URL(request.url);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("month") || "")
      ? url.searchParams.get("month")
      : getTaipeiMonthInput();
    const monthRange = monthInputToTaipeiRange(month);
    const startIso = url.searchParams.get("start") || monthRange.startIso;
    const endIso = url.searchParams.get("end") || monthRange.endIso;

    const { data, error } = await supabaseAdmin
      .from("customer_service_order_points")
      .select("discord_id, points")
      .eq("app_key", "qiunai")
      .gte("served_at", startIso)
      .lte("served_at", endIso);
    if (error) throw error;

    const totals = new Map();
    for (const row of data || []) {
      totals.set(row.discord_id, (totals.get(row.discord_id) || 0) + Number(row.points || 0));
    }
    return NextResponse.json({
      ok: true,
      month,
      rows: [...totals].map(([discordId, points]) => ({ discordId, points })),
    });
  } catch (error) {
    return erpErrorResponse(error, "讀取客服服務點數失敗");
  }
}
