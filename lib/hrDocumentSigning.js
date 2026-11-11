import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildEmploymentEvidencePdf, evidenceSecret, readHrDocumentTemplate } from "@/lib/employmentSigning";
import { getHrRole } from "@/lib/hrAccess";
import { hrAuth } from "@/lib/hrServer";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_FILE_BUCKET, removeAdminFilePath, uploadAdminFileBuffer } from "@/lib/adminFileStorage";
import {
  HR_PAYMENT_QR_MAX_BYTES, HR_QR_PROVIDERS, HR_SIGNER_IDENTITIES, HR_SIGNING_DOCUMENTS,
  HR_SIGNING_START, taipeiSigningAge,
} from "@/lib/hrSigningDocuments.mjs";
import receivingBanks from "@/lib/taiwanReceivingBanks.json";

const TABLE = "hr_document_signings";
const EMPLOYMENT = "employment-v22";
const NDA = "manager-nda";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400) => Object.assign(Error(message), { status });

function required(value, label, maxLength) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean || clean.length > maxLength || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw fail(`請確認${label}已填寫且格式正確`);
  }
  return clean;
}

function profileKey() {
  return createHash("sha256").update("hr-contract-profile:v1\0").update(evidenceSecret()).digest();
}

function encryptNationalId(value, discordId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", profileKey(), iv);
  cipher.setAAD(Buffer.from(discordId));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptNationalId(value, discordId) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", profileKey(), iv);
  decipher.setAAD(Buffer.from(discordId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function normalizePaymentQr(value) {
  const input = typeof value === "string" ? value : "";
  if (input.length > Math.ceil(HR_PAYMENT_QR_MAX_BYTES / 3) * 4 + 30) throw fail("收款碼圖片不得超過 768 KB");
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) throw fail("請上傳 PNG 或 JPEG 收款碼");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > HR_PAYMENT_QR_MAX_BYTES) throw fail("收款碼圖片不得超過 768 KB");
  try {
    const image = sharp(bytes, { limitInputPixels: 8_000_000 });
    const { format, width, height, pages } = await image.metadata();
    if (format !== match[1] || width < 100 || height < 100 || (pages ?? 1) !== 1) {
      throw Error("Invalid QR image");
    }
    return await image.rotate().resize(750, 750, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw fail("收款碼圖片無法讀取，請上傳至少 100 × 100 的 PNG 或 JPEG");
  }
}

async function normalizePayout(identity, body, realName) {
  if (identity === "cn_hk_mo") {
    const provider = required(body.qrProvider, "收款方式", 10);
    if (!Object.hasOwn(HR_QR_PROVIDERS, provider)) throw fail("請選擇支付寶或微信收款");
    return {
      payoutChannel: HR_QR_PROVIDERS[provider], payeeName: required(body.payeeName, "收款人名稱", 50),
      paymentQr: await normalizePaymentQr(body.paymentQrDataUrl),
    };
  }
  if (identity === "foreign") {
    const walletAddress = required(body.walletAddress, "錢包地址", 160);
    if (!/^[A-Za-z0-9:_-]{8,160}$/.test(walletAddress)) throw fail("錢包地址格式不正確");
    const confirmation = typeof body.confirmWalletAddress === "string" ? body.confirmWalletAddress.trim() : "";
    if (walletAddress !== confirmation) throw fail("兩次輸入的錢包地址不一致");
    return { payoutChannel: required(body.cryptoChannel, "加密貨幣通路", 60), walletAddress };
  }
  const bankCode = required(body.bankCode, "銀行代碼", 3);
  const bankName = Object.hasOwn(receivingBanks, bankCode) ? receivingBanks[bankCode] : null;
  if (!bankName) throw fail("請從清單選擇收款銀行");
  const bankAccount = required(body.bankAccount, "收款帳戶", 50).replace(/[ -]/g, "");
  if (!/^\d{6,30}$/.test(bankAccount)) throw fail("收款帳戶格式不正確");
  return { bankCode, bankName, bankAccount,
    bankHolder: body.sameBankHolder === true ? realName : required(body.bankHolder, "銀行戶名", 50) };
}

export async function normalizeHrDocumentForm(key, body, now, existingStaffWaiver = false) {
  const identity = typeof body.identity === "string" && Object.hasOwn(HR_SIGNER_IDENTITIES, body.identity) ? body.identity : null;
  if (!identity) throw fail("請選擇簽署身分");
  const { idLabel } = HR_SIGNER_IDENTITIES[identity];
  const form = {
    identity,
    realName: required(body.realName, "姓名", 50),
    nationalId: required(body.nationalId, idLabel, 30),
    contact: required(body.contact, key === NDA ? "聯絡電話" : "聯絡方式", 30),
  };
  if (!/^[A-Za-z0-9() /-]{5,30}$/.test(form.nationalId)) throw fail(`${idLabel}格式不正確`);
  if (key === NDA) return { ...form, address: required(body.address, "聯絡地址", 150) };

  const birthday = required(body.birthday, "西元出生年月日", 10);
  const age = taipeiSigningAge(birthday, now);
  if (age === null) throw fail("西元出生年月日不正確");
  const isMinor = age < 18;
  const guardianName = isMinor ? required(body.guardianName, "法定代理人姓名", 50) : "";
  const normalizeName = (value) => value.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase("zh-TW");
  if (isMinor && normalizeName(guardianName) === normalizeName(form.realName)) {
    throw fail("法定代理人姓名不可與乙方本人相同");
  }
  if (isMinor && body.signatureDataUrl === body.guardianSignatureDataUrl) {
    throw fail("請由法定代理人另外手寫簽名");
  }
  return {
    ...form, birthday, isMinor, ...await normalizePayout(identity, body, form.realName),
    depositApplies: !isMinor && !existingStaffWaiver,
    guardianName,
    guardianContact: isMinor ? required(body.guardianContact, "法定代理人聯絡方式", 70) : "",
  };
}

async function existingStaffDepositWaiver(auth) {
  const { data, error } = await supabaseAdmin.rpc("hr_contract_existing_staff_waiver", {
    p_discord_id: auth.discordId,
  });
  if (error) throw error;
  return data === true;
}

async function signedRows(discordId) {
  const { data, error } = await supabaseAdmin.from(TABLE)
    .select("document_key,signed_at,signed_pdf_path,organization_code,deposit_required,deposit_paid_at")
    .eq("discord_id", discordId).not("signed_at", "is", null);
  if (error) throw error;
  return data;
}

async function managerDepartments(auth) {
  const managers = await Promise.all(auth.departments.map(async ({ key }) =>
    (await getHrRole(key, auth.discordId)) === "Manager" ? key : null
  ));
  return managers.filter(Boolean);
}

export async function getHrSigningTasks(auth) {
  if (Date.now() < HR_SIGNING_START) return [];
  const [signed, managers] = await Promise.all([signedRows(auth.discordId), managerDepartments(auth)]);
  return Object.entries(HR_SIGNING_DOCUMENTS)
    .filter(([key]) => key === EMPLOYMENT || managers.length)
    .flatMap(([key, { title }]) => {
      const row = signed.find((record) => record.document_key === key);
      const waiting = row?.deposit_required && !row.deposit_paid_at;
      if (row && !waiting) return [];
      return [{ key, title: waiting ? "繳交履約保證金 NT$1,000" : title,
        href: `/collaboration/contract-signing?document=${key}` }];
    });
}

export async function requireHrDocumentSigner(request, key) {
  if (!Object.hasOwn(HR_SIGNING_DOCUMENTS, key) || Date.now() < HR_SIGNING_START) {
    throw fail("這份文件尚未開放簽署", 404);
  }
  let auth;
  try {
    auth = await hrAuth(request);
  } catch (error) {
    if (key !== EMPLOYMENT || error.status !== 403) throw error;
    const identity = await getAuthUserFromRequest(supabaseAdmin, request);
    const { data: invite, error: lookupError } = await supabaseAdmin.from("hr_contract_invitations")
      .select("organization_code,discord_name").eq("discord_id", identity.discordId)
      .gt("expires_at", new Date().toISOString()).order("invited_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    const signed = invite ? null : (await signedRows(identity.discordId)).find((row) => row.document_key === EMPLOYMENT);
    if (!invite && !signed) throw error;
    auth = { ...identity, departments: [], onboarding: invite || { organization_code: signed.organization_code } };
  }
  const eligible = key === NDA ? await managerDepartments(auth) : auth.departments.map(({ key }) => key);
  if (!eligible.length && !auth.onboarding) throw fail("目前沒有此文件的待辦資格", 403);
  return { ...auth, eligible, organization: eligible[0] || auth.onboarding.organization_code };
}

export async function getHrContractProfile(discordId) {
  if (Date.now() < HR_SIGNING_START) return null;
  const { data, error } = await supabaseAdmin.from("hr_contract_profiles")
    .select("national_id_encrypted,signer_identity,bank_holder,bank_code,payout_channel").eq("discord_id", discordId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const nationalId = decryptNationalId(data.national_id_encrypted, discordId);
  return { nationalIdLast4: nationalId.slice(-4), signerIdentity: data.signer_identity,
    bankHolder: data.bank_holder, bankCode: data.bank_code, payoutChannel: data.payout_channel };
}

export async function getHrDocumentSigning(auth, key) {
  const signed = (await signedRows(auth.discordId)).find((row) => row.document_key === key);
  if (signed) return {
    signedAt: signed.signed_at, depositRequired: signed.deposit_required, depositPaidAt: signed.deposit_paid_at,
  };
  const preferred = auth.departments.find(({ key }) => key === auth.organization)?.staff;
  const staff = [preferred, ...auth.departments.map((department) => department.staff)].filter(Boolean);
  const profileValue = (field) => staff.map((row) => row[field]).find((value) => value !== null && value !== undefined && value !== "") || "";
  const { data: profile, error } = await supabaseAdmin.from("hr_contract_profiles")
    .select("national_id_encrypted,signer_identity").eq("discord_id", auth.discordId).maybeSingle();
  if (error) throw error;
  const fromHr = {
    realName: profileValue("real_name") || "",
    contact: profileValue("phone") || "",
    nationalId: profile ? decryptNationalId(profile.national_id_encrypted, auth.discordId) : "",
    identity: profile?.signer_identity || "",
  };
  const bank = staff.find((row) => row.bank_name && row.bank_account) || staff[0] || {};
  const bankCode = Object.hasOwn(receivingBanks, bank.bank_code) ? bank.bank_code :
    Object.entries(receivingBanks).find(([, name]) => name === bank.bank_name)?.[0] || "";
  const prefill = key === NDA
    ? { ...fromHr, address: profileValue("address") }
    : { ...fromHr, birthday: profileValue("birthday"), bankAccount: bank.bank_account || "",
      bankHolder: bank.bank_holder || "", bankCode };
  return { signedAt: null, prefill,
    ...(key === EMPLOYMENT ? { existingStaffWaiver: await existingStaffDepositWaiver(auth) } : {}) };
}

export async function hrSigningPdf(auth, key, signed) {
  if (signed) {
    const record = (await signedRows(auth.discordId)).find((row) => row.document_key === key);
    if (!record?.signed_pdf_path) throw fail("找不到簽署完成的文件", 404);
    const { data, error } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).download(record.signed_pdf_path);
    if (error) throw error;
    return data;
  }
  const document = HR_SIGNING_DOCUMENTS[key];
  return new Uint8Array(await readHrDocumentTemplate(document));
}

export async function completeHrDocumentSigning(auth, key, body, request) {
  const existing = (await signedRows(auth.discordId)).find((row) => row.document_key === key);
  if (existing) return { signedAt: existing.signed_at, depositRequired: existing.deposit_required, depositPaidAt: existing.deposit_paid_at };
  if (body.confirmed !== true) throw fail("請先確認已閱讀並同意簽署文件");
  const now = new Date();
  const existingStaffWaiver = key === EMPLOYMENT && await existingStaffDepositWaiver(auth);
  const form = await normalizeHrDocumentForm(key, body, now, existingStaffWaiver);
  const attempt = randomUUID();
  const { data: id, error: claimError } = await supabaseAdmin.rpc("hr_claim_document_signing", {
    p_discord_id: auth.discordId, p_document_key: key, p_org: auth.organization, p_attempt: attempt,
  });
  if (claimError) throw claimError;
  if (!id) throw fail("文件正在簽署，請稍後重新讀取", 409);
  let storagePath;
  let finalizing = false;
  try {
    const staff = auth.departments.find(({ key }) => key === auth.organization)?.staff;
    const discordName = staff?.discord_name || auth.onboarding?.discord_name || auth.discordId;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const result = await buildEmploymentEvidencePdf({
      organization: auth.organization, transactionId: id, discordId: auth.discordId, discordName,
      authUserId: auth.user.id, readConfirmedAt: now.toISOString(), signedAt: now,
      form, documentKey: key, signatureDataUrl: body.signatureDataUrl,
      guardianSignatureDataUrl: body.guardianSignatureDataUrl,
      userAgent: request.headers.get("user-agent"), ipHash: ip ? digest(`${evidenceSecret()}:${ip}`) : null,
    });
    storagePath = await uploadAdminFileBuffer({
      organization: auth.organization, category: "employees",
      name: `${HR_SIGNING_DOCUMENTS[key].title}-${auth.discordId}.pdf`, buffer: result.signedPdf,
      contentType: "application/pdf",
    });
    const profile = key === EMPLOYMENT ? {
      signer_identity: form.identity, payout_channel: form.payoutChannel, deposit_required: form.depositApplies,
      real_name: form.realName, birthday: form.birthday, phone: form.contact,
      bank_name: form.bankName, bank_code: form.bankCode, bank_holder: form.bankHolder,
      bank_account: form.bankAccount, national_id_encrypted: encryptNationalId(form.nationalId, auth.discordId),
    } : { signer_identity: form.identity };
    finalizing = true;
    const { error } = await supabaseAdmin.rpc("hr_complete_document_signing", {
      p_id: id, p_attempt: attempt, p_discord_id: auth.discordId, p_discord_name: discordName,
      p_auth_user_id: auth.user.id, p_signed_at: now.toISOString(),
      p_pdf_path: storagePath, p_pdf_sha256: result.signedSha256,
      p_source_sha256: result.sourceSha256, p_evidence_hmac: result.evidenceHmac,
      p_profile: profile, p_departments: auth.eligible, p_token_hash: digest(randomBytes(36)),
    });
    if (error) throw error;
    return { signedAt: now.toISOString(), depositRequired: Boolean(form.depositApplies), depositPaidAt: null };
  } catch (error) {
    if (finalizing) {
      const rows = await signedRows(auth.discordId).catch(() => null);
      const completed = rows?.find((row) => row.document_key === key);
      if (completed?.signed_pdf_path === storagePath) return {
        signedAt: completed.signed_at, depositRequired: completed.deposit_required, depositPaidAt: completed.deposit_paid_at,
      };
      if (!rows) throw fail("簽署狀態暫時無法確認，請稍後重新讀取", 503);
    }
    if (storagePath) await removeAdminFilePath(storagePath).catch(() => {});
    await supabaseAdmin.rpc("hr_release_document_signing", { p_id: id, p_attempt: attempt });
    throw error;
  }
}
