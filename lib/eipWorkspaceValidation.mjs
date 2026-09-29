export class WorkspaceInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function required(value, label, max = 120) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new WorkspaceInputError(`${label}需為 1～${max} 字`);
  return text;
}
export function validateFields(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new WorkspaceInputError("表單需設定 1～12 個欄位");
  const seen = new Set();
  return value.map((item) => {
    const key = required(item?.key, "欄位代碼", 40);
    if (!/^[a-z][a-z0-9_]*$/.test(key) || seen.has(key)) throw new WorkspaceInputError("欄位代碼需為不重複的英數字");
    seen.add(key);
    const label = required(item?.label, "欄位名稱", 60);
    const type = String(item?.type || "");
    if (!new Set(["text", "textarea", "date", "choice"]).has(type)) throw new WorkspaceInputError("欄位類型不正確");
    const options = type === "choice"
      ? [...new Set((Array.isArray(item?.options) ? item.options : []).map((entry) => required(entry, "選項", 80)))]
      : [];
    if (type === "choice" && (options.length < 2 || options.length > 20)) throw new WorkspaceInputError("單選欄位需設定 2～20 個選項");
    return { key, label, type, required: item?.required !== false, options };
  });
}
export function validateAnswers(formFields, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceInputError("表單內容不正確");
  const allowed = new Set(formFields.map((field) => field.key));
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new WorkspaceInputError("表單包含未定義欄位");
  return Object.fromEntries(formFields.map((field) => {
    const answer = String(value[field.key] ?? "").trim();
    if (field.required && !answer) throw new WorkspaceInputError(`請填寫「${field.label}」`);
    if (answer.length > 3000) throw new WorkspaceInputError(`「${field.label}」內容過長`);
    if (field.type === "choice" && answer && !field.options.includes(answer)) throw new WorkspaceInputError(`「${field.label}」選項不正確`);
    if (field.type === "date" && answer) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(answer);
      const parsed = match ? new Date(`${answer}T00:00:00Z`) : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== answer) {
        throw new WorkspaceInputError(`「${field.label}」日期不正確`);
      }
    }
    return [field.key, answer];
  }));
}
