import { HR_ROUTES } from "./hrRoutes.mjs";

export const SUPERVISOR_ORIGIN = "https://eip.wearestilllhere.com";
export const DEEPNIGHT_BACKEND_ORIGIN = "https://deepnight-salary-app-production.up.railway.app";
const OLD_QIUNAI_HOST = "qiunai.wearestilllhere.com";
const QIUNAI_SECTIONS = new Set([
  "staff", "salary", "payroll", "ranking", "approvals", "workspace",
  "activities", "files", "accounting", "activity-logs", "settings",
]);

function normalizedHost(hostname) {
  return String(hostname).toLowerCase().split(":")[0];
}

export function legacyQiunaiSupervisorTarget(hostname, pathname, search = "") {
  if (normalizedHost(hostname) !== OLD_QIUNAI_HOST) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  const target = new URL(SUPERVISOR_ORIGIN);
  target.search = search;
  target.searchParams.delete("embedded");
  if (path === "/admin-login") {
    target.pathname = path;
    target.searchParams.set("department", "qiunai");
    return target;
  }
  if (path !== "/admin" && !path.startsWith("/admin/")) return null;
  const section = path.split("/")[2];
  target.pathname = `/admin/department/qiunai/${QIUNAI_SECTIONS.has(section) ? section : "salary"}`;
  return target;
}

export function legacyEmployeeTarget(hostname, pathname, search = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  const isStaff = path === "/staff" || path.startsWith("/staff/");
  if (normalizedHost(hostname) !== OLD_QIUNAI_HOST && !(isSupervisorHost(hostname) && isStaff))
    return null;
  if (path !== "/" && !isStaff && !Object.values(HR_ROUTES).includes(path)) return null;
  const target = new URL("https://hr.wearestilllhere.com");
  target.pathname = isStaff ? HR_ROUTES.workspace : path;
  target.search = search;
  return target;
}

export function isSupervisorHost(hostname) {
  return normalizedHost(hostname) === "eip.wearestilllhere.com";
}

// These routes share the local collaboration/course database. The rest of the
// existing supervisor site, including its distinct JS chunks, stays upstream.
export function localSupervisorRoute(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/admin/workspace" || path === "/admin/department/qiunai/workspace" ||
    /^\/api\/(qiunai|deepnight)\/workspace(?:\/files)?$/.test(path) ||
    /^\/api\/qiunai\/(erp-access|admin-notifications|hr)$/.test(path);
}

export function supervisorTarget(hostname, pathname, search = "") {
  // A container's NextRequest URL may use its internal listening hostname.
  // Route by the HTTP authority supplied by the edge, including an optional port.
  if (!isSupervisorHost(hostname) || localSupervisorRoute(pathname)) return null;
  if (pathname === "/service" || pathname.startsWith("/service/")) return null;
  const target = new URL(DEEPNIGHT_BACKEND_ORIGIN);
  target.pathname = pathname === "/" ? "/admin-login" : pathname;
  target.search = search;
  return target;
}
