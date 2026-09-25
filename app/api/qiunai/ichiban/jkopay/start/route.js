import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ICHIBAN_CORS, ICHIBAN_ORIGIN, claimDigest, newTradeNo } from "@/lib/ichibanEcpay";
import { createJkopayPayment, getIchibanJkopayConfig } from "@/lib/ichibanJkopay";

export function OPTIONS(request) {
  return new Response(null, { status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403, headers: ICHIBAN_CORS });
}

export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN)
    return NextResponse.json({ ok: false, message: "來源不符" }, { status: 403 });
  try {
    const config = getIchibanJkopayConfig();
    const body = await request.json();
    const challengeId = String(body.challengeId || "");
    const claimToken = String(body.claimToken || "");
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^[0-9a-f]{64}$/.test(claimToken))
      return NextResponse.json({ ok: false, message: "請先完成 Discord 私訊驗證" }, { status: 400, headers: ICHIBAN_CORS });
    const tradeNo = newTradeNo();
    const { error } = await supabaseAdmin.rpc("qiunai_ichiban_begin_jkopay_payment", {
      p_challenge_id: challengeId,
      p_token_digest: claimDigest(claimToken),
      p_merchant_trade_no: tradeNo,
      p_store_id: config.storeId,
    });
    if (error) throw error;
    const paymentUrl = await createJkopayPayment(tradeNo, config);
    const { error: saveError } = await supabaseAdmin.from("qiunai_ichiban_web_orders")
      .update({ payment_url: paymentUrl, updated_at: new Date().toISOString() })
      .eq("merchant_trade_no", tradeNo).eq("payment_provider", "jkopay");
    if (saveError) throw saveError;
    return NextResponse.json({ ok: true, tradeNo, paymentUrl }, { headers: ICHIBAN_CORS });
  } catch (error) {
    // 街口 API 若逾時，不能證明付款連結沒建立；保留待付款狀態至自然逾期。
    console.error("[一番賞街口建立付款]", error?.message || error);
    return NextResponse.json({ ok: false, message: error?.message || "街口付款暫時無法建立" }, { status: 503, headers: ICHIBAN_CORS });
  }
}
