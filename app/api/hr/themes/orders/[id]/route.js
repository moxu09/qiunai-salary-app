import { hrFail } from "@/lib/hrServer";
import { db,hrAuth,themeJson,themeOrder,themeEcpayConfig,queryThemePayment,grantThemePayment } from "@/lib/hrThemeServer";
export async function GET(request,context){try{
 const actor=await hrAuth(request),{id}=await context.params,order=await themeOrder(id,actor.discordId);
 return themeJson({ok:true,order:{id:order.id,theme_key:order.theme_key,status:order.status,amount:order.amount,paid_at:order.paid_at}});
}catch(error){return hrFail(error);}}

export async function POST(request,context){try{
 const actor=await hrAuth(request),{id}=await context.params,order=await themeOrder(id,actor.discordId);
 if(order.status!=="processing"||order.payment_method!=="ecpay")return themeJson({ok:true,status:order.status});
 const tenMinutesAgo=new Date(Date.now()-600000).toISOString();
 if(!order.submitted_at||order.submitted_at>tenMinutesAgo)return themeJson({ok:true,status:"processing",message:"付款後 10 分鐘仍未確認時，可再向綠界查詢；目前尚未解鎖。"});
 const claim=await db.from("hr_theme_orders").update({last_queried_at:new Date().toISOString()}).eq("id",id).eq("status","processing").or(`last_queried_at.is.null,last_queried_at.lt.${tenMinutesAgo}`).select("id");
 if(claim.error)throw claim.error;if(!claim.data.length)return themeJson({ok:true,status:"processing",message:"已向綠界查詢，請 10 分鐘後再試。"});
 const config=themeEcpayConfig(),verified=await queryThemePayment(order,config);
 if(verified){await grantThemePayment(verified,config);return themeJson({ok:true,status:"paid",message:"付款已核對成功，可以套用主題。"});}
 return themeJson({ok:true,status:"processing",message:"綠界尚未確認付款，請勿重複付款，10 分鐘後可再查詢。"});
}catch(error){return hrFail(error);}}
