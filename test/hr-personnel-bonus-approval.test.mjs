import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("生日福利以該店簽約資料與前月薪資核對，兩店固定金額且覆核只能入帳一次", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table salary_requests(
        id uuid primary key default gen_random_uuid(), organization_code text not null, discord_id text not null,
        staff_name text not null, request_type text not null, request_group text default 'welfare',
        application_date date, status text not null, approval_category text default 'welfare',
        first_reviewed_by text, first_reviewed_at timestamptz, review_result text,
        reviewed_by text, reviewed_at timestamptz, updated_at timestamptz, form_data jsonb
      );
      create table qiunai_staff(discord_id text, is_active bool);
      create table players(discord_id text, is_active bool);
      create table qiunai_salary_orders(discord_id text, staff_salary int, is_deleted bool, order_finished_at timestamptz);
      create table play_orders(discord_id text, staff_salary int, is_deleted bool, guild_id text, order_finished_at timestamptz);
      create table employment_contract_signings(discord_id text, organization_code text, contract_version text, status text, signed_at timestamptz, form_data jsonb);
      create table qiunai_staff_bonus(
        id uuid primary key default gen_random_uuid(), discord_id text, staff_name text, title text, amount int,
        note text, created_at timestamptz
      );
      create table players_bonus(
        id uuid primary key default gen_random_uuid(), discord_id text, staff_name text, bonus_type text,
        description text, amount int check(bonus_type <> '月餅補助'), created_at timestamptz
      );
      create function hr_salary_reviewer_role(org text, actor text) returns text
      language sql as $$select case when actor = 'pic' then 'PIC' else 'Manager' end$$;
      insert into qiunai_staff values ('employee',true),('missing-birthday',true);
      insert into players values ('employee',true);
      insert into employment_contract_signings values ('employee','deepnight','v2.2','activated',now(),
        jsonb_build_object('birthday',to_char(now() at time zone 'Asia/Taipei','"2000"-MM-"01"')));
      insert into qiunai_salary_orders values ('employee',5000,false,
        (date_trunc('month',now() at time zone 'Asia/Taipei') - interval '1 hour') at time zone 'Asia/Taipei'),
        ('missing-birthday',5000,false,(date_trunc('month',now() at time zone 'Asia/Taipei') - interval '1 hour') at time zone 'Asia/Taipei');
      insert into play_orders values ('employee',5000,false,'1501098191813214312',
        (date_trunc('month',now() at time zone 'Asia/Taipei') - interval '1 hour') at time zone 'Asia/Taipei');
    `);
    await db.exec(await readFile(new URL(
      "../supabase/migrations/20261114170000_hr_personnel_bonus_approval.sql", import.meta.url,
    ), "utf8"));
    const apply = async (store, type, person = "employee", reviewed = true) => (await db.query(`
      insert into salary_requests(organization_code,discord_id,staff_name,request_type,status,first_reviewed_by,first_reviewed_at,form_data)
      values($1,$2,'Employee',$3,'pending',case when $4 then 'manager' end,case when $4 then now() end,'{}') returning id
    `, [store, person, type, reviewed])).rows[0].id;
    const approve = async (id, store, reviewer = "pic") => (await db.query(
      "select * from hr_approve_personnel_bonus($1,$2,$3,'Reviewer','已確認')", [id, store, reviewer],
    )).rows[0];

    await db.exec(`
      update employment_contract_signings
      set form_data = jsonb_build_object('birthday',
        to_char((now() at time zone 'Asia/Taipei') + interval '1 month','"2000"-MM-"01"'))
    `);
    await assert.rejects(() => apply("qiunai", "生日禮金"), /生日當月/);
    await db.exec(`
      update employment_contract_signings
      set form_data = jsonb_build_object('birthday',to_char(now() at time zone 'Asia/Taipei','"2000"-MM-"01"'))
    `);
    await assert.rejects(() => apply("deepnight", "生日禮金", "missing-birthday"), /須滿 5,000/);
    await assert.rejects(() => apply("qiunai", "生日禮金", "missing-birthday"), /生日當月/);
    await db.exec("update qiunai_salary_orders set staff_salary=4999 where discord_id='employee'");
    await assert.rejects(() => apply("qiunai", "生日禮金"), /須滿 5,000/);
    await db.exec("update qiunai_salary_orders set staff_salary=5000 where discord_id='employee'");
    const q = await apply("qiunai", "生日禮金");
    await assert.rejects(() => apply("qiunai", "生日禮金"), /今年已申請/);
    await assert.rejects(() => approve(q, "deepnight"), /找不到/);
    await assert.rejects(() => approve(q, "qiunai", "manager"), /PIC/);
    assert.equal((await approve(q, "qiunai")).form_data.approved_amount, 200);
    assert.equal((await approve(q, "qiunai")).status, "approved");
    assert.equal((await db.query("select sum(amount)::int as total from qiunai_staff_bonus")).rows[0].total, 200);

    const d = await apply("deepnight", "聖誕補助");
    assert.equal((await approve(d, "deepnight")).form_data.approved_amount, 100);
    const rollback = await apply("deepnight", "月餅補助");
    await assert.rejects(() => approve(rollback, "deepnight"), /check constraint/);
    assert.equal((await db.query("select status from salary_requests where id=$1", [rollback])).rows[0].status, "pending");
    assert.equal((await db.query("select sum(amount)::int as total from players_bonus")).rows[0].total, 100);
    const pending = await apply("qiunai", "肉粽補助", "employee", false);
    await assert.rejects(() => approve(pending, "qiunai"), /初核/);
    const { rows: [grants] } = await db.query(`
      select has_function_privilege('authenticated','hr_approve_personnel_bonus(uuid,text,text,text,text)','execute') as browser,
        has_function_privilege('service_role','hr_approve_personnel_bonus(uuid,text,text,text,text)','execute') as server
    `);
    assert.deepEqual(grants, { browser: false, server: true });
  } finally {
    await db.close();
  }
});
