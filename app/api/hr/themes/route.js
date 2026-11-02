import { hrFail } from "@/lib/hrServer";
import { db,hrAuth,themeJson,themeStoreState,HR_THEMES } from "@/lib/hrThemeServer";
export async function GET(request){try{return themeJson(await themeStoreState(await hrAuth(request)));}catch(error){return hrFail(error);}}
export async function POST(request){try{
  const actor=await hrAuth(request),body=await request.json();
  if(!HR_THEMES.some(t=>t.key===body.theme))throw Error("主題無效");
  const {error}=await db.rpc("hr_apply_theme",{p_discord_id:actor.discordId,p_theme:body.theme});if(error)throw error;
  return themeJson({ok:true,theme:body.theme});
}catch(error){return hrFail(error);}}
