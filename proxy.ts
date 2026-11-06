import { NextResponse, type NextRequest } from "next/server";
import { isSupervisorHost, legacyEmployeeTarget, legacyQiunaiSupervisorTarget, supervisorTarget } from "@/lib/hrHostRouting.mjs";

// Existing supervisor routes proxy upstream; the service namespace stays local.
export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  const employeeTarget = legacyEmployeeTarget(
    hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (employeeTarget) return NextResponse.redirect(employeeTarget, 308);
  const legacySupervisor = legacyQiunaiSupervisorTarget(
    hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (legacySupervisor) return NextResponse.redirect(legacySupervisor, 308);
  if (isSupervisorHost(hostname)) {
    const path = request.nextUrl.pathname.replace(/\/+$/, "");
    if (path === "/api/eip-admin-entry") return NextResponse.next();
    if (path === "/admin" && request.nextUrl.searchParams.get("view") !== "overview") {
      const target = request.nextUrl.clone();
      target.pathname = "/eip-admin-entry";
      return NextResponse.rewrite(target);
    }
  }
  const target = supervisorTarget(
    hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  return target ? NextResponse.rewrite(target) : NextResponse.next();
}
export const config = { matcher: "/:path*" };
