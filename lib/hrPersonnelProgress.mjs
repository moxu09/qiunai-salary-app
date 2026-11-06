const moneyTypes = new Set(["查掛津貼", "代支報銷", "證照津貼申請書", "逾期補登單申請書"]);

export function isMoneyRequest(item) {
  return ["reimbursement", "welfare"].includes(item.approval_category) ||
    item.request_group === "welfare" || moneyTypes.has(item.request_type);
}

export function personnelProgress(item, role, actorId) {
  const financial = isMoneyRequest(item);
  const stage = financial ? item.first_reviewed_at ? "final" : "initial" : "general";
  const canReview = item.status === "pending" && String(item.discord_id) !== String(actorId) &&
    (stage === "initial" ? role === "Manager" :
      stage === "final" ? role === "PIC" && String(item.first_reviewed_by) !== String(actorId) :
      role === "PIC" || role === "Manager");
  return { stage, canReview };
}
