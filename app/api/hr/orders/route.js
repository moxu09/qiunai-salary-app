import { filterShadowedSourceOrders } from "@/lib/playOrderDedupe";
import { hrAuth, hrFail, HR_CONFIG, allRows } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { monthInputToTaipeiRange } from "@/lib/taipeiTime";
import { hrFinancialScope } from "@/lib/hrAccounts";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const auth = await hrAuth(request);
    const month = new URL(request.url).searchParams.get("month");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw Error("查詢月份格式錯誤");
    const { startIso, endIso } = monthInputToTaipeiRange(month);
    const departments = await hrFinancialScope(auth);
    const result = await Promise.all(
      departments.map(async ({ key, ids }) => {
        const c = HR_CONFIG[key];
        const loadOrders = () => {
          let query = supabaseAdmin.from(c.orders).select("*");
          if (key === "deepnight")
            query = query.or("guild_id.eq.1501098191813214312,guild_id.is.null");
          return query
            .in("discord_id", ids)
            .or("is_deleted.eq.false,is_deleted.is.null")
            .gte("order_finished_at", startIso)
            .lte("order_finished_at", endIso)
            .order("order_finished_at", { ascending: false })
            .order("id");
        };
        const orders = filterShadowedSourceOrders(await allRows(loadOrders));
        const bonuses = await allRows(() =>
          supabaseAdmin
            .from(c.bonuses)
            .select("*")
            .in("discord_id", ids)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("created_at", { ascending: false })
            .order("id"),
        );
        return { key, orders, bonuses };
      }),
    );
    return Response.json(
      { ok: true, departments: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
