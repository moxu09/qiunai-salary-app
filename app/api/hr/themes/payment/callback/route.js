import { themeEcpayConfig,decryptEcpayData,fulfillThemePayment } from "@/lib/hrThemeServer";
export async function POST(request){try{
 const config=themeEcpayConfig(),outer=await request.json();
 if(Number(outer.TransCode)!==1||String(outer.MerchantID)!==config.merchantId)throw Error("付款通知驗證失敗");
 const data=decryptEcpayData(outer.Data,config);await fulfillThemePayment(data,config);
 return new Response("1|OK",{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}catch(error){console.error("[HR 主題付款通知]",error?.message||"驗證失敗");return new Response("retry",{status:500});}}
