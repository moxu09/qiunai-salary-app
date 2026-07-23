import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";
import {
  ADMIN_FILE_CATEGORIES,
  createAdminFileDownload,
  deleteAdminFile,
  listAdminFiles,
  saveAdminFileOrder,
  uploadAdminFile,
} from "@/lib/adminFileStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";
async function authorize(request) {
  return authorizeErpRequest(supabaseAdmin, request, ORGANIZATION, "canViewAllAdmin");
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
      canUpload: auth.capabilities.canUploadFiles,
      canDelete: auth.capabilities.canDeleteFiles,
      canReorder: auth.capabilities.canReorderFiles,
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
    if (!auth.capabilities.canUploadFiles) throw new Error("此帳號沒有上傳權限");
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

export async function PATCH(request) {
  try {
    const auth = await authorize(request);
    if (!auth.capabilities.canReorderFiles) throw new Error("只有最高管理員可以調整檔案排序");
    const body = await request.json().catch(() => ({}));
    const category = validCategory(body.category);
    if (!Array.isArray(body.orderedPaths)) throw new Error("檔案排序資料不正確");
    const files = await saveAdminFileOrder(ORGANIZATION, category, body.orderedPaths);
    return NextResponse.json({ ok: true, category, files });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "調整檔案排序失敗" },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const auth = await authorize(request);
    if (!auth.capabilities.canDeleteFiles) throw new Error("只有最高管理員可以刪除檔案");
    const body = await request.json().catch(() => ({}));
    const category = validCategory(body.category);
    const path = String(body.path || "");
    if (!path) throw new Error("請指定要刪除的檔案");
    const files = await deleteAdminFile({ organization: ORGANIZATION, category, path });
    return NextResponse.json({ ok: true, category, files });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "刪除檔案失敗" },
      { status: 400 }
    );
  }
}
