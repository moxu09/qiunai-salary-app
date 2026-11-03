"use client";
import {ChevronLeft,ChevronRight,Copy,Download,FileText,Search,Sparkles} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {normalizeSearch} from '@/lib/serviceManual.mjs';
import {copyText,safeHref,saveFile,serviceRequest} from './client';
import {storeName,type Department,type Template} from './types';
type Gift={key:string;name:string;price:number;unit:string};
type GiftCatalog={regular:Gift[];heart:Gift[]|null};

export default function ServiceTemplates({department,templates,initial}:{department:Department;templates:Template[];initial?:string|null}){
 const generation=useRef(0),pending=useRef(false),editor=useRef<HTMLElement>(null);const [queued,setQueued]=useState<Set<string>>(()=>new Set());const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[selected,setSelected]=useState(initial||''),[values,setValues]=useState<Record<string,string>>({}),[output,setOutput]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const template=templates.find(item=>item.id===selected||item.slug===selected||item.title===selected),shown=templates.filter(item=>(category==='all'||item.category===category)&&normalizeSearch(`${item.title} ${item.description}`).includes(normalizeSearch(query)));
 const giftKind=template?.slug==='gift-broadcast'?'regular':template?.slug==='heart-gift-broadcast'?'heart':null;
 const giftLabel=giftKind==='heart'?'心動禮物名稱':'禮物名稱';
 const [giftCatalog,setGiftCatalog]=useState<GiftCatalog|null>(null);
 const [giftFailed,setGiftFailed]=useState(false);
 const [giftChoice,setGiftChoice]=useState('');
 const giftOptions=giftKind?giftCatalog?.[giftKind]:undefined;
 const needsGifts=Boolean(giftKind);
 useEffect(()=>{
  if(!needsGifts)return;
  const controller=new AbortController();
  void serviceRequest(`/service/api/gifts?department=${department}`,undefined,controller.signal)
   .then(result=>{if(!controller.signal.aborted){setGiftCatalog(result);setGiftFailed(false);}})
   .catch(()=>{if(!controller.signal.aborted)setGiftFailed(true);});
  return()=>controller.abort();
 },[department,needsGifts]);

 const pageSize=8;
 const [page,setPage]=useState(()=>Math.max(0,Math.floor(templates.findIndex(item=>item.id===initial||item.slug===initial||item.title===initial)/pageSize)));
 const pages=Math.max(1,Math.ceil(shown.length/pageSize)),currentPage=Math.min(page,pages-1);
 const visible=shown.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 const queueKey=template?JSON.stringify([template.id,output]):'';
 function choose(id:string){generation.current++;setSelected(id);setGiftChoice('');setValues({});setOutput('');setNotice('');setError('');requestAnimationFrame(()=>{const pane=editor.current;if(!pane)return;const {top}=pane.getBoundingClientRect();if(top<0||top>window.innerHeight*.75)pane.scrollIntoView({block:'start'});});}
 async function render(){if(!template||busy)return;const current=generation.current;setBusy(true);setError('');setOutput('');setNotice('');try{const result=await serviceRequest(`/service/api/templates/${template.id}/render`,{department,version:template.version,values});if(current===generation.current)setOutput(result.text);}catch(caught){if(current===generation.current)setError(caught instanceof Error?caught.message:'產生模板失敗');}finally{setBusy(false);}}
 async function queue(){if(!template||!output||busy||pending.current||queued.has(queueKey))return;const current=generation.current;pending.current=true;setBusy(true);setError('');try{await serviceRequest(`/service/api/desk/${department}`,{action:'save',record:{kind:'broadcast',label:template.title,body:output,priority:false,customerId:'',url:''}});setQueued(prior=>new Set([...prior,queueKey]));if(current===generation.current)setNotice('已加入待發播報。');}catch(error){if(current===generation.current)setError(error instanceof Error?error.message:'加入播報失敗');}finally{pending.current=false;setBusy(false);}}
 return <section className="svc-page"><div className="svc-page-heading"><span className="svc-kicker"><FileText size={17}/> RESPONSE TEMPLATES</span><h1>套模板</h1><p>挑選情境、填入欄位，再複製 {storeName(department)} 專用的文字。</p></div><div className="svc-template-columns"><aside className="svc-panel svc-template-list"><div className="svc-section-title"><h2>模板庫</h2><span className="svc-badge">{shown.length} 份</span></div><label className="svc-search-input"><Search size={17}/><input value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} aria-label="搜尋模板" placeholder="搜尋播報、派單或登記"/></label><select aria-label="模板分類" value={category} onChange={event=>{setCategory(event.target.value);setPage(0);}}><option value="all">全部分類</option>{Array.from(new Set(templates.map(item=>item.category))).map(value=><option key={value}>{value}</option>)}</select><div className="svc-template-options">{visible.map(item=><button type="button" key={item.id} aria-pressed={template?.id===item.id} onClick={()=>choose(item.id)}><small>{item.category}</small><strong>{item.title}</strong></button>)}{!shown.length?<p className="svc-muted">沒有符合條件的模板。</p>:null}</div>{pages>1?<nav className="svc-template-pagination" aria-label="模板分頁"><button type="button" className="svc-secondary" aria-label="上一頁模板" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={17}/></button><span>第 {currentPage+1}／{pages} 頁</span><button type="button" className="svc-secondary" aria-label="下一頁模板" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}><ChevronRight size={17}/></button></nav>:null}</aside><article className="svc-panel svc-template-editor" ref={editor}>{template?<><span className="svc-badge">{storeName(department)} · {template.category}</span><h2>{template.title}</h2><p className="svc-muted">{template.description}</p>{template.destination_label?<p>建議貼至：{safeHref(template.destination_url)?<a href={template.destination_url} target="_blank" rel="noreferrer">{template.destination_label}</a>:template.destination_label}</p>:null}{giftKind&&!giftOptions?.length?<p className="svc-muted">{giftFailed||giftOptions===null?'暫時無法讀取本店禮物清單，可先手動填寫。':giftOptions?'本店沒有獨立的心動禮物清單，請填寫實際品項。':'正在讀取本店禮物清單…'}</p>:null}<form className="svc-form" onSubmit={event=>{event.preventDefault();void render();}}>{template.fields.map(field=><label key={field.key}>{field.label}{field.required?' *':''}{giftKind&&field.label===giftLabel&&giftOptions?.length?<>
 <select required={field.required} value={giftChoice} aria-label={giftLabel} onChange={event=>{
  const key=event.target.value;
  setGiftChoice(key);
  setValues(prior=>({...prior,[field.key]:giftOptions.find(gift=>gift.key===key)?.name||''}));
  generation.current++;setOutput('');setNotice('');setError('');
 }}>
  <option value="">選擇本店現有禮物</option>
  {giftOptions.map(gift=><option key={gift.key} value={gift.key}>{gift.name} · {gift.price.toLocaleString('zh-TW')} {gift.unit}</option>)}
  <option value="__custom__">客製禮物（自行填寫）</option>
 </select>
 {giftChoice==='__custom__'?<input aria-label="客製禮物名稱" required={field.required} maxLength={field.maxLength||500} value={values[field.key]||''} onChange={event=>setValues({...values,[field.key]:event.target.value})}/>:null}
 </>:field.type==='choice'?<select required={field.required} value={values[field.key]||''} onChange={event=>setValues({...values,[field.key]:event.target.value})}><option value="">請選擇</option>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:field.type==='paragraph'?<textarea required={field.required} maxLength={field.maxLength||2000} value={values[field.key]||''} onChange={event=>setValues({...values,[field.key]:event.target.value})}/>:<input required={field.required} maxLength={field.maxLength||500} inputMode={['user','role'].includes(field.type)?'numeric':undefined} value={values[field.key]||''} onChange={event=>setValues({...values,[field.key]:event.target.value})}/>}</label>)}<button type="submit" disabled={busy}><Sparkles size={17}/>{busy?'產生中…':'產生模板'}</button></form>{error?<p className="svc-error" role="alert">{error}</p>:null}{output?<div className="svc-output"><label>產生的模板文字<textarea readOnly value={output}/></label><div className="svc-actions"><button type="button" onClick={async()=>setNotice(await copyText(output)?'已複製文字。':'請選取上方文字手動複製。')}><Copy size={16}/> 複製文字</button><button type="button" className="svc-secondary" onClick={()=>saveFile(new Blob([output],{type:'text/plain;charset=utf-8'}),`${template.title}.txt`)}><Download size={16}/> 儲存 .txt</button>{template.category==='播報'||template.title.includes('播報')||template.title.endsWith('卡')?<button type="button" disabled={busy||queued.has(queueKey)} onClick={()=>void queue()}>{queued.has(queueKey)?'已加入待發播報':'加入待發播報'}</button>:null}</div><p role="status" className="svc-muted">{notice||'請確認店家、金額與對象，再自行貼到指定頻道。'}</p></div>:null}</>:<div className="svc-empty"><Copy size={34}/><h2>選一份模板開始</h2><p>左側有播報、訂單協助與內部登記模板。</p></div>}</article></div></section>;
}
