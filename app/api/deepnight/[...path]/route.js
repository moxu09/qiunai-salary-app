import { HR_CONFIG } from "@/lib/hrServer";
export const dynamic = "force-dynamic";
const allowed = new Set([
  "ensure-staff",
  "auth-links",
  "erp-access",
  "public-profile",
  "staff",
  "salary-wallet",
  "workspace",
  "hr",
  "activities",
  "announcements",
  "announcement-signing",
  "messages",
  "installers",
  "poll-vote",
  "performance-rank",
]);
async function proxy(request, { params }) {
  const { path } = await params;
  if (!allowed.has(path[0]) || path.some((p) => p === ".." || p.includes("/")))
    return Response.json({ ok: false, message: "找不到此服務" }, { status: 404 });
  const target = new URL(
    `/api/deepnight/${path.map(encodeURIComponent).join("/")}`,
    HR_CONFIG.deepnight.origin,
  );
  target.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    const out = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition"])
      if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json(
      { ok: false, message: "深夜服務暫時無法連線，請稍後重試" },
      { status: 502 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
