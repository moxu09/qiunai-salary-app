import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorkspaceInputError, validateFields, validateAnswers } from "../lib/eipWorkspaceValidation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const employee = "1206138511535898654";
const manager = "1552711165954756688";
const owner = "847840193859682304";
const templateId = "c14b93bb-1f84-489c-9072-8826a71b3eab";
const requestId = "9ef13ca3-4e1f-4a6c-815b-f32ce63ddda1";

function setup() {
  const calls = [];
  const records = {
    qiunai_staff: [
      { discord_id: employee, display_name: "員工", is_active: true },
      { discord_id: manager, display_name: "經理", is_active: true },
      { discord_id: owner, display_name: "老闆", is_active: true },
    ],
    eip_workflow_templates: [{
      id: templateId, organization_code: "qiunai", name: "測試流程", is_active: true,
      approver_role: "manager", fields: [{ key: "reason", label: "事由", type: "text", required: true, options: [] }],
    }],
    eip_workflow_requests: [{
      id: requestId, organization_code: "qiunai", template_id: templateId,
      applicant_discord_id: employee, status: "pending",
    }],
  };
  const supabaseAdmin = {
    from(table) {
      const filters = [];
      let inserted = null;
      let updated = null;
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return this; },
        insert(value) { inserted = value; calls.push({ table, inserted: value }); return this; },
        update(value) { updated = value; calls.push({ table, updated: value, filters }); return this; },
        result() {
          const rows = (records[table] || []).filter((item) => filters.every(([key, value]) => item[key] === value));
          if (updated && rows.length) Object.assign(rows[0], updated);
          return { data: inserted ? { id: requestId, ...inserted } : rows[0] || null, error: null };
        },
        maybeSingle() { return Promise.resolve(this.result()); },
        single() { return Promise.resolve(this.result()); },
      };
      return query;
    },
  };
  const source = readFileSync(join(root, "lib/eipWorkspace.js"), "utf8")
    .replace(/^import .*;\s*$/gm, "")
    .replace("export function createEipWorkspaceHandlers", "function createEipWorkspaceHandlers")
    .replace(/^export const workspaceValidation.*;\s*$/gm, "");
  const context = {
    supabaseAdmin,
    InputError: WorkspaceInputError,
    fields: validateFields,
    answers: validateAnswers,
    getAuthUserFromRequest: async (_db, request) => {
      if (!request.discordId) throw new Error("missing");
      return { discordId: request.discordId };
    },
    getErpAccessByDiscordId: async (_db, _org, discordId) => ({
      role: discordId === owner ? "super_admin" : discordId === manager ? "store_manager" : "employee",
      capabilities: { canViewAllAdmin: discordId === owner || discordId === manager },
    }),
    Response: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    console, Date, URL, String, Number, Object, Array, Set,
  };
  runInNewContext(`${source}\nthis.create = createEipWorkspaceHandlers;`, context);
  return { route: context.create("qiunai", "qiunai_staff"), records, calls };
}
const request = (discordId, body) => ({ discordId, text: async () => JSON.stringify(body) });

test("unauthenticated and ordinary employees cannot manage workspace content", async () => {
  const { route, calls } = setup();
  assert.equal((await route.POST(request(null, { kind: "event" }))).status, 401);
  assert.equal((await route.POST(request(employee, { kind: "event", title: "偽造" }))).status, 403);
  assert.equal(calls.length, 0);
});

test("staff submission uses authenticated applicant and server organization", async () => {
  const { route, calls } = setup();
  const result = await route.POST(request(employee, {
    kind: "request", templateId, formData: { reason: "請假" },
    organization_code: "deepnight", applicant_discord_id: owner,
  }));
  assert.equal(result.status, 201);
  const insert = calls.find((item) => item.inserted).inserted;
  assert.equal(insert.organization_code, "qiunai");
  assert.equal(insert.applicant_discord_id, employee);
  assert.equal(insert.form_data.reason, "請假");
});

test("maker cannot approve own request; manager decision is pending-only and audited by DB trigger", async () => {
  const { route, calls } = setup();
  assert.equal((await route.PATCH(request(employee, { kind: "decision", id: requestId, status: "approved" }))).status, 403);
  const result = await route.PATCH(request(manager, { kind: "decision", id: requestId, status: "approved", note: "符合規定" }));
  assert.equal(result.status, 200);
  const update = calls.find((item) => item.updated);
  assert.equal(update.updated.decided_by, manager);
  assert.ok(update.filters.some(([key, value]) => key === "organization_code" && value === "qiunai"));
  assert.ok(update.filters.some(([key, value]) => key === "status" && value === "pending"));
});

test("owner-only templates reject store manager decisions", async () => {
  const { route, records } = setup();
  records.eip_workflow_templates[0].approver_role = "owner";
  assert.equal((await route.PATCH(request(manager, { kind: "decision", id: requestId, status: "approved" }))).status, 403);
  assert.equal((await route.PATCH(request(owner, { kind: "decision", id: requestId, status: "approved" }))).status, 200);
});

test("workspace migration protects browser roles and records revisions", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20260929_eip_workspace.sql"), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.%I from anon, authenticated/i);
  assert.match(sql, /eip_workspace_document_revision before update/i);
  assert.match(sql, /eip_workflow_decision_audit after update of status/i);
});
