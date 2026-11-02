import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { courseManager, courseFailure, requireCourseAudience } from '@/lib/courseAccess';
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
  const [documents,links,staff,reviews]=await Promise.all([
   checked(supabaseAdmin.from('eip_workspace_documents').select('id,title,category,body,version,updated_at,is_published').eq('organization_code',department).eq('document_type','knowledge').order('updated_at',{ascending:false}).limit(500)),
   checked(supabaseAdmin.from('service_course_links').select('*').eq('organization_code',department)),
   allRows(()=>supabaseAdmin.from(SERVICE_STORES[department].staff).select('discord_id,discord_name,display_name').or('is_active.is.null,is_active.eq.true').order('discord_id')),
   allRows(()=>supabaseAdmin.from('course_learning_progress').select('document_id,discord_id,document_version,read_chapters,study_seconds,quiz_score,review_status,review_note,reviewed_at').eq('organization_code',department).order('document_id').order('discord_id').order('document_version')),
  ]);
  return Response.json({ok:true,courses:documents.filter(document=>links.some(link=>link.document_id===document.id)).map(document=>({...document,settings:links.find(link=>link.document_id===document.id)||null})),staff:staff.map(person=>({id:person.discord_id,name:person.display_name||person.discord_name||person.discord_id})),reviews},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
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
export async function PATCH(request,context){
 try{
  const {department}=await context.params;const actor=await courseManager(request,department);const input=await readBody(request);
  if(!uuid.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1||!['approve','reject'].includes(input.action)||!/^\d{15,22}$/.test(input.employee)||typeof input.note!=='string'||input.note.length>1000)throw new CourseError('審核資料不正確');
  const link=await checked(supabaseAdmin.from('service_course_links').select('audience').eq('document_id',input.id).eq('organization_code',department).maybeSingle());
  if(!link)throw new CourseError('找不到課程',404);
  if(input.action==='approve')await requireCourseAudience(input.employee,department,link.audience);
  const result=await checked(supabaseAdmin.rpc('course_learning_atomic',{p_org:department,p_id:input.id,p_actor:actor.discordId,p_version:input.version,p_action:input.action,p_input:{employee:input.employee,note:input.note,serviceAuthorized:link.audience?.kind==='service'},p_source:'hr'}));
  return Response.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return courseFailure(error);}
}
