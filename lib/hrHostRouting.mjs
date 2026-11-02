export function supervisorTarget(hostname, pathname, search = "") {
  if (hostname !== "eip.wearestilllhere.com") return null;
  const target = new URL("https://salary.wearestilllhere.com");
  target.pathname = pathname === "/" ? "/admin-login" : pathname;
  target.search = search;
  return target;
}
