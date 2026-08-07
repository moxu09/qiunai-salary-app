import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await authorizeErpRequest(
      supabaseAdmin,
      request,
      "qiunai",
      "canViewAllAdmin",
    );

    const [payroll, approvals] = await Promise.all([
      supabaseAdmin
        .from("salary_withdraw_requests")
        .select("id", { count: "exact", head: true })
        .eq("app_key", "qiunai")
        .eq("status", "pending"),
      supabaseAdmin
        .from("salary_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_code", "qiunai")
        .eq("status", "pending"),
    ]);

    const failed = [payroll, approvals].find((result) => result.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({
      ok: true,
      payroll: payroll.count || 0,
      approvals: approvals.count || 0,
    });
  } catch (error) {
    return erpErrorResponse(error, "讀取待處理通知失敗");
  }
}
