import { serviceAuth, serviceFail } from "@/lib/service/access";
import { privateCourseCatalog } from "@/lib/service/courses";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export async function GET(request) {
 try {
  const actor = await serviceAuth(request);
  const requested = new URL(request.url).searchParams.get("department");
  const department = requested || actor.departments[0].key;
  if (!actor.departments.some((store) => store.key === department)) throw Object.assign(Error("沒有此店家的客服權限"), { status: 403 });
  const now = new Date().toISOString();
  const [{ data: templates, error }, { data: guides, error: guideError }, courses] = await Promise.all([
   supabaseAdmin.from("service_templates").select("id,organization_code,slug,category,title,description,fields,version,destination_label,destination_url")
    .eq("organization_code", department).eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`).order("category").order("title"),
   supabaseAdmin.from("service_guides").select("kind,content,updated_at").eq("organization_code", department),
   privateCourseCatalog(department, actor.discordId, true),
  ]);
  if (error || guideError) throw error || guideError;
  return Response.json({ ok: true, department, departments: actor.departments, actor: actor.discordId, templates, courses, guides: Object.fromEntries(guides.map((guide) => [guide.kind, guide.content])) }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
 } catch (error) { return serviceFail(error); }
}
