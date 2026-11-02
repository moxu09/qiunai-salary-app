import { filterShadowedSourceOrders, getWorkReportSourceId } from "./playOrderDedupe.js";

// A deliberately bounded repair, not a second settlement engine. Only a named,
// already-due DeepNight salary with an independently supplied amount is eligible.
export function planDeepnightSalaryRecovery({ discordId, sourceId, expectedAmount, orders, entries, now = new Date() }) {
  if (!/^\d{17,20}$/.test(discordId) || !Number.isSafeInteger(expectedAmount) || expectedAmount <= 0)
    throw Error("請指定員工及已核對的正整數薪資");
  const source = orders.find((row) => row.id === sourceId);
  if (!source || source.discord_id !== discordId || source.is_deleted === true ||
      (source.guild_id != null && source.guild_id !== "1501098191813214312"))
    throw Error("來源不屬於指定的深夜員工或已刪除");
  if (!["completed", "已完成", "已入帳", "已發薪", "未入帳", "未發薪"].includes(source.status) ||
      source.review_decision === "rejected") throw Error("來源尚未完成或已駁回");
  if (Number(source.staff_salary) !== expectedAmount) throw Error("來源薪資與核對金額不同，停止修復");
  const settled = new Date(source.wallet_settled_at);
  if (!source.wallet_settled_at || !Number.isFinite(settled.getTime()) ||
      settled > new Date(now) || settled < new Date("2026-07-17T00:00:00+08:00") ||
      !source.wallet_period_key) throw Error("來源沒有已到期的入帳標記");
  const parentId = getWorkReportSourceId(source.order_id || source.order_no);
  if (parentId && String(source.order_id || source.order_no).toLowerCase() !== `WORK-${parentId}-${discordId}`.toLowerCase())
    throw Error("正式報單中的員工識別碼不同，停止修復");
  const scoped = orders.filter((row) => row.discord_id === discordId && row.is_deleted !== true &&
    (row.guild_id == null || row.guild_id === "1501098191813214312"));
  if (!filterShadowedSourceOrders(scoped).some((row) => row.id === sourceId))
    throw Error("來源已有正式報單，不能再次計薪");
  const familyId = parentId || sourceId;
  const siblings = scoped.filter((row) => getWorkReportSourceId(row.order_id || row.order_no) === familyId);
  if (siblings.length > 1) throw Error("同一來源有多筆正式報單，請人工核對");
  const relatedIds = new Set([sourceId, familyId, ...siblings.map((row) => row.id)]);
  const ledger = entries.filter((row) => relatedIds.has(String(row.source_id)) && Number(row.amount) !== 0);
  const existing = ledger.find((row) => row.source_id === sourceId && row.entry_type === "order_salary");
  if (ledger.some((row) => row.app_key !== "deepnight" || row.discord_id !== discordId || row.source_table !== "play_orders"))
    throw Error("既有分錄的部門或員工不同，停止修復");
  if (existing && Number(existing.amount) !== expectedAmount) throw Error("既有薪資金額不同，不能覆寫");
  if (ledger.some((row) => row !== existing && (row.source_id !== sourceId || row.entry_type !== "order_bonus")))
    throw Error("相同來源已有其他薪資或修正分錄，不能重複入帳");
  if (existing) return { state: "already-credited", amount: 0, entry: null };
  const taipeiDate = new Date(settled.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    state: "missing-salary", amount: expectedAmount,
    entry: {
      app_key: "deepnight", discord_id: discordId, staff_name: source.staff_name || null,
      entry_type: "order_salary", amount: expectedAmount, source_table: "play_orders", source_id: sourceId,
      source_label: source.service_name || source.service || source.order_no || "訂單薪資",
      period_key: source.wallet_period_key, settlement_date: taipeiDate,
      metadata: { repair: "missing-settled-salary", original_wallet_settled_at: source.wallet_settled_at,
        canonical_source_id: sourceId, original_order_id: familyId, repaired_at: new Date(now).toISOString(),
        repair_tool: "repair-missing-wallet-salary.mjs",
        reason: "來源已標記入帳，但對應薪資分錄缺漏；依指定來源與核對金額補建" },
    },
  };
}
