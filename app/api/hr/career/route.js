import { hrAuth, hrFail, HR_CONFIG, allRows } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMonthlyOrderAmount } from "@/lib/creditedSalaryCommission";
import { careerSummary } from "@/lib/hrCareer.mjs";
import { filterShadowedSourceOrders } from "@/lib/playOrderDedupe";
import { hrSource } from "@/lib/hrUpstream";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const now = new Date().toISOString();
    const results = await Promise.all(
      departments.map(async ({ key, staff }) => {
        const orders = filterShadowedSourceOrders(
          await allRows(() => {
            let query = supabaseAdmin
              .from(HR_CONFIG[key].orders)
              .select("*")
              .eq("discord_id", discordId)
              .or("is_deleted.eq.false,is_deleted.is.null");
            if (key === "deepnight")
              query = query.or("guild_id.eq.1501098191813214312,guild_id.is.null");
            return query.order("id");
          }),
        );
        const [currentMonth, previousMonth] =
          key === "qiunai"
            ? await Promise.all([
                getMonthlyOrderAmount(supabaseAdmin, discordId, now),
                getMonthlyOrderAmount(supabaseAdmin, discordId, now, -1),
              ])
            : [0, 0];
        const ranking = await hrSource(request, key, "performance-rank");
        return {
          key,
          ...careerSummary(key, staff, orders, currentMonth, previousMonth, now),
          ranking: ranking.ranking || ranking.performance || null,
        };
      }),
    );
    return Response.json(
      { ok: true, departments: results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
