import { serviceAuth, serviceFail, SERVICE_STORES } from "@/lib/service/access";

const BOT_ORIGINS = {
  qiunai: "https://vigilant-rebirth-production-6af8.up.railway.app",
  deepnight: "https://superb-perfection-production-ba97.up.railway.app",
};
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const actor = await serviceAuth(request);
    const department = new URL(request.url).searchParams.get("department");
    if (!actor.departments.some((store) => store.key === department)) {
      throw Object.assign(Error("沒有此店家的客服權限"), { status: 403 });
    }
    const token = process.env[SERVICE_STORES[department].token];
    if (!token) throw Object.assign(Error("禮物清單暫時無法讀取"), { status: 503 });
    const catalog = await fetch(BOT_ORIGINS[department] + "/service-gifts", {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    }).then(response => response.ok ? response.json() : null).catch(() => null);
    if (catalog?.organization !== department || !Array.isArray(catalog.regular)) {
      throw Object.assign(Error("禮物清單暫時無法讀取"), { status: 503 });
    }
    return Response.json({ regular: catalog.regular, heart: catalog.heart }, {
      headers: { "Cache-Control": "no-store", Vary: "Authorization" },
    });
  } catch (error) {
    return serviceFail(error);
  }
}
