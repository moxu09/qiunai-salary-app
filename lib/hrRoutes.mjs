export const HR_ROUTES = {
  workspace: "/collaboration/workspace",
  messages: "/collaboration/messages",
  calendar: "/collaboration/calendar",
  documents: "/collaboration/documents",
  knowledge: "/collaboration/knowledge",
  workflows: "/collaboration/workflows",
  activities: "/collaboration/activities",
  profile: "/personal/data",
  "admin-service": "/personal/administrative.service",
  welfare: "/personal/welfare",
  orders: "/order/order.details",
  tips: "/order/reward.details",
  bonuses: "/order/bonus.details",
  deductions: "/order/deduction.details",
  "approval-administrative": "/approval/administrative",
  "approval-reimbursement": "/approval/reimbursement",
  "approval-welfare": "/approval/welfare",
  "approval-leave": "/approval/leave",
  "approval-suspension": "/approval/suspension",
  downloads: "/resources/downloads",
  appearance: "/resources/appearance",
  "device-audit": "/audit/device",
};
export function hrTabForPath(path) {
  return Object.keys(HR_ROUTES).find((key) => HR_ROUTES[key] === path.replace(/\/$/, "")) || null;
}
export const HR_DEPARTMENTS = [
  { key: "qiunai", name: "秋奈電競", logo: "/brand/qiunai.png" },
  { key: "deepnight", name: "深夜不關燈", logo: "/brand/deepnight.png" },
];
export function allocateWithdrawal(total, balances) {
  if (!Number.isSafeInteger(total) || total < 1) throw Error("請輸入有效的整數金額");
  const entries = HR_DEPARTMENTS.filter((d) => Object.hasOwn(balances, d.key)).map((d) => [
    d.key,
    Math.max(0, Math.floor(Number(balances[d.key]) || 0)),
  ]);
  const available = entries.reduce((s, [, v]) => s + v, 0);
  if (total > available) throw Error("申請金額超過可提領餘額");
  let remaining = total;
  return Object.fromEntries(
    entries.map(([key, balance], index) => {
      const amount =
        index === entries.length - 1
          ? remaining
          : Math.min(balance, Math.floor((total * balance) / available));
      remaining -= amount;
      return [key, amount];
    }),
  );
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
