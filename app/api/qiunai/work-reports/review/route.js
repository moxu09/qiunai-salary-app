import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";
import { reviewWorkReport } from "@/lib/workReportReview";
export const runtime = "nodejs";
export async function POST(request) { try { const access = await authorizeErpRequest(supabaseAdmin, request, "qiunai", "canReviewOrdersAndTips"); const body = await request.json().catch(() => ({})); return NextResponse.json({ ok: true, result: await reviewWorkReport(supabaseAdmin, "qiunai", body, access.discordId) }); } catch (error) { return erpErrorResponse(error, "審核訂單或打賞失敗"); } }
