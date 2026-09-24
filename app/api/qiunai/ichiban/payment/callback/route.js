import { getIchibanEcpayConfig, decryptEcpayData, fulfillVerifiedPayment } from "@/lib/ichibanEcpay";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Source: ECPay 9058.md, fetched 2026-09-25. S2S JSON callback, exact 1|OK.
export async function POST(request) {
  try {
    const config = getIchibanEcpayConfig();
    const outer = await request.json();
    if (Number(outer.TransCode) !== 1 || String(outer.MerchantID) !== config.merchantId)
      throw new Error("綠界通知驗證失敗");
    const data = decryptEcpayData(outer.Data, config);
    if (String(data.MerchantID) !== config.merchantId) throw new Error("綠界特店編號不符");
    if (Number(data.RtnCode) === 1) {
      await fulfillVerifiedPayment(data, config);
    } else if (Number(data.RtnCode) !== 10300066 &&
               /^QI[A-F0-9]{18}$/.test(String(data.OrderInfo?.MerchantTradeNo || ""))) {
      // 10300066 是「待確認」，不能視為失敗；其他確定失敗的授權釋放名額。
      const { error } = await supabaseAdmin.rpc("qiunai_ichiban_set_web_order_status", {
        p_merchant_trade_no: data.OrderInfo.MerchantTradeNo,
        p_status: "failed", p_reason: String(data.RtnMsg || "付款失敗"),
      });
      if (error) throw error;
    }
    return new Response("1|OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    // DB 暫時失敗時保留綠界重送機會，絕不假裝已完成發獎。
    console.error("[一番賞站內付通知]", error?.message || error);
    return new Response("retry", { status: 500 });
  }
}
