import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorkspaceInputError, validateFields, validateAnswers } from "../lib/eipWorkspaceValidation.mjs";
import { WORKFLOW_TARGET_HOURS, workflowOverdueBefore } from "../lib/eipWorkflowSla.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const employee = "1206138511535898654";
const manager = "1552711165954756688";
const owner = "847840193859682304";
const templateId = "c14b93bb-1f84-489c-9072-8826a71b3eab";
const requestId = "9ef13ca3-4e1f-4a6c-815b-f32ce63ddda1";

function setup() {
  const calls = [];
  const records = {
    eip_workspace_events: [
      { id: "future-event", organization_code: "qiunai", is_published: true, ends_at: "2100-01-01T00:00:00Z" },
      { id: "past-event", organization_code: "qiunai", is_published: true, ends_at: "2020-01-01T00:00:00Z" },
    ],
    eip_workspace_documents: [
      { id: "published-doc", organization_code: "qiunai", is_published: true },
      { id: "draft-doc", organization_code: "qiunai", is_published: false },
    ],
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
    eip_workflow_audit: [{
      request_id: requestId, organization_code: "qiunai",
      old_status: "pending", new_status: "approved", actor_discord_id: owner,
      note: "符合規定", created_at: "2026-09-29T06:00:00Z",
    }],
  };
  const supabaseAdmin = {
    from(table) {
      const filters = [];
      let inserted = null;
      let updated = null;
      let selectedOptions = {};
      let range = null;
      let rowLimit = null;
      const query = {
        select(_columns, options) { selectedOptions = options || {}; return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        gte(key, value) { filters.push([key, { gte: value }]); return this; },
        lt(key, value) { filters.push([key, { lt: value }]); return this; },
        order() { return this; },
        limit(value) { rowLimit = value; return this; },
        range(from, to) { range = [from, to]; return this; },
        insert(value) { inserted = value; calls.push({ table, inserted: value }); return this; },
        update(value) { updated = value; calls.push({ table, updated: value, filters }); return this; },
        then(resolve, reject) {
          const rows = (records[table] || []).filter((item) => filters.every(([key, value]) =>
            value && typeof value === "object" && "gte" in value ? item[key] >= value.gte :
              value && typeof value === "object" && "lt" in value ? item[key] < value.lt : item[key] === value));
          calls.push({ table, filters: [...filters], range, selectedOptions });
          const visible = range ? rows.slice(range[0], range[1] + 1) : rowLimit ? rows.slice(0, rowLimit) : rows;
          return Promise.resolve({ data: selectedOptions.head ? null : visible, count: selectedOptions.count === "exact" ? rows.length : null, error: null }).then(resolve, reject);
        },
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
    WORKFLOW_TARGET_HOURS,
    workflowOverdueBefore,
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

test("documents can be created with attachments instead of typed body text", async () => {
  const { route, calls } = setup();
  const result = await route.POST(request(manager, {
    kind: "document", documentType: "knowledge", title: "操作手冊",
    category: "新人訓練", body: "", isPublished: false,
  }));
  assert.equal(result.status, 201);
  const insert = calls.find((item) => item.table === "eip_workspace_documents" && item.inserted).inserted;
  assert.equal(insert.body, "請下載下方附件閱讀全文。");
  assert.equal(insert.is_published, false);
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

test("rejected decisions require a reason", async () => {
  const { route, calls } = setup();
  assert.equal((await route.PATCH(request(manager, { kind: "decision", id: requestId, status: "rejected", note: " " }))).status, 400);
  assert.equal(calls.filter((item) => item.updated).length, 0);
});

test("admin inbox is status-filtered, paginated, and counted across all records", async () => {
  const { route, records, calls } = setup();
  for (let index = 0; index < 29; index++) {
    records.eip_workflow_requests.push({
      id: `9ef13ca3-4e1f-4a6c-815b-${String(index).padStart(12, "0")}`,
      organization_code: "qiunai", template_id: templateId,
      applicant_discord_id: employee, status: "pending",
    });
  }
  records.eip_workflow_requests.push({
    id: "9ef13ca3-4e1f-4a6c-815b-ffffffffffff", organization_code: "deepnight",
    template_id: templateId, applicant_discord_id: employee, status: "pending",
  });
  const result = await route.GET({ discordId: manager, url: "https://local.test/api/qiunai/workspace?admin=1&status=pending&page=2" });
  assert.equal(result.status, 200);
  assert.equal(result.body.requests.length, 5);
  assert.equal(result.body.requestSummary.pending, 30);
  assert.equal(result.body.requestPagination.total, 30);
  assert.equal(result.body.requestPagination.page, 2);
  assert.equal(result.body.workspaceSummary.upcomingEvents, 1);
  assert.equal(result.body.workspaceSummary.publishedDocuments, 1);
  assert.equal(result.body.workspaceSummary.activeTemplates, 1);
  const query = calls.find((item) => item.table === "eip_workflow_requests" && item.range);
  assert.deepEqual(query.range, [25, 49]);
  assert.ok(query.filters.some(([key, value]) => key === "organization_code" && value === "qiunai"));
  assert.equal((await route.GET({ discordId: manager, url: "https://local.test/api/qiunai/workspace?admin=1&status=invalid" })).status, 400);
});

test("overdue workflow inbox counts only old pending requests in the same organization", async () => {
  const { route, records, calls } = setup();
  records.eip_workflow_requests[0].created_at = new Date(Date.now() - 72 * 3600000).toISOString();
  records.eip_workflow_requests.push({
    id: "e013ca3e-4e1f-4a6c-815b-f32ce63ddda1", organization_code: "qiunai",
    template_id: templateId, applicant_discord_id: employee, status: "pending",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  });
  records.eip_workflow_requests.push({
    id: "e013ca3e-4e1f-4a6c-815b-f32ce63ddda2", organization_code: "deepnight",
    template_id: templateId, applicant_discord_id: employee, status: "pending",
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
  });
  const result = await route.GET({ discordId: manager, url: "https://local.test/api/qiunai/workspace?admin=1&status=pending&overdue=1" });
  assert.equal(result.status, 200);
  assert.equal(result.body.workflowTargetHours, 48);
  assert.equal(result.body.requestSummary.pending, 2);
  assert.equal(result.body.requestSummary.overdue, 1);
  assert.equal(result.body.requestPagination.total, 1);
  assert.equal(result.body.requests[0].id, requestId);
  assert.ok(calls.some((item) => item.table === "eip_workflow_requests" && item.filters.some(([key, value]) => key === "created_at" && value.lt)));
  assert.equal((await route.GET({ discordId: manager, url: "https://local.test/api/qiunai/workspace?admin=1&status=approved&overdue=1" })).status, 400);
});

test("audit history is visible only to its applicant or a scoped manager", async () => {
  const { route, records } = setup();
  const url = `https://local.test/api/qiunai/workspace?audit=${requestId}`;
  const own = await route.GET({ discordId: employee, url });
  assert.equal(own.status, 200);
  assert.equal(own.body.audit.length, 1);
  assert.equal((await route.GET({ discordId: manager, url })).status, 403);
  assert.equal((await route.GET({ discordId: manager, url: url + "&admin=1" })).status, 200);
  records.eip_workflow_requests[0].organization_code = "deepnight";
  assert.equal((await route.GET({ discordId: manager, url: url + "&admin=1" })).status, 404);
});

test("workspace migration protects browser roles and records revisions", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20260929_eip_workspace.sql"), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.%I from anon, authenticated/i);
  assert.match(sql, /eip_workspace_document_revision before update/i);
  assert.match(sql, /eip_workflow_decision_audit after update of status/i);
});
