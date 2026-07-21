import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import {
  ADMIN_FILE_CATEGORIES,
  createAdminFileDownload,
  listAdminFiles,
  uploadAdminFile,
} from "@/lib/adminFileStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";
const DEFAULT_UPLOAD_EMAIL = "vince930927@gmail.com";

function normalizedEmail(user) {
  return String(user?.email || user?.user_metadata?.email || "")
    .trim()
    .toLowerCase();
}

function canUpload(user) {
  const allowed = String(
    process.env.SALARY_FILE_UPLOAD_EMAILS || DEFAULT_UPLOAD_EMAIL
  )
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalizedEmail(user));
}

async function requireAdmin(discordId) {
  const { data, error } = await supabaseAdmin
    .from("qiunai_admins")
    .select("discord_id")
    .eq("discord_id", discordId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) throw new Error("沒有後台管理權限");
}

async function authorize(request) {
  const auth = await getAuthUserFromRequest(supabaseAdmin, request);
  const uploader = canUpload(auth.user);
  if (!uploader) await requireAdmin(auth.discordId);
  return { ...auth, canUpload: uploader };
}

function validCategory(value) {
  return ADMIN_FILE_CATEGORIES.includes(value) ? value : "operations";
}

export async function GET(request) {
  try {
    const auth = await authorize(request);
    const url = new URL(request.url);
    const downloadPath = String(url.searchParams.get("download") || "");
    if (downloadPath) {
      return NextResponse.json({
        ok: true,
        ...(await createAdminFileDownload(downloadPath, ORGANIZATION)),
      });
    }
    const category = validCategory(url.searchParams.get("category"));
    return NextResponse.json({
      ok: true,
      category,
      canUpload: auth.canUpload,
      files: await listAdminFiles(ORGANIZATION, category),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "讀取資料下載失敗" },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await authorize(request);
    if (!auth.canUpload) throw new Error("此帳號只有下載權限");
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 27 * 1024 * 1024) throw new Error("上傳內容過大");
    const form = await request.formData();
    const category = validCategory(String(form.get("category") || ""));
    const file = form.get("file");
    await uploadAdminFile({ organization: ORGANIZATION, category, file });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "檔案上傳失敗" },
      { status: 400 }
    );
  }
}
