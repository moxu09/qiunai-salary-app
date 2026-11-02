import {supabase} from '@/lib/supabase';
import type {Department,Entry} from './types';
export async function serviceRequest(path:string,body?:unknown,signal?:AbortSignal){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Object.assign(Error('請使用 Discord 登入客服工作台'),{status:401});
 const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(result.message||'客服工作台暫時無法使用'),{status:response.status});return result;
}
export async function manualRequest(department:Department,kind='home',extra:Record<string,string>={},signal?:AbortSignal):Promise<Entry[]>{
 const result=await serviceRequest(`/service/api/manual?${new URLSearchParams({department,kind,...extra})}`,undefined,signal);return result.items;
}
export function safeHref(value?:string|null){if(typeof value!=='string')return null;if(value.startsWith('/service/')&&!value.includes('\\'))return value;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export async function copyText(value:string){if(!value)return false;try{await navigator.clipboard.writeText(value);return true;}catch{return false;}}
export function saveFile(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
