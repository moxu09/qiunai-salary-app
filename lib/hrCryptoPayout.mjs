export const HR_CRYPTO_ASSETS = ["USDT", "USDC"];
export const HR_CRYPTO_FEE_PERCENT = 1;
export const HR_CRYPTO_PAYOUT_TERMS = "先從新台幣結算金額扣除 1% 手續費，再按發放時的即時匯率換算。";

export function isHrCryptoAsset(value) {
  return typeof value === "string" && HR_CRYPTO_ASSETS.includes(value);
}

export function normalizeHrCryptoAmount(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,14}$/.test(value)) {
    throw Error("請輸入大於零的新台幣整數金額");
  }
  return value;
}

function decimal(value, scale) {
  const digits = value.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function calculateHrCryptoPayout(amountTwd, rateTwd) {
  const amount = BigInt(normalizeHrCryptoAmount(amountTwd));
  const rate = typeof rateTwd === "string" ? /^(\d{1,9})(?:\.(\d{1,8}))?$/.exec(rateTwd) : null;
  if (!rate) throw Error("匯率格式不正確");
  const rateUnits = BigInt(rate[1] + (rate[2] || "").padEnd(8, "0"));
  if (rateUnits <= BigInt(0)) throw Error("匯率必須大於零");

  const grossCents = amount * BigInt(100);
  const feeCents = amount * BigInt(HR_CRYPTO_FEE_PERCENT);
  const netCents = grossCents - feeCents;
  // Convert TWD cents through the rate's eight decimals and round down to six token decimals.
  const tokenUnits = netCents * BigInt(1_000_000_000_000) / rateUnits;
  return {
    grossTwd: decimal(grossCents, 2),
    feeTwd: decimal(feeCents, 2),
    netTwd: decimal(netCents, 2),
    tokenAmount: decimal(tokenUnits, 6),
  };
}
