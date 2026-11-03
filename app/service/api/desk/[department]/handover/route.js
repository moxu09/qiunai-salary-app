import {SERVICE_STORES} from '@/lib/service/access';
import {handoverMessage,QIUNAI_HANDOVER_CHANNEL} from '@/lib/service/handoverFeed.mjs';
import {manualActor,deskError} from '@/lib/service/manualServer';

export const dynamic = 'force-dynamic';
const pageCache = new Map();

async function readPage(token,before){
 const key=before||'latest',cached=pageCache.get(key);
 if(cached&&cached.until>Date.now())return cached.promise;
 const query=new URLSearchParams({limit:'100'});
 if(before)query.set('before',before);
 const promise=(async()=>{
  const response=await fetch(`https://discord.com/api/v10/channels/${QIUNAI_HANDOVER_CHANNEL}/messages?${query}`,{
   headers:{Authorization:`Bot ${token}`},signal:AbortSignal.timeout(10000),cache:'no-store',
  });
  if(!response.ok)throw Object.assign(Error('交班頻道暫時無法讀取'),{status:503});
  const raw=await response.json();
  if(!Array.isArray(raw))throw Object.assign(Error('交班頻道資料格式不正確'),{status:503});
  return {messages:raw.map(handoverMessage).filter(Boolean),nextBefore:raw.length===100?raw.at(-1)?.id:null};
 })();
 pageCache.set(key,{promise,until:Date.now()+20000});
 if(pageCache.size>20)pageCache.delete(pageCache.keys().next().value);
 try{return await promise;}catch(error){pageCache.delete(key);throw error;}
}

export async function GET(request,context){try{
 const {department}=await context.params;
 await manualActor(request,department);
 if(department!=='qiunai')throw Object.assign(Error('此店沒有這個交班頻道'),{status:404});
 const before=new URL(request.url).searchParams.get('before');
 if(before&&!/^\d{15,22}$/.test(before))throw Object.assign(Error('交班頁碼不正確'),{status:400});
 const token=process.env[SERVICE_STORES.qiunai.token];
 if(!token)throw Object.assign(Error('交班頻道尚未設定'),{status:503});
 const page=await readPage(token,before);
 return Response.json({ok:true,...page},{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
}catch(error){return deskError(error);}}
