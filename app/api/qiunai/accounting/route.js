import { NextResponse } from "next/server";
import { loadQiunaiAccountingReport } from "@/lib/accountingReport";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function requireAdmin(request) {
  const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);

  const { data, error } = await supabaseAdmin
    .from("qiunai_admins")
    .select("id, discord_id, is_active")
    .eq("discord_id", discordId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("你沒有後台管理權限");
  }
}

export async function GET(request) {
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const report = await loadQiunaiAccountingReport(supabaseAdmin, {
      month: url.searchParams.get("month"),
    });

    return NextResponse.json({
      ok: true,
      ...report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "讀取會計報表失敗",
      },
      { status: 400 }
    );
  }
}
