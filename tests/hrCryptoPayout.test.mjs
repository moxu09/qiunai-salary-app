import assert from "node:assert/strict";
import test from "node:test";
import { calculateHrCryptoPayout, isHrCryptoAsset } from "../lib/hrCryptoPayout.mjs";

test("外國人收款幣種只接受 USDT 與 USDC", () => {
  assert.equal(isHrCryptoAsset("USDT"), true);
  assert.equal(isHrCryptoAsset("USDC"), true);
  for (const unsupported of ["BTC", "USDT-TRC20", "usdc", null]) {
    assert.equal(isHrCryptoAsset(unsupported), false);
  }
});

test("先扣 1% 新台幣手續費，再按所選行情換算", () => {
  assert.deepEqual(calculateHrCryptoPayout("10000", "33.00"), {
    grossTwd: "10000.00",
    feeTwd: "100.00",
    netTwd: "9900.00",
    tokenAmount: "300.000000",
  });
  assert.equal(calculateHrCryptoPayout("10000", "32.98").tokenAmount, "300.181928");
});

test("手續費精確到分，幣量向下保留六位小數", () => {
  assert.deepEqual(calculateHrCryptoPayout("1", "31"), {
    grossTwd: "1.00", feeTwd: "0.01", netTwd: "0.99", tokenAmount: "0.031935",
  });
  for (const invalid of ["0", "1.5", "-1", "1e3"]) {
    assert.throws(() => calculateHrCryptoPayout(invalid, "33"));
  }
  for (const invalid of ["0", "-33", "NaN", "33.123456789"]) {
    assert.throws(() => calculateHrCryptoPayout("1000", invalid));
  }
});
