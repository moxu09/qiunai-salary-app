import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { drawIchibanWithAsd, getIchibanAsdBalance } from "@/lib/ichibanAsdDraw";
import { ICHIBAN_CORS, ICHIBAN_ORIGIN } from "@/lib/ichibanEcpay";

function digest(value) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("付款驗證服務尚未設定");
  return createHmac("sha256", secret).update(`claim:${value}`).digest("hex");
}

function errorStatus(message) {
  if (message.includes("餘額不足")) return 402;
  if (message.includes("登入已過期")) return 401;
  if (message.includes("售完") || message.includes("付款中")) return 409;
  if (message.includes("格式錯誤")) return 400;
  return 503;
}

export function OPTIONS(request) {
  return new Response(null, {
    status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403,
    headers: ICHIBAN_CORS,
  });
}

export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN) {
    return NextResponse.json({ ok: false, message: "來源不符" }, { status: 403, headers: ICHIBAN_CORS });
  }
  try {
    const body = await request.json();
    if (body?.action === "balance") {
      const result = await getIchibanAsdBalance(supabaseAdmin, digest, body);
      return NextResponse.json({ ok: true, ...result }, { headers: ICHIBAN_CORS });
    }
    const draw = await drawIchibanWithAsd(supabaseAdmin, digest, body);
    return NextResponse.json({ ok: true, draw }, { headers: ICHIBAN_CORS });
  } catch (error) {
    const message = error?.message || "ASD 付款暫時無法使用";
    console.error("[一番賞 ASD 付款]", message);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message), headers: ICHIBAN_CORS });
  }
}
