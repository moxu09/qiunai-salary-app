import assert from "node:assert/strict";

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

for (const path of ["/staff", "/admin/activities"]) {
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
  "/api/qiunai/activities?admin=1",
  "/api/qiunai/activities/3df7cc5b-7dbb-4c72-8d42-9d338429ea0f/export",
]) {
  const response = await read(path);
  assert.ok([400, 401, 403].includes(response.status), "未登入的管理 API 應拒絕存取");
}
const logo = await read("/employment/deepnight-logo.png");
assert.equal(logo.status, 200, "缺少公開圖片");
console.log(`容器驗證完成${revision ? `，版本 ${revision}` : ""}；未進行資料庫寫入、扣款或通知。`);
