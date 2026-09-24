import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ICHIBAN_API_BASE, ICHIBAN_CORS, ICHIBAN_ORIGIN,
  claimDigest, getIchibanEcpayConfig, newTradeNo, postEcpay, taipeiTradeDate } from "@/lib/ichibanEcpay";

export function OPTIONS(request) {
  return new Response(null, { status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403, headers: ICHIBAN_CORS });
}
export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN) return NextResponse.json({ ok: false, message: "來源不符" }, { status: 403 });
  let tradeNo;
  try {
    const config = getIchibanEcpayConfig();
    const body = await request.json();
    const challengeId = String(body.challengeId || "");
    const claimToken = String(body.claimToken || "");
    const email = String(body.email || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^[0-9a-f]{64}$/.test(claimToken) ||
        !/^[^ @]+@[^ @]+\.[^ @]+$/.test(email) || email.length > 100) {
      return NextResponse.json({ ok: false, message: "請完成 Discord 驗證並填寫電子郵件" }, { status: 400, headers: ICHIBAN_CORS });
    }
    tradeNo = newTradeNo();
    const { error } = await supabaseAdmin.rpc("qiunai_ichiban_begin_web_payment", {
      p_challenge_id: challengeId, p_token_digest: claimDigest(claimToken),
      p_email: email, p_merchant_trade_no: tradeNo, p_merchant_id: config.merchantId,
    });
    if (error) throw error;
    // Source: ECPay 9040.md, fetched 2026-09-25. ConsumerInfo Email required;
    // PaymentUIType=2 / ChoosePaymentList='1' renders credit cards via official SDK.
    const tokenResult = await postEcpay("/Merchant/GetTokenbyTrade", {
      MerchantID: config.merchantId, RememberCard: 0, PaymentUIType: 2,
      ChoosePaymentList: "1",
      OrderInfo: {
        MerchantTradeDate: taipeiTradeDate(), MerchantTradeNo: tradeNo, TotalAmount: 300,
        ReturnURL: `${ICHIBAN_API_BASE}/api/qiunai/ichiban/payment/callback`,
        TradeDesc: "秋奈一番賞", ItemName: "秋奈一番賞一抽",
      },
      CardInfo: { OrderResultURL: `${ICHIBAN_API_BASE}/api/qiunai/ichiban/payment/result` },
      ConsumerInfo: { Email: email },
    }, config);
    if (Number(tokenResult.RtnCode) !== 1 || !tokenResult.Token) throw new Error(tokenResult.RtnMsg || "無法建立刷卡表單");
    return NextResponse.json({ ok: true, token: tokenResult.Token, tradeNo,
      environment: config.stage ? "Stage" : "Prod" }, { headers: ICHIBAN_CORS });
  } catch (error) {
    if (tradeNo) await supabaseAdmin.rpc("qiunai_ichiban_set_web_order_status", {
      p_merchant_trade_no: tradeNo, p_status: "failed", p_reason: String(error?.message || error),
    });
    console.error("[一番賞站內付取 Token]", error?.message || error);
    return NextResponse.json({ ok: false, message: error?.message || "暫時無法開始付款" }, { status: 503, headers: ICHIBAN_CORS });
  }
}
