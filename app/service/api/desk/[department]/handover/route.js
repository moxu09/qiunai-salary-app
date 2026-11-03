import {SERVICE_STORES} from '@/lib/service/access';
import {allowedHandoverChannel,handoverChannelReferences,handoverDisplayContent,handoverMessage,QIUNAI_HANDOVER_CHANNEL} from '@/lib/service/handoverFeed.mjs';
import {manualActor,deskError} from '@/lib/service/manualServer';

export const dynamic = 'force-dynamic';
const pageCache = new Map();

const channelCache = new Map();
const CHANNEL_TTL = 5 * 60_000;

async function readChannel(token, id, deadline) {
 const cached = channelCache.get(id);
 if (cached && cached.until > Date.now()) return cached.promise;
 const remaining = deadline - Date.now();
 if (remaining <= 0) return null;
 const promise = (async () => {
  try {
   const response = await fetch(`https://discord.com/api/v10/channels/${id}`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(Math.min(remaining, 2500)),
    cache: 'no-store',
   });
   if (!response.ok) return null;
   return allowedHandoverChannel(await response.json(), id);
  } catch {
   return null;
  }
 })();
 const entry = { promise, until: Date.now() + CHANNEL_TTL };
 channelCache.set(id, entry);
 if (channelCache.size > 1500) channelCache.delete(channelCache.keys().next().value);
 const channel = await promise;
 if (!channel) entry.until = Date.now() + 30_000;
 return channel;
}

async function addChannelNames(token, messages) {
 const ids = [...new Set(messages.flatMap(message =>
  handoverChannelReferences(message.content).map(reference => reference.channelId)
 ))].slice(0, 100);
 const channels = new Map();
 const deadline = Date.now() + 3500;
 let cursor = 0;
 async function resolveChannels() {
  while (cursor < ids.length && Date.now() < deadline) {
   const id = ids[cursor++];
   const channel = await readChannel(token, id, deadline);
   if (channel) channels.set(id, channel);
  }
 }
 await Promise.all(Array.from({ length: Math.min(ids.length, 6) }, resolveChannels));
 return messages.map(message => ({
  ...message,
  displayContent: handoverDisplayContent(message.content, channels),
  links: message.links.map(link => {
   const channel = channels.get(link.channelId);
   return {
    ...link,
    name: channel && link.url === `https://discord.com/channels/${channel.guildId}/${link.channelId}`
     ? channel.name : null,
   };
  }),
 }));
}

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
  return {messages:await addChannelNames(token,raw.map(handoverMessage).filter(Boolean)),nextBefore:raw.length===100?raw.at(-1)?.id:null};
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
