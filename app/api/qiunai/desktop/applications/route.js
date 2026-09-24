import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twelveMonthStart() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return start.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const { data, error } = await supabaseAdmin
      .from("salary_requests")
      .select(
        "id,application_date,request_type,approval_category,status,review_result,needed_date,created_at"
      )
      .eq("organization_code", "qiunai")
      .eq("discord_id", discordId)
      .gte("application_date", twelveMonthStart())
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return NextResponse.json({ ok: true, requests: data || [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error?.message || "讀取員工申請紀錄失敗" },
      { status: 400 }
    );
  }
}
