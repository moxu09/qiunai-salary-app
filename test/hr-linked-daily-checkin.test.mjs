import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("verified accounts share a Taiwan-day reward, even after unlinking", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.users (user_id text primary key, coins integer not null, last_checkin text);
    create table public.hr_account_links (
      primary_id text not null, alternate_id text not null, verified_at timestamptz,
      primary key (primary_id, alternate_id)
    );
    grant select,update on public.users to service_role;
    insert into public.users values
      ('main',0,null), ('alt1',0,null), ('alt2',0,null), ('pending',0,null),
      ('legacy-main',5,'2026-11-03'), ('legacy-alt',0,null),
      ('alt-first-main',0,null), ('alt-first',0,null);
    insert into public.hr_account_links values
      ('main','alt1',now()), ('main','alt2',now()), ('main','pending',null),
      ('legacy-main','legacy-alt',now()), ('alt-first-main','alt-first',now());
    set test.checkin_day = '2026-11-03';
  `);
  const sql = await readFile(new URL("../supabase/migrations/20261103001300_hr_linked_daily_checkin.sql", import.meta.url), "utf8");
  await db.exec(sql.replaceAll("(statement_timestamp() at time zone 'Asia/Taipei')::date", "current_setting('test.checkin_day')::date"));
  const claim = (id, date = "2026-11-03") => db.query(
    "update public.users set coins=coins+5,last_checkin=$2 where user_id=$1 returning coins", [id,date],
  );

  await db.exec("set role service_role");
  assert.equal((await claim("main")).rows[0].coins, 5);
  for (const id of ["alt1","alt2","legacy-alt"]) {
    await assert.rejects(claim(id), {code:"PDC01"});
  }
  assert.equal((await claim("pending")).rows[0].coins, 5);
  assert.equal((await claim("alt-first")).rows[0].coins, 5);
  await assert.rejects(claim("alt-first-main"), {code:"PDC01"});
  await assert.rejects(db.query("select * from public.hr_daily_checkin_reservations"), {code:"42501"});
  await db.exec("reset role");

  // Exercise unlink for a fresh reservation and for a pre-migration claim.
  await db.exec("select pg_advisory_xact_lock(hashtextextended('hr-account-links',0)); delete from public.hr_account_links where alternate_id in ('alt1','legacy-alt');");
  await assert.rejects(claim("alt1"), {code:"PDC01"});
  await assert.rejects(claim("legacy-alt"), {code:"PDC01"});
  assert.equal((await db.query("select coins from public.users where user_id='alt1'")).rows[0].coins, 0);
  await db.exec("set test.checkin_day = '2026-11-04'");
  await assert.rejects(claim("alt1"), {code:"PDC02"});
  assert.equal((await claim("alt1","2026-11-04")).rows[0].coins, 5);
});
