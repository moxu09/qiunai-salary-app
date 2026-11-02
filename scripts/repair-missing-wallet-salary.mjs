import { createClient } from "@supabase/supabase-js";
import { getWorkReportSourceId } from "../lib/playOrderDedupe.js";
import { planDeepnightSalaryRecovery } from "../lib/salaryWalletRecovery.mjs";

const args = process.argv.slice(2);
const allowed = new Set(["--discord-id", "--source-id", "--expected-amount", "--apply"]);
const values = {};
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (!allowed.has(flag) || Object.hasOwn(values, flag)) throw Error("不支援或重複的參數");
  values[flag] = flag === "--apply" ? true : args[++index];
}
const discordId = values["--discord-id"], sourceId = values["--source-id"];
if (!/^\d{17,20}$/.test(discordId || "") || !/^[0-9a-f-]{36}$/i.test(sourceId || "") ||
    !/^\d+$/.test(values["--expected-amount"] || "")) throw Error("必須明確指定員工、來源 UUID 與核對金額");
const expectedAmount = Number(values["--expected-amount"]);
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const fields = "id,discord_id,staff_name,staff_salary,bonus_amount,service_name,service,order_id,order_no,status,review_decision,is_deleted,guild_id,wallet_settled_at,wallet_period_key";
async function data(query) { const result = await query; if (result.error) throw Error(result.error.message); return result.data; }
async function plan() {
  const source = await data(client.from("play_orders").select(fields).eq("id", sourceId).single());
  const parentId = getWorkReportSourceId(source.order_id || source.order_no) || sourceId;
  const workId = `WORK-${parentId}-${discordId}`;
  const orders = await data(client.from("play_orders").select(fields)
    .or(`id.eq.${sourceId},id.eq.${parentId},order_id.eq.${workId},order_no.eq.${workId}`).limit(1001));
  if (orders.length >= 1000) throw Error("來源數量超出單筆修復範圍");
  const ids = [...new Set(orders.map((row) => row.id))];
  const entries = await data(client.from("salary_wallet_entries")
    .select("id,app_key,discord_id,entry_type,amount,source_table,source_id").in("source_id", ids).limit(1001));
  if (entries.length >= 1000) throw Error("分錄數量超出單筆修復範圍");
  return planDeepnightSalaryRecovery({ discordId, sourceId, expectedAmount, orders, entries });
}
let result = await plan();
if (values["--apply"] && result.entry) {
  // Recheck immediately before the only mutation; the existing unique source key
  // makes concurrent invocations and retries harmless. No balances are overwritten.
  result = await plan();
  if (result.entry) await data(client.from("salary_wallet_entries").upsert(result.entry,
    { onConflict: "app_key,source_table,source_id,entry_type", ignoreDuplicates: true }));
  const verified = await plan();
  if (verified.state !== "already-credited") throw Error("修復後驗證未通過");
  console.log(JSON.stringify({ mode: "apply", sourceId, state: verified.state, expectedAmount }));
} else console.log(JSON.stringify({ mode: values["--apply"] ? "apply" : "dry-run", sourceId,
  state: result.state, missingAmount: result.amount, entry: result.entry }));
