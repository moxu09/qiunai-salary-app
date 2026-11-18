import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { personnelProgress } from "@/lib/hrPersonnelProgress.mjs";
import { privateCourseCatalog } from "@/lib/service/courses";
import { hrAuth, hrFail } from "@/lib/hrServer";
import { getHrSigningTasks } from "@/lib/hrDocumentSigning";
import { hrSource, annotate } from "@/lib/hrUpstream";
import { hrNasSelected, hrReadHeaders, readHrNas } from "@/lib/hrNasRead.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const timings = [];
  async function timed(name, read) {
    const start = performance.now();
    try { return await read(); }
    finally { timings.push(`${name};dur=${Math.round(performance.now() - start)}`); }
  }
  try {
    const auth = await timed("auth", () => hrAuth(request));
    const { departments, discordId } = auth;
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
    const nas = hrNasSelected(request);
    const [personnel, signingTasks, workspaces] = await Promise.all([
      timed("personnel", async () => nas
        ? { data: await readHrNas(supabaseAdmin, auth, "personnel") }
        : supabaseAdmin.from("salary_requests")
          .select("id,organization_code,request_type,approval_category,request_group,status,created_at,review_result,reviewed_at,first_reviewed_at,first_review_note")
          .eq("discord_id", discordId).in("organization_code", departments.map(({ key }) => key))
          .order("created_at", { ascending: false }).limit(100)),
      timed("signing", () => getHrSigningTasks(auth)),
      Promise.all(departments.map(async ({ key }, index) => {
        const [data, documents, courses] = await Promise.all([
          timed(`workspace${index}`, () => hrSource(request, key, "workspace", { skipEmployeeDocuments: nas })),
          nas ? timed(`documents${index}`, () => readHrNas(supabaseAdmin, auth, "documents", { department: key })) : null,
          timed(`courses${index}`, () => privateCourseCatalog(key, discordId)).catch(() => null),
        ]);
        return { key, data, documents: nas ? documents : data.documents, courses };
      })),
    ]);
    if (personnel.error) throw personnel.error;
    const result = {
      ok: true,
      signingTasks,
      events: [],
      documents: [],
      templates: [],
      requests: [],
      personnelRequests: personnel.data.map((item) => ({
        ...item, organization: item.organization_code, stage: personnelProgress(item).stage,
      })),
      workflowTargetHours: 48,
      workflowStagesEnabled: false,
    };
    for (const { key, data, documents, courses } of workspaces) {
      for (const field of ["events", "documents", "templates", "requests"])
        result[field].push(
          ...annotate(
            field === "documents" ? documents : data[field],
            key,
            field === "templates" ? "name" : field === "requests" ? null : "title",
          ),
        );
      if (courses) result.documents.push(...courses);
      else result.serviceCoursesUnavailable = true;
      result.workflowStagesEnabled ||= data.workflowStagesEnabled === true;
    }
    result.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    result.documents.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    result.requests.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const headers = nas ? hrReadHeaders("personnel,documents") : { "Cache-Control": "no-store" };
    return Response.json(result, { headers: { ...headers, "Server-Timing": timings.join(", ") } });
  } catch (error) {
    return hrFail(error);
  }
}
export async function POST(request) {
  try {
    const { departments } = await hrAuth(request);
    const body = await request.json();
    if (body?.kind !== "request") throw Object.assign(Error("此入口只受理員工申請"), { status: 400 });
    const key = body.organization;
    if (!departments.some((d) => d.key === key))
      throw Object.assign(Error("無權向此部門提出申請"), { status: 403 });
    delete body.organization;
    return Response.json(await hrSource(request, key, "workspace", { method: "POST", body }));
  } catch (error) {
    return hrFail(error);
  }
}
