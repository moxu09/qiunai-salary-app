import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
    }).format(new Date());
    const category = url.searchParams.get("category") || "all";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式不正確");

    const start = new Date(`${date}T00:00:00+08:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    let query = supabaseAdmin
      .from("erp_activity_logs")
      .select("id, organization_code, category, table_name, record_id, operation, summary, actor_id, old_data, new_data, changed_at")
      .eq("organization_code", "qiunai")
      .gte("changed_at", start.toISOString())
      .lt("changed_at", end.toISOString())
      .order("changed_at", { ascending: false })
      .limit(1000);
    if (["order", "money", "system"].includes(category)) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, date, rows: data || [] });
  } catch (error) {
    return erpErrorResponse(error, "讀取異動日誌失敗");
  }
}
