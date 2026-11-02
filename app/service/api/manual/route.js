import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {manualActor,deskError} from '@/lib/service/manualServer';
import {MANUAL_KINDS} from '@/lib/serviceManual.mjs';
import {ADMIN_FILE_BUCKET} from '@/lib/adminFileStorage';
export const dynamic='force-dynamic';
export async function GET(request){try{
 const url=new URL(request.url),department=url.searchParams.get('department');await manualActor(request,department);
 const kind=url.searchParams.get('kind')||'home',slug=url.searchParams.get('slug'),search=(url.searchParams.get('q')||'').normalize('NFKC').trim();
 if(kind!=='home'&&!MANUAL_KINDS.includes(kind)||search.length>100||slug&&!/^[a-z0-9-]{1,80}$/.test(slug))throw Object.assign(Error('手冊查詢條件不正確'),{status:400});
 const now=new Date().toISOString(),full=kind!=='home'&&!search;
 let query=supabaseAdmin.from('service_manual_entries').select(`id,kind,slug,title,category,summary,version,sort_order,starts_at,ends_at,updated_at${full?',content':''}${kind==='price'?',storage_path':''}`)
 .eq('organization_code',department).eq('is_active',true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`).order('sort_order').order('slug');
 if(kind!=='home')query=query.eq('kind',kind);if(slug)query=query.eq('slug',slug);if(search)query=query.ilike('search_text','%'+search.replace(/[\\%_]/g,'\\$&')+'%');
 const {data,error}=await query.limit(search?80:1000);if(error)throw error;
 let items=data;
 if(kind==='price'){
  const paths=data.filter(row=>row.storage_path?.startsWith(`${department}/manual/`)).map(row=>row.storage_path);
  let signed=[];if(paths.length){const result=await supabaseAdmin.storage.from(ADMIN_FILE_BUCKET).createSignedUrls(paths,120);if(result.error)throw Error('Price image signing failed');signed=result.data;}
  items=data.map(({storage_path,...entry})=>({...entry,imageUrl:signed.find(file=>file.path===storage_path)?.signedUrl||null}));
 }
 return Response.json({ok:true,department,items,serverTime:now},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
}catch(error){return deskError(error);}}
