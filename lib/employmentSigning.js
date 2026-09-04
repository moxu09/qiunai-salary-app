import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  removeAdminFilePath,
  uploadAdminFileBuffer,
} from "@/lib/adminFileStorage";

export const CONTRACT_VERSION = "v1.1";
export const CONTRACT_PAGE_COUNT = 8;
export const SIGNING_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SIGNING_REQUIRED_FROM = "2026-08-31T16:00:00.000Z";

const TABLE = "employment_contract_signings";
const CONTRACT_PATH = path.join(
  process.cwd(),
  "assets",
  "employment",
  "contract-v1.1.pdf",
);
const FONT_PATH = path.join(
  process.cwd(),
  "assets",
  "employment",
  "NotoSansCJKtc-Regular.otf",
);
const WATERMARK_LOGO_PATH = path.join(
  process.cwd(),
  "assets",
  "employment",
  "deepnight-logo.png",
);
const WATERMARK_TEXT = "僅供深夜不關燈工作室營運使用";

async function findReusableSigning(discordId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("organization_code, status, signed_at")
    .eq("discord_id", discordId)
    .in("status", ["signed", "activated"])
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "讀取既有簽署紀錄失敗");
  return data || null;
}

async function findLegacyStaffRecord(discordId) {
  const deepnightGuildId =
    process.env.DEEPNIGHT_GUILD_ID ||
    process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
    process.env.NEXT_PUBLIC_GUILD_ID ||
    "1501098191813214312";
  const [qiunaiResult, deepnightResult] = await Promise.all([
    supabaseAdmin
      .from("qiunai_staff")
      .select("discord_id, created_at")
      .eq("discord_id", discordId)
      .lt("created_at", SIGNING_REQUIRED_FROM)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("players")
      .select("discord_id, created_at")
      .eq("guild_id", deepnightGuildId)
      .eq("discord_id", discordId)
      .lt("created_at", SIGNING_REQUIRED_FROM)
      .limit(1)
      .maybeSingle(),
  ]);
  const error = qiunaiResult.error || deepnightResult.error;
  if (error) throw new Error(error.message || "讀取既有員工資料失敗");
  return qiunaiResult.data || deepnightResult.data || null;
}

async function findStaffPrefill(organization, discordId) {
  const table = organization === "qiunai" ? "qiunai_staff" : "players";
  let query = supabaseAdmin
    .from(table)
    .select("real_name, gender, birthday, bank_name, bank_account")
    .eq("discord_id", discordId);
  if (table === "players") {
    const guildId =
      process.env.DEEPNIGHT_GUILD_ID ||
      process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
      process.env.NEXT_PUBLIC_GUILD_ID ||
      "1501098191813214312";
    query = query.eq("guild_id", guildId);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message || "讀取 EIP 員工資料失敗");
  if (!data) return {};
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== ""),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value, maxLength = 100) {
  return String(value || "").trim().slice(0, maxLength);
}

function required(value, label, maxLength = 100) {
  const result = clean(value, maxLength);
  if (!result) throw new Error(`請填寫${label}`);
  return result;
}

function tokenHash(token) {
  const value = clean(token, 200);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(value)) {
    throw new Error("簽署連結格式不正確");
  }
  return sha256(value);
}

export function verifySigningApiSecret(candidate) {
  const expected = Buffer.from(
    String(process.env.EMPLOYMENT_SIGNING_API_SECRET || ""),
  );
  const received = Buffer.from(String(candidate || ""));
  return (
    expected.length >= 32 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

function taipeiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function calculateAge(birthday, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) throw new Error("生日格式不正確");
  const birth = new Date(`${birthday}T00:00:00+08:00`);
  if (Number.isNaN(birth.getTime()) || birth > now) throw new Error("生日不正確");
  const current = taipeiDateParts(now);
  let age = Number(current.year) - Number(match[1]);
  if (`${current.month}-${current.day}` < `${match[2]}-${match[3]}`) age -= 1;
  return age;
}

function signaturePng(value, label) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
    String(value || ""),
  );
  if (!match) throw new Error(`請完成${label}手寫簽名`);
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length < 200 || buffer.length > 1_500_000) {
    throw new Error(`${label}手寫簽名內容不正確`);
  }
  return buffer;
}

