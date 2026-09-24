import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ICHIBAN_CORS, ICHIBAN_ORIGIN, claimDigest, getIchibanEcpayConfig, postEcpay } from "@/lib/ichibanEcpay";

export function OPTIONS(request) {
  return new Response(null, { status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403, headers: ICHIBAN_CORS });
}
export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN) return NextResponse.json({ ok: false, message: "來源不符" }, { status: 403 });
  try {
    const config = getIchibanEcpayConfig();
    const body = await request.json();
    const tradeNo = String(body.tradeNo || "");
    const payToken = String(body.payToken || "");
    const claimToken = String(body.claimToken || "");
    if (!/^QI[A-F0-9]{18}$/.test(tradeNo) || !payToken || payToken.length > 2000 ||
        !/^[0-9a-f]{64}$/.test(claimToken)) {
      return NextResponse.json({ ok: false, message: "付款資料格式錯誤" }, { status: 400, headers: ICHIBAN_CORS });
    }
    const { data: order, error } = await supabaseAdmin.from("qiunai_ichiban_web_orders")
      .select("id,status,challenge_id,merchant_id").eq("merchant_trade_no", tradeNo).maybeSingle();
    if (error) throw error;
    if (!order || order.merchant_id !== config.merchantId || !["pending","processing"].includes(order.status))
      return NextResponse.json({ ok: false, message: "付款單已失效" }, { status: 409, headers: ICHIBAN_CORS });
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("qiunai_ichiban_identity_challenges").select("token_digest,expires_at,verified_at")
      .eq("id", order.challenge_id).maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge || challenge.token_digest !== claimDigest(claimToken) ||
        !challenge.verified_at || new Date(challenge.expires_at).getTime() <= Date.now())
      return NextResponse.json({ ok: false, message: "Discord 驗證已過期" }, { status: 403, headers: ICHIBAN_CORS });
    const result = await postEcpay("/Merchant/CreatePayment", {
      MerchantID: config.merchantId, PayToken: payToken, MerchantTradeNo: tradeNo,
    }, config);
    const threeDUrl = String(result.ThreeDInfo?.ThreeDURL || "");
    if (threeDUrl) {
      if (!threeDUrl.startsWith("https://")) throw new Error("綠界 3D 驗證網址不安全");
      await supabaseAdmin.rpc("qiunai_ichiban_set_web_order_status", {
        p_merchant_trade_no: tradeNo, p_status: "processing", p_reason: null,
      });
      return NextResponse.json({ ok: true, threeDUrl }, { headers: ICHIBAN_CORS });
    }
    if (Number(result.RtnCode) === 1) {
      // 即時成功也等 S2S ReturnURL 核對金額後才抽紙，避免前景結果先於通知。
      await supabaseAdmin.rpc("qiunai_ichiban_set_web_order_status", {
        p_merchant_trade_no: tradeNo, p_status: "processing", p_reason: null,
      });
      return NextResponse.json({ ok: true, pending: true }, { headers: ICHIBAN_CORS });
    }
    await supabaseAdmin.rpc("qiunai_ichiban_set_web_order_status", {
      p_merchant_trade_no: tradeNo, p_status: "failed", p_reason: result.RtnMsg || "授權失敗",
    });
    return NextResponse.json({ ok: false, message: result.RtnMsg || "付款失敗" }, { status: 402, headers: ICHIBAN_CORS });
  } catch (error) {
    console.error("[一番賞站內付交易]", error?.message || error);
    return NextResponse.json({ ok: false, message: "付款狀態尚待確認，請勿重複付款；請稍後查詢" }, { status: 503, headers: ICHIBAN_CORS });
  }
}
