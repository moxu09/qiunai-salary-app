import { createCipheriv, createDecipheriv } from "node:crypto";

// Source: ECPay Web 2.0 9040.md / 9053.md and 9103.md, fetched 2026-09-25.
function aesUrlEncode(value) {
  return encodeURIComponent(value).replace(/%20/g, "+").replace(/~/g, "%7E")
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}

export function encryptEcpayData(data, config) {
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(config.hashKey), Buffer.from(config.hashIv));
  return Buffer.concat([cipher.update(aesUrlEncode(JSON.stringify(data)), "utf8"), cipher.final()]).toString("base64");
}

export function decryptEcpayData(cipherText, config) {
  if (typeof cipherText !== "string" || cipherText.length > 20000) throw new Error("綠界回傳資料格式錯誤");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(config.hashKey), Buffer.from(config.hashIv));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherText, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(decodeURIComponent(plain.replace(/\+/g, "%20")));
}
