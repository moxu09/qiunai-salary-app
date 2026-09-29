import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";
import { workflowOverdueBefore } from "@/lib/eipWorkflowSla.mjs";

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

    const overdueBefore = workflowOverdueBefore();
    const [payroll, approvals, workflowOverdue] = await Promise.all([
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
      supabaseAdmin
        .from("eip_workflow_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_code", "qiunai")
        .eq("status", "pending")
        .lt("created_at", overdueBefore),
    ]);

    const failed = [payroll, approvals, workflowOverdue].find((result) => result.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({
      ok: true,
      payroll: payroll.count || 0,
      approvals: approvals.count || 0,
      workflowOverdue: workflowOverdue.count || 0,
    });
  } catch (error) {
    return erpErrorResponse(error, "讀取待處理通知失敗");
  }
}
