import { HR_ROUTES } from "./hrRoutes.mjs";

export function legacyEmployeeTarget(hostname, pathname, search = "") {
  if (String(hostname).toLowerCase().split(":")[0] !== "qiunai.wearestilllhere.com")
    return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  const isStaff = path === "/staff" || path.startsWith("/staff/");
  if (path !== "/" && !isStaff && !Object.values(HR_ROUTES).includes(path)) return null;
  const target = new URL("https://hr.wearestilllhere.com");
  target.pathname = isStaff ? HR_ROUTES.workspace : path;
  target.search = search;
  return target;
}

export function isSupervisorHost(hostname) {
  return String(hostname).toLowerCase().split(":")[0] === "eip.wearestilllhere.com";
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
  const target = new URL("https://salary.wearestilllhere.com");
  target.pathname = pathname === "/" ? "/admin-login" : pathname;
  target.search = search;
  return target;
}