export function normalizeEmploymentForm(body) {
  const birthday = required(body.birthday, "生日", 10);
  const isMinor = calculateAge(birthday) < 18;
  const data = {
    realName: required(body.realName, "真實姓名", 50),
    nationalId: required(body.nationalId, "身分證字號", 30),
    contact: required(body.contact, "聯絡方式", 100),
    gender: required(body.gender, "性別", 20),
    birthday,
    bankName: required(body.bankName, "銀行名稱", 80),
    bankAccount: required(body.bankAccount, "銀行帳號", 50),
    isMinor,
    guardianName: isMinor ? required(body.guardianName, "法定代理人姓名", 50) : "",
    guardianNationalId: isMinor
      ? required(body.guardianNationalId, "法定代理人身分證字號", 30)
      : "",
    guardianContact: isMinor
      ? required(body.guardianContact, "法定代理人聯絡方式", 100)
      : "",
  };
  if (!/^[A-Za-z0-9()\-]{5,30}$/.test(data.nationalId)) {
    throw new Error("身分證字號格式不正確");
  }
  if (!/^[0-9\-() +#]{6,50}$/.test(data.bankAccount)) {
    throw new Error("銀行帳號格式不正確");
  }
  return data;
}

function safeFilePart(value) {
  return clean(value, 80)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ") || "未命名";
}

function drawFitText(page, font, text, x, y, maxWidth, size = 9) {
  let fontSize = size;
  while (fontSize > 6 && font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}

function drawDate(page, font, date, x, y) {
  const parts = taipeiDateParts(date);
  drawFitText(page, font, parts.year, x, y, 30, 9);
  drawFitText(page, font, parts.month, x + 38, y, 18, 9);
  drawFitText(page, font, parts.day, x + 76, y, 18, 9);
}

function evidenceSecret() {
  const secret = String(
    process.env.EMPLOYMENT_SIGNING_AUDIT_SALT ||
      process.env.EMPLOYMENT_SIGNING_API_SECRET ||
      "",
  );
  if (secret.length < 32) {
    throw new Error("電子簽署稽核密鑰尚未設定或長度不足");
  }
  return secret;
}

function drawAuditRow(page, labelFont, valueFont, label, value, y) {
  page.drawText(label, { x: 58, y, size: 10, font: labelFont, color: rgb(0.28, 0.33, 0.4) });
  drawFitText(page, valueFont, String(value || "-"), 180, y, 350, 9);
}

function drawEmploymentWatermark(page, font, logo) {
  const { width, height } = page.getSize();
  const logoWidth = Math.min(width * 0.56, 335);
  const logoHeight = logoWidth * (logo.height / logo.width);
  page.drawImage(logo, {
    x: (width - logoWidth) / 2,
    y: (height - logoHeight) / 2,
    width: logoWidth,
    height: logoHeight,
    opacity: 0.065,
  });
  const textSize = 18;
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, textSize);
  page.drawText(WATERMARK_TEXT, {
    x: Math.max(42, (width - textWidth) / 2),
    y: height / 2 - 52,
    size: textSize,
    font,
    color: rgb(0.35, 0.28, 0.12),
    opacity: 0.11,
    rotate: degrees(24),
  });
}

function drawSignatureFieldWatermark(page, font, logo, { x, y, width, height }) {
  const logoWidth = Math.min(width * 0.7, 108);
  const logoHeight = Math.min(height * 0.82, logoWidth * (logo.height / logo.width));
  page.drawImage(logo, {
    x: x + (width - logoWidth) / 2,
    y: y + (height - logoHeight) / 2 + 2,
    width: logoWidth,
    height: logoHeight,
    opacity: 0.1,
  });
  let textSize = 4.2;
  while (textSize > 3 && font.widthOfTextAtSize(WATERMARK_TEXT, textSize) > width - 6) {
    textSize -= 0.2;
  }
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, textSize);
  page.drawText(WATERMARK_TEXT, {
    x: x + (width - textWidth) / 2,
    y: y + 1.5,
    size: textSize,
    font,
    color: rgb(0.35, 0.28, 0.12),
    opacity: 0.2,
  });
}

