export {};

const targetUrl = process.env.SALARY_WALLET_CRON_URL;
const cronSecret = process.env.CRON_SECRET;

if (!targetUrl || !cronSecret) {
  throw new Error("缺少 SALARY_WALLET_CRON_URL 或 CRON_SECRET");
}

const response = await fetch(targetUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`,
  },
});
const responseText = await response.text();

if (!response.ok) {
  throw new Error(`薪資錢包排程執行失敗 (${response.status}): ${responseText}`);
}

console.log("薪資錢包排程執行完成", responseText);
