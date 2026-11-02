import { hrFail } from "@/lib/hrServer";
import { db,hrAuth,themeJson,themeOrder,themeEcpayConfig,postEcpay } from "@/lib/hrThemeServer";
export async function POST(request){try{
 const actor=await hrAuth(request),body=await request.json();const order=await themeOrder(body.orderId,actor.discordId);
 if(order.status==="paid")return themeJson({ok:true,paid:true});if(order.status==="processing")return themeJson({ok:true,pending:true});
 const payToken=String(body.payToken||"");if(!payToken||payToken.length>2000)throw Error("付款代碼無效");
 if(order.payment_method!=="ecpay"||order.status!=="pending"||new Date(order.expires_at).getTime()<=Date.now())throw Error("付款單已失效");
 const config=themeEcpayConfig();if(config.stage||order.merchant_id!==config.merchantId)throw Error("付款環境不符");
 const claimed=await db.from("hr_theme_orders").update({status:"processing",submitted_at:new Date().toISOString()}).eq("id",order.id).eq("status","pending").gt("expires_at",new Date().toISOString()).select("id");if(claimed.error)throw claimed.error;if(!claimed.data.length)return themeJson({ok:true,pending:true});
 // 官方規格 9053.md，2026-11-02 即時查閱。逾時保留 processing，不重送扣款。
 const result=await postEcpay("/Merchant/CreatePayment",{MerchantID:config.merchantId,PayToken:payToken,MerchantTradeNo:order.merchant_trade_no},config);
 const threeDUrl=String(result.ThreeDInfo?.ThreeDURL||"");
 if(threeDUrl){if(!threeDUrl.startsWith("https://"))throw Error("綠界驗證網址不安全");return themeJson({ok:true,threeDUrl});}
 if(Number(result.RtnCode)===1||Number(result.RtnCode)===10300066)return themeJson({ok:true,pending:true});
 const failed=await db.from("hr_theme_orders").update({status:"failed",reason:String(result.RtnMsg||"付款失敗"),gateway_token:null}).eq("id",order.id).eq("status","processing");if(failed.error)throw failed.error;
 return themeJson({ok:false,message:result.RtnMsg||"付款失敗，尚未解鎖"},402);
}catch(error){return hrFail(error);}}