export async function buildEmploymentEvidencePdf({
  organization,
  transactionId,
  discordId,
  discordName,
  authUserId,
  readConfirmedAt,
  form,
  signatureDataUrl,
  guardianSignatureDataUrl,
  userAgent,
  ipHash,
  signedAt = new Date(),
}) {
  const [sourceBytes, fontBytes, watermarkLogoBytes] = await Promise.all([
    readFile(CONTRACT_PATH),
    readFile(FONT_PATH),
    readFile(WATERMARK_LOGO_PATH),
  ]);
  const pdfDoc = await PDFDocument.load(sourceBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: false });
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const watermarkLogo = await pdfDoc.embedPng(watermarkLogoBytes);
  const pages = pdfDoc.getPages();
  if (pages.length !== CONTRACT_PAGE_COUNT) {
    throw new Error(`契約頁數不正確，預期 ${CONTRACT_PAGE_COUNT} 頁`);
  }
  pages.forEach((page) => drawEmploymentWatermark(page, font, watermarkLogo));

  const employeeSignature = await pdfDoc.embedPng(
    signaturePng(signatureDataUrl, "乙方"),
  );
  const guardianSignature = form.isMinor
    ? await pdfDoc.embedPng(signaturePng(guardianSignatureDataUrl, "法定代理人"))
    : null;
  const page1 = pages[0];
  drawFitText(page1, font, form.realName, 304, 536, 245, 9);
  drawFitText(page1, latinFont, form.nationalId, 334, 518, 215, 9);
  drawFitText(page1, latinFont, discordId, 326, 500, 223, 8.5);
  drawFitText(page1, latinFont, form.contact, 324, 482, 225, 8.5);
  drawFitText(page1, font, form.bankName, 324, 464, 225, 9);
  drawFitText(page1, latinFont, form.bankAccount, 324, 446, 225, 9);

  const page4 = pages[3];
  drawSignatureFieldWatermark(page4, font, watermarkLogo, { x: 75, y: 241, width: 120, height: 46 });
  page4.drawImage(employeeSignature, { x: 83, y: 246, width: 104, height: 32 });
  drawFitText(page4, latinFont, form.nationalId, 259, 254, 104, 8.5);
  drawDate(page4, latinFont, signedAt, 407, 254);
  if (form.isMinor && guardianSignature) {
    drawSignatureFieldWatermark(page4, font, watermarkLogo, { x: 106, y: 223, width: 120, height: 46 });
    page4.drawImage(guardianSignature, { x: 116, y: 228, width: 104, height: 32 });
    drawFitText(page4, latinFont, form.guardianNationalId, 291, 236, 104, 8.5);
    drawDate(page4, latinFont, signedAt, 455, 236);
  }
  if (form.isMinor && guardianSignature) {
    const page8 = pages[7];
    drawFitText(page8, font, form.guardianName, 74, 689, 80, 8.5);
    drawFitText(page8, font, form.realName, 190, 689, 80, 8.5);
    drawSignatureFieldWatermark(page8, font, watermarkLogo, { x: 106, y: 553, width: 180, height: 48 });
    page8.drawImage(guardianSignature, { x: 116, y: 558, width: 160, height: 36 });
    drawFitText(page8, latinFont, form.guardianNationalId, 116, 550, 210, 8.5);
    drawFitText(page8, latinFont, form.guardianContact, 106, 532, 220, 8.5);
    drawDate(page8, latinFont, signedAt, 105, 515);
  }

  pdfDoc.setTitle(`${discordName}_${form.realName}_${CONTRACT_VERSION}`);
  pdfDoc.setAuthor("深夜不關燈／秋奈電競陪玩");
  const sourceSha256 = sha256(sourceBytes);
  const evidence = {
    organization,
    transactionId,
    discordId,
    discordName,
    authUserId,
    contractVersion: CONTRACT_VERSION,
    contractSha256: sourceSha256,
    readConfirmedAt,
    signedAt: signedAt.toISOString(),
    verificationMethod: "discord_oauth_and_handwritten_signature",
    userAgentSha256: sha256(String(userAgent || "")),
    ipHash: ipHash || null,
  };
  const evidenceHmac = createHmac("sha256", evidenceSecret())
    .update(JSON.stringify(evidence))
    .digest("hex");

  const auditPage = pdfDoc.addPage([595.28, 841.89]);
  drawEmploymentWatermark(auditPage, font, watermarkLogo);
  auditPage.drawText("電子簽署稽核紀錄", {
    x: 58,
    y: 770,
    size: 21,
    font,
    color: rgb(0.08, 0.15, 0.25),
  });
  auditPage.drawText("本頁記錄簽署流程與文件完整性驗證資料", {
    x: 58,
    y: 742,
    size: 10,
    font,
    color: rgb(0.35, 0.4, 0.47),
  });
  auditPage.drawRectangle({
    x: 48,
    y: 453,
    width: 499,
    height: 260,
    borderWidth: 1,
    borderColor: rgb(0.82, 0.85, 0.89),
    color: rgb(0.98, 0.985, 0.99),
  });
  drawAuditRow(auditPage, font, latinFont, "驗證方式", "Discord OAuth + handwritten signature", 683);
  drawAuditRow(auditPage, font, latinFont, "簽署交易編號", transactionId, 651);
  drawAuditRow(auditPage, font, latinFont, "受邀 Discord ID", discordId, 619);
  drawAuditRow(auditPage, font, font, "Discord 名稱", discordName, 587);
  drawAuditRow(auditPage, font, latinFont, "完整閱讀確認時間", readConfirmedAt, 555);
  drawAuditRow(auditPage, font, latinFont, "完成簽署時間", signedAt.toISOString(), 523);
  drawAuditRow(auditPage, font, latinFont, "原始契約 SHA-256", sourceSha256, 491);
  drawAuditRow(auditPage, font, latinFont, "稽核驗證碼", evidenceHmac, 459);
  auditPage.drawText("簽署人手寫簽名", {
    x: 58,
    y: 404,
    size: 11,
    font,
    color: rgb(0.08, 0.15, 0.25),
  });
  drawSignatureFieldWatermark(auditPage, font, watermarkLogo, { x: 52, y: 330, width: 225, height: 70 });
  auditPage.drawImage(employeeSignature, { x: 58, y: 335, width: 210, height: 60 });
  auditPage.drawText(form.realName, { x: 58, y: 314, size: 10, font, color: rgb(0.08, 0.15, 0.25) });
  auditPage.drawText("系統已核對登入的 Discord ID 與受邀者一致，並保存閱讀同意、", {
    x: 58,
    y: 255,
    size: 10,
    font,
    color: rgb(0.2, 0.25, 0.32),
  });
  auditPage.drawText("簽署時間、裝置資訊雜湊、IP 雜湊及最終 PDF 雜湊。", {
    x: 58,
    y: 235,
    size: 10,
    font,
    color: rgb(0.2, 0.25, 0.32),
  });
  auditPage.drawText("本流程為電子簽章證據紀錄，不宣稱為憑證機構簽發之數位簽章。", {
    x: 58,
    y: 195,
    size: 9.5,
    font,
    color: rgb(0.45, 0.25, 0.16),
  });

  pdfDoc.setSubject("陪陪承攬合作契約書（電子簽署稽核版）");
  pdfDoc.setKeywords([organization, "employment", "electronic-signature", CONTRACT_VERSION]);
  pdfDoc.setProducer("We Are Still Here EIP Employment Signing");
  pdfDoc.setModificationDate(signedAt);
  const signedPdf = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  return {
    signedPdf,
    sourceSha256,
    signedSha256: sha256(signedPdf),
    evidenceHmac,
  };
}

