import { hrAuth, hrFail } from "@/lib/hrServer";
import { hrSource, annotate } from "@/lib/hrUpstream";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { departments } = await hrAuth(request);
    const url = new URL(request.url);
    if (url.searchParams.has("audit")) {
      const key = url.searchParams.get("department");
      if (!departments.some((d) => d.key === key))
        throw Object.assign(Error("無權讀取此部門"), { status: 403 });
      return Response.json(
        await hrSource(
          request,
          key,
          `workspace?audit=${encodeURIComponent(url.searchParams.get("audit"))}`,
        ),
      );
    }
    const result = {
      ok: true,
      events: [],
      documents: [],
      templates: [],
      requests: [],
      workflowTargetHours: 48,
      workflowStagesEnabled: false,
    };
    for (const { key } of departments) {
      const data = await hrSource(request, key, "workspace");
      for (const field of ["events", "documents", "templates", "requests"])
        result[field].push(
          ...annotate(
            data[field],
            key,
            field === "templates" ? "name" : field === "requests" ? null : "title",
          ),
        );
      result.workflowStagesEnabled ||= data.workflowStagesEnabled === true;
    }
    result.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    result.documents.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    result.requests.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return hrFail(error);
  }
}
export async function POST(request) {
  try {
    const { departments } = await hrAuth(request);
    const body = await request.json();
    const key = body.organization;
    if (!departments.some((d) => d.key === key))
      throw Object.assign(Error("無權向此部門提出申請"), { status: 403 });
    delete body.organization;
    return Response.json(await hrSource(request, key, "workspace", { method: "POST", body }));
  } catch (error) {
    return hrFail(error);
  }
}
