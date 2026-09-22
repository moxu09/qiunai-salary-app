import "server-only";

import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_FILE_BUCKET, removeAdminFilePath, uploadAdminFileBuffer } from "@/lib/adminFileStorage";

const SIGNATURE_TABLE = "salary_announcement_signatures";
const FONT_PATH = path.join(process.cwd(), "assets", "employment", "NotoSansCJKtc-Regular.otf");
const LOGO_PATH = path.join(process.cwd(), "assets", "employment", "deepnight-logo.png");
const WATERMARK_TEXT = "僅供深夜不關燈工作室營運使用";

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function clean(value, max = 200) { return String(value || "").trim().slice(0, max); }
function safePart(value) { return clean(value, 80).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ") || "公告文件"; }
function auditSecret() {
  const secret = String(process.env.EMPLOYMENT_SIGNING_AUDIT_SALT || process.env.EMPLOYMENT_SIGNING_API_SECRET || "");
  if (secret.length < 32) throw new Error("電子簽署稽核密鑰尚未設定或長度不足");
  return secret;
}
function signaturePng(value) {
  const matched = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
  if (!matched) throw new Error("請完成手寫正楷簽名");
  const buffer = Buffer.from(matched[1], "base64");
  if (buffer.length < 200 || buffer.length > 1_500_000) throw new Error("手寫簽名內容不正確");
  return buffer;
}
function isAudience(announcement, discordId) {
  const audience = Array.isArray(announcement.audience_discord_ids) ? announcement.audience_discord_ids.map(String) : [];
  return audience.length === 0 || audience.includes(String(discordId));
}
function drawFit(page, font, text, x, y, maxWidth, size = 9) {
  let next = size;
  while (next > 6 && font.widthOfTextAtSize(String(text || "-"), next) > maxWidth) next -= 0.5;
  page.drawText(String(text || "-"), { x, y, size: next, font, color: rgb(0.08, 0.12, 0.2) });
}
function drawWatermark(page, font, logo) {
  const { width, height } = page.getSize();
  const logoWidth = Math.min(width * 0.5, 300);
  const logoHeight = logoWidth * (logo.height / logo.width);
  page.drawImage(logo, { x: (width - logoWidth) / 2, y: (height - logoHeight) / 2, width: logoWidth, height: logoHeight, opacity: 0.055 });
  const size = 16;
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, size);
  page.drawText(WATERMARK_TEXT, { x: Math.max(30, (width - textWidth) / 2), y: height / 2 - 48, size, font, color: rgb(0.35, 0.28, 0.12), opacity: 0.1, rotate: degrees(22) });
}

export function sha256Buffer(buffer) { return hash(buffer); }

export function parseAudience(value) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (value) {
    try { items = JSON.parse(String(value)); }
    catch { items = String(value).split(/[\s,，]+/); }
  }
  const ids = [...new Set(items.map((item) => String(item).replace(/\D/g, "")).filter(Boolean))];
  if (ids.some((id) => !/^\d{15,22}$/.test(id))) throw new Error("指定對象包含不正確的 Discord ID");
  return ids;
}

export async function listEmployeeAnnouncements(organization, discordId) {
  const { data, error } = await supabaseAdmin.from("salary_announcements")
    .select("id,title,content,is_active,created_at,updated_at,attachment_name,requires_signature,audience_discord_ids,signature_deadline,document_version")
    .eq("organization_code", organization).eq("is_active", true).order("created_at", { ascending: false });
  if (error) throw error;
  const visible = (data || []).filter((item) => isAudience(item, discordId));
  const requiredIds = visible.filter((item) => item.requires_signature).map((item) => item.id);
  const { data: signatures, error: signatureError } = requiredIds.length
    ? await supabaseAdmin.from(SIGNATURE_TABLE).select("announcement_id,status,opened_at,read_confirmed_at,signed_at").eq("organization_code", organization).eq("discord_id", String(discordId)).in("announcement_id", requiredIds)
    : { data: [], error: null };
  if (signatureError) throw signatureError;
  const states = new Map((signatures || []).map((row) => [row.announcement_id, row]));
  return visible.map((item) => ({ ...item, has_attachment: Boolean(item.attachment_name), signature: states.get(item.id) || null }));
}

