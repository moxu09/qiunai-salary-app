import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3000";
const revision = process.env.EXPECTED_REVISION;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function read(path) {
  return fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) });
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await read("/staff");
    if (response.ok) { ready = true; break; }
  } catch { /* Wait for the container, without contacting production services. */ }
  await sleep(1000);
}
assert.ok(ready, "容器未能啟動員工頁面");

for (const path of ["/staff", "/personal/data", "/order/order.details", "/order/reward.details", "/resources/appearance", "/admin/activities"]) {
  const response = await read(path);
  assert.equal(response.status, 200, `${path} 載入失敗`);
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")))];
  assert.ok(assets.length > 0, `${path} 缺少程式資產`);
  const scripts = await Promise.all(assets.map(async (asset) => {
    assert.equal(new URL(asset, origin).origin, new URL(origin).origin, "不接受外部程式資產");
    const result = await read(asset);
    assert.equal(result.status, 200, "程式資產載入失敗");
    return result.text();
  }));
  const source = scripts.join("\n");
  assert.ok(source.includes("selected_option_ids"), `${path} 缺少活動複選修正`);
  assert.ok(source.includes("allow_multiple_options"), `${path} 缺少活動複選設定`);
  console.log(`${path}: 頁面、${assets.length} 個資產及複選修正驗證通過`);
}

for (const path of [
  "/api/hr/session",
  "/api/hr/wallet",
  "/api/hr/orders?month=2026-11",
  "/api/qiunai/activities?admin=1",
  "/api/qiunai/activities/3df7cc5b-7dbb-4c72-8d42-9d338429ea0f/export",
]) {
  const response = await read(path);
  assert.ok([400, 401, 403].includes(response.status), "未登入的管理 API 應拒絕存取");
}
for (const path of ["/employment/deepnight-logo.png", "/brand/xiaonai.png", "/brand/deepnight-gold.png", "/brand/qiunai-cloud-room.png", "/brand/deepnight-lounge.png"]) {
  const image = await read(path);
  assert.equal(image.status, 200, `品牌圖片載入失敗：${path}`);
  assert.ok(image.headers.get("content-type")?.startsWith("image/"), `品牌圖片格式錯誤：${path}`);
}
for (const scene of ["qiunai-cloud-room", "deepnight-lounge"]) {
  const image = await fetch(new URL(`/_next/image?url=%2Fbrand%2F${scene}.png&w=640&q=75`, origin), {
    headers: { Accept: "image/webp" }, signal: AbortSignal.timeout(15000),
  });
  assert.equal(image.status, 200, `主題圖片最佳化失敗：${scene}`);
  assert.equal(image.headers.get("content-type"), "image/webp", "手機主題圖片應使用 WebP");
  assert.ok((await image.arrayBuffer()).byteLength < 400000, "手機主題圖片不應載入完整 PNG");
}
console.log("兩套主題插畫與手機 WebP 圖片最佳化驗證通過。");
// Exercise the actual HTTP authority through Next's production server. Its
// internal NextRequest hostname can differ when running behind Railway's edge.
async function readHost(hostname, path) {
  return new Promise((resolve, reject) => {
    const address = new URL(path, origin);
    const client = address.protocol === "https:" ? https : http;
    const request = client.get(address, { headers: { Host: hostname } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body, location: response.headers.location }));
    });
    request.setTimeout(15000, () => request.destroy(Error("網域驗證逾時")));
    request.on("error", reject);
  });
}
const supervisor = await readHost("eip.wearestilllhere.com", "/");
assert.equal(supervisor.status, 200, "主管網域入口載入失敗");
assert.ok(supervisor.body.includes("<title>深夜不關燈 EIP</title>"), "主管網域必須顯示既有主管應用程式");
console.log("主管 HTTP 網域已導向既有後台登入頁。");
for (const [path, target] of [
  ["/staff", "/collaboration/workspace"],
  ["/", "/"],
  ["/order/order.details?month=2026-11", "/order/order.details?month=2026-11"],
]) {
  const legacy = await readHost("qiunai.wearestilllhere.com", path);
  assert.equal(legacy.status, 308, "舊秋奈員工入口應永久轉至 HR");
  assert.equal(legacy.location, `https://hr.wearestilllhere.com${target}`, "舊入口轉址目的地不正確");
}
const legacyApi = await readHost("qiunai.wearestilllhere.com", "/api/hr/session");
assert.ok([400, 401, 403].includes(legacyApi.status), "舊網域 API 必須保留登入保護，不能轉址");
console.log("舊秋奈員工頁已永久轉至 HR，API 保留原本驗證。");
console.log(`容器驗證完成${revision ? `，版本 ${revision}` : ""}；未進行資料庫寫入、扣款或通知。`);
