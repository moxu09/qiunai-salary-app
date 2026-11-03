"use client";
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {ArrowDownLeft,ArrowRight,BookOpenText,ClipboardList,Clock3,Copy,Gift,Headphones,Link2,Megaphone,MessageSquare,Pin,Search,Sparkles,Tag,WalletCards} from 'lucide-react';
import {useEffect,useState} from 'react';
import {manualHref,normalizeSearch} from '@/lib/serviceManual.mjs';
import {copyText,safeHref,serviceRequest} from './client';
import {storeName,type Department,type DeskData,type DeskItem,type Entry,type Staff} from './types';
const flows=[['order',ArrowDownLeft,'派單'],['designated',Pin,'指定單'],['self',ClipboardList,'自助單'],['gifts',Gift,'禮物打賞'],['naming',Tag,'冠名'],['topup',WalletCards,'儲值']] as const;
export function StaffFinder({staff,compact=false}:{staff:Staff[];compact?:boolean}){
 const [query,setQuery]=useState('');const search=normalizeSearch(query),shown=search?staff.filter(person=>normalizeSearch(person.name+' '+person.discordId).includes(search)).slice(0,compact?5:100):[];
 return <div className="svc-staff-finder"><label className="svc-search-input"><Search size={17}/><input aria-label="搜尋本店填單專區" placeholder="陪陪暱稱或 Discord ID" value={query} onChange={event=>setQuery(event.target.value)}/></label><p className="svc-muted">{!search?`可搜尋 ${staff.length} 位本店員工的填單專區。`:shown.length?`找到 ${shown.length}${shown.length===(compact?5:100)?'＋':''} 筆`: '找不到相符的填單專區。'}</p><div className="svc-staff-results">{shown.map(person=><a key={person.discordId} href={safeHref(person.url)||undefined} target="_blank" rel="noreferrer"><strong>{person.name}</strong><ArrowRight size={16}/></a>)}</div></div>;
}
function DeskPreview({title,icon:Icon,href,items,kind,error}:{
 title:string;icon:typeof Clock3;href:string;items:DeskItem[]|undefined;kind:'track'|'note'|'broadcast';error:boolean;
}){
 const empty={track:'沒有待追蹤的頻道。',note:'尚無本店備註。',broadcast:'目前沒有待發播報。'}[kind];
 return <section className="svc-panel svc-queue-card">
  <div className="svc-section-title">
   <h2><Icon size={18}/>{title}{items?<span className="svc-badge" aria-label={items.length===6?'至少 6 筆':`${items.length} 筆`}>{items.length===6?'6+':items.length}</span>:null}</h2>
   <Link href={href}>查看 <ArrowRight size={15}/></Link>
  </div>
  {items?.length?<ul className="svc-quick-list">
   {items.slice(0,3).map(item=>{
    const label=<span><strong>{item.priority?<Pin size={12} aria-label="優先"/>:null}{item.label}</strong>
      {kind!=='broadcast'&&item.body?<small>{item.body}</small>:null}</span>;
    const url=kind==='track'?safeHref(item.url):null;
    return <li key={item.id}>{url?
     <a href={url} target="_blank" rel="noreferrer">{label}<ArrowRight size={16}/></a>:
     <Link href={kind==='note'?`${href}&item=${item.id}`:href}>{label}<ArrowRight size={16}/></Link>}
    </li>;
   })}
  </ul>:<p className="svc-queue-empty">{error?'暫時無法讀取，請開啟清單重試。':items?empty:'讀取中…'}</p>}
 </section>;
}

