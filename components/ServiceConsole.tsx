"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenText, ClipboardCheck, Copy, FileText, Headphones, LogIn, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";
type Department = "qiunai" | "deepnight";
type Field = { key: string; label: string; type: string; required?: boolean; maxLength?: number; options?: string[] };
type Template = { id: string; title: string; description: string; category: string; version: number; fields: Field[]; destination_label: string; destination_url?: string };
type GuideSection = { title: string; body?: string; summary?: string; items?: string[]; links?: {label: string; url: string}[] };
type Catalog = { actor: string; department: Department; departments: {key: Department;name: string}[]; templates: Template[]; staffDirectory?: {discordId: string; name: string; url: string}[]; courses: React.ComponentProps<typeof KnowledgeLibrary>['documents']; guides: Record<string, {title?: string;sections?: GuideSection[]}> };
const tabs = [{key:'duty',name:'值班指引',Icon:ClipboardCheck},{key:'courses',name:'完整教程',Icon:BookOpenText},{key:'templates',name:'套模板',Icon:Copy},{key:'resources',name:'工具與頻道',Icon:Headphones},{key:'rules',name:'規則查閱',Icon:FileText}];
function safeLink(url?: string) { try { const parsed = new URL(url || ''); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; } }
async function serviceRequest(path: string, body?: unknown) {
 const { data } = await supabase.auth.getSession();
 if (!data.session) throw Object.assign(Error('請使用 Discord 登入客服工作台'), { status: 401 });
 const response = await fetch(path, {method: body ? 'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result = await response.json();
 if (!response.ok) throw Object.assign(Error(result.message || '客服工作台暫時無法使用'), { status: response.status });
 return result;
}
export default function ServiceConsole() {
 const pathname = usePathname();
 const router = useRouter();
 const searchParams = useSearchParams();
 const queryDepartment = searchParams.get("department");
 const storedDepartment = queryDepartment === "qiunai" || queryDepartment === "deepnight" ? queryDepartment : "";
 const generation = useRef(0);
 const tab = tabs.find((item) => pathname === `/service/${item.key}` || pathname.startsWith(`/service/${item.key}/`))?.key || 'duty';
 const [department, setDepartment] = useState<Department | ''>('');
 const effectiveDepartment=(pathname.match(/^\/service\/courses\/(qiunai|deepnight)\//)?.[1] || storedDepartment || department) as Department | '';
 const [catalog, setCatalog] = useState<Catalog | null>(null);
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [needLogin,setNeedLogin] = useState(false);
 const [query,setQuery] = useState(''),[category,setCategory] = useState('all'),[selected,setSelected] = useState('');
 const [values,setValues] = useState<Record<string,string>>({}),[output,setOutput] = useState(''),[notice,setNotice] = useState(''),[renderError,setRenderError] = useState(''),[busy,setBusy] = useState(false);
 const [checked,setChecked] = useState<Record<string,boolean>>({});
 const [revision,setRevision] = useState(0);
 const reload = useCallback(()=>setRevision((value)=>value+1),[]);
 useEffect(()=>{
  let cancelled=false;
  generation.current++;
  void Promise.resolve().then(async()=>{
   setLoading(true);setError('');setNeedLogin(false);setCatalog(null);
   try { const result=await serviceRequest(`/service/api/catalog${effectiveDepartment?`?department=${effectiveDepartment}`:''}`);if(!cancelled)setCatalog(result); }
   catch(caught) {if(!cancelled){setError(caught instanceof Error?caught.message:'讀取失敗');setNeedLogin((caught as {status?:number})?.status===401);}}
   finally {if(!cancelled)setLoading(false);}
  });
  return ()=>{cancelled=true;};
 },[effectiveDepartment,revision]);
 useEffect(()=>{const {data}=supabase.auth.onAuthStateChange(()=>setTimeout(reload,0));return()=>data.subscription.unsubscribe();},[reload]);
 async function login(){setError('');const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:`${window.location.origin}${pathname}${effectiveDepartment?`?department=${effectiveDepartment}`:''}`}});if(error)setError('Discord 登入暫時無法開啟，請稍後重試');}
 const currentDepartment=catalog?.department||effectiveDepartment;
 const template=catalog?.templates.find((item)=>item.id===selected);
 function selectTemplate(id:string){generation.current++;setSelected(id);setValues({});setOutput('');setNotice('');setRenderError('');}
 async function render(){if(!template||!catalog||busy)return;const current=generation.current;setBusy(true);setRenderError('');setOutput('');
  try{const result=await serviceRequest(`/service/api/templates/${template.id}/render`,{department:catalog.department,version:template.version,values});if(current===generation.current)setOutput(result.text);}
  catch(caught){if(current===generation.current)setRenderError(caught instanceof Error?caught.message:'產生模板失敗');}finally{setBusy(false);}
 }
 async function copy(){try{await navigator.clipboard.writeText(output);setNotice('已複製，可貼到指定頻道');}catch{setNotice('請選取下方文字，手動複製');}}
 function download(){const url=URL.createObjectURL(new Blob([output],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${template?.title||'客服模板'}.txt`;link.click();URL.revokeObjectURL(url);}
 function checkItem(key:string,checked:boolean){setChecked((old)=>({...old,[key]:checked}));}
 const shown=catalog?.templates.filter((item)=>(category==='all'||item.category===category)&&[item.title,item.description].some((value)=>value.includes(query.trim())))||[];
 const guide=catalog?.guides[tab];
 return <main className={`service-console service-store-${catalog?.department||'qiunai'}`}>
  <header className="service-header"><div className="service-brand"><img src="/service/assets/brand/qiunai.png" alt="秋奈" width={48} height={48}/><img src="/service/assets/brand/deepnight-gold.png" alt="深夜" width={48} height={48}/><div><span>QIUNAI × DEEPNIGHT</span><h1>客服工作台</h1></div></div><a href="https://hr.wearestilllhere.com/collaboration/knowledge">前往 HR 知識庫</a></header>
  <section className="service-hero"><div><span>每一次回覆，都有人陪你一起完成</span><h2>讓值班更順手。</h2><p>查閱完整教程、選擇店家、填入欄位，產生清楚一致的客服訊息。</p></div><Headphones size={72} strokeWidth={1.25} aria-hidden="true"/></section>
  <div className="service-toolbar"><label>操作店家<select aria-label="操作店家" disabled={loading||!catalog} value={catalog?.department||department} onChange={(event)=>{setDepartment(event.target.value as Department);router.replace(`${pathname.startsWith('/service/courses/')?'/service/courses':pathname}?department=${event.target.value}`);selectTemplate('');setQuery('');setCategory('all');}}>{!catalog?<option value="">驗證權限中</option>:catalog.departments.map((store)=><option key={store.key} value={store.key}>{store.name}</option>)}</select></label><button type="button" onClick={reload} disabled={loading}><RefreshCw size={17}/> {loading?'讀取中…':'重新整理'}</button></div>
  <nav className="service-tabs" aria-label="客服工具分類">{tabs.map(({key,name,Icon})=><Link key={key} href={`/service/${key}${currentDepartment?`?department=${currentDepartment}`:''}`} aria-current={tab===key?'page':undefined}><Icon size={18}/>{name}</Link>)}</nav>
  <label className="service-mobile-tabs">工具分類<select aria-label="工具分類" value={tab} onChange={(event)=>{router.push(`/service/${event.target.value}${currentDepartment?`?department=${currentDepartment}`:''}`);}}>{tabs.map((item)=><option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
  {error?<section className="service-card" role="alert"><p>{error}</p>{needLogin?<button type="button" onClick={()=>void login()}><LogIn size={18}/> 使用 Discord 登入</button>:<button type="button" onClick={reload}>重試</button>}</section>:null}
  {loading?<section className="service-card" role="status">正在確認客服權限與讀取內容…</section>:catalog?<>
   {tab==='courses'?<KnowledgeLibrary documents={catalog.courses} organization={catalog.department} loading={false} basePath="/service/courses" libraryHref={`/service/courses?department=${catalog.department}`} apiBase="/service/api/courses"/>:tab==='templates'?<div className="service-template-layout">
    <aside className="service-card service-template-list"><h2>話術模板</h2><label className="service-search"><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜尋模板" aria-label="搜尋模板"/></label><select aria-label="模板分類" value={category} onChange={(event)=>setCategory(event.target.value)}><option value="all">全部分類</option>{Array.from(new Set(catalog.templates.map((item)=>item.category))).map((value)=><option key={value}>{value}</option>)}</select><div>{shown.map((item)=><button type="button" key={item.id} aria-pressed={selected===item.id} onClick={()=>selectTemplate(item.id)}><small>{item.category}</small><strong>{item.title}</strong></button>)}</div>{!shown.length?<p>目前沒有符合條件的模板。</p>:null}</aside>
    <section className="service-card service-template-editor">{template?<><span className="service-eyebrow">{catalog.department==='qiunai'?'秋奈電競':'深夜不關燈'} · {template.category}</span><h2>{template.title}</h2><p>{template.description}</p>{template.destination_label?<p>建議貼至：{safeLink(template.destination_url)?<a href={safeLink(template.destination_url)!} target="_blank" rel="noreferrer">{template.destination_label}</a>:template.destination_label}</p>:null}<form onSubmit={(event)=>{event.preventDefault();void render();}}>{template.fields.map((field)=><label key={field.key}>{field.label}{field.required?' *':''}{field.type==='choice'?<select required={field.required} value={values[field.key]||''} onChange={(event)=>setValues({...values,[field.key]:event.target.value})}><option value="">請選擇</option>{field.options?.map((option)=><option key={option}>{option}</option>)}</select>:field.type==='paragraph'?<textarea required={field.required} maxLength={field.maxLength||2000} value={values[field.key]||''} onChange={(event)=>setValues({...values,[field.key]:event.target.value})}/>:<input required={field.required} maxLength={field.maxLength||500} inputMode={['user','role'].includes(field.type)?'numeric':undefined} value={values[field.key]||''} onChange={(event)=>setValues({...values,[field.key]:event.target.value})}/>}</label>)}<button type="submit" disabled={busy}>{busy?'產生中…':'產生模板'}</button></form>{renderError?<p role="alert">{renderError}</p>:null}{output?<div className="service-output"><div><button type="button" onClick={()=>void copy()}><Copy size={16}/> 複製文字</button><button type="button" onClick={download}>儲存 .txt</button></div><textarea aria-label="產生的模板文字" readOnly value={output}/><p role="status">{notice||'確認店家、金額與對象後，再自行貼至指定頻道。'}</p></div>:null}</>:<div className="service-empty"><Copy size={40}/><h2>選擇一份模板開始</h2><p>產生的文字會留在這裡，方便確認與複製。</p></div>}</section>
   </div>:<section className="service-guide"><div className="service-section-heading"><h2>{guide?.title||tabs.find((item)=>item.key===tab)?.name}</h2><p>{tab==='duty'?'依照店家規則逐項確認；勾選僅供本頁值班自查。':'僅顯示目前店家的參考資料。'}</p></div>{guide?.sections?.map((section,index)=><article className="service-card" key={index}><h3>{section.title}</h3>{section.body||section.summary?<p className="service-guide-text">{section.body||section.summary}</p>:null}{section.items?.map((item,i)=><label className="service-check" key={i}><input type="checkbox" checked={checked[`${catalog.department}:${index}:${i}`]||false} onChange={(event)=>checkItem(`${catalog.department}:${index}:${i}`,event.target.checked)}/><span>{item}</span></label>)}{section.links?.map((link,i)=>safeLink(link.url)?<a className="service-resource" key={i} href={safeLink(link.url)!} target="_blank" rel="noreferrer">{link.label} ↗</a>:null)}</article>)}{tab==='resources'?<article className="service-card"><h3>填單專區</h3><label className="service-search"><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} aria-label="搜尋本店填單專區" placeholder="搜尋陪陪名稱或 Discord ID"/></label><div className="service-staff-directory">{catalog.staffDirectory?.filter((staff)=>[staff.name,staff.discordId].some((value)=>value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).map((staff)=><a key={staff.discordId} href={safeLink(staff.url)!} target="_blank" rel="noreferrer"><strong>{staff.name}</strong><span>開啟填單專區 ↗</span></a>)}</div>{!catalog.staffDirectory?.length?<p>目前沒有已設定的填單專區，請向本店主管確認。</p>:null}</article>:null}{!guide?.sections?.length?<article className="service-card">此店家的內容尚在整理，請依主管最新公告操作。</article>:null}</section>}
  </>:null}
 </main>;
}
