import { hrFail } from "@/lib/hrServer";
import { db,hrAuth,themeJson,themeOrder } from "@/lib/hrThemeServer";
export async function POST(request){try{
 const actor=await hrAuth(request),body=await request.json(),order=await themeOrder(body.orderId,actor.discordId);
 const result=await db.from("hr_theme_orders").update({status:"cancelled",gateway_token:null}).eq("id",order.id).eq("status","pending").select("id");
 if(result.error)throw result.error;if(!result.data.length)throw Error("此筆交易已送出付款，請查詢結果，勿重複付款");return themeJson({ok:true});
}catch(error){return hrFail(error);}}
