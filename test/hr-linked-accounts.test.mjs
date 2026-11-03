import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { linkedWithdrawalPlan } from "../lib/hrLinkedWallet.mjs";
import { allocateWithdrawal } from "../lib/hrRoutes.mjs";

const primary = "999999999999990010", alt = "999999999999990011";
const other = "999999999999990012", third = "999999999999990013";
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create table qiunai_staff(discord_id text primary key, is_active boolean, display_name text, bank_name text, bank_account text);
    create table players (like qiunai_staff including all);
    create table users(user_id text primary key,coins integer);
    create table wallet_logs(user_id text,type text,amount integer,balance integer,note text);
    create table salary_wallet_entries(app_key text,discord_id text,amount numeric,settlement_date date default current_date);
    create table salary_withdraw_requests(id uuid primary key default gen_random_uuid(), app_key text, discord_id text,
      staff_name text,amount numeric,service_fee integer,welfare_fee integer,payout_amount integer,status text,
      destination text, request_note text,reviewed_by text,reviewed_at timestamptz,updated_at timestamptz,
      requested_at timestamptz not null default now());
    insert into qiunai_staff values ('${primary}',true,'primary','bank','000'),('${alt}',true,'alt','bank','001');
    insert into players values ('${alt}',true,'alt','bank','001');
    insert into salary_wallet_entries(app_key,discord_id,amount) values ('qiunai','${primary}',2000),('qiunai','${alt}',600),('deepnight','${alt}',500);
  `);
  for (const path of ["salary_to_asd.sql", "migrations/20261102000100_unified_hr.sql", "migrations/20261103001000_hr_linked_accounts.sql"]) {
    const sql = await readFile(new URL("../supabase/" + path, import.meta.url), "utf8");
    // Pin the bank window for deterministic tests. Other SQL runs as published.
    await db.exec(sql.replace("v_local timestamp:=now() at time zone 'Asia/Taipei'", "v_local timestamp:='2026-11-10 12:00:00'"));
  }
  return db;
}
const change = (db, actor, target, action) => db.query(
  "select hr_change_account_link($1,$2,$3,array['qiunai','deepnight'])", [actor, target, action],
);
const submit = (db, n, destination, sources, mode = "combined") => db.query(
  "select hr_request_linked_withdrawal_atomic($1,$2,$3,$4,$5) as result",
  [primary, `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    JSON.stringify(sources.map(([department, owner, amount, fee = 0]) => ({ department, owner, amount, fee }))),
    destination, JSON.stringify({ mode })],
);
test("cap, ownership, consent, expiration, and database privileges", async (t) => {
  const db = await fixture(t);
  await change(db, primary, alt, "request");
  await assert.rejects(change(db, primary, alt, "confirm"), /失效/);
  await assert.rejects(submit(db, 1, "asd", [["qiunai", alt, 50]]), /綁定已變更/);
  await change(db, alt, primary, "confirm");
  await change(db, primary, other, "request");
  await assert.rejects(change(db, primary, third, "request"), /兩組/);
  await assert.rejects(change(db, third, alt, "request"), /其他綁定/);
  await assert.rejects(change(db, alt, third, "request"), /其他綁定/);
  await db.exec("update hr_account_links set created_at=now()-interval '25 hours' where verified_at is null");
  await assert.rejects(change(db, other, primary, "confirm"), /失效/);
  await change(db, primary, third, "request");
  await change(db, alt, primary, "remove");
  await assert.rejects(submit(db, 1, "asd", [["qiunai", alt, 50]]), /綁定已變更/);
  assert.deepEqual((await db.query("select action from hr_account_link_audit order by id")).rows, [{action:"confirmed"},{action:"removed"}]);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from hr_account_links"), /permission denied/);
  await assert.rejects(change(db, primary, alt, "request"), /permission denied/);
  await assert.rejects(submit(db, 1, "asd", [["qiunai", primary, 50]]), /permission denied/);
});
test("linked ASD uses source account and rollback and retry leave correct balances", async (t) => {
  const db = await fixture(t);
  await change(db, primary, alt, "request");
  await change(db, alt, primary, "confirm");
  const sources = [["qiunai", primary, 100], ["qiunai", alt, 200], ["deepnight", alt, 300]];
  await assert.rejects(submit(db, 1, "asd", [...sources.slice(0, 2), ["deepnight", alt, 501]]), /超過/);
  await assert.rejects(submit(db, 2, "asd", [["deepnight", alt, 100], ["qiunai", alt, 601]]), /超過/);
  assert.equal((await db.query("select * from users")).rows.length, 0);
  const first = await submit(db, 3, "asd", sources);
  const retry = await submit(db, 3, "asd", sources);
  assert.deepEqual(first.rows, retry.rows);
  assert.equal(first.rows[0].result.length, 3);
  assert.deepEqual((await db.query("select coins from users order by user_id")).rows, [{coins:100},{coins:500}]);
  assert.equal((await db.query("select * from salary_withdraw_requests")).rows.length, 3);
});
test("bank applies the minimum per department, preserving source account and rollback", async (t) => {
  const db = await fixture(t);
  await change(db, primary, alt, "request");
  await change(db, alt, primary, "confirm");
  await assert.rejects(submit(db, 1, "bank", [["qiunai", primary, 600], ["qiunai", alt, 400]], "separate"), /1,000|不足/);
  await assert.rejects(submit(db, 2, "bank", [["qiunai", primary, 600], ["qiunai", alt, 600, 15]], "separate"), /手續費已變更/);
  assert.equal((await db.query("select * from salary_withdraw_requests")).rows.length, 0);
  await submit(db, 3, "bank", [["qiunai", primary, 600], ["qiunai", alt, 600]], "separate");
  assert.deepEqual((await db.query("select discord_id,amount::integer from salary_withdraw_requests order by discord_id")).rows,
    [{discord_id:primary,amount:600},{discord_id:alt,amount:600}]);
  await assert.rejects(submit(db, 4, "bank", [["qiunai", primary, 1200]]), /等待審核/);
});
test("integer allocation does not assign money to zero-balance sources or exceed any account", () => {
  assert.deepEqual(allocateWithdrawal(100, { qiunai: 1000, deepnight: 0 }), { qiunai: 100, deepnight: 0 });
  const wallet = { key: "qiunai", sources: [
    { owner: primary, available: 2 }, { owner: alt, available: 2 }, { owner: other, available: 1 },
  ] };
  assert.deepEqual(linkedWithdrawalPlan([wallet], { qiunai: 4 }).map(({amount}) => amount), [2,1,1]);
  assert.throws(() => linkedWithdrawalPlan([wallet], { qiunai: 6 }), /超過/);
});

