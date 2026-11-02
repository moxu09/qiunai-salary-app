# 深夜手動抽成與歷史校正

資料庫的 `sync_play_order_salary_fields()` 原本只在 `salary_rate IS NULL` 時採用員工比例，因此來自舊流程的非空舊比例會保留下來。新的計薪與完成審核改用手動比例；開幕期至少 90%，活動只提高比例，打賞沿用 90%／特別設定 95% 規則。直接編輯單筆薪資、已入帳、已有帳本、刪除、駁回與原始／WORK 重複來源均保留原處理。

先套用 `20261103000100` 與 `20261103000200`。這兩個 migration 不會自動回填歷史薪資。`deepnight_commission_audit` 只記錄比例變更，不會禁止管理員修改。

歷史校正必須使用 service role 與經人工核對的私人試算檔案。環境變數沿用既有 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，不要把憑證或試算資料提交到儲存庫。

```sh
node scripts/repair-deepnight-commission.mjs --discord-id STAFF_ID --cutoff 2026-11-02T18:00:00Z --request-id REQUEST_UUID --plan-file /private/path/plan.json
# 核對每筆來源、既有帳本、missingBase、rateDifference 與 additionalCredit 後：
node scripts/repair-deepnight-commission.mjs --discord-id STAFF_ID --cutoff 2026-11-02T18:00:00Z --request-id REQUEST_UUID --plan-file /private/path/plan.json --apply
```

截止時間必須帶時區；資料庫內 `created_at` 的無時區值按 UTC 比較。套用時鎖住帳本及來源，在同一交易補回缺漏的原薪資、增加抽成補差分錄、校正來源。原分錄與提領不變。試算後有任何來源／帳本變更就停止。

同一 request UUID 與試算重試只回傳已完成、額外入帳 0。其他 request UUID 若涵蓋已有修正的歷史單，會轉人工核對；此工具刻意不是持續循環補款引擎。獎金、沖銷、非正數、舊錢包日期、尚未入帳及來源／帳本不一致，也會停止整批，絕不推估補款。

`npm test` 使用 PGlite 實際執行 migration 與交易，覆蓋手動比例、跨部門、已入帳、WORK 防重、明確時區、資料變更、權限與重試。
