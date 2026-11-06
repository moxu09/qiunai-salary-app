"use client";
import {ArrowUpRight,Clock3,Plus,RefreshCw} from 'lucide-react';
import {useEffect,useMemo,useState} from 'react';
import {serviceRequest} from './client';

type HandoverLink={channelId:string;name?:string|null;url:string;messageUrl:string|null};
type HandoverMessage={id:string;createdAt:string;slotStart:string;author:string;content:string;displayContent?:string;sourceUrl:string;links:HandoverLink[];attachments:{name:string;url:string}[]};
type HandoverPage={messages:HandoverMessage[];nextBefore:string|null};
const stamp=(value:string)=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
const merge=(current:HandoverMessage[],incoming:HandoverMessage[])=>[...new Map([...current,...incoming].map(item=>[item.id,item])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));

export default function ServiceHandover({api,activeUrls,onTracked}:{api:string;activeUrls:Set<string>;onTracked:()=>Promise<void>}){
 const [messages,setMessages]=useState<HandoverMessage[]>([]);
 const [nextBefore,setNextBefore]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[moreBusy,setMoreBusy]=useState(false),[busyUrl,setBusyUrl]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=async()=>{try{
   const page=await serviceRequest(`${api}/handover`,undefined,controller.signal) as HandoverPage;
   if(controller.signal.aborted)return;
   setMessages(current=>merge(current,page.messages));
   setNextBefore(current=>current??page.nextBefore);
   setError('');
  }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'交班內容暫時無法讀取');}
  finally{if(!controller.signal.aborted)setLoading(false);}};
  void refresh();
  const interval=setInterval(()=>void refresh(),60_000);
  return ()=>{controller.abort();clearInterval(interval);};
 },[api,attempt]);
 const groups=useMemo(()=>{
  const grouped=new Map<string,HandoverMessage[]>();
  for(const message of messages){if(!grouped.has(message.slotStart))grouped.set(message.slotStart,[]);grouped.get(message.slotStart)!.push(message);}
  return [...grouped.entries()];
 },[messages]);
 async function older(){if(!nextBefore||moreBusy)return;setMoreBusy(true);setError('');try{
  const page=await serviceRequest(`${api}/handover?before=${nextBefore}`) as HandoverPage;
  setMessages(current=>merge(current,page.messages));setNextBefore(page.nextBefore);
 }catch(failure){setError(failure instanceof Error?failure.message:'較早的交班內容暫時無法讀取');}finally{setMoreBusy(false);}}
 async function track(message:HandoverMessage,link:HandoverLink){if(busyUrl)return;setBusyUrl(link.url);setNotice('');setError('');try{
  const note=message.content.replace(/https:\/\/\S+/g,' ').replace(/\s+/g,' ').trim();
  const label=(note?`交班：${note}`:`交班頻道 ${link.channelId}`).slice(0,100);
  const body=`${message.content.slice(0,1800)}\n\n交班來源：${message.sourceUrl}`.slice(0,2000);
  await serviceRequest(api,{action:'save',record:{kind:'track',label,body,priority:false,url:link.url,customerId:''}});
  await onTracked();setNotice('已加入你的待追蹤清單。');
 }catch(failure){setError(failure instanceof Error?failure.message:'加入追蹤失敗');}finally{setBusyUrl('');}}
 return <section className="svc-handover" aria-labelledby="svc-handover-title">
  <div className="svc-handover-heading"><div><span className="svc-kicker"><Clock3 size={17}/> LIVE HANDOVER</span><h2 id="svc-handover-title">交班內容</h2><p>自動讀取秋奈 #交接班，依臺北時間每 3 小時分組。點「加入追蹤」即可放進自己的待追蹤清單。</p></div><button type="button" className="svc-secondary" onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={16}/> 重新整理</button></div>
  {error?<p className="svc-error" role="alert">{error}</p>:null}{notice?<p className="svc-notice" role="status">{notice}</p>:null}
  {loading?<p className="svc-empty" role="status">正在讀取交班內容…</p>:null}
  {!loading&&!groups.length?<p className="svc-empty">目前沒有可顯示的交班內容。</p>:null}
  {groups.map(([slot,entries],index)=><details className="svc-handover-slot" key={slot} open={index<2}><summary>{stamp(slot)} ～ {stamp(new Date(Date.parse(slot)+3*60*60*1000).toISOString())} <span>（{entries.length} 則）</span></summary><div className="svc-handover-grid">{entries.map(message=><article className="svc-panel svc-handover-card" key={message.id}>
   <div className="svc-handover-meta"><strong>{message.author}</strong><time dateTime={message.createdAt}>{stamp(message.createdAt)}</time><a href={message.sourceUrl} target="_blank" rel="noreferrer">查看交班原文 <ArrowUpRight size={14}/></a></div>
   {message.content?<p className="svc-handover-body">{message.displayContent ?? message.content}</p>:null}
   {message.attachments.length?<div className="svc-inline-links">{message.attachments.map(file=><a key={file.url} href={file.url} target="_blank" rel="noreferrer">附件：{file.name} <ArrowUpRight size={14}/></a>)}</div>:null}
   {message.links.length?<div className="svc-handover-links">{message.links.map(link=><div key={link.url} className="svc-handover-link"><a href={link.messageUrl||link.url} target="_blank" rel="noreferrer">{link.name ? `#${link.name}` : `頻道 …${link.channelId.slice(-6)}`} <ArrowUpRight size={14}/></a><button type="button" className="svc-secondary" disabled={activeUrls.has(link.url)||Boolean(busyUrl)} onClick={()=>void track(message,link)}><Plus size={14}/>{activeUrls.has(link.url)?'已追蹤':busyUrl===link.url?'加入中…':'加入追蹤'}</button></div>)}</div>:null}
  </article>)}</div></details>)}
  {nextBefore?<button type="button" className="svc-secondary" disabled={moreBusy} onClick={()=>void older()}>{moreBusy?'讀取中…':'載入較早交班'}</button>:null}
 </section>;
}
