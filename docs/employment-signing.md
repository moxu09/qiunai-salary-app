# 線上入職契約設定

上線前先執行 `supabase/migrations/20260902_employment_contract_signing.sql`，並在 EIP 與對應 Discord 機器人設定相同的 `EMPLOYMENT_SIGNING_API_SECRET`（至少 32 個隨機字元）。

EIP 另外需要下列私密環境變數：

```text
EMPLOYMENT_SIGNING_API_SECRET=
EMPLOYMENT_SIGNING_AUDIT_SALT=
EMPLOYMENT_SIGNING_PUBLIC_URL=https://qiunai.wearestilllhere.com
```

簽署採用 Discord OAuth 身分核對、一次性邀請連結、強制手寫簽名及 PDF 完整性稽核紀錄，不需要簡訊 OTP 或 PAdES 憑證。`EMPLOYMENT_SIGNING_AUDIT_SALT` 至少 32 個隨機字元，專門用來建立 IP 雜湊與稽核驗證碼；請勿與其他服務共用或提交至版本庫。

最終 PDF 會附加電子簽署稽核頁，資料庫另存最終 PDF SHA-256。這是電子簽章證據紀錄，不宣稱為憑證機構簽發的數位簽章。

機器人環境變數：

```text
EMPLOYMENT_SIGNING_BASE_URL=https://qiunai.wearestilllhere.com
EMPLOYMENT_SIGNING_API_SECRET=
```

正式環境也必須在 Supabase Auth 的 Redirect URLs 允許：

```text
https://qiunai.wearestilllhere.com/auth/callback
```
