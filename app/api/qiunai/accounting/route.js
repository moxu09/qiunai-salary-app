import { NextResponse } from "next/server";
import { loadQiunaiAccountingReport } from "@/lib/accountingReport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";

async function requireAdmin(request) {
  return authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
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
