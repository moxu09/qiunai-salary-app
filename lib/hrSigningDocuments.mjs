export const HR_SIGNING_START = Date.parse("2026-12-01T00:00:00+08:00");

export const HR_SIGNING_DOCUMENTS = {
  "employment-v22": {
    title: "陪陪承攬合作契約書 v2.2",
    version: "v2.2",
    filename: "contract-v2.2.pdf",
    sha256: "abca0bf344776cd05038efe701b93f3c2577c8da38990c0f91fa4347668b2afe",
    pageCount: 18,
  },
  "manager-nda": {
    title: "Manager 保密協議書",
    version: "manager-nda-v1",
    filename: "manager-nda-v1.pdf",
    sha256: "280442e5e13d36f01e5308550a9af728cd3339b5d9f846280e529a7daf82e643",
    pageCount: 6,
  },
};

export function taipeiSigningAge(birthday, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const birth = new Date(birthday + "T00:00:00Z");
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthday) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const today = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${today.year}-${today.month}-${today.day}`;
  if (birthday > date || Number(birthday.slice(0, 4)) < 1900) return null;
  return Number(today.year) - Number(birthday.slice(0, 4)) - Number(date.slice(5) < birthday.slice(5));
}
