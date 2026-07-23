import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyErpAuthLinkAction,
  getAuthUserFromBearer,
  getErpAuthLinkStatus,
} from "@/lib/erpAuthLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, fallback = "處理 ERP 登入綁定失敗") {
  return NextResponse.json(
    { ok: false, message: error?.message || fallback },
    { status: Number(error?.status || 400) }
  );
}

export async function GET(request) {
  try {
    const user = await getAuthUserFromBearer(supabaseAdmin, request);
    return NextResponse.json({
      ok: true,
      status: getErpAuthLinkStatus(user),
    });
  } catch (error) {
    return errorResponse(error, "讀取 ERP 登入綁定失敗");
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUserFromBearer(supabaseAdmin, request);
    const body = await request.json().catch(() => ({}));
    const updatedUser = await applyErpAuthLinkAction(
      supabaseAdmin,
      user,
      String(body.action || ""),
      body
    );

    return NextResponse.json({
      ok: true,
      status: getErpAuthLinkStatus(updatedUser),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

