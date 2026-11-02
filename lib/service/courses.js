import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireService } from "./access";
import { requireCourseAudience } from '@/lib/courseAccess';
import { learnerSettings } from '@/lib/courseRules.mjs';
const columns = "id,organization_code,document_type,is_published,category,title,body,version,updated_at";
export async function loadKnowledgeCourse(organization, id, actor) {
 const { data: link, error: linkError } = await supabaseAdmin.from("service_course_links").select("is_published,managed,audience").eq("organization_code", organization).eq("document_id", id).maybeSingle();
 if (linkError) throw linkError;
 if (link) {
  if(link.managed) await requireCourseAudience(actor.discordId, organization, link.audience);
  else await requireService(actor.discordId, organization);
  if (!link.is_published) return null;
 }
 if(link?.managed){
  // Read content and its effective policy in one database snapshot, then check
  // that same policy again. A concurrent audience edit must not pair new content
  // with the earlier audience check.
  const result=await supabaseAdmin.from('service_course_links').select(`managed,audience,chapters,requirements,quiz,is_published,eip_workspace_documents!inner(${columns})`).eq('document_id',id).eq('organization_code',organization).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.is_published)return null;
  await requireCourseAudience(actor.discordId,organization,result.data.audience);
  return {...result.data.eip_workspace_documents,...learnerSettings(result.data),is_published:true,is_course:true};
 }
 let query = supabaseAdmin.from("eip_workspace_documents").select(columns).eq("organization_code", organization).eq("id", id).eq("document_type", "knowledge");
 if (!link) query = query.eq("is_published", true);
 const { data, error } = await query.maybeSingle();
 if (error) throw error;
 if(!data) return null;
 return { ...data, is_published: true, is_course: Boolean(link) };
}
export async function privateCourseCatalog(organization, discordId, alreadyAuthorized = false) {
 const { data: links, error } = await supabaseAdmin.from("service_course_links").select("document_id,managed,audience,eip_workspace_documents!inner(id,title,category,version,updated_at,organization_code,document_type)").eq("organization_code", organization).eq("is_published", true);
 if (error) throw error;
 const allowed=[];
 for(const link of links){
  try {
   if(link.managed) await requireCourseAudience(discordId,organization,link.audience);
   else if(!alreadyAuthorized) await requireService(discordId,organization);
   if(link.eip_workspace_documents?.document_type==='knowledge'&&link.eip_workspace_documents?.organization_code===organization)allowed.push({...link.eip_workspace_documents,organization,is_course:true,body:''});
  } catch(error){ if(error.status!==403)throw error; }
 }
 return allowed;
}
export async function loadCourseCompletion(organization, id, discordId, version) {
 const { data, error } = await supabaseAdmin.from("knowledge_course_completions").select("document_version,completed_at")
  .eq("organization_code", organization).eq("document_id", id).eq("discord_id", discordId).eq("document_version", version).maybeSingle();
 if (error) throw error;
 return data;
}
export async function completePrivateCourse(organization, id, discordId, version, source = "hr") {
 const { data: link, error: linkError } = await supabaseAdmin.from("service_course_links").select("document_id,managed,audience").eq("document_id", id).eq("organization_code", organization).eq("is_published", true).maybeSingle();
 if (linkError) throw linkError;
 if (!link) throw Object.assign(Error("課程不存在或尚未發布"), { status: 404 });
 if(link.managed) return learnCourse(organization,id,discordId,version,'complete',{},source);
 await requireService(discordId, organization);
 const { data, error } = await supabaseAdmin.rpc("complete_service_course_atomic", {
  p_organization: organization, p_document_id: id, p_discord_id: discordId, p_expected_version: version, p_source: source,
 });
 if (error) throw error;
 return data;
}
export async function loadCourseProgress(organization,id,discordId,version) {
 const {data,error}=await supabaseAdmin.from('course_learning_progress').select('read_chapters,study_seconds,quiz_score,quiz_attempts,review_status,review_note').eq('organization_code',organization).eq('document_id',id).eq('discord_id',discordId).eq('document_version',version).maybeSingle();
 if(error)throw error;
 return data;
}
export async function learnCourse(organization,id,discordId,version,action,input={},source='hr'){
 const {data:link,error}=await supabaseAdmin.from('service_course_links').select('managed,audience,is_published').eq('organization_code',organization).eq('document_id',id).maybeSingle();
 if(error)throw error;
 if(!link?.managed||!link.is_published)throw Object.assign(Error('找不到已發布課程'),{status:404});
 await requireCourseAudience(discordId,organization,link.audience);
 const {data,error:rpcError}=await supabaseAdmin.rpc('course_learning_atomic',{p_org:organization,p_id:id,p_actor:discordId,p_version:version,p_action:action,p_input:{...input,serviceAuthorized:link.audience?.kind==='service'},p_source:source});
 if(rpcError)throw rpcError;
 return data;
}
