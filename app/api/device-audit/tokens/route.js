import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CENTRAL_ERP_URL =
  process.env.CENTRAL_ERP_URL || "https://salary.wearestilllhere.com";

export async function POST(request) {
  const authorization = request.headers.get("authorization") || "";

  try {
    const body = await request.text();
    const response = await fetch(
      new URL("/api/device-audit/tokens", CENTRAL_ERP_URL),
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => ({
      ok: false,
      message: "共同 ERP 回傳格式錯誤",
    }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("proxy device audit token failed", error);
    return NextResponse.json(
      { ok: false, message: "目前無法連線至共同 ERP" },
      { status: 502 },
    );
  }
}
