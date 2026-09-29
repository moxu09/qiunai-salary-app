export const WORKFLOW_TARGET_HOURS = 48;

export function workflowOverdueBefore(now = Date.now()) {
  return new Date(now - WORKFLOW_TARGET_HOURS * 3600000).toISOString();
}
