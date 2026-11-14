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

function reviewerStage(request, actorRole, actorId, legacyRole) {
  const steps = requestSteps(request, legacyRole);
  const stage = Number(request.approval_step_index || 0);
  if (request.status !== "pending" || !Number.isInteger(stage) || stage < 0 || stage >= steps.length) {
    throw new WorkspaceInputError("申請已處理或關卡資料不正確，請重新整理", 409);
  }
  if (String(request.applicant_discord_id) === String(actorId)) throw new WorkspaceInputError("不得簽核自己的申請", 403);
  if (steps[stage] === "owner" && actorRole !== "PIC") throw new WorkspaceInputError("此關卡須由 PIC 簽核", 403);
  if (steps[stage] === "manager" && steps.length === 2 && actorRole !== "Manager") {
    throw new WorkspaceInputError("此關卡須由 Manager 初核", 403);
  }
  if (steps[stage] === "manager" && !["Manager", "PIC"].includes(actorRole)) {
    throw new WorkspaceInputError("此關卡須由管理員簽核", 403);
  }
  if (stage > 0 && String(request.first_approved_by) === String(actorId)) {
    throw new WorkspaceInputError("初審與複審不可由同一人完成", 403);
  }
  return { stage, steps };
}

export function canDecideWorkflow(request, actorRole, actorId, legacyRole, multistageEnabled = true) {
  if (!multistageEnabled && request.approval_steps?.length !== 2) {
    return request.status === "pending" && String(request.applicant_discord_id) !== String(actorId) &&
      (actorRole === "PIC" || (actorRole === "Manager" && legacyRole !== "owner"));
  }
  try {
    reviewerStage(request, actorRole, actorId, legacyRole);
    return true;
  } catch (error) {
    if (!(error instanceof WorkspaceInputError)) throw error;
    return false;
  }
}

export function planWorkflowDecision({ request, actorRole, actorId, status, note, legacyRole, now }) {
  if (status !== "approved" && status !== "rejected") throw new WorkspaceInputError("簽核決定不正確");
  if (status === "rejected" && !note) throw new WorkspaceInputError("退回申請時須填寫原因");
  const { stage, steps } = reviewerStage(request, actorRole, actorId, legacyRole);
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
