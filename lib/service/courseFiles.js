import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_FILE_BUCKET, createNamedAdminFileDownload, decodedName } from "@/lib/adminFileStorage";
import { loadKnowledgeCourse } from "./courses";
import { serviceFail } from "./access";
export function courseFileHandler(authorize, readReplicaIndex) {
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
   const index = course.is_course ? await readReplicaIndex?.(request, actor, department, id) : undefined;
   const hiddenPaths = new Set([...(hidden.data?.hidden_files || []), ...(index || [])]);
   const files = (data || []).filter((item) => item.id && !hiddenPaths.has(`${folder}/${item.name}`)).map((item) => ({ path: `${folder}/${item.name}`, name: decodedName(item.name), size: Number(item.metadata?.size || 0), createdAt: item.created_at, image: /^image\/(?:png|jpeg|webp|gif)$/i.test(item.metadata?.mimetype || "") }));
   const params = new URL(request.url).searchParams;
   const path = params.get('download');
   const headers = index ? { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie',
     'X-HR-Replica-Reads': 'attachment_index' } : { 'Cache-Control': 'no-store', Vary: 'Authorization' };
   if (path !== null) {
    const file = files.find((item) => item.path === path);
    if (!file) throw Object.assign(Error('找不到附件'), { status: 404 });
    const url = await createNamedAdminFileDownload(file.path, file.name);
    return Response.json({ ok: true, url }, { headers });
   }
   if (params.get('previews') === '1') {
    const images = files.filter(file => file.image && /\.(?:png|jpe?g|webp|gif)$/i.test(file.name));
    if (images.length) {
     const signed = await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).createSignedUrls(images.map(file => file.path), 300);
     if (!signed.error) {
      const urls = new Map((signed.data || []).map(file => [file.path, file.signedUrl]));
      return Response.json({ ok: true, files: files.map(file => ({...file,previewUrl:urls.get(file.path)||null})) }, { headers });
     }
    }
   }
   return Response.json({ ok: true, files }, { headers });
  } catch (error) { return serviceFail(error); }
 };
}
