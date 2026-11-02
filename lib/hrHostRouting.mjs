export function supervisorTarget(hostname, pathname, search = "") {
  // A container's NextRequest URL may use its internal listening hostname.
  // Route by the HTTP authority supplied by the edge, including an optional port.
  const authority = String(hostname).toLowerCase().split(":")[0];
  if (authority !== "eip.wearestilllhere.com") return null;
  const target = new URL("https://salary.wearestilllhere.com");
  target.pathname = pathname === "/" ? "/admin-login" : pathname;
  target.search = search;
  return target;
}
