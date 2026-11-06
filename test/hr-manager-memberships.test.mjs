import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("only the PIC can grant or revoke HR Manager membership in an employee's department", async () => {
  const db = new PGlite();
  const owner = "847840193859682304";
  const manager = "100000000000000001";
  const admin = "100000000000000002";
  const staff = "100000000000000003";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table qiunai_staff(discord_id text, is_active boolean);
      create table players(discord_id text, is_active boolean);
      create table salary_requests(id int);
      create table eip_workflow_requests(id int);
      create function hr_salary_reviewer_role(p_org text, p_actor text) returns text
      language sql as $$ select case when p_actor = '${manager}' then 'Manager' else 'PIC' end $$;
      create function course_is_manager(p_org text, p_actor text) returns boolean
      language sql as $$ select true $$;
      insert into qiunai_staff values ('${manager}', true), ('${admin}', true), ('${staff}', true);
    `);
    const sql = await readFile(new URL("../supabase/migrations/20261106000300_hr_manager_memberships.sql", import.meta.url), "utf8");
    await db.exec(sql);
    const role = async (id, org = "qiunai") => (await db.query("select hr_salary_reviewer_role($1,$2) as role", [org, id])).rows[0].role;
    const set = (actor, member, grant, org = "qiunai") => db.query("select hr_set_manager($1,$2,$3,$4)", [org, actor, member, grant]);
    assert.equal(await role(owner), "PIC");
    assert.equal(await role(owner, "deepnight"), "PIC");
    assert.equal(await role(admin), "Staff");
    assert.equal(await role(manager), "Manager");
    assert.equal(await role(manager, "deepnight"), "Staff");
    await assert.rejects(() => set(manager, staff, true), /只有 PIC/);
    await assert.rejects(() => set(admin, manager, false), /只有 PIC/);
    await assert.rejects(() => set(owner, owner, false), /成員或部門/);
    await assert.rejects(() => set(owner, staff, true, "deepnight"), /在職員工/);
    await set(owner, staff, true);
    await set(owner, staff, true);
    assert.equal(await role(staff), "Manager");
    await db.query("update qiunai_staff set is_active=false where discord_id=$1", [staff]);
    assert.equal(await role(staff), "Staff");
    await set(owner, manager, false);
    await set(owner, manager, false);
    assert.equal(await role(manager), "Staff");
    const permissions = (await db.query(`select
      has_function_privilege('authenticated', 'hr_set_manager(text,text,text,boolean)', 'execute') as can_grant,
      has_table_privilege('service_role', 'hr_manager_memberships', 'insert') as can_write`)).rows[0];
    assert.deepEqual(permissions, { can_grant: false, can_write: false });
  } finally { await db.close(); }
});
