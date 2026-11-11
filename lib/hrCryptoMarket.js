import "server-only";
import { calculateHrCryptoPayout, isHrCryptoAsset, normalizeHrCryptoAmount } from "@/lib/hrCryptoPayout.mjs";

const ids = { USDT: "tether", USDC: "usd-coin" };
const priceUrl = "https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=twd&include_last_updated_at=true";
const maxAgeMs = 3 * 60_000;
const cacheMs = 20_000;
let market;
let pending;

async function readMarket() {
  if (market && Date.now() - market.fetchedAt < cacheMs) return market.payload;
  pending ??= fetch(priceUrl, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(7_000),
  }).then(async (response) => {
    if (!response.ok) throw Error("market response failed");
    const payload = await response.json();
    market = { payload, fetchedAt: Date.now() };
    return payload;
  }).finally(() => { pending = undefined; });
  return pending;
}

export async function quoteHrCryptoPayout(asset, amountTwd) {
  if (!isHrCryptoAsset(asset)) throw Error("收款幣種限 USDT 或 USDC");
  normalizeHrCryptoAmount(amountTwd);
  let price;
  let updatedAt;
  try {
    const sample = (await readMarket())?.[ids[asset]];
    if (typeof sample?.twd !== "number" || !Number.isFinite(sample.twd) || sample.twd < 0.00000001 ||
        sample.twd >= 1_000_000_000 ||
        !Number.isInteger(sample.last_updated_at)) throw Error("market data invalid");
    updatedAt = sample.last_updated_at * 1000;
    const age = Date.now() - updatedAt;
    if (age < -15_000 || age > maxAgeMs) throw Error("market data stale");
    price = sample.twd.toFixed(8).replace(/\.?0+$/, "");
  } catch {
    throw Object.assign(Error("暫時無法取得即時匯率，請稍後再試"), { status: 503 });
  }
  return {
    asset, rateTwd: price, source: "CoinGecko", updatedAt: new Date(updatedAt).toISOString(),
    ...calculateHrCryptoPayout(amountTwd, price),
  };
}
