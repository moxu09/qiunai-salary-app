import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";
import { decryptEcpayData, postEcpay, taipeiTradeDate } from "@/lib/ichibanEcpay";
import { createJkopayPayment, getJkopayConfig, inquireJkopayPayment } from "@/lib/ichibanJkopay";
import { HR_ORIGIN } from "@/lib/hrThemeServer";

const PAYMENTS = "hr_contract_deposit_payments";
const ENDPOINT = `${HR_ORIGIN}/api/hr/contract-deposit`;
const NAME = "履約保證金";
const TRADE = /^HD[A-F0-9]{18}$/;
const cardDeclines = new Set([10100248, 10100251, 10100252, 10100254, 10100255, 10100256]);
const errorWithStatus = (message, status = 400) => Object.assign(Error(message), { status });

function configFor(method) {
  if (method === "jkopay") {
    if (process.env.HR_CONTRACT_DEPOSIT_JKOPAY_ENABLED === "false") throw errorWithStatus("街口保證金付款尚未開放", 503);
    try {
      const config = getJkopayConfig();
      return { ...config, id: config.storeId };
    } catch {
      throw errorWithStatus("街口保證金付款尚未設定", 503);
    }
  }
  if (method !== "ecpay") throw errorWithStatus("付款方式無效");
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY || "";
  const hashIv = process.env.ECPAY_HASH_IV || "";
  if (process.env.HR_CONTRACT_DEPOSIT_ECPAY_ENABLED === "false" || process.env.ECPAY_ENV === "stage" ||
      !merchantId || Buffer.byteLength(hashKey) !== 16 || Buffer.byteLength(hashIv) !== 16) {
    throw errorWithStatus("綠界保證金付款尚未開放", 503);
  }
  return { id: merchantId, merchantId, hashKey, hashIv, baseUrl: "https://ecpg.ecpay.com.tw" };
}

function availableMethods() {
  return ["ecpay", "jkopay"].filter((method) => {
    try { return Boolean(configFor(method)); } catch { return false; }
  });
}

async function signingFor(discordId) {
  const { data, error } = await db.from("hr_document_signings")
    .select("id,deposit_required,deposit_paid_at").eq("discord_id", discordId)
    .eq("document_key", "employment-v22").not("signed_at", "is", null).maybeSingle();
  if (error) throw error;
  return data;
}

async function paymentFor(field, value) {
  const { data, error } = await db.from(PAYMENTS).select("*")
    .eq(field, value).neq("status", "failed").maybeSingle();
  if (error) throw error;
  return data;
}

function checkout(payment) {
  if (!payment) return null;
  return {
    method: payment.method, tradeNo: payment.trade_no, status: payment.status,
    amount: payment.amount,
    ...(payment.status !== "ready" ? {} : payment.method === "ecpay"
      ? { token: payment.gateway_payload }
      : { url: payment.gateway_payload }),
  };
}

export async function contractDepositState(discordId) {
  const signing = await signingFor(discordId);
  return { required: Boolean(signing?.deposit_required), paidAt: signing?.deposit_paid_at || null,
    methods: availableMethods(),
    payment: signing?.deposit_required ? checkout(await paymentFor("signing_id", signing.id)) : null };
}

