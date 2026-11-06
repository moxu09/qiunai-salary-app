"use client";
import { useEffect,useRef,useState } from "react";
import { Check,LockKeyhole,Palette,LoaderCircle,X,Ghost } from "lucide-react";
import { useHrTheme,hrThemeRequest,HrSceneImage,type HrTheme,type ThemeProduct,type ThemeOrder } from "@/components/HrThemeProvider";
import { isHrThemeOnSale,FREE_HR_THEMES } from "@/lib/hrThemes.mjs";

type Payment={order:ThemeOrder;token:string;environment:string};
type EcpaySdk={Language:{zhTW:string};initialize:(environment:string,loading:number,callback:(error?:string)=>void)=>void;createPayment:(token:string,language:string,callback:(error?:string)=>void,version:string)=>void;getPayToken:(callback:(info:{PayToken?:string;MerchantTradeNo?:string},error?:string)=>void)=>void};
declare global {interface Window {ECPay?:EcpaySdk;jQuery?:unknown;forge?:unknown;}}
const scriptLoads=new Map<string,Promise<void>>();
function loadScript(src:string){if(scriptLoads.has(src))return scriptLoads.get(src)!;const loading=new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=()=>resolve();script.onerror=()=>{scriptLoads.delete(src);script.remove();reject(Error("綠界付款元件載入失敗，請稍後重試"));};document.head.appendChild(script);});scriptLoads.set(src,loading);return loading;}
export async function loadHrThemeEcpay(environment:string){
 if(!window.jQuery)await loadScript("https://code.jquery.com/jquery-3.7.1.min.js");
 if(!window.forge)await loadScript("https://cdn.jsdelivr.net/npm/node-forge@1.4.2/dist/forge.min.js");
 if(!window.ECPay)await loadScript(`https://${environment==="Stage"?"ecpg-stage":"ecpg"}.ecpay.com.tw/Scripts/sdk-1.0.0.js`);
 if(!window.ECPay)throw Error("綠界付款元件尚未就緒");return window.ECPay;
}
const statusLabel:Record<string,string>={pending:"尚未送出付款",processing:"付款結果確認中",paid:"已付款",failed:"付款失敗",cancelled:"已取消"};
export default function HrThemeShop(){
 const {theme,setTheme,store,refresh,error:storeError,ready}=useHrTheme();
 const [selected,setSelected]=useState<ThemeProduct|null>(null),[method,setMethod]=useState("asd"),[department,setDepartment]=useState(""),[email,setEmail]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[payment,setPayment]=useState<Payment|null>(null),[sdkReady,setSdkReady]=useState(false),[requestId,setRequestId]=useState("");
 const checkoutRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(store.departments.length&&!department)setDepartment(store.departments[0].key);},[store.departments,department]);
 useEffect(()=>{if(selected)checkoutRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[selected]);
 useEffect(()=>{if(!payment)return;let active=true;setSdkReady(false);
  void loadHrThemeEcpay(payment.environment).then(sdk=>{if(!active)return;return new Promise<void>((resolve,reject)=>sdk.initialize(payment.environment,0,err=>{if(!active)return resolve();if(err)return reject(Error(err));sdk.createPayment(payment.token,sdk.Language.zhTW,err=>err?reject(Error(err)):resolve(),"V2");}));}).then(()=>{if(active)setSdkReady(true);}).catch(caught=>{if(active)setError(String(caught.message||caught));});
  return ()=>{active=false;};
 },[payment]);
 useEffect(()=>{if(!store.orders.some(order=>order.status==="processing"))return;const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[store.orders,refresh]);
 useEffect(()=>{if(payment&&store.owned.includes(payment.order.theme_key)){setPayment(null);setSelected(null);setMessage("付款已完成，現在可以套用主題。");}},[store.owned,payment]);
 useEffect(()=>{if(payment&&store.orders.some(order=>order.id===payment.order.id&&order.status==="failed")){setPayment(null);setSelected(null);setMessage("");setError("綠界付款未成功，主題尚未解鎖，可以重新選擇付款方式。");}},[store.orders,payment]);
 async function apply(product:ThemeProduct){setError("");setBusy(true);try{await setTheme(product.key as HrTheme);setMessage(`已套用${product.name}。`);}catch(caught){setError(caught instanceof Error?caught.message:"套用失敗");}finally{setBusy(false);}}
 function choose(product:ThemeProduct,order?:ThemeOrder){setError("");setMessage("");setConfirmed(false);setPayment(null);setSdkReady(false);setRequestId(order?.id||crypto.randomUUID());setMethod(order?.payment_method||"asd");setSelected(product);}
 async function begin(){if(!selected||!confirmed||busy)return;setError("");setBusy(true);try{
  const result=await hrThemeRequest("/api/hr/themes/purchase",{theme:selected.key,method,department,email,confirmed,requestId});
  await refresh();if(result.owned){setSelected(null);setMessage("購買成功，可以套用此主題。");}
  else if(result.token){setPayment(result);setMessage("請在綠界表單完成資料，再按「確認綠界付款」。");}
  else setMessage("付款結果確認中；確認成功後才會解鎖，請勿重複付款。");
 }catch(caught){setError(caught instanceof Error?caught.message:"購買失敗，請重新查詢付款狀態");await refresh();}finally{setBusy(false);}}
 async function pay(){if(!payment||!window.ECPay||busy)return;setError("");setBusy(true);try{
  const token=await new Promise<string>((resolve,reject)=>window.ECPay!.getPayToken((info,err)=>err?reject(Error(err)):info?.MerchantTradeNo!==payment.order.merchant_trade_no?reject(Error("付款單已變更，請重新開啟此付款表單")):info?.PayToken?resolve(info.PayToken):reject(Error("尚未取得付款代碼"))));
  const result=await hrThemeRequest("/api/hr/themes/payment/create",{orderId:payment.order.id,payToken:token});
  if(result.threeDUrl){window.location.assign(result.threeDUrl);return;}
  setSdkReady(false);await refresh();setMessage("付款已送出，正在確認結果；成功後才會解鎖主題，請勿重複付款。");
 }catch(caught){setError(caught instanceof Error?caught.message:"付款狀態尚待確認，請勿重複付款");setSdkReady(false);await refresh();}finally{setBusy(false);}}
 async function cancel(order:ThemeOrder){setBusy(true);setError("");try{await hrThemeRequest("/api/hr/themes/payment/cancel",{orderId:order.id});if(payment?.order.id===order.id){setPayment(null);setSelected(null);}await refresh();setMessage("已取消尚未送出的付款單。");}catch(caught){setError(caught instanceof Error?caught.message:"無法取消付款");}finally{setBusy(false);}}
 async function reconcile(order:ThemeOrder){setBusy(true);setError("");try{const result=await hrThemeRequest(`/api/hr/themes/orders/${order.id}`,{});await refresh();setMessage(result.message||"已更新付款結果。");}catch(caught){setError(caught instanceof Error?caught.message:"查詢失敗，尚未解鎖主題");}finally{setBusy(false);}}
 return <section className="hr-card hr-appearance-panel">
  <div className="hr-appearance-heading"><Palette size={22}/><h1>外觀主題</h1></div>
  <p className="hr-note">秋奈與深夜主題免費使用。付費主題一次購買、永久使用，付款完成後才能套用；兩家店的資料仍會一併顯示。</p>
  {(error||storeError)?<p className="hr-error" role="alert">{error||storeError}</p>:null}
  {message?<p className="hr-success" role="status">{message}</p>:null}
  {selected?<section className="hr-theme-checkout" ref={checkoutRef} aria-label="主題付款">
    <div className="hr-checkout-heading"><div><h2>{selected.name}</h2><p>NT${selected.price}・永久使用{selected.saleEndsAt?"・2026/11/30 截止販售":"・長期販售"}</p></div><button type="button" className="qiunai-soft-button" aria-label="關閉主題付款" disabled={busy} onClick={()=>{setSelected(null);setPayment(null);}}><X size={20}/></button></div>
    {!payment?<><label>付款方式<select aria-label="付款方式" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value);setConfirmed(false);}}><option value="asd">ASD 餘額</option><option value="salary">扣薪</option><option value="ecpay" disabled={!store.ecpayReady}>綠界信用卡（內嵌式）{!store.ecpayReady?"・目前未開放":""}</option></select></label>
      {method==="asd"?<p className="hr-note">目前 ASD 餘額：{store.asdBalance.toLocaleString("zh-TW")} ASD。本次將扣除 {selected.price} ASD；餘額不足不會扣款。</p>:null}
      {method==="salary"?<><label>扣薪部門<select aria-label="扣薪部門" value={department} disabled={busy} onChange={e=>{setDepartment(e.target.value);setConfirmed(false);}}>{store.departments.map(d=><option value={d.key} key={d.key}>{d.name}</option>)}</select></label><p className="hr-note">從所選部門的可用薪資扣除 NT${selected.price}，同時記入薪資扣項；可用薪資不足不會扣款。</p></>:null}
      {method==="ecpay"?<label>付款電子郵件<input aria-label="付款電子郵件" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" disabled={busy}/></label>:null}
      <label className="hr-theme-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>我確認購買「{selected.name}」，費用 {method==="asd"?`${selected.price} ASD`:`NT$${selected.price}`}，並同意使用上述方式付款。</span></label>
      <button type="button" className="qiunai-button hr-submit" disabled={!ready||!confirmed||busy||(method==="salary"&&!department)||(method==="ecpay"&&!store.ecpayReady)} onClick={()=>void begin()}>{busy?<LoaderCircle size={17} className="animate-spin"/>:null}{method==="ecpay"?"建立綠界付款表單":method==="salary"?`確認扣薪 NT$${selected.price} 並購買`:`確認扣除 ${selected.price} ASD 並購買`}</button>
    </>:<><div id="ECPayPayment"/><button type="button" className="qiunai-button hr-submit" disabled={!sdkReady||busy} onClick={()=>void pay()}>{busy?<LoaderCircle className="animate-spin" size={17}/>:null}確認綠界付款 NT${payment.order.amount}</button><p className="hr-note">刷卡與必要的銀行 3D 驗證由綠界處理。畫面返回或付款通知尚未確認時，不會先解鎖主題。</p></>}
  </section>:null}
  <div className="hr-theme-options" role="group" aria-label="選擇 HR 外觀主題">
    {store.products.map(product=>{const owned=FREE_HR_THEMES.includes(product.key)||store.owned.includes(product.key),onSale=isHrThemeOnSale(product),active=theme===product.key;return <article key={product.key} className={`hr-theme-option hr-option-${product.key}${active?" is-selected":""}`}>
      <div className="hr-theme-option-preview" style={product.color?{background:product.color}:undefined}>{product.scene?<HrSceneImage theme={product.key as HrTheme} sizes="(max-width: 760px) 100vw, 35vw"/>:<span className="hr-solid-preview" style={{color:product.key==="black"?"#fff":"#203047"}}>Aa<span>純色工作空間</span></span>}{product.key==="halloween-2026"?<span className="hr-seasonal-badge"><Ghost size={14}/>萬聖節限定</span>:null}</div>
      <div className="hr-theme-option-info"><h2 className="hr-theme-option-title">{product.name}</h2><p className="hr-theme-option-description">{product.description}</p><p className="hr-theme-price">{product.price===0?"免費":`NT$${product.price}`}<span>{product.price>0?"永久使用":"隨時切換"}</span></p>{product.saleEndsAt?<p className="hr-theme-deadline">2026/11/30 截止販售・已購買可永久使用</p>:null}
      {owned?<button type="button" className="hr-theme-option-status" aria-pressed={active} disabled={busy} onClick={()=>void apply(product)}>{active?<><Check size={17}/>使用中</>:"套用主題"}</button>:<button type="button" className="hr-theme-option-status" disabled={busy||!onSale} onClick={()=>choose(product)}><LockKeyhole size={16}/>{onSale?`購買 NT$${product.price}`:"已停止販售"}</button>}</div>
    </article>;})}
  </div>
  <p className="hr-note hr-theme-saved" role="status">目前使用：{store.products.find(p=>p.key===theme)?.name}。付費主題會保留在你的員工帳號中。</p>
  {store.orders.length?<section className="hr-theme-history"><div className="hr-checkout-heading"><h2>購買紀錄</h2><button type="button" className="qiunai-soft-button" disabled={busy} onClick={()=>void refresh()}>重新查詢</button></div>{store.orders.map(order=><div className="hr-theme-history-row" key={order.id}><div><strong>{store.products.find(p=>p.key===order.theme_key)?.name}</strong><p>NT${order.amount}・{order.payment_method==="asd"?"ASD":order.payment_method==="salary"?"扣薪":"綠界"}・{statusLabel[order.status]||order.status}</p><small>{new Date(order.created_at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</small></div>{order.status==="processing"?<button className="qiunai-soft-button" type="button" disabled={busy} onClick={()=>void reconcile(order)}>向綠界查詢付款</button>:null}{order.status==="pending"?<div><button className="qiunai-soft-button" type="button" disabled={busy} onClick={()=>{const product=store.products.find(p=>p.key===order.theme_key);if(product)choose(product,order);}}>繼續付款</button><button className="qiunai-soft-button" type="button" disabled={busy} onClick={()=>void cancel(order)}>取消未送出付款</button></div>:null}</div>)}</section>:null}
 </section>;
}
