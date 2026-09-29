import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stepsForRole, requestSteps, planWorkflowDecision } from "../lib/eipWorkflowSteps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = { status: "pending", applicant_discord_id: "employee", approval_steps: ["manager", "owner"], approval_step_index: 0 };
const decide = (request, actorRole, actorId, status = "approved", note = "") =>
  planWorkflowDecision({ request, actorRole, actorId, status, note, legacyRole: "owner", now: "2026-09-29T10:00:00Z" });

test("only the supported one- and two-stage sequences can be configured", () => {
  assert.deepEqual(stepsForRole("manager_then_owner"), ["manager", "owner"]);
  assert.deepEqual(stepsForRole("owner"), ["owner"]);
  assert.throws(() => stepsForRole("owner_then_manager"), /關卡設定不正確/);
  assert.throws(() => requestSteps({ approval_steps: ["owner", "manager"] }), /關卡資料不正確/);
  assert.deepEqual(requestSteps({}, "owner"), ["owner"]);
});

test("two-stage approval does not complete at the first step and requires separate roles", () => {
  assert.throws(() => decide(base, "super_admin", "owner"), /店經理/);
  const first = decide(base, "store_manager", "manager", "approved", "符合規定");
  assert.equal(first.completed, false);
  assert.equal(first.patch.approval_step_index, 1);
  assert.equal(first.patch.status, undefined);
  const secondRequest = { ...base, approval_step_index: 1, first_approved_by: "manager" };
  assert.throws(() => decide(secondRequest, "store_manager", "manager"), /最高管理員/);
  assert.throws(() => decide(secondRequest, "super_admin", "manager"), /同一人/);
  const final = decide(secondRequest, "super_admin", "owner", "approved", "複審通過");
  assert.equal(final.completed, true);
  assert.equal(final.patch.status, "approved");
  assert.equal(final.filters.first_approved_by, "manager");
});

test("rejecting either stage requires a reason; a terminal request cannot be decided again", () => {
  assert.throws(() => decide(base, "store_manager", "manager", "rejected"), /原因/);
  const rejected = decide(base, "store_manager", "manager", "rejected", "資料不齊");
  assert.equal(rejected.patch.status, "rejected");
  assert.throws(() => decide({ ...base, status: "approved" }, "store_manager", "manager"), /已處理/);
  assert.throws(() => decide({ ...base, applicant_discord_id: "manager" }, "store_manager", "manager"), /自己的申請/);
});

test("migration snapshots old templates and audits intermediate stage transitions", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20260929_eip_workflow_two_stage.sql"), "utf8");
  assert.match(sql, /where request\.template_id = template\.id and request\.approval_steps is null/i);
  assert.match(sql, /after update of status, approval_step_index/i);
  assert.match(sql, /new\.approval_step_index is distinct from old\.approval_step_index/i);
  assert.match(sql, /revoke all on function public\.eip_workflow_record_decision\(\) from public, anon, authenticated/i);
});
