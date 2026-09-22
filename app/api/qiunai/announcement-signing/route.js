import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { completeAnnouncementSigning, confirmAnnouncementRead, openAnnouncementDocument } from "@/lib/announcementSigning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ORGANIZATION = "qiunai";

function fail(error, fallback) {
  return NextResponse.json({ ok: false, message: error?.message || fallback }, { status: 400 });
}
function announcementId(request, body = {}) {
  return String(body.announcementId || new URL(request.url).searchParams.get("announcementId") || "").trim();
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const id = announcementId(request);
    if (!id) throw new Error("缺少公告 ID");
    return NextResponse.json({ ok: true, document: await openAnnouncementDocument(ORGANIZATION, id, discordId) });
  } catch (error) { return fail(error, "開啟公告文件失敗"); }
}

export async function PATCH(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const body = await request.json().catch(() => ({}));
    const id = announcementId(request, body);
    if (!id) throw new Error("缺少公告 ID");
    return NextResponse.json({ ok: true, signature: await confirmAnnouncementRead(ORGANIZATION, id, discordId) });
  } catch (error) { return fail(error, "儲存閱讀確認失敗"); }
}

export async function POST(request) {
  try {
    const { user, discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const body = await request.json().catch(() => ({}));
    const id = announcementId(request, body);
    if (!id) throw new Error("缺少公告 ID");
    const ipAddress = String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
    const signature = await completeAnnouncementSigning({ organization: ORGANIZATION, announcementId: id, discordId, authUserId: user.id, signatureDataUrl: body.signatureDataUrl, userAgent: request.headers.get("user-agent") || "", ipAddress });
    return NextResponse.json({ ok: true, signature });
  } catch (error) { return fail(error, "完成公告簽署失敗"); }
}
