export const FREE_HR_THEMES = ["qiunai", "deepnight"];
export const HALLOWEEN_SALE_END = "2026-11-30T23:59:59.999+08:00";
export const HR_THEMES = [
  { key: "qiunai", name: "秋奈・小奈的雲朵日常", price: 0, description: "雲朵遊戲房、花草與小奈一起陪你工作。", scene: "/brand/qiunai-cloud-room.png" },
  { key: "deepnight", name: "深夜・不關燈的星空", price: 0, description: "午夜城市、暖燈與星空下的休息室。", scene: "/brand/deepnight-lounge.png" },
  { key: "white", name: "純白色", price: 10, color: "#ffffff", description: "乾淨明亮的純白工作空間。" },
  { key: "black", name: "純黑色", price: 10, color: "#000000", description: "純黑背景與清楚的亮色文字。" },
  { key: "blue", name: "純藍色", price: 10, color: "#b8d9ff", description: "清爽、專注的藍色工作空間。" },
  { key: "gray", name: "純灰色", price: 10, color: "#d2d5da", description: "簡潔沉穩的灰色工作空間。" },
  { key: "pink", name: "純粉色", price: 10, color: "#fbd4e6", description: "柔和明亮的粉色工作空間。" },
  { key: "halloween-2026", name: "萬聖節限定・幽靈遊戲屋", price: 50, saleEndsAt: HALLOWEEN_SALE_END, scene: "/brand/halloween-2026.png", description: "南瓜燈、幽靈、蝙蝠、魔藥和黑貓，滿滿萬聖節元素。" },
];
export function canUseHrTheme(key, owned = []) {
  return HR_THEMES.some(theme => theme.key === key) && (FREE_HR_THEMES.includes(key) || owned.includes(key));
}
export function isHrThemeOnSale(theme, now = new Date()) {
  return !theme.saleEndsAt || now.getTime() <= new Date(theme.saleEndsAt).getTime();
}
export function verifiedThemePayment(data, merchantId) {
  if (String(data?.MerchantID) !== String(merchantId)) throw Error("綠界特店編號不符");
  if (Number(data?.RtnCode) !== 1 || Number(data?.SimulatePaid) !== 0) return null;
  const info = data.OrderInfo || {};
  if (!/^HT[A-F0-9]{18}$/.test(String(info.MerchantTradeNo || "")) ||
      !Number.isSafeInteger(Number(info.TradeAmt)) || Number(info.TradeAmt) < 1 || !String(info.TradeNo || ""))
    throw Error("主題付款通知資料不符");
  return { tradeNo: info.MerchantTradeNo, gatewayTradeNo: String(info.TradeNo), amount: Number(info.TradeAmt) };
}
export function confirmedThemeQuery(data, order) {
  if (Number(data?.RtnCode) !== 1) throw Error("綠界訂單查詢失敗");
  const info = data.OrderInfo || {};
  if (String(data.MerchantID) !== String(order.merchant_id) || info.MerchantTradeNo !== order.merchant_trade_no || Number(info.TradeAmt) !== order.amount)
    throw Error("綠界查詢與主題訂單不符");
  if (String(info.TradeStatus) !== "1") return null;
  if (!String(info.TradeNo || "")) throw Error("綠界查詢缺少交易編號");
  return { tradeNo: info.MerchantTradeNo, gatewayTradeNo: String(info.TradeNo), amount: Number(info.TradeAmt) };
}
export function failedThemePayment(data, order) {
  const code = Number(data?.RtnCode),info=data?.OrderInfo || {};
  return Number.isInteger(code) && code !== 1 && code !== 10300066 && Number(data?.SimulatePaid) === 0 &&
    String(data.MerchantID) === String(order.merchant_id) && info.MerchantTradeNo === order.merchant_trade_no && Number(info.TradeAmt) === order.amount;
}
