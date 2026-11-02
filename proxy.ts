import { NextResponse, type NextRequest } from "next/server";
import { legacyEmployeeTarget, supervisorTarget } from "@/lib/hrHostRouting.mjs";

// The new EIP host serves the existing supervisor application unchanged.
export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  const employeeTarget = legacyEmployeeTarget(
    hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (employeeTarget) return NextResponse.redirect(employeeTarget, 308);
  const target = supervisorTarget(
    hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  return target ? NextResponse.rewrite(target) : NextResponse.next();
}
export const config = { matcher: "/:path*" };
