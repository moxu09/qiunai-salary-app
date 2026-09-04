import { NextResponse } from "next/server";
import { getAuthUserFromBearer, getDiscordIdFromUser } from "@/lib/erpAuthLinks";
import {
  completeEmploymentSigning,
  confirmEmploymentContractRead,
  getEmploymentSigning,
  normalizeEmploymentForm,
} from "@/lib/employmentSigning";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORGANIZATION = "qiunai";
let demoStatus = "invited";

function isDemoToken(token) {
  const expected = String(process.env.EMPLOYMENT_SIGNING_DEMO_TOKEN || "");
  return expected.length >= 40 && token === expected;
}

function demoSigning() {
  return {
    status: demoStatus,
    organization: ORGANIZATION,
    discordId: "847840193859682304",
    discordName: "TEST｜阿陌陌",
    contractVersion: "v1.1",
    pageCount: 8,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    readConfirmedAt: ["read", "signed"].includes(demoStatus)
      ? new Date().toISOString()
      : null,
    signedAt: demoStatus === "signed" ? new Date().toISOString() : null,
    activatedAt: null,
    demo: true,
  };
}

function validateDemoSignature(value, label) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
    String(value || ""),
  );
  if (!match || Buffer.from(match[1], "base64").length < 200) {
    throw new Error(`請完成${label}手寫簽名`);
  }
}

function responseError(error, fallback) {
  const message = error?.message || fallback;
  const status = /登入|Discord 帳號不是/.test(message) ? 401 : 400;
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (isDemoToken(token)) {
      if (demoStatus === "invited") demoStatus = "opened";
      return NextResponse.json({ ok: true, signing: demoSigning() });
    }
    let includePrefill = false;
    const authorization = request.headers.get("authorization") || "";
    if (/^Bearer\s+/i.test(authorization)) {
      const user = await getAuthUserFromBearer(supabaseAdmin, request);
      const signing = await getEmploymentSigning(token);
      includePrefill = getDiscordIdFromUser(user) === signing.discordId;
    }
    return NextResponse.json({
      ok: true,
      signing: await getEmploymentSigning(token, {
        markOpened: true,
        includePrefill,
      }),
    });
  } catch (error) {
    return responseError(error, "讀取簽署邀請失敗");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (isDemoToken(body.token)) {
      demoStatus = "read";
      return NextResponse.json({ ok: true, signing: demoSigning() });
    }
    return NextResponse.json({
      ok: true,
      signing: await confirmEmploymentContractRead(body.token),
    });
  } catch (error) {
    return responseError(error, "儲存閱讀確認失敗");
  }
}

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4 * 1024 * 1024) throw new Error("簽署內容過大");
    const body = await request.json().catch(() => ({}));
    if (isDemoToken(body.token)) {
      const form = normalizeEmploymentForm(body);
      validateDemoSignature(body.signatureDataUrl, "乙方");
      if (form.isMinor) {
        validateDemoSignature(body.guardianSignatureDataUrl, "法定代理人");
      }
      demoStatus = "signed";
      return NextResponse.json({ ok: true, signing: demoSigning() });
    }
    const user = await getAuthUserFromBearer(supabaseAdmin, request);
    const authDiscordId = getDiscordIdFromUser(user);
    if (!authDiscordId) throw new Error("必須使用 Discord 登入後才能簽署");
    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    const ipAddress = forwardedFor.split(",")[0]?.trim() || "";
    return NextResponse.json({
      ok: true,
      signing: await completeEmploymentSigning({
        token: body.token,
        organization: ORGANIZATION,
        authUserId: user.id,
        authDiscordId,
        body,
        userAgent: request.headers.get("user-agent"),
        ipAddress,
      }),
    });
  } catch (error) {
    console.error("[employment-signing] submit failed", error);
    return responseError(error, "完成契約簽署失敗");
  }
}
