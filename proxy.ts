import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isSupervisorHost, legacyEmployeeTarget, legacyQiunaiSupervisorTarget, legacyWorkspaceTarget, supervisorTarget } from "@/lib/hrHostRouting.mjs";

const NAS_RELAY = "http://eip-nas-private-relay.railway.internal:8080";
const CANARY_COOKIE = "__Host-eip-nas-canary";

const EIP_FORWARD_HEADERS = [
  "accept", "accept-encoding", "accept-language", "authorization", "content-length",
  "content-type", "if-match", "if-modified-since", "if-none-match", "if-range",
  "next-router-prefetch", "next-router-segment-prefetch", "next-router-state-tree",
  "next-url", "origin", "range", "referer", "rsc", "user-agent",
];

function hasCanaryCookie(request: NextRequest) {
  const expected = Buffer.from(process.env.EIP_NAS_CANARY_SECRET || "");
  const provided = Buffer.from(request.cookies.get(CANARY_COOKIE)?.value || "");
  return expected.length >= 32 && expected.length === provided.length && timingSafeEqual(expected, provided);
}

function nasRoute(request: NextRequest, hostname: string, target: URL) {
  if (!isSupervisorHost(hostname)) return null;
  const relayKey = process.env.EIP_NAS_RELAY_KEY;
  if (!relayKey || relayKey.length < 32) return null;
  const live = process.env.EIP_NAS_MODE === "live";
  if (!live && !hasCanaryCookie(request)) return null;

  const destination = new URL(NAS_RELAY);
  destination.pathname = target.pathname;
  destination.search = target.search;
  const headers = new Headers();
  for (const name of EIP_FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("x-eip-relay-key", relayKey);

  const rewrite = NextResponse.rewrite(destination, { request: { headers } });
  rewrite.headers.set("cache-control", "private, no-store");
  if (!live) rewrite.headers.append("vary", "Cookie");
  return rewrite;
}

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
  const workspaceTarget = legacyWorkspaceTarget(hostname, request.nextUrl.pathname);
  if (workspaceTarget) return NextResponse.redirect(workspaceTarget);
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
  if (!target) return NextResponse.next();
  return nasRoute(request, hostname, target) || NextResponse.rewrite(target);
}
export const config = { matcher: "/:path*" };
