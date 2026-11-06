import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { courseManager,courseFailure } from '@/lib/courseAccess';
import { CourseError } from '@/lib/courseRules.mjs';
import { ADMIN_FILE_BUCKET,decodedName,uploadAdminFile,validateAdminFile,removeAdminFilePath } from '@/lib/adminFileStorage';
export const dynamic='force-dynamic';
async function contextFor(request,context){
 const {department,id}=await context.params;const actor=await courseManager(request,department);
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new CourseError('附件網址不正確',404);
 const {data,error}=await supabaseAdmin.from('eip_workspace_documents').select('id,version').eq('id',id).eq('organization_code',department).eq('document_type','knowledge').maybeSingle();
 if(error)throw error;if(!data)throw new CourseError('找不到課程',404);
 const folder=`${department}/workspace/${id}`;
 const listing=await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).list(folder,{limit:1000});if(listing.error)throw listing.error;
 const link=await supabaseAdmin.from('service_course_links').select('hidden_files').eq('document_id',id).eq('organization_code',department).maybeSingle();if(link.error)throw link.error;
 if(!link.data)throw new CourseError('請先儲存課程，再管理附件',409);
 return {department,id,actor:actor.discordId,version:data.version,folder,hidden:link.data?.hidden_files||[],files:listing.data.filter(file=>file.id).map(file=>({path:`${folder}/${file.name}`,name:decodedName(file.name),size:Number(file.metadata?.size||0),createdAt:file.created_at}))};
}
export async function GET(request,context){try{const c=await contextFor(request,context);const path=new URL(request.url).searchParams.get('download');if(path!==null){const file=c.files.find(file=>file.path===path);if(!file)throw new CourseError('找不到附件',404);const {data,error}=await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).createSignedUrl(path,60,{download:file.name});if(error)throw error;return Response.json({ok:true,url:data.signedUrl},{headers:{'Cache-Control':'no-store'}});}return Response.json({ok:true,files:c.files.filter(file=>!c.hidden.includes(file.path)),archivedFiles:c.files.filter(file=>c.hidden.includes(file.path))},{headers:{'Cache-Control':'no-store'}});}catch(error){return courseFailure(error);}}
async function change(c,path,action){const {data,error}=await supabaseAdmin.rpc('change_course_attachment',{p_org:c.department,p_actor:c.actor,p_id:c.id,p_path:path,p_action:action});if(error)throw error;return data;}
async function limitedForm(request){
 const chunks=[];let length=0;const reader=request.body?.getReader();if(!reader)throw new CourseError('請選擇附件');
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>27*1024*1024){await reader.cancel();throw new CourseError('單一檔案不得超過 25 MB',413);}chunks.push(value);}
 return new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:Buffer.concat(chunks)}).formData();
}
export async function POST(request,context){
 try{
  const c=await contextFor(request,context);
  if(Number(request.headers.get('content-length')||0)>27*1024*1024)throw new CourseError('單一檔案不得超過 25 MB',413);
  const form=await limitedForm(request);const file=form.get('file');
  try{validateAdminFile(file);}catch(error){throw new CourseError(error.message);}
  if(c.files.filter(file=>!c.hidden.includes(file.path)).length>=20)throw new CourseError('每門課程最多 20 個附件');
  const path=await uploadAdminFile({organization:c.department,category:`workspace/${c.id}`,file});
  let version;try{version=await change(c,path,'add');}catch(error){await removeAdminFilePath(path);throw error;}
  return Response.json({ok:true,version},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return courseFailure(error);}
}
async function toggle(request,context,action){try{const c=await contextFor(request,context);const raw=await request.text();if(raw.length>2000)throw new CourseError('附件資料不正確');let input;try{input=JSON.parse(raw);}catch{throw new CourseError('附件資料不正確');}if(!c.files.some(file=>file.path===input.path))throw new CourseError('找不到附件',404);const version=await change(c,input.path,action);return Response.json({ok:true,version},{headers:{'Cache-Control':'no-store'}});}catch(error){return courseFailure(error);}}
export const DELETE=(request,context)=>toggle(request,context,'hide');
export const PATCH=(request,context)=>toggle(request,context,'restore');