export async function addAdminSignatureStats(organization, announcements) {
  const ids = announcements.filter((item) => item.requires_signature).map((item) => item.id);
  if (!ids.length) return announcements;
  const { data, error } = await supabaseAdmin.from(SIGNATURE_TABLE).select("announcement_id,discord_id,status,signed_at").eq("organization_code", organization).in("announcement_id", ids);
  if (error) throw error;
  const grouped = new Map();
  for (const row of data || []) {
    const group = grouped.get(row.announcement_id) || [];
    group.push(row); grouped.set(row.announcement_id, group);
  }
  return announcements.map((item) => {
    const rows = grouped.get(item.id) || [];
    return { ...item, signature_stats: { signed: rows.filter((row) => row.status === "signed").length, opened: rows.length, records: rows } };
  });
}

async function accessibleAnnouncement(organization, announcementId, discordId) {
  const { data, error } = await supabaseAdmin.from("salary_announcements").select("*").eq("id", announcementId).eq("organization_code", organization).eq("is_active", true).maybeSingle();
  if (error || !data) throw new Error("找不到公告文件");
  if (!isAudience(data, discordId)) throw new Error("你不是這份公告的指定簽署人");
  if (!data.attachment_path) throw new Error("這則公告沒有附件");
  return data;
}

export async function openAnnouncementDocument(organization, announcementId, discordId) {
  const announcement = await accessibleAnnouncement(organization, announcementId, discordId);
  if (announcement.requires_signature) {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from(SIGNATURE_TABLE).upsert({ announcement_id: announcement.id, organization_code: organization, discord_id: String(discordId), status: "opened", opened_at: now, updated_at: now }, { onConflict: "announcement_id,discord_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const { data, error } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).createSignedUrl(announcement.attachment_path, 600);
  if (error || !data?.signedUrl) throw new Error("建立公告文件預覽失敗");
  return { url: data.signedUrl, name: announcement.attachment_name, requiresSignature: announcement.requires_signature };
}

export async function confirmAnnouncementRead(organization, announcementId, discordId) {
  const announcement = await accessibleAnnouncement(organization, announcementId, discordId);
  if (!announcement.requires_signature) return { status: "read" };
  const { data: existing, error: existingError } = await supabaseAdmin.from(SIGNATURE_TABLE).select("status,read_confirmed_at,signed_at").eq("announcement_id", announcement.id).eq("organization_code", organization).eq("discord_id", String(discordId)).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "signed") return existing;
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from(SIGNATURE_TABLE).upsert({ announcement_id: announcement.id, organization_code: organization, discord_id: String(discordId), status: "read", opened_at: now, read_confirmed_at: now, updated_at: now }, { onConflict: "announcement_id,discord_id" }).select("status,read_confirmed_at,signed_at").single();
  if (error) throw error;
  return data;
}

async function buildSignedPdf({ source, announcement, discordId, authUserId, signatureDataUrl, readConfirmedAt, userAgent, ipHash, signedAt }) {
  const [fontBytes, logoBytes] = await Promise.all([readFile(FONT_PATH), readFile(LOGO_PATH)]);
  let pdf;
  try { pdf = await PDFDocument.load(source); } catch { throw new Error("公告附件不是有效的 PDF 文件"); }
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const logo = await pdf.embedPng(logoBytes);
  pdf.getPages().forEach((page) => drawWatermark(page, font, logo));
  const signature = await pdf.embedPng(signaturePng(signatureDataUrl));
  const sourceSha256 = hash(source);
  const evidence = { organization: announcement.organization_code, announcementId: announcement.id, documentVersion: announcement.document_version, discordId, authUserId, sourceSha256, readConfirmedAt, signedAt: signedAt.toISOString(), userAgentSha256: hash(String(userAgent || "")), ipHash };
  const evidenceHmac = createHmac("sha256", auditSecret()).update(JSON.stringify(evidence)).digest("hex");
  const page = pdf.addPage([595.28, 841.89]);
  drawWatermark(page, font, logo);
  page.drawText("公告文件電子簽署紀錄", { x: 52, y: 775, size: 21, font, color: rgb(0.08, 0.15, 0.25) });
  page.drawText("本人確認已完整閱讀公告附件，並以 Discord 驗證及手寫簽名完成簽署。", { x: 52, y: 742, size: 10, font, color: rgb(0.3, 0.35, 0.42) });
  const rows = [["公告標題", announcement.title], ["文件版本", String(announcement.document_version || 1)], ["Discord ID", discordId], ["完整閱讀確認時間", readConfirmedAt], ["完成簽署時間", signedAt.toISOString()], ["原始文件 SHA-256", sourceSha256], ["稽核驗證碼", evidenceHmac]];
  rows.forEach(([label, value], index) => { page.drawText(label, { x: 52, y: 690 - index * 34, size: 10, font, color: rgb(0.28, 0.33, 0.4) }); drawFit(page, index < 2 ? font : latin, value, 180, 690 - index * 34, 355, 9); });
  page.drawText("簽署人手寫簽名（請使用正楷）", { x: 52, y: 420, size: 11, font, color: rgb(0.08, 0.15, 0.25) });
  page.drawImage(logo, { x: 105, y: 310, width: 170, height: 170 * (logo.height / logo.width), opacity: 0.08 });
  page.drawText(WATERMARK_TEXT, { x: 75, y: 326, size: 8, font, color: rgb(0.35, 0.28, 0.12), opacity: 0.18 });
  page.drawImage(signature, { x: 62, y: 340, width: 260, height: 72 });
  pdf.setTitle(`${announcement.title}－公告簽署版`); pdf.setAuthor("深夜不關燈／秋奈電競陪玩"); pdf.setProducer("We Are Still Here EIP Announcement Signing"); pdf.setModificationDate(signedAt);
  const signedPdf = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return { signedPdf, sourceSha256, signedSha256: hash(signedPdf), evidenceHmac };
}

export async function completeAnnouncementSigning({ organization, announcementId, discordId, authUserId, signatureDataUrl, userAgent, ipAddress }) {
  const announcement = await accessibleAnnouncement(organization, announcementId, discordId);
  if (!announcement.requires_signature) throw new Error("這則公告不需要簽署");
  const { data: record, error: readError } = await supabaseAdmin.from(SIGNATURE_TABLE).select("*").eq("announcement_id", announcement.id).eq("organization_code", organization).eq("discord_id", String(discordId)).maybeSingle();
  if (readError || !record?.read_confirmed_at) throw new Error("請先詳閱文件並確認已閱讀");
  if (record.status === "signed") return record;
  const now = new Date();
  const { data: claimed, error: claimError } = await supabaseAdmin.from(SIGNATURE_TABLE).update({ status: "signing", updated_at: now.toISOString() }).eq("id", record.id).eq("status", "read").select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("簽署正在處理中，請勿重複送出");
  let outputPath = "";
  try {
    const { data: blob, error: downloadError } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).download(announcement.attachment_path);
    if (downloadError || !blob) throw new Error("讀取公告附件失敗");
    const source = Buffer.from(await blob.arrayBuffer());
    if (announcement.attachment_sha256 && hash(source) !== announcement.attachment_sha256) throw new Error("公告文件完整性驗證失敗，請聯繫管理員");
    const secret = auditSecret();
    const ipHash = ipAddress ? hash(`${secret}:${ipAddress}`) : null;
    const result = await buildSignedPdf({ source, announcement, discordId, authUserId, signatureDataUrl, readConfirmedAt: record.read_confirmed_at, userAgent, ipHash, signedAt: now });
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(now);
    outputPath = await uploadAdminFileBuffer({ organization, category: "employees", name: `${safePart(announcement.title)}_${discordId}_${date}.pdf`, buffer: result.signedPdf, contentType: "application/pdf" });
    const { data, error } = await supabaseAdmin.from(SIGNATURE_TABLE).update({ status: "signed", signed_at: now.toISOString(), signed_pdf_path: outputPath, source_pdf_sha256: result.sourceSha256, signed_pdf_sha256: result.signedSha256, evidence_hmac: result.evidenceHmac, signer_auth_user_id: authUserId, signer_user_agent: clean(userAgent, 500) || null, signer_ip_hash: ipHash, updated_at: now.toISOString() }).eq("id", record.id).eq("status", "signing").select("status,signed_at").single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (outputPath) await removeAdminFilePath(outputPath).catch(() => {});
    await supabaseAdmin.from(SIGNATURE_TABLE).update({ status: "read", updated_at: new Date().toISOString() }).eq("id", record.id).eq("status", "signing");
    throw error;
  }
}
