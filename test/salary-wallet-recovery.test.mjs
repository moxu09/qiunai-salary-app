import test from "node:test";
import assert from "node:assert/strict";
import { planDeepnightSalaryRecovery } from "../lib/salaryWalletRecovery.mjs";
const discordId = "123456789012345678", parent = "12345678-1234-4123-8123-123456789abc", sourceId = "87654321-4321-4321-8321-cba987654321";
const source = { id: sourceId, discord_id: discordId, guild_id: "1501098191813214312", status: "completed",
  staff_salary: 532, bonus_amount: 0, paid: false, order_id: `WORK-${parent}-${discordId}`,
  wallet_settled_at: "2026-11-01T16:00:00Z", wallet_period_key: "2026-10-H2" };
const base = { ...source, id: parent, order_id: null, staff_salary: 0 };
function plan(overrides = {}) { return planDeepnightSalaryRecovery({ discordId, sourceId, expectedAmount: 532,
  orders: [base, source], entries: [], now: new Date("2026-11-03T00:00:00Z"), ...overrides }); }
test("recover the completed WORK salary once, preserving the department, unique source and Taipei settlement date", () => {
  const result = plan(); assert.equal(result.amount, 532); assert.equal(result.entry.source_id, sourceId);
  assert.equal(result.entry.app_key, "deepnight"); assert.equal(result.entry.settlement_date, "2026-11-02");
  assert.equal(result.entry.period_key, "2026-10-H2");
  assert.equal(plan({ entries: [result.entry] }).state, "already-credited");
});
test("never double-credit the raw order or a family that already has salary/corrections", () => {
  assert.throws(() => plan({ sourceId: parent, expectedAmount: 532, orders: [{ ...base, staff_salary: 532 }, source] }), /正式報單/);
  const entry = plan().entry;
  assert.throws(() => plan({ entries: [{ ...entry, source_id: parent }] }), /其他薪資/);
  assert.throws(() => plan({ entries: [{ ...entry, entry_type: "salary_correction" }] }), /其他薪資/);
  assert.throws(() => plan({ orders: [base, source, { ...source, id: "other-work" }] }), /多筆正式報單/);
});
test("fail closed on identity, organization, source amount, status, deleted or future/unmarked settlement", () => {
  for (const patch of [{ discord_id: "999999999999999999" }, { guild_id: "1206138511535898654" },
    { staff_salary: 0 }, { status: "cancelled" }, { review_decision: "rejected" }, { is_deleted: true },
    { order_id: `WORK-${parent}-999999999999999999` },
    { wallet_settled_at: null }, { wallet_period_key: null }, { wallet_settled_at: "2026-12-02T00:00:00Z" }])
    assert.throws(() => plan({ orders: [base, { ...source, ...patch }] }));
  assert.throws(() => plan({ expectedAmount: 531 }));
});
test("never overwrite a conflicting amount or someone else's ledger", () => {
  const entry = plan().entry;
  for (const patch of [{ amount: 500 }, { app_key: "qiunai" }, { discord_id: "999999999999999999" }, { source_table: "other" }])
    assert.throws(() => plan({ entries: [{ ...entry, ...patch }] }));
});