export async function createEmploymentInvite({
  organization,
  discordId,
  discordName,
  invitedBy,
  baseUrl,
  forceSigning = false,
}) {
  if (!['deepnight', 'qiunai'].includes(organization)) throw new Error("公司別不正確");
  const id = required(discordId, "Discord ID", 22);
  if (!/^\d{15,22}$/.test(id)) throw new Error("Discord ID 格式不正確");
  const name = required(discordName || id, "Discord 名稱", 100);
  const reusableSigning = await findReusableSigning(id);
  if (reusableSigning) {
    return {
      required: false,
      reason: "already_signed",
      signedOrganization: reusableSigning.organization_code,
      signedAt: reusableSigning.signed_at,
      url: null,
      expiresAt: null,
    };
  }
  const legacyStaff = await findLegacyStaffRecord(id);
  if (legacyStaff && !forceSigning) {
    return {
      required: false,
      reason: "legacy_staff",
      existingSince: legacyStaff.created_at,
      url: null,
      expiresAt: null,
    };
  }
  const token = randomBytes(36).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIGNING_LINK_TTL_MS);
  const formData = await findStaffPrefill(organization, id);
  await supabaseAdmin
    .from(TABLE)
    .update({ status: "revoked", updated_at: now.toISOString() })
    .eq("organization_code", organization)
    .eq("discord_id", id)
    .in("status", ["invited", "opened", "read"]);
  const { error } = await supabaseAdmin.from(TABLE).insert({
    organization_code: organization,
    discord_id: id,
    discord_name: name,
    token_hash: sha256(token),
    contract_version: CONTRACT_VERSION,
    status: "invited",
    expires_at: expiresAt.toISOString(),
    invited_by: clean(invitedBy, 100) || null,
    form_data: formData,
  });
  if (error) throw new Error(error.message || "建立簽署邀請失敗");
  const origin = String(baseUrl || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(origin) && !/^http:\/\/localhost(?::\d+)?$/.test(origin)) {
    throw new Error("簽署網站網址不正確");
  }
  return {
    required: true,
    url: `${origin}/employment-sign/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

async function findSigning(token) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw new Error(error.message || "讀取簽署資料失敗");
  if (!data) throw new Error("找不到簽署邀請，連結可能已失效");
  if (new Date(data.expires_at).getTime() <= Date.now() && !["signed", "activated"].includes(data.status)) {
    await supabaseAdmin.from(TABLE).update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", data.id);
    throw new Error("簽署連結已逾期，請聯繫審核官重新發送");
  }
  if (["revoked", "expired"].includes(data.status)) throw new Error("簽署連結已失效");
  return data;
}

export async function getEmploymentSigning(
  token,
  { markOpened = false, includePrefill = false } = {},
) {
  const data = await findSigning(token);
  if (markOpened && data.status === "invited") {
    const now = new Date().toISOString();
    await supabaseAdmin.from(TABLE).update({ status: "opened", opened_at: now, updated_at: now }).eq("id", data.id).eq("status", "invited");
    data.status = "opened";
    data.opened_at = now;
  }
  return {
    status: data.status,
    organization: data.organization_code,
    discordId: data.discord_id,
    discordName: data.discord_name,
    contractVersion: data.contract_version,
    pageCount: CONTRACT_PAGE_COUNT,
    expiresAt: data.expires_at,
    readConfirmedAt: data.read_confirmed_at,
    signedAt: data.signed_at,
    activatedAt: data.activated_at,
    prefill: includePrefill ? data.form_data || {} : undefined,
  };
}

export async function confirmEmploymentContractRead(token) {
  const data = await findSigning(token);
  if (["signed", "activated"].includes(data.status)) return getEmploymentSigning(token);
  if (!['invited', 'opened', 'read'].includes(data.status)) throw new Error("目前無法確認閱讀狀態");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from(TABLE).update({
    status: "read",
    opened_at: data.opened_at || now,
    read_confirmed_at: data.read_confirmed_at || now,
    updated_at: now,
  }).eq("id", data.id);
  if (error) throw new Error(error.message || "儲存閱讀確認失敗");
  return getEmploymentSigning(token);
}

export async function completeEmploymentSigning({
  token,
  organization,
  authUserId,
  authDiscordId,
  body,
  userAgent,
  ipAddress,
}) {
  const record = await findSigning(token);
  if (record.organization_code !== organization) throw new Error("簽署連結公司別不正確");
  if (record.discord_id !== authDiscordId) throw new Error("目前登入的 Discord 帳號不是受邀簽署人");
  if (["signed", "activated"].includes(record.status)) return getEmploymentSigning(token);
  if (record.status !== "read" || !record.read_confirmed_at) throw new Error("請先詳閱完整契約並確認已閱讀");
  const form = normalizeEmploymentForm(body);
  const now = new Date();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from(TABLE)
    .update({ status: "signing", updated_at: now.toISOString() })
    .eq("id", record.id)
    .eq("status", "read")
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) throw new Error("簽署正在處理中，請勿重複送出");

  let pdfPath = "";
  try {
    const ipSalt = evidenceSecret();
    const ipHash = ipAddress ? sha256(`${ipSalt}:${ipAddress}`) : null;
    const result = await buildEmploymentEvidencePdf({
      organization,
      transactionId: record.id,
      discordId: record.discord_id,
      discordName: record.discord_name,
      authUserId,
      readConfirmedAt: record.read_confirmed_at,
      form,
      signatureDataUrl: body.signatureDataUrl,
      guardianSignatureDataUrl: body.guardianSignatureDataUrl,
      userAgent,
      ipHash,
      signedAt: now,
    });
    const date = taipeiDateParts(now);
    const filename = `${safeFilePart(record.discord_name)}_${safeFilePart(form.realName)}_${date.year}-${date.month}-${date.day}.pdf`;
    pdfPath = await uploadAdminFileBuffer({
      organization,
      category: "employees",
      name: filename,
      buffer: result.signedPdf,
      contentType: "application/pdf",
    });
    const formData = {
      real_name: form.realName,
      gender: form.gender,
      birthday: form.birthday,
      bank_name: form.bankName,
      bank_account: form.bankAccount,
    };
    const { error } = await supabaseAdmin.from(TABLE).update({
      status: "signed",
      signed_at: now.toISOString(),
      form_data: formData,
      signed_pdf_path: pdfPath,
      signed_pdf_sha256: result.signedSha256,
      contract_sha256: result.sourceSha256,
      verification_method: "discord_oauth_and_handwritten_signature",
      evidence_hmac: result.evidenceHmac,
      signer_auth_user_id: authUserId,
      signer_user_agent: clean(userAgent, 500) || null,
      signer_ip_hash: ipHash,
      updated_at: now.toISOString(),
    }).eq("id", record.id).eq("status", "signing");
    if (error) throw error;
    return getEmploymentSigning(token);
  } catch (error) {
    if (pdfPath) await removeAdminFilePath(pdfPath).catch(() => {});
    await supabaseAdmin.from(TABLE).update({ status: "read", updated_at: new Date().toISOString() }).eq("id", record.id).eq("status", "signing");
    throw error;
  }
}

export async function getPendingSignedProfile(organization, discordId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("id, form_data, signed_at")
    .eq("organization_code", organization)
    .eq("discord_id", discordId)
    .eq("status", "signed")
    .is("activated_at", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "讀取已簽署入職資料失敗");
  if (data) return data;

  const { data: reusable, error: reusableError } = await supabaseAdmin
    .from(TABLE)
    .select("id, form_data, signed_at")
    .eq("discord_id", discordId)
    .in("status", ["signed", "activated"])
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reusableError) {
    throw new Error(reusableError.message || "讀取跨店簽署資料失敗");
  }
  return reusable || null;
}

export async function activateSignedProfile(signingId) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from(TABLE).update({
    status: "activated",
    activated_at: now,
    updated_at: now,
  }).eq("id", signingId).eq("status", "signed").is("activated_at", null);
  if (error) throw new Error(error.message || "更新入職啟用狀態失敗");
}
