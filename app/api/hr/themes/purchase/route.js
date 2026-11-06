import { hrFail } from "@/lib/hrServer";
import { db,hrAuth,themeJson,UUID,themeEcpayConfig,newThemeTradeNo,postEcpay,taipeiTradeDate,HR_ORIGIN,themeOrder,HR_THEMES } from "@/lib/hrThemeServer";
export async function POST(request){let order;
 try{
  const actor=await hrAuth(request),body=await request.json();
  if(!UUID.test(String(body.requestId||"")) || !["ecpay","salary","asd"].includes(body.method) || body.confirmed!==true || !HR_THEMES.some(t=>t.key===body.theme&&t.price>0))throw Error("請確認主題、金額及付款方式");
  if(body.method==="salary"&&!actor.departments.some(d=>d.key===body.department))throw Error("請選擇你所屬的扣薪部門");
  const email=String(body.email||"").trim();let config=null;
  if(body.method==="ecpay"){
    config=themeEcpayConfig();
    if(config.stage)throw Object.assign(Error("目前為綠界測試環境，正式主題付款尚未開放"),{status:503});
    if(!/^[^ @]+@[^ @]+\.[^ @]+$/.test(email)||email.length>100)throw Error("請填寫付款電子郵件");
  }
  const {data,error}=await db.rpc("hr_buy_theme_atomic",{p_discord_id:actor.discordId,p_theme:body.theme,p_method:body.method,p_request_id:body.requestId,p_department:body.method==="salary"?body.department:null,p_merchant_id:config?.merchantId||null,p_trade_no:config?newThemeTradeNo():null,p_email:config?email:null});
  if(error)throw error;if(data.alreadyOwned||data.status==="paid")return themeJson({ok:true,owned:true,order:data});
  if(data.payment_method!==body.method)throw Object.assign(Error("此主題已有綠界付款單，請先查詢或取消尚未送出的付款"),{status:409});
  order=await themeOrder(data.id,actor.discordId);
  if(order.status==="processing")return themeJson({ok:true,pending:true,order:data});
  if(order.status!=="pending"||new Date(order.expires_at).getTime()<=Date.now())throw Object.assign(Error("付款表單已過期，請取消此未送出的付款單後重試"),{status:409});
  if(!order.gateway_token){
    // 官方規格 9040.md，2026-11-02 即時查閱。價格一律讀已建立的資料庫訂單。
    const result=await postEcpay("/Merchant/GetTokenbyTrade",{MerchantID:config.merchantId,RememberCard:0,PaymentUIType:2,ChoosePaymentList:"1",
      OrderInfo:{MerchantTradeDate:taipeiTradeDate(),MerchantTradeNo:order.merchant_trade_no,TotalAmount:order.amount,ReturnURL:`${HR_ORIGIN}/api/hr/themes/payment/callback`,TradeDesc:"員工主題購買",ItemName:HR_THEMES.find(t=>t.key===order.theme_key).name},
      CardInfo:{OrderResultURL:`${HR_ORIGIN}/api/hr/themes/payment/result`},ConsumerInfo:{Email:email}},config);
    if(Number(result.RtnCode)!==1||!result.Token)throw Error(result.RtnMsg||"無法建立綠界付款表單");
    const saved=await db.from("hr_theme_orders").update({gateway_token:result.Token}).eq("id",order.id).eq("status","pending").select("id");if(saved.error)throw saved.error;if(!saved.data.length)throw Error("付款單狀態已改變，請重新查詢");order.gateway_token=result.Token;
  }
  return themeJson({ok:true,order:data,token:order.gateway_token,environment:config.stage?"Stage":"Prod"});
 }catch(error){return hrFail(error);}
}