export default function ServiceDashboard({department,items,staff,templateCount}:{department:Department;items:Entry[];staff:Staff[];templateCount:number}){
 const [desk,setDesk]=useState<DeskData|null>(null),[deskError,setDeskError]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void serviceRequest(`/service/api/desk/${department}?summary=1`,undefined,controller.signal)
   .then(result=>{if(!controller.signal.aborted)setDesk(result);})
   .catch(()=>{if(!controller.signal.aborted)setDeskError(true);});
  return()=>controller.abort();
 },[department]);
 const campaigns=items.filter(item=>item.kind==='campaign');
 const workflows=flows.flatMap(([slug,Icon,fallback])=>{
  const item=items.find(row=>row.kind==='flow'&&row.slug===slug);
  return item?[{item,Icon,fallback}]:[];
 });
 const commands=items.filter(item=>item.kind==='command'&&item.category!=='舊指令').slice(0,4);
 const daily=items.filter(item=>item.kind==='flow'&&['start','review','handover','help','trouble','self-trouble','bot-down'].includes(item.slug));
 const path=(section:string)=>`/service/${section}?department=${department}`;
 const shortcuts=[
  ['templates',Copy,'套用模板',`${templateCount} 份可填寫模板`],
  ['phrases',MessageSquare,'回覆話術','依情境快速複製'],
  ['prices',Tag,'查本店價目','商品與服務價目'],
  ['broadcasts',Megaphone,'待發播報',desk?.broadcasts.length?`有 ${desk.broadcasts.length===6?'6+':desk.broadcasts.length} 筆待處理`:'準備文案與查看進度'],
 ] as const;

 return <div className="svc-home">
  <section className="svc-home-hero">
   <div className="svc-hero-content">
    <span className="svc-kicker"><Sparkles size={15}/>{storeName(department)}</span>
    <h1>值班工作台</h1>
    <p>查工單、回覆老闆、準備播報，從本店常用工具開始。</p>
    <div className="svc-hero-actions">
     <Link className="svc-primary-link" href={path('flows')}><ClipboardList size={17}/> 查看訂單流程</Link>
     <Link className="svc-secondary-link" href={path('reviews')}><Clock3 size={17}/> 待審核訂單</Link>
     <Link className="svc-secondary-link" href={path('courses')}><BookOpenText size={17}/> 完整教程</Link>
    </div>
   </div>
   <img className="svc-hero-art" src={`/service/assets/brand/${department==='qiunai'?'qiunai-cloud-room.png':'deepnight-lounge.png'}`} alt="" loading="eager"/>
   {department==='deepnight' && <span className="svc-night-stars" aria-hidden="true">✦</span>}
  </section>

  <nav className="svc-shortcut-grid" aria-label="常用操作">
   {shortcuts.map(([section,Icon,title,description])=><Link className="svc-shortcut" key={section} href={path(section)}>
    <span className="svc-icon-bubble"><Icon size={19}/></span>
    <span className="svc-shortcut-copy"><strong>{title}</strong><small>{description}</small></span>
    <ArrowRight className="svc-shortcut-arrow" size={16}/>
   </Link>)}
  </nav>

  {campaigns.map(item=><Link className="svc-campaign-banner" key={item.id} href={manualHref(item.kind,item.slug,department)}>
   <span className="svc-icon-bubble"><Gift size={20}/></span>
   <span><small>進行中的活動</small><strong>{item.title}</strong><span>{item.summary}</span></span><ArrowRight size={18}/>
  </Link>)}

  <div className="svc-home-columns">
   <div className="svc-home-main">
    <section className="svc-panel svc-workflow-panel" aria-label="訂單流程">
     <div className="svc-section-title"><h2><ClipboardList size={20}/>訂單流程</h2><Link href={path('flows')}>全部流程 <ArrowRight size={15}/></Link></div>
     {workflows.length?<div className="svc-flow-grid">{workflows.map(({item,Icon,fallback})=><Link className="svc-flow-tile" key={item.id} href={manualHref(item.kind,item.slug,department)}>
      <span className="svc-icon-bubble"><Icon size={20}/></span>
      <strong>{item.title||fallback}</strong><p>{item.summary}</p>
      <span className="svc-card-action">查看流程 <ArrowRight size={15}/></span>
     </Link>)}</div>:<p className="svc-empty">目前沒有可顯示的訂單流程，可先查看完整教程。</p>}
    </section>
    <section className="svc-panel">
     <div className="svc-section-title"><h2><Headphones size={20}/>交接與異常處理</h2></div>
     {daily.length?<div className="svc-quick-list">{daily.map(item=><Link key={item.id} href={manualHref(item.kind,item.slug,department)}>
      <span><strong>{item.title}</strong><small>{item.summary}</small></span><ArrowRight size={17}/>
     </Link>)}</div>:<p className="svc-muted">目前沒有交接流程可顯示。</p>}
    </section>
   </div>
   <aside className="svc-home-rail" aria-label="值班清單與工具">
    <DeskPreview title="待追蹤頻道" icon={Clock3} href={path('tracking')} items={desk?.tracking} kind="track" error={deskError}/>
    <DeskPreview title="待發播報" icon={Megaphone} href={path('broadcasts')} items={desk?.broadcasts} kind="broadcast" error={deskError}/>
    <DeskPreview title="老闆備註" icon={MessageSquare} href={path('notes')} items={desk?.notes} kind="note" error={deskError}/>
    <section className="svc-panel">
     <div className="svc-section-title"><h2><Link2 size={18}/>填單專區</h2><Link href={path('resources')}>名錄 <ArrowRight size={15}/></Link></div>
     <StaffFinder staff={staff} compact/>
    </section>
    <section className="svc-panel">
     <div className="svc-section-title"><h2><Copy size={18}/>常用指令</h2><Link href={path('resources')}>全部 <ArrowRight size={15}/></Link></div>
     <div className="svc-command-grid">{commands.map(item=><button type="button" key={item.id} onClick={async()=>setNotice(await copyText(item.title)?`已複製 ${item.title}`:`請手動複製 ${item.title}`)}><Copy size={14}/>{item.title}</button>)}</div>
     <p className="svc-muted" role="status">{notice||'點選即可複製，到 Discord 貼上使用。'}</p>
    </section>
   </aside>
  </div>
 </div>;
}
