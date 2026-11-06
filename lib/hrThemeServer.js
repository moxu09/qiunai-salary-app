import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";
import { hrAuth } from "@/lib/hrServer";
import { HR_THEMES, canUseHrTheme, verifiedThemePayment, confirmedThemeQuery, failedThemePayment } from "@/lib/hrThemes.mjs";
import { postEcpay, taipeiTradeDate, decryptEcpayData } from "@/lib/ichibanEcpay";
export { db, hrAuth, HR_THEMES, postEcpay, taipeiTradeDate, decryptEcpayData };
export const HR_ORIGIN = "https://hr.wearestilllhere.com";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const themeJson = (data, status=200) => Response.json(data, { status, headers:{"Cache-Control":"no-store"} });
export function themeEcpayConfig() {
  const merchantId=process.env.ECPAY_MERCHANT_ID,hashKey=process.env.ECPAY_HASH_KEY,hashIv=process.env.ECPAY_HASH_IV;
  if(process.env.ECPAY_HR_THEMES_ENABLED==="false" || !merchantId || !hashKey || !hashIv) throw Object.assign(Error("主題綠界付款尚未開放"),{status:503});
  if(Buffer.byteLength(hashKey)!==16 || Buffer.byteLength(hashIv)!==16) throw Object.assign(Error("綠界付款設定錯誤"),{status:503});
  const stage=process.env.ECPAY_ENV==="stage";
  return {merchantId,hashKey,hashIv,stage,baseUrl:stage?"https://ecpg-stage.ecpay.com.tw":"https://ecpg.ecpay.com.tw"};
}
export async function themeOrder(id,discordId) {
  if(!UUID.test(String(id||""))) throw Error("購買識別碼無效");
  const {data,error}=await db.from("hr_theme_orders").select("*").eq("id",id).eq("discord_id",discordId).maybeSingle();
  if(error) throw error;if(!data) throw Object.assign(Error("找不到此購買訂單"),{status:404});return data;
}
export async function themeStoreState(actor) {
  const [entitlements,preferences,orders,balance,catalog]=await Promise.all([
    db.from("hr_theme_entitlements").select("theme_key,granted_at").eq("discord_id",actor.discordId),
    db.from("hr_theme_preferences").select("theme_key").eq("discord_id",actor.discordId).maybeSingle(),
    db.from("hr_theme_orders").select("id,theme_key,payment_method,amount,status,department,created_at,expires_at,paid_at").eq("discord_id",actor.discordId).order("created_at",{ascending:false}).limit(30),
    db.from("users").select("coins").eq("user_id",actor.discordId).maybeSingle(),
    db.from("hr_theme_catalog").select("key,price,sale_ends_at"),
  ]);
  for(const result of [entitlements,preferences,orders,balance,catalog]) if(result.error) throw result.error;
  const owned=entitlements.data.map(item=>item.theme_key);
  let ecpayReady=false;try{ecpayReady=!themeEcpayConfig().stage;}catch{}
  return {ok:true,owned,selected:canUseHrTheme(preferences.data?.theme_key,owned)?preferences.data.theme_key:null,
    products:HR_THEMES.map(theme=>{const row=catalog.data.find(p=>p.key===theme.key);return {...theme,...(row?{price:row.price,saleEndsAt:row.sale_ends_at}:{} )};}),
    orders:orders.data,asdBalance:Number(balance.data?.coins||0),ecpayReady,
    departments:actor.departments.map(d=>({key:d.key,name:d.key==="qiunai"?"秋奈電競":"深夜不關燈"})),};
}
export async function queryThemePayment(order,config) {
  if(config.stage)throw Error("測試環境不能解鎖正式主題");
  // 官方規格 9083.md，2026-11-02 即時查閱。查詢使用 ecpayment 網域，TradeStatus=1 才已付款。
  const result=await postEcpay("/1.0.0/Cashier/QueryTrade",{MerchantID:config.merchantId,MerchantTradeNo:order.merchant_trade_no},{...config,baseUrl:"https://ecpayment.ecpay.com.tw"});
  return confirmedThemeQuery(result,order);
}
export async function grantThemePayment(verified,config) {
  const {error}=await db.rpc("hr_complete_theme_payment",{p_trade_no:verified.tradeNo,p_merchant_id:config.merchantId,p_gateway_trade_no:verified.gatewayTradeNo,p_amount:verified.amount});
  if(error)throw error;
}
export async function fulfillThemePayment(data,config) {
  if(config.stage)throw Error("測試環境不能解鎖正式主題");
  const verified=verifiedThemePayment(data,config.merchantId);
  if(!verified){
    const tradeNo=String(data.OrderInfo?.MerchantTradeNo||"");
    if(!/^HT[A-F0-9]{18}$/.test(tradeNo))return;
    const result=await db.from("hr_theme_orders").select("*").eq("merchant_trade_no",tradeNo).maybeSingle();if(result.error)throw result.error;
    if(result.data&&failedThemePayment(data,result.data)){
      const failed=await db.from("hr_theme_orders").update({status:"failed",reason:String(data.RtnMsg||"付款失敗").slice(0,200),gateway_token:null}).eq("id",result.data.id).in("status",["pending","processing"]);if(failed.error)throw failed.error;
    }
    return;
  }
  const result=await db.from("hr_theme_orders").select("*").eq("merchant_trade_no",verified.tradeNo).maybeSingle();
  if(result.error)throw result.error;const order=result.data;
  if(!order||order.merchant_id!==config.merchantId||order.amount!==verified.amount)throw Error("主題付款訂單不符");
  if(order.status!=="paid"){
    const confirmed=await queryThemePayment(order,config);
    if(!confirmed||confirmed.gatewayTradeNo!==verified.gatewayTradeNo)throw Error("綠界付款仍待確認");
  }
  await grantThemePayment(verified,config);
}
export const newThemeTradeNo=()=>`HT${randomBytes(9).toString("hex").toUpperCase()}`;
