import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function getIchibanJkopayConfig() {
  const config = {
    apiKey: process.env.JKOPAY_API_KEY || "",
    secretKey: process.env.JKOPAY_SECRET_KEY || "",
    storeId: process.env.JKOPAY_STORE_ID || "",
    entryUrl: process.env.JKOPAY_ENTRY_URL || "",
    inquiryUrl: process.env.JKOPAY_INQUIRY_URL || "",
  };
  if (process.env.JKOPAY_ICHIBAN_ENABLED !== "true" ||
      Object.values(config).some((value) => !value)) {
    throw new Error("一番賞街口支付尚未開放");
  }
  for (const url of [config.entryUrl, config.inquiryUrl]) {
    if (new URL(url).protocol !== "https:") throw new Error("街口支付設定網址不安全");
  }
  return config;
}

export function signJkopayPayload(payload, secretKey) {
  return createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function callJkopay(url, method, payload, config) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "api-key": config.apiKey,
      digest: signJkopayPayload(payload, config.secretKey),
    },
    body: method === "GET" ? undefined : payload,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`街口暫時無法連線（HTTP ${response.status}）`);
  const data = await response.json();
  if (data.result !== "000") throw new Error(data.message || `街口回應 ${data.result || "unknown"}`);
  return data;
}

export async function createJkopayPayment(tradeNo, config) {
  const base = "https://qiunai.wearestilllhere.com/api/qiunai/ichiban/jkopay";
  const payload = JSON.stringify({
    platform_order_id: tradeNo,
    store_id: config.storeId,
    currency: "TWD",
    total_price: 300,
    final_price: 300,
    result_url: `${base}/callback`,
    result_display_url: `${base}/display?order=${encodeURIComponent(tradeNo)}`,
    payment_type: "onetime",
    escrow: false,
    products: [{ name: "秋奈一番賞一抽", unit_count: 1, unit_price: 300, unit_final_price: 300 }],
  });
  const result = await callJkopay(config.entryUrl, "POST", payload, config);
  const paymentUrl = String(result.result_object?.payment_url || "");
  if (!paymentUrl || new URL(paymentUrl).protocol !== "https:") {
    throw new Error("街口未回傳安全付款連結");
  }
  return paymentUrl;
}

export async function inquireJkopayPayment(tradeNo, config) {
  const query = `platform_order_ids=${encodeURIComponent(tradeNo)}`;
  const result = await callJkopay(`${config.inquiryUrl}?${query}`, "GET", query, config);
  return (result.result_object?.transactions || []).find(
    (row) => row.platform_order_id === tradeNo,
  ) || null;
}

export async function fulfillJkopayPayment(tradeNo, config, callbackTradeNo = null) {
  const transaction = await inquireJkopayPayment(tradeNo, config);
  if (!transaction || Number(transaction.status) !== 0) return null;
  if (Number(transaction.final_price) !== 300 || transaction.currency !== "TWD" ||
      !/^[A-Za-z0-9]{1,25}$/.test(String(transaction.tradeNo || "")) ||
      (callbackTradeNo && !safeEqual(callbackTradeNo, transaction.tradeNo))) {
    throw new Error("街口查單資料與一番賞付款單不符");
  }
  const { data, error } = await supabaseAdmin.rpc("qiunai_ichiban_fulfill_jkopay_payment", {
    p_merchant_trade_no: tradeNo,
    p_store_id: config.storeId,
    p_gateway_trade_no: transaction.tradeNo,
    p_amount: Number(transaction.final_price),
  });
  if (error) throw error;
  return data;
}
