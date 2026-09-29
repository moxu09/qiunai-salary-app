import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getErpAccessByDiscordId } from "@/lib/erpAccess";
import { WorkspaceInputError as InputError, validateFields as fields, validateAnswers as answers } from "@/lib/eipWorkspaceValidation.mjs";
import { WORKFLOW_TARGET_HOURS, workflowOverdueBefore } from "@/lib/eipWorkflowSla.mjs";
import { stepsForRole, requestSteps, planWorkflowDecision } from "@/lib/eipWorkflowSteps.mjs";

const TABLE = {
  event: "eip_workspace_events",
  document: "eip_workspace_documents",
  template: "eip_workflow_templates",
  request: "eip_workflow_requests",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCORD_ID = /^\d{15,22}$/;
function required(value, label, max = 120) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new InputError(`${label}需為 1～${max} 字`);
  return text;
}
function optional(value, max = 5000) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new InputError(`內容不可超過 ${max} 字`);
  return text;
}
function id(value) {
  if (!UUID.test(String(value || ""))) throw new InputError("項目編號不正確");
  return String(value);
}
function boolean(value) { return value === true; }
function date(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new InputError(`${label}不正確`);
  return parsed.toISOString();
}
async function body(request) {
  const raw = await request.text();
  if (raw.length > 80000) throw new InputError("提交內容過大", 413);
  try { return JSON.parse(raw); } catch { throw new InputError("資料格式不正確"); }
}
function fail(error) {
  if (!(error instanceof InputError)) console.error("EIP workspace error", error?.code || error?.name || "unknown");
  const missing = ["42P01", "PGRST202", "PGRST205"].includes(error?.code);
  return Response.json({
    ok: false,
    message: missing ? "協作資料表尚未啟用" : error instanceof InputError ? error.message : "協作服務暫時無法使用",
  }, { status: missing ? 503 : error?.status || 500, headers: { "Cache-Control": "no-store" } });
}
async function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function createEipWorkspaceHandlers(organization, staffTable) {
  const multistageEnabled = process.env.EIP_WORKFLOW_MULTISTAGE_ENABLED === "true";
  async function auth(request) {
    let discordId;
    try { ({ discordId } = await getAuthUserFromRequest(supabaseAdmin, request)); }
    catch { throw new InputError("請重新登入 EIP", 401); }
    if (!DISCORD_ID.test(String(discordId))) throw new InputError("登入資訊無效", 401);
    const staff = await checked(await supabaseAdmin.from(staffTable)
      .select("discord_id,discord_name,display_name,is_active")
      .eq("discord_id", discordId).maybeSingle());
    if (staff?.is_active === false) throw new InputError("停用中的員工帳號無法使用協作功能", 403);
    return { discordId, staff };
  }
  async function manager(discordId) {
    const access = await getErpAccessByDiscordId(supabaseAdmin, organization, discordId);
    if (!access.capabilities.canViewAllAdmin) throw new InputError("沒有管理協作資料的權限", 403);
    return access;
  }
  async function GET(request) {
    try {
      const actor = await auth(request);
      const params = new URL(request.url).searchParams;
      const admin = params.get("admin") === "1";
      const adminAccess = admin ? await manager(actor.discordId) : null;
      if (!admin && !actor.staff) throw new InputError("只有在職員工可以使用協作功能", 403);
      if (params.has("revisions")) {
        if (!admin) throw new InputError("沒有檢視修訂記錄的權限", 403);
        const revisions = await checked(await supabaseAdmin.from("eip_workspace_document_revisions")
          .select("version,title,body,category,is_published,changed_at")
          .eq("organization_code", organization).eq("document_id", id(params.get("revisions")))
          .order("version", { ascending: false }).limit(30));
        return Response.json({ ok: true, revisions }, { headers: { "Cache-Control": "no-store" } });
      }
      if (params.has("audit")) {
        const requestId = id(params.get("audit"));
        const item = await checked(await supabaseAdmin.from(TABLE.request).select("*")
          .eq("organization_code", organization).eq("id", requestId).maybeSingle());
        if (!item) throw new InputError("找不到申請", 404);
        if (!admin && item.applicant_discord_id !== actor.discordId) {
          throw new InputError("無權檢視此申請", 403);
        }
        const audit = await checked(await supabaseAdmin.from("eip_workflow_audit")
          .select(multistageEnabled ? "old_status,new_status,actor_discord_id,note,created_at,step_index" : "old_status,new_status,actor_discord_id,note,created_at")
          .eq("organization_code", organization).eq("request_id", requestId)
          .order("created_at", { ascending: true }).limit(100));
        return Response.json({ ok: true, item, audit }, { headers: { "Cache-Control": "no-store" } });
      }
      const requestStatus = params.get("status") || "pending";
      if (admin && !["pending", "approved", "rejected", "all"].includes(requestStatus)) {
        throw new InputError("申請狀態不正確");
      }
      const overdueOnly = admin && params.get("overdue") === "1";
      if (overdueOnly && requestStatus !== "pending") throw new InputError("逾期待辦僅能篩選待處理申請");
      const overdueBefore = workflowOverdueBefore();
      const page = admin ? Number(params.get("page") || 1) : 1;
      if (admin && (!Number.isSafeInteger(page) || page < 1 || page > 10000)) {
        throw new InputError("頁碼不正確");
      }
      const pageSize = 25;
      const eventQuery = supabaseAdmin.from(TABLE.event).select("*").eq("organization_code", organization)
        .gte("ends_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("starts_at").limit(200);
      const documentQuery = supabaseAdmin.from(TABLE.document).select("*").eq("organization_code", organization)
        .order("updated_at", { ascending: false }).limit(250);
      const templateQuery = supabaseAdmin.from(TABLE.template).select("*").eq("organization_code", organization)
        .order("created_at", { ascending: false }).limit(100);
      const requestQuery = supabaseAdmin.from(TABLE.request)
        .select("*", admin ? { count: "exact" } : undefined).eq("organization_code", organization)
        .order("created_at", { ascending: admin && requestStatus === "pending" });
      if (admin) {
        if (requestStatus !== "all") requestQuery.eq("status", requestStatus);
        if (overdueOnly) requestQuery.lt("created_at", overdueBefore);
        requestQuery.range((page - 1) * pageSize, page * pageSize - 1);
      } else {
        requestQuery.eq("applicant_discord_id", actor.discordId).limit(100);
      }
      if (!admin) {
        eventQuery.eq("is_published", true);
        documentQuery.eq("is_published", true);
        templateQuery.eq("is_active", true);
      }
      const summaryQuery = admin
        ? Promise.all(["pending", "approved", "rejected", "overdue"].map((status) => {
          const query = supabaseAdmin.from(TABLE.request).select("id", { count: "exact", head: true })
            .eq("organization_code", organization).eq("status", status === "overdue" ? "pending" : status);
          if (status === "overdue") query.lt("created_at", overdueBefore);
          return query;
        }))
        : Promise.resolve(null);
      const workspaceSummaryQuery = admin
        ? Promise.all([
          supabaseAdmin.from(TABLE.event).select("id", { count: "exact", head: true })
            .eq("organization_code", organization).eq("is_published", true)
            .gte("ends_at", new Date().toISOString()),
          supabaseAdmin.from(TABLE.document).select("id", { count: "exact", head: true })
            .eq("organization_code", organization).eq("is_published", true),
          supabaseAdmin.from(TABLE.template).select("id", { count: "exact", head: true })
            .eq("organization_code", organization).eq("is_active", true),
        ])
        : Promise.resolve(null);
      const [events, documents, templates, requestResult, summaryResults, workspaceSummaryResults] = await Promise.all([
        eventQuery.then(checked), documentQuery.then(checked),
        templateQuery.then(checked), requestQuery, summaryQuery, workspaceSummaryQuery,
      ]);
      const requests = await checked(requestResult);
      if (summaryResults) summaryResults.forEach((result) => { if (result.error) throw result.error; });
      if (workspaceSummaryResults) workspaceSummaryResults.forEach((result) => { if (result.error) throw result.error; });
      return Response.json({
        ok: true,
        events, documents, templates, requests, workflowTargetHours: WORKFLOW_TARGET_HOURS,
        workflowStagesEnabled: multistageEnabled,
        ...(admin ? {
          actorRole: adminAccess.role,
          requestSummary: Object.fromEntries(["pending", "approved", "rejected", "overdue"]
            .map((status, index) => [status, summaryResults[index].count || 0])),
          workspaceSummary: Object.fromEntries(["upcomingEvents", "publishedDocuments", "activeTemplates"]
            .map((name, index) => [name, workspaceSummaryResults[index].count || 0])),
          requestPagination: { page, pageSize, total: requestResult.count || 0, status: requestStatus, overdueOnly },
        } : {}),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return fail(error); }
  }
  async function POST(request) {
    try {
      const actor = await auth(request);
      const input = await body(request);
      const kind = String(input?.kind || "");
      if (kind === "request") {
        if (!actor.staff) throw new InputError("只有在職員工可以提交簽核", 403);
        const template = await checked(await supabaseAdmin.from(TABLE.template).select("*")
          .eq("organization_code", organization).eq("id", id(input.templateId)).eq("is_active", true).maybeSingle());
        if (!template) throw new InputError("此簽核表單已停用", 404);
        const form = answers(fields(template.fields), input.formData);
        const requestData = {
          organization_code: organization, template_id: template.id,
          applicant_discord_id: actor.discordId,
          applicant_name: actor.staff.display_name || actor.staff.discord_name || actor.discordId,
          form_data: form,
          ...(multistageEnabled ? { approval_steps: requestSteps(template, template.approver_role), approval_step_index: 0 } : {}),
        };
        const created = await checked(await supabaseAdmin.from(TABLE.request).insert(requestData).select("*").single());
        return Response.json({ ok: true, item: created }, { status: 201 });
      }
      await manager(actor.discordId);
      let data;
      if (kind === "event") {
        const startsAt = date(input.startsAt, "開始時間");
        const endsAt = date(input.endsAt, "結束時間");
        if (endsAt <= startsAt) throw new InputError("結束時間需晚於開始時間");
        data = { title: required(input.title, "日程名稱"), details: optional(input.details),
          location: optional(input.location, 160), starts_at: startsAt, ends_at: endsAt,
          is_published: boolean(input.isPublished) };
      } else if (kind === "document") {
        if (!["document", "knowledge"].includes(input.documentType)) throw new InputError("文件類型不正確");
        data = { document_type: input.documentType, title: required(input.title, "標題"),
          category: required(input.category || "一般", "分類", 50), body: optional(input.body, 30000) || "請下載下方附件閱讀全文。",
          is_published: boolean(input.isPublished) };
      } else if (kind === "template") {
        const selectedRole = input.approverRole || "manager";
        const approvalSteps = stepsForRole(selectedRole);
        if (approvalSteps.length > 1 && !multistageEnabled) throw new InputError("逐關簽核尚未啟用，請先完成資料庫遷移", 503);
        data = { name: required(input.name, "流程名稱", 100), description: optional(input.description, 2000),
          fields: fields(input.fields), approver_role: selectedRole === "owner" || selectedRole === "manager_then_owner" ? "owner" : "manager",
          ...(multistageEnabled ? { approval_steps: approvalSteps } : {}), is_active: boolean(input.isActive) };
      } else throw new InputError("操作類型不正確");
      const created = await checked(await supabaseAdmin.from(TABLE[kind]).insert({
        organization_code: organization, ...data, created_by: actor.discordId,
      }).select("*").single());
      return Response.json({ ok: true, item: created }, { status: 201 });
    } catch (error) { return fail(error); }
  }
  async function PATCH(request) {
    try {
      const actor = await auth(request);
      const input = await body(request);
      const kind = String(input?.kind || "");
      const itemId = id(input?.id);
      const access = await manager(actor.discordId);
      if (kind === "decision") {
        if (!["approved", "rejected"].includes(input.status)) throw new InputError("簽核決定不正確");
        const decisionNote = optional(input.note, 2000);
        if (input.status === "rejected" && !decisionNote) throw new InputError("退回申請時須填寫原因");
        const existing = await checked(await supabaseAdmin.from(TABLE.request).select("*")
          .eq("organization_code", organization).eq("id", itemId).maybeSingle());
        if (!existing) throw new InputError("找不到申請", 404);
        if (existing.applicant_discord_id === actor.discordId) throw new InputError("不得簽核自己的申請", 403);
        const template = await checked(await supabaseAdmin.from(TABLE.template).select("id,approver_role")
          .eq("organization_code", organization).eq("id", existing.template_id).maybeSingle());
        if (!template) throw new InputError("找不到簽核流程", 404);
        if (multistageEnabled) {
          const plan = planWorkflowDecision({ request: existing, actorRole: access.role,
            actorId: actor.discordId, status: input.status, note: decisionNote,
            legacyRole: template.approver_role, now: new Date().toISOString() });
          let query = supabaseAdmin.from(TABLE.request).update(plan.patch)
            .eq("organization_code", organization).eq("id", itemId).eq("status", "pending")
            .eq("approval_step_index", plan.stage);
          if (plan.stage > 0) query = query.eq("first_approved_by", existing.first_approved_by);
          const changed = await checked(await query.select("*").maybeSingle());
          if (!changed) throw new InputError("申請已由其他管理員處理，請重新整理", 409);
          return Response.json({ ok: true, item: changed, stageCompleted: plan.completed });
        }
        if (template.approver_role === "owner" && access.role !== "super_admin") throw new InputError("此流程須由最高管理員簽核", 403);
        const changed = await checked(await supabaseAdmin.from(TABLE.request).update({
          status: input.status, decided_by: actor.discordId,
          decision_note: decisionNote, decided_at: new Date().toISOString(),
        }).eq("organization_code", organization).eq("id", itemId).eq("status", "pending").select("*").maybeSingle());
        if (!changed) throw new InputError("申請已由其他管理員處理，請重新整理", 409);
        return Response.json({ ok: true, item: changed });
      }
      if (kind === "template") {
        const prior = await checked(await supabaseAdmin.from(TABLE.template).select("id").eq("organization_code", organization).eq("id", itemId).maybeSingle());
        if (!prior) throw new InputError("找不到流程", 404);
        const changed = await checked(await supabaseAdmin.from(TABLE.template).update({
          is_active: boolean(input.isActive), updated_at: new Date().toISOString(),
        }).eq("organization_code", organization).eq("id", itemId).select("*").single());
        return Response.json({ ok: true, item: changed });
      }
      if (kind === "event") {
        const startsAt = date(input.startsAt, "開始時間");
        const endsAt = date(input.endsAt, "結束時間");
        if (endsAt <= startsAt) throw new InputError("結束時間需晚於開始時間");
        const changed = await checked(await supabaseAdmin.from(TABLE.event).update({
          title: required(input.title, "日程名稱"), details: optional(input.details),
          location: optional(input.location, 160), starts_at: startsAt, ends_at: endsAt,
          is_published: boolean(input.isPublished), updated_at: new Date().toISOString(),
        }).eq("organization_code", organization).eq("id", itemId).select("*").maybeSingle());
        if (!changed) throw new InputError("找不到日程", 404);
        return Response.json({ ok: true, item: changed });
      }
      if (kind === "document") {
        const changed = await checked(await supabaseAdmin.from(TABLE.document).update({
          title: required(input.title, "標題"), body: optional(input.body, 30000) || "請下載下方附件閱讀全文。",
          category: required(input.category || "一般", "分類", 50), is_published: boolean(input.isPublished),
        }).eq("organization_code", organization).eq("id", itemId).eq("version", Number(input.version)).select("*").maybeSingle());
        if (!changed) throw new InputError("文件已由其他管理員修改，請重新整理", 409);
        return Response.json({ ok: true, item: changed });
      }
      throw new InputError("操作類型不正確");
    } catch (error) { return fail(error); }
  }
  return { GET, POST, PATCH };
}
