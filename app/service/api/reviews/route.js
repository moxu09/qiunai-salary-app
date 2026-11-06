import { SERVICE_STORES } from "@/lib/service/access";

const reviewEndpoint = "https://www.wearestilllhere.com/api/service";
const headers = { "Cache-Control": "no-store", Vary: "Authorization" };
const membershipActions = new Set([
  "invite_exclusive_member", "set_staff_role", "adjust_points",
  "review_redemption", "save_reward", "delete_reward",
]);
export const dynamic = "force-dynamic";

function reply(data, status = 200) {
  return Response.json(data, { status, headers });
}
function error(status, message) {
  return reply({ ok: false, message }, status);
}
async function legacyReview(request, body) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: error(401, "請使用 Discord 登入客服工作台") };
  }
  const upstream = await fetch(reviewEndpoint, {
    method: body ? "POST" : "GET",
    headers: { Authorization: authorization, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = await upstream.json();
  if (!upstream.ok) return { response: error(upstream.status >= 500 ? 503 : upstream.status,
    upstream.status >= 500 ? "審核服務暫時無法使用，請稍後重試" : data.error || "審核操作失敗") };
  return { data };
}

export async function GET(request) {
  try {
    const selected = new URL(request.url).searchParams.get("department");
    if (selected && !Object.hasOwn(SERVICE_STORES, selected)) return error(400, "店家不正確");
    const { data, response } = await legacyReview(request);
    if (response) return response;
    const departments = Object.entries(SERVICE_STORES).flatMap(([key, store]) =>
      data.allowedBrands?.includes(key) ? [{ key, name: store.name }] : []);
    const department = selected || departments[0]?.key;
    if (!departments.some(store => store.key === department)) return error(403, "沒有此店家的訂單審核權限");
    return reply({ ...data, ok: true, department, departments,
      reports: (data.reports || []).filter(item => item.brand === department),
      reviewHistory: (data.reviewHistory || []).filter(item => item.brand === department),
    });
  } catch {
    return error(503, "審核服務暫時無法使用，請稍後重試");
  }
}

export async function POST(request) {
  try {
    const department = new URL(request.url).searchParams.get("department");
    if (!Object.hasOwn(SERVICE_STORES, department || "")) return error(400, "店家不正確");
    const raw = await request.text();
    if (raw.length > 24000) return error(400, "審核資料太長");
    const body = JSON.parse(raw);
    if (body?.action === "review_report") {
      if (body.brand !== department || typeof body.approved !== "boolean" ||
          typeof body.reportId !== "string" || !body.reportId.trim() || body.reportId.length > 160 ||
          (!body.approved && (typeof body.note !== "string" || !body.note.trim() || body.note.length > 1000))) {
        return error(400, "請確認本店訂單及審核資料，駁回時請填寫原因");
      }
    } else if (!membershipActions.has(body?.action)) {
      return error(400, "不支援的審核操作");
    }
    const { data, response } = await legacyReview(request, body);
    return response || reply(data);
  } catch (failure) {
    if (failure instanceof SyntaxError) return error(400, "審核資料不正確");
    return error(503, "審核服務暫時無法使用，請稍後重試");
  }
}
