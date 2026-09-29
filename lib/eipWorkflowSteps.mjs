import { WorkspaceInputError } from "./eipWorkspaceValidation.mjs";

const ALLOWED = new Set(["manager", "owner", "manager_then_owner"]);

export function stepsForRole(value) {
  if (!ALLOWED.has(value)) throw new WorkspaceInputError("簽核關卡設定不正確");
  return value === "manager_then_owner" ? ["manager", "owner"] : [value];
}

export function requestSteps(request, legacyRole = "manager") {
  const steps = request?.approval_steps;
  if (steps !== undefined && steps !== null) {
    if (Array.isArray(steps) && (steps.join(",") === "manager" || steps.join(",") === "owner" || steps.join(",") === "manager,owner")) return steps;
    throw new WorkspaceInputError("簽核關卡資料不正確，請聯繫管理員", 409);
  }
  return stepsForRole(legacyRole === "owner" ? "owner" : "manager");
}

export function planWorkflowDecision({ request, actorRole, actorId, status, note, legacyRole, now }) {
  const steps = requestSteps(request, legacyRole);
  const stage = Number(request.approval_step_index || 0);
  if (request.status !== "pending" || !Number.isInteger(stage) || stage < 0 || stage >= steps.length) {
    throw new WorkspaceInputError("申請已處理或關卡資料不正確，請重新整理", 409);
  }
  if (String(request.applicant_discord_id) === String(actorId)) throw new WorkspaceInputError("不得簽核自己的申請", 403);
  if (status !== "approved" && status !== "rejected") throw new WorkspaceInputError("簽核決定不正確");
  if (status === "rejected" && !note) throw new WorkspaceInputError("退回申請時須填寫原因");
  if (steps[stage] === "owner" && actorRole !== "super_admin") throw new WorkspaceInputError("此關卡須由最高管理員簽核", 403);
  if (steps[stage] === "manager" && steps.length === 2 && actorRole !== "store_manager") {
    throw new WorkspaceInputError("初審須由店經理簽核，最高管理員不能代替初審", 403);
  }
  if (steps[stage] === "manager" && !["store_manager", "super_admin"].includes(actorRole)) {
    throw new WorkspaceInputError("此關卡須由管理員簽核", 403);
  }
  if (stage > 0 && String(request.first_approved_by) === String(actorId)) {
    throw new WorkspaceInputError("初審與複審不可由同一人完成", 403);
  }
  const filters = { approval_step_index: stage, ...(stage > 0 ? { first_approved_by: request.first_approved_by } : {}) };
  if (status === "approved" && stage < steps.length - 1) {
    return { stage, steps, completed: false, filters, patch: {
      approval_step_index: stage + 1, first_approved_by: actorId,
      first_approved_at: now, first_approval_note: note,
    } };
  }
  return { stage, steps, completed: true, filters, patch: {
    status, decided_by: actorId, decision_note: note, decided_at: now,
  } };
}
