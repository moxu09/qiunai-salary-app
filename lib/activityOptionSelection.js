// Keep legacy single-choice requests compatible without losing saved multiple choices.
export function normalizeActivityOptionIds(activity, body, options, existingResponse = null) {
  if (body.optionIds === undefined && existingResponse?.selected_option_ids?.length > 1) {
    throw new Error("頁面版本過舊，請重新整理後再提交；原本的複選報名已保留");
  }
  if (body.status !== "attending") return [];
  const raw = body.optionIds === undefined
    ? (body.optionId ? [body.optionId] : []) : body.optionIds;
  if (!Array.isArray(raw) || raw.length > 20 ||
      raw.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("活動選項格式不正確");
  }
  const ids = [...new Set(raw.map((id) => id.trim()))];
  if (!activity.allow_multiple_options && ids.length > 1) {
    throw new Error("此活動只能選擇一個活動選項");
  }
  const allowed = new Set(options.map((option) => option.id));
  if (ids.some((id) => !allowed.has(id))) throw new Error("活動選項不屬於此活動");
  if (options.length && !ids.length) throw new Error("請至少選擇一個活動選項");
  return options.filter((option) => ids.includes(option.id)).map((option) => option.id);
}
