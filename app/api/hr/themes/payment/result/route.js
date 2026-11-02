import { HR_ORIGIN } from "@/lib/hrThemeServer";
// 官方規格 15076.md，2026-11-02 即時查閱。前景跳轉不解鎖，仍等待 S2S 驗款。
export async function POST(){return new Response(null,{status:303,headers:{Location:`${HR_ORIGIN}/resources/appearance?payment=pending`,"Cache-Control":"no-store"}});}
