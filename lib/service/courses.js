import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireService } from "./access";
const columns = "id,organization_code,document_type,is_published,category,title,body,version,updated_at";
export async function loadKnowledgeCourse(organization, id, actor) {
 const { data: link, error: linkError } = await supabaseAdmin.from("service_course_links").select("is_published").eq("organization_code", organization).eq("document_id", id).maybeSingle();
 if (linkError) throw linkError;
 if (link) {
  await requireService(actor.discordId, organization);
  if (!link.is_published) return null;
 }
 let query = supabaseAdmin.from("eip_workspace_documents").select(columns).eq("organization_code", organization).eq("id", id).eq("document_type", "knowledge");
 if (!link) query = query.eq("is_published", true);
 const { data, error } = await query.maybeSingle();
 if (error) throw error;
 return data ? { ...data, is_published: true, is_course: Boolean(link) } : null;
}
export async function privateCourseCatalog(organization, discordId, alreadyAuthorized = false) {
 if (!alreadyAuthorized) {
  const { canReadService } = await import("./access");
  if (!await canReadService(discordId, organization)) return [];
 }
 const { data: links, error } = await supabaseAdmin.from("service_course_links").select("document_id").eq("organization_code", organization).eq("is_published", true);
 if (error) throw error;
 if (!links.length) return [];
 const { data, error: documentsError } = await supabaseAdmin.from("eip_workspace_documents").select(columns)
  .eq("organization_code", organization).eq("document_type", "knowledge").in("id", links.map((link) => link.document_id));
 if (documentsError) throw documentsError;
 return data.map((document) => ({ ...document, organization, is_course: true }));
}
export async function loadCourseCompletion(organization, id, discordId, version) {
 const { data, error } = await supabaseAdmin.from("knowledge_course_completions").select("document_version,completed_at")
  .eq("organization_code", organization).eq("document_id", id).eq("discord_id", discordId).eq("document_version", version).maybeSingle();
 if (error) throw error;
 return data;
}
export async function completePrivateCourse(organization, id, discordId, version, source = "hr") {
 await requireService(discordId, organization);
 const { data: link, error: linkError } = await supabaseAdmin.from("service_course_links").select("document_id").eq("document_id", id).eq("organization_code", organization).eq("is_published", true).maybeSingle();
 if (linkError) throw linkError;
 if (!link) throw Object.assign(Error("課程不存在或尚未發布"), { status: 404 });
 const { data, error } = await supabaseAdmin.rpc("complete_service_course_atomic", {
  p_organization: organization, p_document_id: id, p_discord_id: discordId, p_expected_version: version, p_source: source,
 });
 if (error) throw error;
 return data;
}
