import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("離職只封存該店，結清本店薪資並保留既有提領，尾款只建立一次", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table salary_requests(id uuid primary key default gen_random_uuid(), organization_code text,
        discord_id text, staff_name text, request_type text, approval_category text, status text,
        reviewed_by text, reviewed_at timestamptz, review_result text, updated_at timestamptz, form_data jsonb);
      create table salary_withdraw_requests(id uuid primary key default gen_random_uuid(), app_key text, discord_id text,
        staff_name text, amount int, service_fee int, welfare_fee int, payout_amount int, status text,
        destination text, request_note text, requested_at timestamptz default now());
      create table hr_bank_payout_details(request_id uuid, primary_discord_id text, bank_name text, bank_account text check(bank_account <> '54321'));
      create table qiunai_staff(discord_id text primary key, is_active bool, is_online bool, can_take_order bool,
        updated_at timestamptz, bank_name text, bank_account text, real_name text);
      create table players(like qiunai_staff including all);
      create table qiunai_admins(discord_id text, is_active bool);
      create table admins(like qiunai_admins);
      create table salary_public_profiles(app_key text, discord_id text, is_active bool, is_online bool,
        can_take_order bool,is_featured bool, featured_month text,updated_at timestamptz);
      create table device_audit_role_memberships(organization_code text,discord_id text,is_active bool);
      create table hr_manager_memberships(organization_code text,discord_id text);
      create table erp_role_assignments(organization_code text,discord_id text,display_name text,role text,is_active bool,
        created_by text,updated_by text,updated_at timestamptz,unique(organization_code,discord_id));
      create table employment_contract_signings(discord_id text, organization_code text, contract_version text,
        status text, signed_at timestamptz, form_data jsonb);
      create table salary_wallet_entries(app_key text,discord_id text,staff_name text,entry_type text,amount numeric,
        source_table text,source_id text,source_label text,period_key text,settlement_date date,metadata jsonb,
        unique(app_key,source_table,source_id,entry_type));
      create table qiunai_salary_orders(id uuid default gen_random_uuid(),discord_id text,staff_name text,staff_salary int,
        bonus_amount int,is_deleted bool,status text,order_finished_at timestamptz,paid_at timestamptz,wallet_settled_at timestamptz,wallet_period_key text);
      create table play_orders(like qiunai_salary_orders including all, guild_id text, assigned_player text, order_type text);
      create table qiunai_staff_bonus(id uuid default gen_random_uuid(),discord_id text,staff_name text,amount int,
        created_at timestamptz,wallet_settled_at timestamptz,wallet_period_key text);
      create table players_bonus(like qiunai_staff_bonus including all);
      create function hr_salary_reviewer_role(org text, actor text) returns text
        language sql as $$select case when org='qiunai' and actor='manager' then 'Manager' else 'Staff' end$$;
      insert into qiunai_staff values ('employee',true,true,true,null,'test-bank','12345','Test'),
        ('unverified',true,true,true,null,'test-bank','67890','Test'),
        ('failed-bank',true,true,true,null,'test-bank','54321','Test');
      insert into players select * from qiunai_staff where discord_id='employee';
      insert into qiunai_admins values ('employee',true);
      insert into admins values ('employee',true);
      insert into hr_manager_memberships values ('qiunai','employee'),('deepnight','employee');
      insert into employment_contract_signings values
        ('employee','deepnight','v2.2','activated',now(),'{"bank_name":"test-bank","bank_account":"12345"}'),
        ('failed-bank','qiunai','v2.2','signed',now(),'{"bank_name":"test-bank","bank_account":"54321"}');
      insert into salary_wallet_entries(app_key,discord_id,amount,settlement_date)
        values ('qiunai','employee',300,current_date),('deepnight','employee',800,current_date),('qiunai','unverified',55,current_date),('qiunai','failed-bank',49,current_date);
      insert into salary_withdraw_requests(app_key,discord_id,amount,status,destination)
        values ('qiunai','employee',100,'pending','bank');
      insert into qiunai_salary_orders(discord_id,staff_name,staff_salary,bonus_amount,is_deleted,status,order_finished_at)
        values ('employee','Test',100,10,false,'已完成',now() - interval '1 second');
      insert into qiunai_staff_bonus(discord_id,staff_name,amount,created_at)
        values ('employee','Test',20,now() - interval '1 second');
    `);
    await db.exec(await readFile(new URL(
      "../supabase/migrations/20261114171000_hr_resignation_settlement.sql", import.meta.url,
    ), "utf8"));
    const add = async (person) => (await db.query(`
      insert into salary_requests(organization_code,discord_id,staff_name,request_type,approval_category,status)
      values('qiunai',$1,'Test','離職申請書','administrative','pending') returning id
    `, [person])).rows[0].id;
    const approve = async (id, org = "qiunai") => (await db.query(
      "select * from hr_approve_resignation($1,$2,'manager','Reviewer','已確認','2000-01-01')", [id, org],
    )).rows[0];

    const id = await add("employee");
    await assert.rejects(() => approve(id, "deepnight"), /找不到離職申請/);
    await assert.rejects(() => db.query("update salary_requests set status='approved' where id=$1", [id]), /EIP 人事簽核/);
    const done = await approve(id);
    assert.equal(done.status, "approved");
    assert.equal(done.form_data.withdrawal_amount, 330);
    assert.equal(done.form_data.settlement_status, "withdrawal_pending");
    assert.equal(done.form_data.unpaid_sources, false);
    await approve(id);
    assert.deepEqual((await db.query(
      "select amount,service_fee,payout_amount,status from salary_withdraw_requests where request_note is not null",
    )).rows, [{ amount: 330, service_fee: 0, payout_amount: 330, status: "pending" }]);
    assert.equal((await db.query("select is_active from qiunai_staff where discord_id='employee'")).rows[0].is_active, false);
    assert.equal((await db.query("select is_active from players where discord_id='employee'")).rows[0].is_active, true);
    assert.deepEqual((await db.query("select organization_code from hr_manager_memberships")).rows, [{ organization_code: "deepnight" }]);
    assert.equal((await db.query("select count(*)::int as n from hr_bank_payout_details")).rows[0].n, 1);
    await assert.rejects(() => db.query(
      "insert into salary_withdraw_requests(app_key,discord_id,amount,status,destination) values ('qiunai','employee',1,'pending','bank')",
    ), /離職尾款須交由財務處理/);
    await db.exec("insert into qiunai_staff(discord_id,is_active) values ('999999999999999999',false)");
    await assert.rejects(() => db.query(
      "insert into play_orders(guild_id,assigned_player) values ('1206138511535898654','999999999999999999')",
    ), /已停用/);
    await db.exec("insert into play_orders(guild_id,assigned_player,order_type) values ('1206138511535898654','999999999999999999','打賞')");
    await db.exec("insert into play_orders(guild_id,assigned_player) values ('1501098191813214312','999999999999999999')");
    const needsBankReview = await approve(await add("unverified"));
    assert.equal(needsBankReview.form_data.settlement_status, "bank_review");
    assert.equal(needsBankReview.form_data.withdrawal_id, null);

    const blocked = await add("failed-bank");
    await assert.rejects(() => approve(blocked), /check constraint/);
    assert.equal((await db.query("select status from salary_requests where id=$1", [blocked])).rows[0].status, "pending");
    assert.equal((await db.query("select is_active from qiunai_staff where discord_id='failed-bank'")).rows[0].is_active, true);
    assert.equal((await db.query("select count(*)::int as n from salary_withdraw_requests where discord_id='failed-bank'")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
