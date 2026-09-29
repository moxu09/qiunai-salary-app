import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getErpAccessByDiscordId } from "@/lib/erpAccess";
import {
  ADMIN_FILE_BUCKET,
  decodedName,
  ensureAdminFileBucket,
  uploadAdminFileBuffer,
  validateAdminFile,
} from "@/lib/adminFileStorage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCORD_ID = /^\d{15,22}$/;
const MAX_FILES = 20;
const MAX_REQUEST_BYTES = 27 * 1024 * 1024;

class FileError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function documentId(value) {
  const valueText = String(value || "");
  if (!UUID.test(valueText)) throw new FileError("文件編號不正確");
  return valueText;
}

function failure(error) {
  if (!(error instanceof FileError)) console.error("EIP workspace file error", error?.code || error?.name || "unknown");
  return Response.json({
    ok: false,
    message: error instanceof FileError ? error.message : "附件服務暫時無法使用",
  }, { status: error instanceof FileError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}

export function createEipWorkspaceFileHandlers(organization, staffTable) {
  async function authorize(request, admin) {
    let discordId;
    try { ({ discordId } = await getAuthUserFromRequest(supabaseAdmin, request)); }
    catch { throw new FileError("請重新登入 EIP", 401); }
    if (!DISCORD_ID.test(String(discordId))) throw new FileError("登入資訊無效", 401);
    if (admin) {
      const access = await getErpAccessByDiscordId(supabaseAdmin, organization, discordId);
      if (!access.capabilities.canViewAllAdmin) throw new FileError("沒有管理文件的權限", 403);
    } else {
      const { data, error } = await supabaseAdmin.from(staffTable).select("discord_id,is_active")
        .eq("discord_id", discordId).maybeSingle();
      if (error) throw error;
      if (!data || data.is_active === false) throw new FileError("只有在職員工可以下載文件", 403);
    }
    return discordId;
  }

  async function loadDocument(value, admin) {
    const { data, error } = await supabaseAdmin.from("eip_workspace_documents")
      .select("id,is_published").eq("organization_code", organization)
      .eq("id", documentId(value)).maybeSingle();
    if (error) throw error;
    if (!data || (!admin && !data.is_published)) throw new FileError("找不到可查閱的文件", 404);
    return data;
  }

  async function listFiles(id) {
    await ensureAdminFileBucket();
    const folder = `${organization}/workspace/${id}`;
    const { data, error } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET)
      .list(folder, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw error;
    return (data || []).filter((item) => item.id).map((item) => ({
      path: `${folder}/${item.name}`,
      name: decodedName(item.name),
      size: Number(item.metadata?.size || 0),
      createdAt: item.created_at,
    }));
  }

  async function GET(request) {
    try {
      const params = new URL(request.url).searchParams;
      const admin = params.get("admin") === "1";
      await authorize(request, admin);
      const document = await loadDocument(params.get("documentId"), admin);
      const files = await listFiles(document.id);
      const path = params.get("download");
      if (path !== null) {
        const selected = files.find((file) => file.path === path);
        if (!selected) throw new FileError("找不到附件", 404);
        const { data, error } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET)
          .createSignedUrl(selected.path, 60, { download: selected.name });
        if (error || !data?.signedUrl) throw new Error("create signed URL failed");
        return Response.json({ ok: true, url: data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
      }
      return Response.json({ ok: true, files }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return failure(error); }
  }

  async function POST(request) {
    try {
      await authorize(request, true);
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_REQUEST_BYTES) throw new FileError("單一檔案不得超過 25 MB", 413);
      const form = await request.formData();
      const document = await loadDocument(form.get("documentId"), true);
      const file = form.get("file");
      try { validateAdminFile(file); }
      catch (error) { throw new FileError(error.message); }
      const files = await listFiles(document.id);
      if (files.length >= MAX_FILES) throw new FileError("每篇文件最多可附加 20 個檔案");
      await uploadAdminFileBuffer({
        organization,
        category: `workspace/${document.id}`,
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: "application/octet-stream",
      });
      return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) { return failure(error); }
  }

  return { GET, POST };
}
