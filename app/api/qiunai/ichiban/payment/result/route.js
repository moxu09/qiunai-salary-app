import { getIchibanEcpayConfig, decryptEcpayData, ICHIBAN_ORIGIN } from "@/lib/ichibanEcpay";

// Source: ECPay 15076.md, fetched 2026-09-25. Browser form POST; display is
// advisory only, never fulfills a draw. S2S ReturnURL is the authority.
export async function POST(request) {
  let status = "pending";
  try {
    const config = getIchibanEcpayConfig();
    const form = await request.formData();
    const outer = JSON.parse(String(form.get("ResultData") || ""));
    if (Number(outer.TransCode) !== 1 || String(outer.MerchantID) !== config.merchantId)
      throw new Error("結果傳輸驗證失敗");
    const data = decryptEcpayData(outer.Data, config);
    status = Number(data.RtnCode) === 1 && Number(data.SimulatePaid || 0) !== 1 ? "pending" : "failed";
  } catch (error) {
    console.error("[一番賞前景結果]", error?.message || error);
    status = "unknown";
  }
  const target = `${ICHIBAN_ORIGIN}/ichiban?payment=${status}`;
  return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>返回秋奈一番賞</title><p>正在返回秋奈一番賞，請到原頁面查詢付款結果。</p><a href="${target}">返回秋奈一番賞</a></html>`, {
    status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
