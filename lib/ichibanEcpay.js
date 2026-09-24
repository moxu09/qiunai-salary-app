import { createHmac, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptEcpayData, decryptEcpayData } from "@/lib/ichibanEcpayCrypto.mjs";
export { encryptEcpayData, decryptEcpayData } from "@/lib/ichibanEcpayCrypto.mjs";

export const ICHIBAN_ORIGIN = "https://qiunai.gaming.wearestilllhere.com";
export const ICHIBAN_API_BASE = "https://qiunai.wearestilllhere.com";
export const ICHIBAN_CORS = {
  "Access-Control-Allow-Origin": ICHIBAN_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function getIchibanEcpayConfig() {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;
  const enabled = process.env.ECPAY_ICHIBAN_ENABLED === "true";
  if (!enabled || !merchantId || !hashKey || !hashIv) {
    throw new Error("一番賞刷卡服務尚未開放");
  }
  if (Buffer.byteLength(hashKey) !== 16 || Buffer.byteLength(hashIv) !== 16) {
    throw new Error("綠界站內付金鑰長度錯誤");
  }
  const stage = process.env.ECPAY_ENV === "stage";
  return {
    merchantId, hashKey, hashIv, stage,
    baseUrl: stage ? "https://ecpg-stage.ecpay.com.tw" : "https://ecpg.ecpay.com.tw",
  };
}

export async function postEcpay(path, data, config) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ MerchantID: config.merchantId,
      RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
      Data: encryptEcpayData(data, config) }),
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`綠界暫時無法連線（HTTP ${response.status}）`);
  const outer = await response.json();
  if (Number(outer.TransCode) !== 1) throw new Error(`綠界傳輸失敗：${outer.TransMsg || "請稍後再試"}`);
  const result = decryptEcpayData(outer.Data, config);
  if (String(result.MerchantID || config.merchantId) !== config.merchantId) throw new Error("綠界特店編號不符");
  return result;
}

export function taipeiTradeDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date()).replace(/-/g, "/");
}

export function newTradeNo() { return `QI${randomBytes(9).toString("hex").toUpperCase()}`; }

export function claimDigest(token) {
  if (!process.env.CRON_SECRET) throw new Error("驗證服務尚未設定");
  return createHmac("sha256", process.env.CRON_SECRET).update(`claim:${token}`).digest("hex");
}

export async function fulfillVerifiedPayment(data, config) {
  // Source: ECPay 9058.md, fetched 2026-09-25. SimulatePaid=1 is not a real payment.
  if (Number(data.RtnCode) !== 1 || Number(data.SimulatePaid || 0) === 1) return null;
  const info = data.OrderInfo || {};
  if (String(data.MerchantID) !== config.merchantId || Number(info.TradeAmt) !== 300 ||
      !/^QI[A-F0-9]{18}$/.test(String(info.MerchantTradeNo || ""))) {
    throw new Error("綠界通知交易資料不符");
  }
  const { data: draw, error } = await supabaseAdmin.rpc("qiunai_ichiban_fulfill_web_payment", {
    p_merchant_trade_no: info.MerchantTradeNo,
    p_merchant_id: config.merchantId,
    p_gateway_trade_no: String(info.TradeNo || ""),
    p_amount: Number(info.TradeAmt),
  });
  if (error) throw error;
  return draw;
}
