import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getErpAccessByDiscordId } from "@/lib/erpAccess";
export const SERVICE_STORES = {
 qiunai: { name: "秋奈電競", staff: "qiunai_staff", guild: "1513174069087047731", role: "1513203868895412305", channel: "1566885603637854269", token: "QIUNAI_SERVICE_BOT_TOKEN" },
 deepnight: { name: "深夜不關燈", staff: "players", guild: "1501836172199202856", role: "1502010574781943989", channel: "1566890399765762208", token: "DEEPNIGHT_SERVICE_BOT_TOKEN" },
};
const negativeAccess = new Map(), negativeMembership = new Map(), roleCache = new Map(), inFlight = new Map();
const actorRates = new Map();
const fail = (status, message) => Object.assign(Error(message), { status });
async function discordRead(config, path) {
 const cached = path.endsWith('/roles') ? roleCache.get(path) : negativeMembership.get(path);
 if (cached && cached.until > Date.now()) return cached.value;
 const token = process.env[config.token];
 if (!token) throw fail(503, "客服權限驗證尚未完成設定");
 const response = await fetch(`https://discord.com/api/v10${path}`, {
  headers: { Authorization: `Bot ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
 });
 if (response.status === 404) {
  negativeMembership.set(path, { until: Date.now()+60000, value: null });
  if(negativeMembership.size>5000)negativeMembership.delete(negativeMembership.keys().next().value);
  return null;
 }
 if (!response.ok) throw fail(503, "Discord 權限驗證暫時無法使用");
 const data = await response.json();
 if(path.endsWith('/roles'))roleCache.set(path,{until:Date.now()+60000,value:data});
 return data;
}
// No positive membership cache: removing a CS role takes effect on the next request.
async function checkService(discordId, organization) {
 const config = Object.hasOwn(SERVICE_STORES, organization) ? SERVICE_STORES[organization] : null;
 if (!config || !/^\d{15,22}$/.test(String(discordId))) return false;
 const access = await getErpAccessByDiscordId(supabaseAdmin, organization, discordId);
 if (access.assignment?.is_active === false) return false;
 if (access.capabilities.canReviewOrdersAndTips) return true;
 const { data: staff, error } = await supabaseAdmin.from(config.staff).select("discord_id,is_active").eq("discord_id", discordId).maybeSingle();
 if (error) throw error;
 if (!staff || staff.is_active === false) return false;
 const negativeKey=`${organization}:${discordId}`;
 if((negativeAccess.get(negativeKey)||0)>Date.now())return false;
 const member = await discordRead(config, `/guilds/${config.guild}/members/${discordId}`);
 if (!member || member.pending) return false;
 if (member.roles?.includes(config.role)) return true;
 const roles = await discordRead(config, `/guilds/${config.guild}/roles`);
 const allowed=Array.isArray(roles) && roles.some((role) => member.roles?.includes(role.id) && (BigInt(role.permissions) & 8n) !== 0n);
 if(!allowed){negativeAccess.set(negativeKey,Date.now()+30000);if(negativeAccess.size>5000)negativeAccess.delete(negativeAccess.keys().next().value);}
 return allowed;
}
export async function canReadService(discordId, organization) {
 const key=`${organization}:${discordId}`;
 if(inFlight.has(key))return inFlight.get(key);
 const pending=checkService(discordId,organization);
 inFlight.set(key,pending);
 try{return await pending;}finally{inFlight.delete(key);}
}
export async function requireService(discordId, organization) {
 if (!await canReadService(discordId, organization)) throw fail(403, "僅此店客服與主管可以閱讀課程及使用客服工具");
}
export async function serviceAuth(request) {
 let auth;
 try { auth = await getAuthUserFromRequest(supabaseAdmin, request); }
 catch { throw fail(401, "請使用 Discord 登入客服工作台"); }
 const now=Date.now();
 const previous=actorRates.get(auth.discordId);
 const rate=previous&&previous.until>now?previous:{until:now+60000,count:0};
 if(++rate.count>120)throw fail(429,"操作太頻繁，請稍候再試");
 actorRates.set(auth.discordId,rate);
 if(actorRates.size>5000)actorRates.delete(actorRates.keys().next().value);
 const keys=Object.keys(SERVICE_STORES);
 const results=await Promise.allSettled(keys.map((key)=>canReadService(auth.discordId,key)));
 const departments=keys.flatMap((key,index)=>results[index].status==='fulfilled'&&results[index].value?[{key,name:SERVICE_STORES[key].name}]:[]);
 if (!departments.length) throw results.some((result)=>result.status==='rejected')?fail(503,"客服權限驗證暫時無法使用"):fail(403,"僅客服與主管可以使用客服工作台");
 return { ...auth, departments };
}
export function serviceFail(error) {
 const status = [400, 401, 403, 404, 409, 429].includes(Number(error?.status)) ? Number(error.status) : 503;
 return Response.json({ ok: false, message: status >= 500 ? "客服服務暫時無法使用，請稍後重試" : error.message }, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}
