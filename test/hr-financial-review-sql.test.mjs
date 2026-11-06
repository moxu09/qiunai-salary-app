import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("HR money requests require separate Manager and PIC decisions through any database writer", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table erp_role_assignments(organization_code text, discord_id text, is_active boolean, role text);
      create table admins(discord_id text, is_active boolean, role text);
      create table qiunai_admins(discord_id text, is_active boolean);
      create table qiunai_staff(discord_id text, is_active boolean);
      create table players(discord_id text, is_active boolean);
      create table salary_requests(id int, organization_code text, discord_id text, status text,
        request_group text, approval_category text, request_type text, reviewed_by text,
        reviewed_at timestamptz, review_result text);
      create table eip_workflow_requests(id int, approval_steps jsonb, approval_step_index int,
        applicant_discord_id text, organization_code text, status text, decided_by text, decided_at timestamptz,
        decision_note text, first_approved_by text, first_approved_at timestamptz, first_approval_note text);
      insert into erp_role_assignments values
        ('qiunai','manager',true,'store_manager'), ('qiunai','pic',true,'super_admin'),
        ('deepnight','other-manager',true,'store_manager');
      insert into salary_requests values
        (1,'qiunai','staff','pending','administrative','reimbursement','代支報銷',null,null,null),
        (2,'qiunai','staff','pending','administrative','administrative','離職申請書',null,null,null),
        (3,'qiunai','staff','pending','administrative',null,'其他申請',null,null,null);
      insert into eip_workflow_requests values
        (1,'["manager","owner"]',0,'staff','qiunai','pending',null,null,null,null,null,null);
    `);
    const sql = await readFile(new URL("../supabase/migrations/20261106000200_hr_personnel_two_stage.sql", import.meta.url), "utf8");
    await db.exec(sql);
    const finalize = (who, id = 1) => db.query("update salary_requests set status='approved', reviewed_by=$1, reviewed_at=now() where id=$2", [who, id]);
    const initial = (who) => db.query("update salary_requests set first_reviewed_by=$1, first_reviewed_at=now() where id=1", [who]);
    await assert.rejects(() => finalize("manager"), /先由 Manager 初核/);
    await assert.rejects(() => finalize("pic"), /先由 Manager 初核/);
    await assert.rejects(() => initial("other-manager"), /由 Manager 初核/);
    await initial("manager");
    await assert.rejects(() => finalize("manager"), /由另一位 PIC/);
    await finalize("pic");
    await assert.rejects(() => finalize("manager"), /不可改寫/);
    await finalize("manager", 2);
    await assert.rejects(() => finalize("manager", 3), /先由 Manager 初核/);
    await assert.rejects(() => initial("other-manager"), /由 Manager 初核/);

    const workflowFinalize = (who) => db.query("update eip_workflow_requests set status='approved', decided_by=$1, decided_at=now()", [who]);
    await assert.rejects(() => workflowFinalize("pic"), /由 Manager 初核/);
    await db.exec("update eip_workflow_requests set approval_step_index=1, first_approved_by='manager', first_approved_at=now()");
    await assert.rejects(() => workflowFinalize("manager"), /由另一位 PIC/);
    await workflowFinalize("pic");
    await assert.rejects(() => workflowFinalize("manager"), /不可改寫/);
  } finally { await db.close(); }
});
