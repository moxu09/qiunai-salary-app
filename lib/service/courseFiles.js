import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_FILE_BUCKET, decodedName } from "@/lib/adminFileStorage";
import { loadKnowledgeCourse } from "./courses";
import { serviceFail } from "./access";
export function courseFileHandler(authorize) {
 return async function GET(request, context) {
  try {
   const { department, id } = await context.params;
   if (!['qiunai','deepnight'].includes(department) || !/^[a-f0-9-]{36}$/i.test(id)) throw Object.assign(Error('附件網址不正確'), { status: 404 });
   const actor = await authorize(request);
   if (!actor.departments.some((store) => store.key === department)) throw Object.assign(Error('沒有此店家的課程權限'), { status: 403 });
   const course = await loadKnowledgeCourse(department, id, actor);
   if (!course) throw Object.assign(Error('找不到課程附件'), { status: 404 });
   const folder = `${department}/workspace/${id}`;
   const { data, error } = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
   if (error) throw error;
   const hidden=await supabaseAdmin.from('service_course_links').select('hidden_files').eq('organization_code',department).eq('document_id',id).maybeSingle();if(hidden.error)throw hidden.error;
   const files = (data || []).filter((item) => item.id && !hidden.data?.hidden_files?.includes(`${folder}/${item.name}`)).map((item) => ({ path: `${folder}/${item.name}`, name: decodedName(item.name), size: Number(item.metadata?.size || 0), createdAt: item.created_at }));
   const path = new URL(request.url).searchParams.get('download');
   const headers = { 'Cache-Control': 'no-store', Vary: 'Authorization' };
   if (path !== null) {
    const file = files.find((item) => item.path === path);
    if (!file) throw Object.assign(Error('找不到附件'), { status: 404 });
    const signed = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).createSignedUrl(file.path, 60, { download: file.name });
    if (signed.error) throw signed.error;
    return Response.json({ ok: true, url: signed.data.signedUrl }, { headers });
   }
   return Response.json({ ok: true, files }, { headers });
  } catch (error) { return serviceFail(error); }
 };
}