test("bank excludes ineligible accounts and can skip tiny shares without blocking the primary", () => {
  const source = (owner, available, extras = {}) => ({
    owner, available, serviceFee: 0, pendingBank: false, bankReady: true, ...extras,
  });
  const wallet = { key: "qiunai", sources: [
    source(primary, 50000),
    source(alt, 300, { serviceFee: 15 }),
    source(other, 5000, { bankReady: false }),
  ] };
  assert.deepEqual(linkedWithdrawalPlan([wallet], { qiunai: 2000 }, "bank").map(({owner, amount}) => [owner, amount]), [[primary, 2000]]);
  assert.deepEqual(linkedWithdrawalPlan([wallet], { qiunai: 50200 }, "bank").map(({amount}) => amount), [49901, 299]);
  wallet.sources[1].pendingBank = true;
  assert.throws(() => linkedWithdrawalPlan([wallet], { qiunai: 50200 }, "bank"), /超過/);
  assert.ok(linkedWithdrawalPlan([wallet], { qiunai: 50200 }, "asd").some(({owner}) => owner === other));
  const tight = { key: "qiunai", sources: [source(primary, 1000), source(alt, 200, {serviceFee:15})] };
  assert.deepEqual(linkedWithdrawalPlan([tight], {qiunai: 1010}, "bank").map(({amount}) => amount), [842,168]);
});
