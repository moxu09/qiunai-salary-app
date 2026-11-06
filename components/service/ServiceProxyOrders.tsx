"use client";
import {ArrowUpRight,ClipboardPlus,RefreshCw} from 'lucide-react';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {serviceRequest} from './client';
import {storeName,type Department} from './types';

type Kind='order'|'tip'|'crown'|'custom-tip'|'custom-crown';
type ProxyRequest={requestId:string;customerId:string;kind:Kind;status:string;createdAt:string;channelUrl:string|null};
const choices:{value:Kind;label:string;detail:string}[]=[
 {value:'order',label:'一般訂單',detail:'開啟原本的遊戲／服務下單流程'},
 {value:'tip',label:'打賞',detail:'從本店禮物選擇品項與陪陪'},
 {value:'crown',label:'冠名',detail:'從本店冠名方案選擇'},
 {value:'custom-tip',label:'客製打賞',detail:'開單後選客製禮物，由客服填寫金額'},
 {value:'custom-crown',label:'自定冠名',detail:'開單後選自定冠，由客服填寫內容與金額'},
];
const labels:Record<string,string>={queued:'等待機器人建單',processing:'正在建單',waiting_member:'老闆尚未完成本店成員驗證',retry:'建單重試中',opened:'已建立',failed:'建單失敗'};
const date=(value:string)=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'}).format(new Date(value));

export default function ServiceProxyOrders({department}:{department:Department}){
 const api=`/service/api/proxy-orders/${department}`;
 const [customerId,setCustomerId]=useState(''),[kind,setKind]=useState<Kind>('order');
 const [rows,setRows]=useState<ProxyRequest[]>([]),[requestId,setRequestId]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  try{const data=await serviceRequest(api,undefined,signal) as {requests:ProxyRequest[]};if(!signal?.aborted){setRows(data.requests);setError('');}}
  catch(failure){if(!signal?.aborted)setError(failure instanceof Error?failure.message:'代建單暫時無法讀取');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[api]);
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>void refresh(controller.signal));const timer=setInterval(()=>void refresh(controller.signal),10000);return()=>{controller.abort();clearInterval(timer);};},[refresh]);
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  const id=requestId||`PROXY-${crypto.randomUUID()}`;setRequestId(id);
  try{
   const data=await serviceRequest(api,{requestId:id,customerId:customerId.trim(),kind}) as {request:ProxyRequest};
   setRows(current=>[data.request,...current.filter(row=>row.requestId!==id)].slice(0,20));
   setNotice('已送出代建請求。機器人建立頻道後，請到該頻道繼續填單；付款方式由老闆本人選擇。');
   setRequestId('');
  }catch(failure){setError(failure instanceof Error?failure.message:'代建單失敗，請重試');}
  finally{setBusy(false);}
 }
 return <section className="svc-page svc-proxy-orders"><div className="svc-page-heading"><span className="svc-kicker"><ClipboardPlus size={17}/> CUSTOMER ORDER ASSIST</span><h1>代老闆建單</h1><p>選擇本店與老闆，建立私人訂單頻道。客服可協助填寫後續內容；付款方式仍由老闆本人選擇。</p></div>
  <form className="svc-panel svc-form svc-proxy-form" onSubmit={event=>void submit(event)}><h2>{storeName(department)} · 新增訂單</h2>
   <label>老闆 Discord ID<input required inputMode="numeric" pattern="[0-9]{17,20}" maxLength={20} value={customerId} onChange={event=>{setCustomerId(event.target.value);setRequestId('');}} placeholder="輸入老闆的 Discord ID"/></label>
   <fieldset><legend>訂單類型</legend><div className="svc-proxy-kinds">{choices.map(choice=><label key={choice.value} className={kind===choice.value?'is-selected':''}><input type="radio" name="order-kind" value={choice.value} checked={kind===choice.value} onChange={()=>{setKind(choice.value);setRequestId('');}}/><span><strong>{choice.label}</strong><small>{choice.detail}</small></span></label>)}</div></fieldset>
   <div className="svc-actions"><button type="submit" disabled={busy}>{busy?'送出中…':'建立私人訂單頻道'}</button><span className="svc-muted">建單不會扣款，也不會代老闆選付款方式。</span></div>
  </form>
  {error?<p className="svc-error" role="alert">{error}</p>:null}{notice?<p className="svc-notice" role="status">{notice}</p>:null}
  <div className="svc-section-title"><h2>我代建的訂單</h2><button type="button" className="svc-secondary" onClick={()=>void refresh()}><RefreshCw size={16}/> 重新整理</button></div>
  {loading?<p className="svc-empty" role="status">正在讀取代建紀錄…</p>:rows.length?<div className="svc-desk-grid">{rows.map(row=><article key={row.requestId} className="svc-panel svc-desk-card"><div className="svc-section-title"><h3>{choices.find(choice=>choice.value===row.kind)?.label||'訂單'}</h3><span className="svc-badge">{labels[row.status]||row.status}</span></div><p>老闆：{row.customerId}</p><small className="svc-muted">{date(row.createdAt)}</small>{row.channelUrl?<a href={row.channelUrl} target="_blank" rel="noreferrer">前往 Discord 訂單頻道 <ArrowUpRight size={15}/></a>:null}</article>)}</div>:<p className="svc-empty">目前沒有代建紀錄。</p>}
 </section>;
}
