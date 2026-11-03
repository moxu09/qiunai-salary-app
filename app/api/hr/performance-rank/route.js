import { hrAuth, hrFail } from "@/lib/hrServer";
import { hrSource } from "@/lib/hrUpstream";
import { recentRankingMonths } from "@/lib/hrRankMonths.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { departments } = await hrAuth(request);
    const month = new URL(request.url).searchParams.get("month");
    if (!recentRankingMonths().includes(month))
      throw Error("只能查詢最近 12 個月的業績排名");

    const rankings = await Promise.all(
      departments.map(async ({ key }) => {
        const result = await hrSource(request, key, `performance-rank?month=${month}`);
        const ranking = result.ranking || result.performance;
        if (!ranking || ranking.month !== month)
          throw Object.assign(Error("月份排名資料不一致，請稍後重試"), { status: 502 });
        return { key, ranking };
      }),
    );
    return Response.json(
      { ok: true, month, departments: rankings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
