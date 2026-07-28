import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CENTRAL_ERP_URL =
  process.env.CENTRAL_ERP_URL || "https://salary.wearestilllhere.com";

export async function GET(request) {
  const authorization = request.headers.get("authorization") || "";
  const target = new URL("/api/device-audit/reports", CENTRAL_ERP_URL);
  target.search = new URL(request.url).search;

  try {
    const response = await fetch(target, {
      headers: { Authorization: authorization },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({
      ok: false,
      message: "共同 ERP 回傳格式錯誤",
    }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("proxy device audit reports failed", error);
    return NextResponse.json(
      { ok: false, message: "目前無法連線至共同 ERP" },
      { status: 502 },
    );
  }
}
