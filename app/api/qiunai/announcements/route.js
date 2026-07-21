import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG = "qiunai";
const ADMIN_TABLE = "qiunai_admins";

function getDiscordId(user) {
  const metadata = user?.user_metadata || {};
  const identity = user?.identities?.[0]?.identity_data || {};
  return String(metadata.provider_id || metadata.sub || metadata.user_id || identity.sub || identity.id || "").trim();
}

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("請先登入");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("登入已失效，請重新登入");
  const discordId = getDiscordId(data.user);
  if (!discordId) throw new Error("無法取得 Discord ID");
  return discordId;
}

async function requireAdmin(request) {
  const discordId = await authenticate(request);
  const { data, error } = await supabaseAdmin.from(ADMIN_TABLE).select("discord_id").eq("discord_id", discordId).eq("is_active", true).maybeSingle();
  if (error || !data) throw new Error("你沒有後台管理權限");
  return discordId;
}

function jsonError(error, fallback) {
  return NextResponse.json({ ok: false, message: error?.message || fallback }, { status: 400 });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const adminMode = url.searchParams.get("admin") === "1";
    if (adminMode) await requireAdmin(request);
    else await authenticate(request);

    let query = supabaseAdmin.from("salary_announcements").select("*").in("organization_code", [ORG, "all"]).order("created_at", { ascending: false });
    if (!adminMode) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, announcements: data || [] });
  } catch (error) {
    return jsonError(error, "讀取公告失敗");
  }
}

export async function POST(request) {
  try {
    const discordId = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!title || !content) throw new Error("請填寫公告標題與內容");
    if (title.length > 120) throw new Error("公告標題不可超過 120 個字");
    if (content.length > 5000) throw new Error("公告內容不可超過 5,000 個字");
    const { data, error } = await supabaseAdmin.from("salary_announcements").insert({
      organization_code: ORG,
      title,
      content,
      is_active: body.isActive !== false,
      created_by: discordId,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, announcement: data });
  } catch (error) {
    return jsonError(error, "新增公告失敗");
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!id || !title || !content) throw new Error("公告資料不完整");
    const { data, error } = await supabaseAdmin.from("salary_announcements").update({
      title,
      content,
      is_active: body.isActive !== false,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_code", ORG).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, announcement: data });
  } catch (error) {
    return jsonError(error, "更新公告失敗");
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) throw new Error("缺少公告 ID");
    const { error } = await supabaseAdmin.from("salary_announcements").delete().eq("id", id).eq("organization_code", ORG);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "刪除公告失敗");
  }
}

