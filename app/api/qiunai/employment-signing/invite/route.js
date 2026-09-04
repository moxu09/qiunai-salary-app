import { NextResponse } from "next/server";
import {
  createEmploymentInvite,
  verifySigningApiSecret,
} from "@/lib/employmentSigning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";

function getPublicBaseUrl(request) {
  const configured = String(process.env.EMPLOYMENT_SIGNING_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(configured)) {
    return configured;
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && /^(https|http)$/.test(forwardedProto || "")) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const secret = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!verifySigningApiSecret(secret)) {
      return NextResponse.json(
        { ok: false, message: "簽署邀請 API 驗證失敗" },
        { status: 401 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const invitation = await createEmploymentInvite({
      organization: ORGANIZATION,
      discordId: body.discordId,
      discordName: body.discordName,
      invitedBy: body.invitedBy,
      baseUrl: getPublicBaseUrl(request),
      forceSigning: body.forceSigning === true,
    });
    return NextResponse.json({ ok: true, invitation });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error?.message || "建立簽署邀請失敗" },
      { status: 400 },
    );
  }
}