async function updatePayment(payment, patch, fromStatus) {
  const { data, error } = await db.from(PAYMENTS).update(patch)
    .eq("trade_no", payment.trade_no).eq("status", fromStatus).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function startContractDeposit(discordId, { method, email }) {
  const config = configFor(method);
  const consumerEmail = typeof email === "string" ? email.trim() : "";
  if (method === "ecpay" && (consumerEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consumerEmail))) {
    throw errorWithStatus("請填寫付款電子郵件");
  }
  const tradeNo = `HD${randomBytes(9).toString("hex").toUpperCase()}`;
  const { data: order, error } = await db.rpc("hr_start_contract_deposit", {
    p_discord_id: discordId, p_trade_no: tradeNo, p_method: method, p_merchant_id: config.id,
  });
  if (error) throw error;
  if (order.status === "paid") return contractDepositState(discordId);
  if (order.method !== method) return { payment: checkout(order) };

  if (method === "jkopay") {
    if (order.merchant_id !== config.id) throw errorWithStatus("付款商戶設定已變更，請聯繫客服", 409);
    // The same platform_order_id refreshes a JKO checkout without creating a second charge.
    let url;
    try {
      url = await createJkopayPayment(order.trade_no, config, {
        amount: order.amount, product: NAME, base: `${ENDPOINT}/jkopay`,
      });
    } catch (error) {
      if (!order.created && await verifyDeposit(order, config).catch(() => false)) {
        return contractDepositState(discordId);
      }
      throw error;
    }
    const saved = await updatePayment(order, { status: "ready", gateway_payload: url }, order.status);
    return saved ? { payment: checkout(saved) } : contractDepositState(discordId);
  }
  if (!order.created) return { payment: checkout(order) };

  try {
    const result = await postEcpay("/Merchant/GetTokenbyTrade", {
      MerchantID: config.id, RememberCard: 0, PaymentUIType: 2, ChoosePaymentList: "1",
      OrderInfo: {
        MerchantTradeDate: taipeiTradeDate(), MerchantTradeNo: tradeNo, TotalAmount: order.amount,
        ReturnURL: `${ENDPOINT}/ecpay/callback`, TradeDesc: NAME, ItemName: NAME,
      },
      CardInfo: { OrderResultURL: `${ENDPOINT}/ecpay/display` },
      ConsumerInfo: { Email: consumerEmail },
    }, config);
    if (Number(result.RtnCode) !== 1 || typeof result.Token !== "string" || !result.Token) {
      throw errorWithStatus("綠界暫時無法建立付款表單，請稍後再試", 502);
    }
    const saved = await updatePayment(order, { status: "ready", gateway_payload: result.Token }, "preparing");
    return saved ? { payment: checkout(saved) } : contractDepositState(discordId);
  } catch (error) {
    await updatePayment(order, { status: "failed" }, "preparing");
    throw error;
  }
}

export async function submitContractDeposit(discordId, { tradeNo, payToken }) {
  const signing = await signingFor(discordId);
  if (!signing?.deposit_required || signing.deposit_paid_at) return contractDepositState(discordId);
  if (typeof tradeNo !== "string" || !TRADE.test(tradeNo) || typeof payToken !== "string" ||
    payToken.length < 1 || payToken.length > 2000) throw errorWithStatus("付款代碼無效");
  const order = await paymentFor("trade_no", tradeNo);
  if (order?.signing_id !== signing.id || order.method !== "ecpay") throw errorWithStatus("找不到這筆綠界付款單", 404);
  const config = configFor("ecpay");
  if (order.merchant_id !== config.id) throw errorWithStatus("付款商戶設定已變更，請聯繫客服", 409);
  if (Date.now() - Date.parse(order.created_at) >= 25 * 60_000) throw errorWithStatus("付款表單已逾時，請重新建立", 409);
  const claimed = await updatePayment(order, {
    status: "processing", submitted_at: new Date().toISOString(), gateway_payload: null,
  }, "ready");
  if (!claimed) return contractDepositState(discordId);

  const result = await postEcpay("/Merchant/CreatePayment", {
    MerchantID: config.id, PayToken: payToken, MerchantTradeNo: tradeNo,
  }, config);
  const redirect = result.ThreeDInfo?.ThreeDURL;
  if (redirect) {
    if (typeof redirect !== "string" || new URL(redirect).protocol !== "https:") throw Error("綠界驗證網址不安全");
    return { payment: checkout(claimed), redirect };
  }
  if (cardDeclines.has(Number(result.RtnCode)) && result.OrderInfo?.MerchantTradeNo === tradeNo) {
    const failed = await updatePayment(claimed, { status: "failed" }, "processing");
    if (failed) throw errorWithStatus("綠界未完成付款，可以重新選擇付款方式", 402);
    return contractDepositState(discordId);
  }
  return { payment: checkout(claimed) };
}

