import { serviceAuth, serviceFail, SERVICE_STORES } from "@/lib/service/access";
import { privateCourseCatalog } from "@/lib/service/courses";
import { allRows } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export async function GET(request) {
 try {
  const actor = await serviceAuth(request);
  const requested = new URL(request.url).searchParams.get("department");
  const department = requested || actor.departments[0].key;
  if (!actor.departments.some((store) => store.key === department)) throw Object.assign(Error("沒有此店家的客服權限"), { status: 403 });
  const now = new Date().toISOString();
  const [{ data: templates, error }, { data: guides, error: guideError }, courses, staffRows] = await Promise.all([
   supabaseAdmin.from("service_templates").select("id,organization_code,slug,category,title,description,fields,version,destination_label,destination_url")
    .eq("organization_code", department).eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`).order("category").order("title"),
   supabaseAdmin.from("service_guides").select("kind,content,updated_at").eq("organization_code", department),
   privateCourseCatalog(department, actor.discordId, true),
   allRows(() => supabaseAdmin.from(SERVICE_STORES[department].staff)
    .select("discord_id,discord_name,display_name,salary_channel_id")
    .or("is_active.is.null,is_active.eq.true").order("discord_id")),
  ]);
  if (error || guideError) throw error || guideError;
  return Response.json({ ok: true, department, departments: actor.departments, actor: actor.discordId, templates, courses,
   staffDirectory: staffRows.filter((row) => /^\d{15,22}$/.test(String(row.salary_channel_id || ""))).map((row) => ({
    discordId: row.discord_id, name: row.display_name || row.discord_name || row.discord_id,
    url: `https://discord.com/channels/${SERVICE_STORES[department].guild}/${row.salary_channel_id}`,
   })), guides: Object.fromEntries(guides.map((guide) => [guide.kind, guide.content])) }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
 } catch (error) { return serviceFail(error); }
}
