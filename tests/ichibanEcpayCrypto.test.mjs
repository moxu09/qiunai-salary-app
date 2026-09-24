import assert from "node:assert/strict";
import test from "node:test";
import { encryptEcpayData, decryptEcpayData } from "../lib/ichibanEcpayCrypto.mjs";

// Source: ECPay-API-Skill/test-vectors/aes-encryption.json, 2026-09-25.
const config = { hashKey: "ejCk326UnaZWKisg", hashIv: "q9jcZX8Ib9LM8wYk" };
test("綠界 AES 符合官方中文與特殊字元測試向量", () => {
  const cases = [
    [{ MerchantID: "2000132", BarCode: "/1234567" }, "XeEOdHpTRvxKEqs/JD9RSd16s7VtpyWVCN6AV44pKTW3DVa6yI7vKmjBRp2eulDhXoru/qBqFDBH3fEqlkMn3bbJfJBfGAq+v+SvttutYnc="],
    [{ Name: "test!*'()~value" }, "uvI4yrErM37XNQkXGAgRgBuDOiJoVs72Xn/rum9Ejl1DSna4HyLSoY7764PmhTR7JXb9jJWLSjCGcZEDeFiABg=="],
    [{ MerchantID: "2000132", ItemName: "綠界科技測試商品" }, "XeEOdHpTRvxKEqs/JD9RSd16s7VtpyWVCN6AV44pKTVKsXddZRgV+Cle9oeB2PqsEC2O0oDi4kObiCtdGznG9aAX69Kj0//VjGXhieBYZ3RuGW9v20xQyBevaBwtOvg1lYjlDw6jsgfToGMUvlGsIJ2DO6/tbXjNZumnRgj2GCSj7LLDRBU3KlkUWji16nO1"],
  ];
  for (const [data, expected] of cases) {
    assert.equal(encryptEcpayData(data, config), expected);
    assert.deepEqual(decryptEcpayData(expected, config), data);
  }
});

test("損壞的綠界密文不能被當作成功通知", () => {
  assert.throws(() => decryptEcpayData("not-base64", config));
});
