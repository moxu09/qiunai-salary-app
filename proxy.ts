import { NextResponse, type NextRequest } from "next/server";
import { legacyEmployeeTarget, supervisorTarget } from "@/lib/hrHostRouting.mjs";

// Existing supervisor routes proxy upstream; the service namespace stays local.
export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  if(hostname.toLowerCase().split(':')[0]==='eip.wearestilllhere.com' && ['/admin/workspace','/admin/department/qiunai/workspace'].includes(request.nextUrl.pathname.replace(/\/$/,''))){
    const local=request.nextUrl.clone();local.pathname='/service/manage';
    local.searchParams.set('department',request.nextUrl.pathname.includes('/qiunai/')?'qiunai':'deepnight');
    return NextResponse.rewrite(local);
  }
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
