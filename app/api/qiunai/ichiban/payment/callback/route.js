import { getIchibanEcpayConfig, decryptEcpayData, fulfillVerifiedPayment } from "@/lib/ichibanEcpay";

// Source: ECPay 9058.md, fetched 2026-09-25. S2S JSON callback, exact 1|OK.
export async function POST(request) {
  try {
    const config = getIchibanEcpayConfig();
    const outer = await request.json();
    if (Number(outer.TransCode) !== 1 || String(outer.MerchantID) !== config.merchantId)
      throw new Error("綠界通知驗證失敗");
    const data = decryptEcpayData(outer.Data, config);
    if (Number(data.RtnCode) === 1) await fulfillVerifiedPayment(data, config);
    return new Response("1|OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    // DB 暫時失敗時保留綠界重送機會，絕不假裝已完成發獎。
    console.error("[一番賞站內付通知]", error?.message || error);
    return new Response("retry", { status: 500 });
  }
}
