import { loadReferenceChannels } from '@/lib/service/referenceChannels';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { courseManager, courseFailure } from '@/lib/courseAccess';
import { validateCourse, CourseError } from '@/lib/courseRules.mjs';
import { SERVICE_STORES } from '@/lib/service/access';
import { allRows } from '@/lib/hrServer';
export const dynamic='force-dynamic';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function readBody(request){const raw=await request.text();if(raw.length>250000)throw new CourseError('課程資料過大',413);try{return JSON.parse(raw);}catch{throw new CourseError('課程資料不正確');}}
async function checked(query){const {data,error}=await query;if(error)throw error;return data;}
export async function GET(request,context){
 try{
  const {department}=await context.params;await courseManager(request,department);
  const [documents,links,staff,channels]=await Promise.all([
   checked(supabaseAdmin.from('eip_workspace_documents').select('id,title,category,body,version,updated_at,is_published').eq('organization_code',department).eq('document_type','knowledge').is('archived_at',null).order('updated_at',{ascending:false}).limit(500)),
   checked(supabaseAdmin.from('service_course_links').select('*').eq('organization_code',department)),
   allRows(()=>supabaseAdmin.from(SERVICE_STORES[department].staff).select('discord_id,discord_name,display_name').or('is_active.is.null,is_active.eq.true').order('discord_id')),
   loadReferenceChannels(department).catch(() => []),
  ]);
  return Response.json({ok:true,courses:documents.filter(document=>links.some(link=>link.document_id===document.id)).map(document=>({...document,settings:links.find(link=>link.document_id===document.id)||null})),staff:staff.map(person=>({id:person.discord_id,name:person.display_name||person.discord_name||person.discord_id})),channels},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
 }catch(error){return courseFailure(error);}
}
export async function POST(request,context){
 try{
  const {department}=await context.params;const actor=await courseManager(request,department);const input=await readBody(request);
  const course=validateCourse(input.course);
  if(input.id!=null&&(!uuid.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1))throw new CourseError('課程編號或版本不正確');
  if(course.audience.kind==='selected'){
   const staff=await checked(supabaseAdmin.from(SERVICE_STORES[department].staff).select('discord_id').in('discord_id',course.audience.ids).or('is_active.is.null,is_active.eq.true'));
   if(staff.length!==course.audience.ids.length)throw new CourseError('指定對象包含非本店或已停用的員工');
  }
  const item=await checked(supabaseAdmin.rpc('save_managed_course',{p_org:department,p_actor:actor.discordId,p_id:input.id||null,p_version:input.version||null,p_course:course}));
  return Response.json({ok:true,item},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return courseFailure(error);}
}
export async function DELETE(request, context) {
  try {
    const { department } = await context.params;
    const actor = await courseManager(request, department);
    const { id, version } = await readBody(request);
    if (!uuid.test(id) || !Number.isSafeInteger(version) || version < 1) {
      throw new CourseError("課程編號或版本不正確");
    }
    const archived = await checked(supabaseAdmin.rpc("archive_hr_course", {
      p_org: department, p_actor: actor.discordId, p_id: id, p_version: version,
    }));
    if (!archived) throw new CourseError("課程已更新或移除，請重新整理", 409);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseFailure(error); }
}
