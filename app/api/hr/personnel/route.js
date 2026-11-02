import { hrAuth, hrFail } from "@/lib/hrServer";
import { hrSource, annotate } from "@/lib/hrUpstream";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { departments } = await hrAuth(request);
    const url = new URL(request.url);
    const month = url.searchParams.get("month") || "";
    const selected = url.searchParams.get("department") || departments[0].key;
    const result = {
      ok: true,
      requests: [],
      announcements: [],
      priorMonthSalary: 0,
      welfareEligible: false,
    };
    for (const { key } of departments) {
      const data = await hrSource(request, key, `hr?month=${encodeURIComponent(month)}`);
      result.requests.push(...annotate(data.requests, key));
      result.announcements.push(...annotate(data.announcements, key, "title"));
      if (key === selected) {
        result.priorMonthSalary = data.priorMonthSalary;
        result.welfareEligible = data.welfareEligible;
      }
    }
    result.requests.sort((a, b) =>
      String(b.application_date).localeCompare(String(a.application_date)),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return hrFail(error);
  }
}
export async function POST(request) {
  try {
    const { departments } = await hrAuth(request);
    const body = await request.formData();
    const key = body.get("organization");
    if (!departments.some((d) => d.key === key))
      throw Object.assign(Error("無權向此部門提出申請"), { status: 403 });
    body.delete("organization");
    return Response.json(await hrSource(request, key, "hr", { method: "POST", body }));
  } catch (error) {
    return hrFail(error);
  }
}