async function verifyDeposit(order, config, notifiedTradeNo) {
  if (order.merchant_id !== config.id) throw Error("保證金付款商戶不符");
  if (order.status === "paid") return true;
  let gatewayTradeNo;
  if (order.method === "ecpay") {
    const result = await postEcpay("/1.0.0/Cashier/QueryTrade", {
      MerchantID: config.id, MerchantTradeNo: order.trade_no,
    }, { ...config, baseUrl: "https://ecpayment.ecpay.com.tw" });
    const info = result.OrderInfo;
    if (Number(result.RtnCode) !== 1 || String(result.MerchantID) !== config.id ||
        info?.MerchantTradeNo !== order.trade_no || Number(info?.TradeAmt) !== order.amount) throw Error("綠界查單結果與保證金不符");
    if (Number(result.SimulatePaid ?? 0) !== 0 || Number(info.SimulatePaid ?? 0) !== 0 ||
      String(info.TradeStatus) !== "1") return false;
    gatewayTradeNo = info.TradeNo;
  } else {
    const info = await inquireJkopayPayment(order.trade_no, config);
    if (!info || (info.status !== 0 && info.status !== "0")) return false;
    if (info.currency !== "TWD" || Number(info.final_price) !== order.amount ||
        (info.store_id && String(info.store_id) !== config.id)) throw Error("街口查單結果與保證金不符");
    gatewayTradeNo = info.tradeNo;
  }
  if (!/^[A-Za-z0-9-]{1,50}$/.test(String(gatewayTradeNo || "")) ||
      (notifiedTradeNo && String(gatewayTradeNo) !== String(notifiedTradeNo))) throw Error("保證金交易編號不符");
  const { error } = await db.rpc("hr_confirm_contract_deposit", {
    p_trade_no: order.trade_no, p_method: order.method, p_merchant_id: config.id,
    p_gateway_trade_no: String(gatewayTradeNo), p_amount: order.amount,
  });
  if (error) throw error;
  return true;
}

export async function checkContractDeposit(discordId) {
  const signing = await signingFor(discordId);
  if (signing?.deposit_required && !signing.deposit_paid_at) {
    const order = await paymentFor("signing_id", signing.id);
    if (order && (order.status === "processing" || order.method === "jkopay")) {
      const now = new Date();
      const { data, error } = await db.from(PAYMENTS).update({ last_checked_at: now.toISOString() })
        .eq("trade_no", order.trade_no).eq("status", order.status)
        .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(now.getTime() - 60_000).toISOString()}`)
        .select("trade_no").maybeSingle();
      if (error) throw error;
      if (data) await verifyDeposit(order, configFor(order.method));
    }
  }
  return contractDepositState(discordId);
}

export async function acceptDepositCallback(method, body) {
  const config = configFor(method);
  let info;
  if (method === "ecpay") {
    if (String(body?.MerchantID) !== config.id || Number(body?.TransCode) !== 1) throw errorWithStatus("綠界通知格式不符");
    const data = decryptEcpayData(body.Data, config);
    if (String(data.MerchantID) !== config.id) throw errorWithStatus("綠界通知商戶不符");
    if (Number(data.SimulatePaid) !== 0) return true;
    info = data.OrderInfo;
    const tradeNo = info?.MerchantTradeNo;
    const order = typeof tradeNo === "string" && TRADE.test(tradeNo) ? await paymentFor("trade_no", tradeNo) : null;
    if (!order || order.method !== method || Number(info.TradeAmt) !== order.amount) throw errorWithStatus("綠界通知交易資料不符");
    if (Number(data.RtnCode) !== 1) {
      if (order.status === "processing" && cardDeclines.has(Number(data.RtnCode)) &&
          !await verifyDeposit(order, config)) await updatePayment(order, { status: "failed" }, "processing");
      return true;
    }
    if (!info.TradeNo) throw errorWithStatus("綠界通知缺少交易編號");
    return verifyDeposit(order, config, info.TradeNo);
  }
  info = body?.transaction;
  const tradeNo = info?.platform_order_id;
  if (typeof tradeNo !== "string" || !TRADE.test(tradeNo)) throw errorWithStatus("街口通知交易編號不符");
  const order = await paymentFor("trade_no", tradeNo);
  if (order?.method !== method) throw errorWithStatus("街口通知交易資料不符");
  return verifyDeposit(order, config, info.tradeNo);
}
