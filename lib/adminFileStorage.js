import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ADMIN_FILE_BUCKET = "salary-admin-files";
export const ADMIN_FILE_CATEGORIES = ["operations", "employees"];
export const MAX_ADMIN_FILE_BYTES = 25 * 1024 * 1024;
const ADMIN_FILE_ORDER_NAME = "_display-order.json";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx",
  "txt", "rtf", "jpg", "jpeg", "png", "webp", "gif", "heic",
  "zip", "rar", "7z",
]);

export async function ensureAdminFileBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(ADMIN_FILE_BUCKET);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(ADMIN_FILE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ADMIN_FILE_BYTES,
  });
  if (error && !/already exists|duplicate/i.test(error.message || "")) {
    throw new Error("建立資料下載空間失敗");
  }
}

function cleanFileName(value) {
  return String(value || "")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180) || "未命名檔案";
}

function encodedName(name) {
  return Buffer.from(cleanFileName(name), "utf8").toString("base64url");
}

function decodedName(storageName) {
  const encoded = String(storageName || "").split("--").slice(1).join("--");
  try {
    return Buffer.from(encoded, "base64url").toString("utf8") || "未命名檔案";
  } catch {
    return "未命名檔案";
  }
}

export function validateAdminFile(file) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    throw new Error("請選擇要上傳的檔案");
  }
  if (file.size > MAX_ADMIN_FILE_BYTES) {
    throw new Error("單一檔案不得超過 25 MB");
  }
  const extension = cleanFileName(file.name).split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("不支援此檔案格式");
  }
}

export async function uploadAdminFile({ organization, category, file }) {
  validateAdminFile(file);
  await ensureAdminFileBucket();
  const name = cleanFileName(file.name);
  const path = `${organization}/${category}/${randomUUID()}--${encodedName(name)}`;
  const { error } = await supabaseAdmin.storage
    .from(ADMIN_FILE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    console.error("upload admin file failed", error);
    throw new Error("檔案上傳失敗，請稍後重試");
  }
  return path;
}

export async function listAdminFiles(organization, category) {
  await ensureAdminFileBucket();
  const folder = `${organization}/${category}`;
  const { data, error } = await supabaseAdmin.storage
    .from(ADMIN_FILE_BUCKET)
    .list(folder, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error("讀取檔案列表失敗");
  const files = (data || []).filter((item) => item.id && item.name !== ADMIN_FILE_ORDER_NAME).map((item) => ({
    path: `${folder}/${item.name}`,
    name: decodedName(item.name),
    size: Number(item.metadata?.size || 0),
    contentType: item.metadata?.mimetype || "application/octet-stream",
    createdAt: item.created_at,
  }));
  const { data: orderFile } = await supabaseAdmin.storage
    .from(ADMIN_FILE_BUCKET)
    .download(`${folder}/${ADMIN_FILE_ORDER_NAME}`);
  if (!orderFile) return files;
  try {
    const orderedPaths = JSON.parse(await orderFile.text());
    const positions = new Map(orderedPaths.map((path, index) => [path, index]));
    return files.sort((left, right) =>
      (positions.get(left.path) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.path) ?? Number.MAX_SAFE_INTEGER)
    );
  } catch {
    return files;
  }
}

export async function saveAdminFileOrder(organization, category, orderedPaths) {
  const folder = `${organization}/${category}`;
  const files = await listAdminFiles(organization, category);
  const currentPaths = new Set(files.map((file) => file.path));
  const nextPaths = Array.from(new Set(orderedPaths.map(String))).filter(
    (path) => path.startsWith(`${folder}/`) && currentPaths.has(path)
  );
  for (const file of files) {
    if (!nextPaths.includes(file.path)) nextPaths.push(file.path);
  }
  const { error } = await supabaseAdmin.storage
    .from(ADMIN_FILE_BUCKET)
    .upload(
      `${folder}/${ADMIN_FILE_ORDER_NAME}`,
      Buffer.from(JSON.stringify(nextPaths)),
      { contentType: "application/json", upsert: true }
    );
  if (error) throw new Error("儲存檔案排序失敗");
  return listAdminFiles(organization, category);
}

export async function createAdminFileDownload(path, organization) {
  const validPrefix = ADMIN_FILE_CATEGORIES.some((category) =>
    path.startsWith(`${organization}/${category}/`)
  );
  if (!validPrefix || path.endsWith(`/${ADMIN_FILE_ORDER_NAME}`)) throw new Error("檔案路徑不正確");
  const name = decodedName(path.split("/").pop());
  const { data, error } = await supabaseAdmin.storage
    .from(ADMIN_FILE_BUCKET)
    .createSignedUrl(path, 60, { download: name });
  if (error || !data?.signedUrl) throw new Error("建立下載連結失敗");
  return { url: data.signedUrl, name };
}
