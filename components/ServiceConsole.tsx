"use client";
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,BookOpenText,ChevronDown,ClipboardList,ClipboardPlus,Clock3,Copy,Headphones,Megaphone,LayoutDashboard,Link2,LogIn,MessageSquare,RefreshCw,Search,ShieldCheck,Tag} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import KnowledgeLibrary from '@/components/KnowledgeLibrary';
import ServiceDashboard from '@/components/service/ServiceDashboard';
import ServiceManual from '@/components/service/ServiceManual';
import ServiceDesk from '@/components/service/ServiceDesk';
import ServiceProxyOrders from '@/components/service/ServiceProxyOrders';
import ServiceBroadcasts from '@/components/service/ServiceBroadcasts';
import ServiceTemplates from '@/components/service/ServiceTemplates';
import ServiceReview, {type ReviewData} from '@/components/service/ServiceReview';
import {manualHref,normalizeSearch} from '@/lib/serviceManual.mjs';
import {manualRequest,serviceRequest} from '@/components/service/client';
import {storeName,type Department,type Entry,type Staff,type Template} from '@/components/service/types';
type Catalog={review?:ReviewData;actor:string;department:Department;departments:{key:Department;name:string}[];templates:Template[];staffDirectory?:Staff[];courses:React.ComponentProps<typeof KnowledgeLibrary>['documents']};
const groups=[{title:'值班',items:[{key:'duty',name:'值班工作台',Icon:LayoutDashboard},{key:'proxy-orders',name:'代老闆建單',Icon:ClipboardPlus},{key:'reviews',name:'待審核訂單',Icon:ShieldCheck},{key:'flows',name:'流程清單',Icon:ClipboardList},{key:'tracking',name:'待追蹤頻道',Icon:Clock3},{key:'notes',name:'老闆備註',Icon:MessageSquare}]},{title:'回覆與查價',items:[{key:'phrases',name:'回覆話術',Icon:MessageSquare},{key:'templates',name:'套模板',Icon:Copy},{key:'broadcasts',name:'待發播報',Icon:Megaphone},{key:'prices',name:'價目表',Icon:Tag}]},{title:'內訓與資源',items:[{key:'courses',name:'完整教程',Icon:BookOpenText},{key:'rules',name:'規則查閱',Icon:ShieldCheck},{key:'resources',name:'工具與頻道',Icon:Link2}]}] as const;
const tabs=groups.flatMap(group=>[...group.items]);
type SearchResult={key:string;title:string;type:string;summary?:string;href:string;external?:boolean};
function SearchDesk({catalog,department}:{catalog:Catalog;department:Department}){
 const [query,setQuery]=useState(''),[manual,setManual]=useState<Entry[]>([]),[searching,setSearching]=useState(false);const input=useRef<HTMLInputElement>(null);const term=normalizeSearch(query);
 useEffect(()=>{const keydown=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.current?.focus();}};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[]);
 useEffect(()=>{if(!term)return;const controller=new AbortController();const timer=setTimeout(()=>{setSearching(true);void manualRequest(department,'home',{q:term},controller.signal).then(rows=>{if(!controller.signal.aborted)setManual(rows);}).catch(()=>{if(!controller.signal.aborted)setManual([]);}).finally(()=>{if(!controller.signal.aborted)setSearching(false);});},250);return()=>{controller.abort();clearTimeout(timer);};},[term,department]);
 const result:SearchResult[]=term?[...catalog.templates.filter(item=>normalizeSearch(`${item.title} ${item.category}`).includes(term)).map(item=>({key:item.id,title:item.title,type:'模板',href:`/service/templates?department=${department}&template=${encodeURIComponent(item.slug||item.id)}`})),...catalog.courses.filter(item=>normalizeSearch(item.title).includes(term)).map(item=>({key:item.id,title:item.title,type:'課程',href:`/service/courses/${department}/${item.id}`})),...manual.map(item=>({key:item.id,title:item.title,type:item.category,summary:item.summary,href:manualHref(item.kind,item.slug,department)})),...(catalog.staffDirectory||[]).filter(person=>normalizeSearch(person.name+' '+person.discordId).includes(term)).slice(0,8).map(person=>({key:`staff:${person.discordId}`,title:person.name,type:'填單專區',href:person.url,external:true}))].slice(0,35):[];
 return <div className="svc-global-search"><label className="svc-search-input"><Search size={18}/><input ref={input} aria-label="搜尋整個手冊" placeholder="搜尋手冊、模板、陪陪…" value={query} onChange={event=>{setQuery(event.target.value);setManual([]);setSearching(false);}} onKeyDown={event=>{if(event.key==='Escape'){setQuery('');input.current?.blur();}}}/><kbd>⌘ K</kbd></label>{term?<div className="svc-search-results" role="region" aria-label="搜尋結果"><div className="svc-section-title"><strong>{storeName(department)} · 搜尋結果</strong><button type="button" className="svc-secondary" onClick={()=>setQuery('')}>關閉</button></div>{result.map(item=>item.external?<a key={item.key} href={item.href} target="_blank" rel="noreferrer" onClick={()=>setQuery('')}><span><small>{item.type}</small><strong>{item.title}</strong></span><ArrowUpRight size={15}/></a>:<Link key={item.key} href={item.href} onClick={()=>setQuery('')}><span><small>{item.type}</small><strong>{item.title}</strong>{item.summary?<small>{item.summary}</small>:null}</span><ArrowUpRight size={15}/></Link>)}{!result.length?<p className="svc-muted" role="status">{searching?'正在搜尋手冊…':'沒有符合條件的項目。'}</p>:null}</div>:null}</div>;
}
function StoreLogo({department,active}:{department:Department;active:boolean}){
 const [failed,setFailed]=useState(false);
 const label=department==='qiunai'?'秋奈':'深夜';
 const className=active?'is-current':'';
 return failed?<span role="img" aria-label={label} className={`svc-logo-fallback ${className}`}>{label}</span>:<img className={className} src={department==='qiunai'?'/service/assets/brand/qiunai.png':'/service/assets/brand/deepnight-gold.png'} alt={label} width={39} height={39} onError={()=>setFailed(true)}/>;
}
export default function ServiceConsole(){
 const pathname=usePathname(),router=useRouter(),params=useSearchParams();const requested=params.get('department');const routeStore=pathname.match(/^\/service\/courses\/(qiunai|deepnight)\//)?.[1];const requestedStore=(routeStore||(['qiunai','deepnight'].includes(requested||'')?requested:null)) as Department|null;const section=(pathname.split('/')[2]||'duty') as (typeof tabs)[number]['key'];const slug=section==='flows'?pathname.split('/')[3]:undefined;
 const [catalog,setCatalog]=useState<Catalog|null>(null),[manual,setManual]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[manualError,setManualError]=useState(''),[needLogin,setNeedLogin]=useState(false),[revision,setRevision]=useState(0),[mobileMenu,setMobileMenu]=useState(false);
 const rail=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const pane=rail.current;if(!pane)return;
  const position=()=>pane.style.setProperty('--svc-rail-top',`${Math.min(0,window.innerHeight-pane.offsetHeight)}px`);
  const observer=new ResizeObserver(position);
  observer.observe(pane);window.addEventListener('resize',position);position();
  return()=>{observer.disconnect();window.removeEventListener('resize',position);};
 },[]);
 const item=params.get('item');
 useEffect(()=>{if(!item)window.scrollTo({top:0,left:0,behavior:'instant'});},[pathname,requestedStore,item]);
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 const reviewPage=section==='reviews';
 useEffect(()=>{
  const controller=new AbortController();
  const suffix=requestedStore?`?department=${requestedStore}`:'';
  void Promise.resolve().then(async()=>{
   setLoading(true);setError('');setManualError('');setNeedLogin(false);setCatalog(null);setManual([]);
   try {
    if(reviewPage){
     const review=await serviceRequest(`/service/api/reviews${suffix}`,undefined,controller.signal) as ReviewData;
     if(!controller.signal.aborted)setCatalog({actor:'',department:review.department,departments:review.departments,templates:[],courses:[],review});
     return;
    }
    const response=await serviceRequest(`/service/api/catalog${suffix}`,undefined,controller.signal) as Catalog;
    if(controller.signal.aborted)return;
    setCatalog(response);
    try {
     const entries=await manualRequest(response.department,'home',{},controller.signal);
     if(!controller.signal.aborted)setManual(entries);
    } catch (failure) {
     if(!controller.signal.aborted)setManualError(failure instanceof Error?failure.message:'手冊目錄暫時無法讀取');
    }
   } catch (failure) {
    if(!controller.signal.aborted){
     setError(failure instanceof Error?failure.message:'讀取失敗');
     setNeedLogin((failure as {status?:number}).status===401);
    }
   } finally {
    if(!controller.signal.aborted)setLoading(false);
   }
  });
  return()=>controller.abort();
 },[requestedStore,revision,reviewPage]);
 useEffect(()=>{const {data}=supabase.auth.onAuthStateChange(()=>setTimeout(reload,0));return()=>data.subscription.unsubscribe();},[reload]);
 const current=catalog&&(!requestedStore||catalog.department===requestedStore)?catalog:null;const department=current?.department||requestedStore||'qiunai';const active=tabs.find(tab=>tab.key===section)||tabs[0];
 async function login(){setError('');const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:`${window.location.origin}${pathname}${params.size?`?${params.toString()}`:''}`}});if(error)setError('Discord 登入暫時無法開啟，請稍後再試。');}
 const sectionUrl=(key:string)=>`/service/${key}?department=${department}`;
 function switchStore(value:Department){setMobileMenu(false);const target=routeStore||slug?`/service/${section}`:pathname;router.replace(`${target}?department=${value}`);}
 function navigation(mobile=false){return <nav className={mobile?'svc-mobile-nav':'svc-nav'} aria-label="客服工具分類">{groups.map(group=><section key={group.title}><span>{group.title}</span>{group.items.map(({key,name,Icon})=><Link key={key} href={sectionUrl(key)} aria-current={active.key===key?'page':undefined} onClick={()=>setMobileMenu(false)}><Icon size={18}/>{name}</Link>)}</section>)}</nav>;}
 return <main className={`service-console svc-workspace service-store-${department}`}>
  <aside className="svc-rail"><div className="svc-rail-content" ref={rail}><Link className="svc-rail-brand" href={sectionUrl('duty')} aria-label="客服工作台首頁"><div className="svc-logos"><StoreLogo department="qiunai" active={department==='qiunai'}/><StoreLogo department="deepnight" active={department==='deepnight'}/></div><div><strong>客服工作台</strong><small>QIUNAI × DEEPNIGHT</small></div></Link>{navigation()}<div className="svc-rail-footer"><a href="https://hr.wearestilllhere.com/collaboration/knowledge">HR 知識庫 <ArrowUpRight size={15}/></a><span><Headphones size={16}/> 客服與主管專用</span></div></div></aside>
  <div className="svc-main"><header className="svc-topbar"><div className="svc-topbar-title"><span>{storeName(department)} · 客服</span><strong>{active.name}</strong></div>{current&&!reviewPage?<SearchDesk key={department} catalog={current} department={department}/>:null}<div className="svc-topbar-controls"><label><span>操作店家</span><select aria-label="操作店家" value={current?.department||''} disabled={!current||loading} onChange={event=>switchStore(event.target.value as Department)}>{current?current.departments.map(store=><option key={store.key} value={store.key}>{store.name}</option>):<option value="">確認權限中</option>}</select></label><button className="svc-secondary" type="button" onClick={reload} disabled={loading} aria-label="重新整理" title="重新整理"><RefreshCw size={17}/></button></div></header>
   <div className="svc-mobile-menu"><button type="button" className="svc-secondary" aria-expanded={mobileMenu} aria-controls="svc-mobile-navigation" onClick={()=>setMobileMenu(open=>!open)}><span>工具選單</span><ChevronDown size={18}/></button><div id="svc-mobile-navigation" hidden={!mobileMenu}>{mobileMenu?navigation(true):null}</div></div>
   <div className="svc-content">{error?<section className="svc-panel svc-login" role="alert"><Headphones size={36}/><h1>客服工作台</h1><p>{error}</p>{needLogin?<button type="button" onClick={()=>void login()}><LogIn size={18}/> 使用 Discord 登入</button>:<button type="button" onClick={reload}>重新讀取</button>}{reviewPage&&requestedStore&&!needLogin?<Link className="svc-secondary-link" href="/service/reviews">查看可審核的店家</Link>:null}</section>:null}{loading?<div className="svc-panel svc-empty" role="status">正在確認客服權限並讀取本店資料…</div>:null}
   {!loading&&current?<>{manualError?<div className="svc-error" role="alert">{manualError} <button type="button" onClick={reload}>重試</button></div>:null}{section==='proxy-orders'?<ServiceProxyOrders key={department} department={department}/>:section==='reviews'?(current.review?<ServiceReview key={department} department={department} initial={current.review}/>:null):section==='duty'?<ServiceDashboard key={department} department={department} items={manual} staff={current.staffDirectory||[]} templateCount={current.templates.length}/>:section==='templates'?<ServiceTemplates key={`${department}:${params.get('template')||''}`} department={department} templates={current.templates} initial={params.get('template')}/>:section==='courses'?<section className="svc-page"><div className="svc-page-heading"><span className="svc-kicker"><BookOpenText size={17}/> TRAINING LIBRARY</span><h1>完整教程</h1><p>從新人訓練到值班細節，依章節閱讀並完成結訓。</p></div><KnowledgeLibrary documents={current.courses} organization={department} loading={false} basePath="/service/courses" libraryHref={sectionUrl('courses')} apiBase="/service/api/courses" relatedLinks={[
    ...tabs.filter(tab=>tab.key!=='courses').map(tab=>({label:tab.name,url:sectionUrl(tab.key)})),
    ...current.templates.map(template=>({label:template.title,url:`${sectionUrl('templates')}&template=${encodeURIComponent(template.slug||template.id)}`}))
   ]}/></section>:section==='broadcasts'?<ServiceBroadcasts key={department} department={department}/>:section==='notes'||section==='tracking'?<ServiceDesk key={`${department}:${section}`} department={department} kind={section==='notes'?'note':'track'} selected={params.get('item')}/>:<ServiceManual key={`${department}:${section}:${slug||''}:${params.get('item')||''}`} department={department} section={section} slug={slug} item={params.get('item')} actor={current.actor} items={manual} staff={current.staffDirectory||[]} templates={current.templates} courseId={current.courses[0]?.id}/>}</>:null}</div>
   <footer className="svc-footer">{storeName(department)} · 客服工作台 <a href="https://hr.wearestilllhere.com/collaboration/knowledge">HR 知識庫 <ArrowUpRight size={14}/></a></footer>
  </div></main>;
}
