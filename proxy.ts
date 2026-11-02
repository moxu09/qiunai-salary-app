import { NextResponse, type NextRequest } from "next/server";
import { supervisorTarget } from "@/lib/hrHostRouting.mjs";

// The new EIP host serves the existing supervisor application unchanged.
export function proxy(request: NextRequest) {
  const target = supervisorTarget(
    request.nextUrl.hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  return target ? NextResponse.rewrite(target) : NextResponse.next();
}
export const config = { matcher: "/:path*" };
