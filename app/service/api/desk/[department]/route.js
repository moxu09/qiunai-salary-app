import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {manualActor,verifyDeskChannel,deskError} from '@/lib/service/manualServer';
import {validateDesk,discordChannel} from '@/lib/serviceManual.mjs';
export const dynamic='force-dynamic';
const columns='id,kind,owner_discord_id,label,body,customer_discord_id,guild_id,channel_id,url,priority,archived_at,version,created_by,updated_by,created_at,updated_at';
export async function GET(request,context){try{
 const {department}=await context.params,actor=await manualActor(request,department),url=new URL(request.url);const archive=url.searchParams.get('archived')==='1',only=url.searchParams.get('kind');
 const read=kind=>{if(only&&only!==kind)return {data:[],error:null};let q=supabaseAdmin.from('service_desk_records').select(columns).eq('organization_code',department).eq('kind',kind).order('priority',{ascending:false}).order('updated_at',{ascending:false});if(kind==='track')q=q.eq('owner_discord_id',actor.discordId);q=archive?q.not('archived_at','is',null):q.is('archived_at',null);return q.limit(url.searchParams.get('summary')==='1'?6:kind==='track'?50:1000);};
 const [notes,tracking,broadcasts]=await Promise.all([read('note'),read('track'),read('broadcast')]);if(notes.error||tracking.error||broadcasts.error)throw notes.error||tracking.error||broadcasts.error;
 return Response.json({ok:true,notes:notes.data,tracking:tracking.data,broadcasts:broadcasts.data},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
}catch(error){return deskError(error);}}
export async function POST(request,context){try{
 const {department}=await context.params,actor=await manualActor(request,department);const raw=await request.text();if(raw.length>64000)throw Object.assign(Error('備註內容太長'),{status:400});let input;try{input=JSON.parse(raw);}catch{throw Object.assign(Error('工作資料不正確'),{status:400});}
 if(!input||Object.keys(input).some(key=>!['id','version','action','record'].includes(key))||!['save','archive','restore'].includes(input.action)||input.id&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1))throw Object.assign(Error('工作資料不正確'),{status:400});
 let data={};if(input.action==='save'){
  if(input.record&&Object.keys(input.record).some(key=>!['kind','label','body','priority','customerId','url'].includes(key)))throw Object.assign(Error('工作資料含有無法使用的欄位'),{status:400});
  data=validateDesk(input.record);
  if(data.kind==='track'){const channel=discordChannel(input.record.url,department);data={...data,...await verifyDeskChannel(department,channel)};}
 }
 const {data:item,error}=await supabaseAdmin.rpc('service_desk_change',{p_org:department,p_actor:actor.discordId,p_id:input.id||null,p_version:input.version||null,p_action:input.action,p_data:data});if(error)throw error;
 return Response.json({ok:true,item},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
}catch(error){return deskError(error);}}
