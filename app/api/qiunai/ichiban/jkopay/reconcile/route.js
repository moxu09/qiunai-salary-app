import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ICHIBAN_CORS, ICHIBAN_ORIGIN, claimDigest } from "@/lib/ichibanEcpay";
import { getIchibanJkopayConfig, fulfillJkopayPayment } from "@/lib/ichibanJkopay";

export function OPTIONS(request) {
  return new Response(null, { status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403, headers: ICHIBAN_CORS });
}

export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN)
    return NextResponse.json({ ok: false }, { status: 403 });
  try {
    const body = await request.json();
    const tradeNo = String(body.tradeNo || "");
    const claimToken = String(body.claimToken || "");
    if (!/^QI[A-F0-9]{18}$/.test(tradeNo) || !/^[0-9a-f]{64}$/.test(claimToken))
      return NextResponse.json({ ok: false }, { status: 400, headers: ICHIBAN_CORS });
    const { data: order, error } = await supabaseAdmin.from("qiunai_ichiban_web_orders")
      .select("status,challenge_id,payment_provider").eq("merchant_trade_no", tradeNo).maybeSingle();
    if (error) throw error;
    if (!order || order.payment_provider !== "jkopay")
      return NextResponse.json({ ok: false }, { status: 404, headers: ICHIBAN_CORS });
    const { data: identity } = await supabaseAdmin.from("qiunai_ichiban_identity_challenges")
      .select("token_digest").eq("id", order.challenge_id).maybeSingle();
    if (!identity || identity.token_digest !== claimDigest(claimToken))
      return NextResponse.json({ ok: false }, { status: 403, headers: ICHIBAN_CORS });
    if (order.status !== "pending" && order.status !== "processing")
      return NextResponse.json({ ok: true, status: order.status }, { headers: ICHIBAN_CORS });
    const config = getIchibanJkopayConfig();
    const result = await fulfillJkopayPayment(tradeNo, config);
    return NextResponse.json({ ok: true, status: result ? "drawn" : "processing" }, { headers: ICHIBAN_CORS });
  } catch (error) {
    console.error("[一番賞街口查單]", error?.message || error);
    return NextResponse.json({ ok: false, message: "付款狀態暫時無法查詢" }, { status: 503, headers: ICHIBAN_CORS });
  }
}
