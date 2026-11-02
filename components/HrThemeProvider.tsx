"use client";
/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { MoonStar, Sparkles, Gamepad2, Headphones, Cloud, Heart, Star, LampDesk, Music2, Ghost, Cat, Skull, FlaskConical, Candy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { HR_THEMES, FREE_HR_THEMES, canUseHrTheme } from "@/lib/hrThemes.mjs";
export type HrTheme = "qiunai" | "deepnight" | "white" | "black" | "blue" | "gray" | "pink" | "halloween-2026";
export type ThemeOrder = {id:string;theme_key:string;payment_method:string;amount:number;status:string;department:string;expires_at:string;created_at:string;merchant_trade_no?:string};
export type ThemeProduct = {key:string;name:string;price:number;description:string;scene?:string;color?:string;saleEndsAt?:string|null};
type Store = {owned:string[];selected?:string|null;products:ThemeProduct[];orders:ThemeOrder[];departments:{key:string;name:string}[];asdBalance:number;ecpayReady:boolean};
const EMPTY:Store={owned:[],products:HR_THEMES,orders:[],departments:[],asdBalance:0,ecpayReady:false};
const STORAGE_KEY="wearestillhere.hr.appearance";
export async function hrThemeRequest(path:string,body?:unknown){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error("請先登入員工 HR");
 const response=await fetch(path,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"});
 const result=await response.json();if(!response.ok)throw Error(result.message||"主題服務暫時無法使用");return result;
}
const ThemeContext=createContext<{theme:HrTheme;setTheme:(theme:HrTheme)=>Promise<void>;store:Store;refresh:()=>Promise<void>;error:string;ready:boolean}>({theme:"qiunai",setTheme:async()=>{},store:EMPTY,refresh:async()=>{},error:"",ready:false});
export const useHrTheme=()=>useContext(ThemeContext);
export default function HrThemeProvider({children}:{children:ReactNode}){
 const [theme,updateTheme]=useState<HrTheme>("qiunai"),[store,setStore]=useState<Store>(EMPTY),[error,setError]=useState(""),[ready,setReady]=useState(false);
 const generation=useRef(0),authUserId=useRef<string|null>(null);
 const refresh=useCallback(async()=>{
  const currentGeneration=++generation.current;
  try{
   const {data}=await supabase.auth.getSession();
   if(currentGeneration!==generation.current)return;
   if(!data.session){setStore(EMPTY);updateTheme(current=>FREE_HR_THEMES.includes(current)?current:"qiunai");return;}
   const result=await hrThemeRequest("/api/hr/themes");if(currentGeneration!==generation.current)return;setStore(result);setError("");
   if(canUseHrTheme(result.selected,result.owned))updateTheme(result.selected as HrTheme);
   else updateTheme(current=>canUseHrTheme(current,result.owned)?current:"qiunai");
  }catch(caught){setError(caught instanceof Error?caught.message:"讀取主題失敗");}finally{setReady(true);}
 },[]);
 useEffect(()=>{
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved&&FREE_HR_THEMES.includes(saved))updateTheme(saved as HrTheme);}catch{}
  void refresh();
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{const nextId=session?.user.id||null;if(nextId!==authUserId.current){authUserId.current=nextId;generation.current++;setStore(EMPTY);updateTheme(current=>FREE_HR_THEMES.includes(current)?current:"qiunai");}setTimeout(()=>void refresh(),0);});
  return ()=>data.subscription.unsubscribe();
 },[refresh]);
 async function setTheme(next:HrTheme){
  if(!canUseHrTheme(next,store.owned))throw Error("請先完成付款才能套用此主題");
  const {data}=await supabase.auth.getSession();
  if(data.session)await hrThemeRequest("/api/hr/themes",{theme:next});
  else if(!FREE_HR_THEMES.includes(next))throw Error("請先登入員工 HR");
  generation.current++;updateTheme(next);try{localStorage.setItem(STORAGE_KEY,next);}catch{}
 }
 return <ThemeContext.Provider value={{theme,setTheme,store,refresh,error,ready}}><div className={`hr-theme-root hr-theme-${theme}${["white","black","blue","gray","pink"].includes(theme)?" hr-theme-solid":""}`}>{children}</div></ThemeContext.Provider>;
}
export function HrSceneImage({theme:selected,sizes="(max-width: 760px) 100vw, 70vw",eager=false}:{theme?:HrTheme;sizes?:string;eager?:boolean}){
 const {theme}=useHrTheme();const product=HR_THEMES.find(t=>t.key===(selected||theme));if(!product?.scene)return null;
 return <span className="hr-scene-image" aria-hidden="true"><Image src={product.scene} alt="" fill sizes={sizes} loading={eager?"eager":"lazy"}/></span>;
}
export function HrThemeArtwork({theme:selected}:{theme?:HrTheme}){
 const {theme}=useHrTheme();const current=selected||theme;if(!["qiunai","deepnight","halloween-2026"].includes(current))return null;
 return <span className={`hr-theme-artwork hr-art-${current}`} aria-hidden="true"><span className="hr-art-orbit"/><Sparkles className="hr-art-sparkle" size={25}/>{current==="qiunai"?<img src="/brand/xiaonai.png" alt="" width={700} height={700}/>:current==="deepnight"?<><span className="hr-art-moon"/><img src="/brand/deepnight-gold.png" alt="" width={1200} height={789}/></>:<Ghost size={65}/>}<span className="hr-art-star">✦</span></span>;
}
export function HrThemeDecorations(){const {theme}=useHrTheme();if(["white","black","blue","gray","pink"].includes(theme))return null;const icons=theme==="qiunai"?[Gamepad2,Cloud,Heart,Headphones,Star,Sparkles]:theme==="halloween-2026"?[Ghost,Cat,Skull,FlaskConical,Candy,MoonStar]:[MoonStar,LampDesk,Star,Headphones,Music2,Sparkles];return <div className="hr-scene-decorations" aria-hidden="true"><HrSceneImage sizes="100vw" eager/>{icons.map((Icon,index)=><span className={`hr-scene-sticker hr-scene-sticker-${index}`} key={index}><Icon strokeWidth={1.4}/></span>)}</div>;}
export function HrSidebarArtwork(){const {theme}=useHrTheme();if(["white","black","blue","gray","pink"].includes(theme))return null;return <div className="hr-sidebar-art" aria-hidden="true"><HrSceneImage sizes="220px"/><HrThemeArtwork/></div>;}
export function HrThemeBanner(){const {theme}=useHrTheme();const product=HR_THEMES.find(t=>t.key===theme);return <div className="hr-theme-banner"><HrSceneImage eager/><div className="hr-theme-banner-copy"><span className="hr-theme-kicker">{theme==="qiunai"?"QIUNAI · A LITTLE JOY EVERY DAY":theme==="deepnight"?"DEEPNIGHT · WE ARE STILL HERE":theme==="halloween-2026"?"HALLOWEEN · TRICK OR TREAT":"YOUR HR · YOUR SPACE"}</span><h2>{theme==="qiunai"?"小奈陪你，今天也一起加油！":theme==="deepnight"?"夜再深，這裡總有一盞燈。":theme==="halloween-2026"?"萬聖夜，歡迎來到幽靈遊戲屋！":`${product?.name}・專注每一天。`}</h2><p>{theme==="qiunai"?"把日常交給 HR，留一點可愛給自己。":theme==="deepnight"?"在熟悉的星光裡，安心處理每一天的大小事。":theme==="halloween-2026"?"南瓜燈亮起，跟幽靈朋友一起完成今天的任務。":"個人資料、薪資、訂單與簽核，都在同一個 HR。"}</p></div><HrThemeArtwork/></div>;}
export {default as HrAppearancePanel} from "@/components/HrThemeShop";
export { ThemeContext as HrThemeContext };
