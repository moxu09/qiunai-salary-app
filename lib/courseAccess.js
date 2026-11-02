import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAuthUserFromRequest } from '@/lib/salaryWallet';
import { getErpAccessByDiscordId } from '@/lib/erpAccess';
import { canReadService, SERVICE_STORES } from '@/lib/service/access';
import { audienceMatches, CourseError } from '@/lib/courseRules.mjs';
export async function courseIdentity(discordId, organization) {
  if (!Object.hasOwn(SERVICE_STORES, organization)) throw new CourseError('店家不正確',404);
  const [access, result] = await Promise.all([
    getErpAccessByDiscordId(supabaseAdmin, organization, discordId),
    supabaseAdmin.from(SERVICE_STORES[organization].staff).select('discord_id,is_active').eq('discord_id',discordId).maybeSingle(),
  ]);
  if (result.error) throw result.error;
  const revoked = access.assignment?.is_active === false || result.data?.is_active === false;
  return { discordId, active: !revoked && Boolean(result.data), manager: !revoked && access.capabilities.canViewAllAdmin === true };
}
export async function requireCourseAudience(discordId, organization, audience = {kind:'service'}) {
  const identity = await courseIdentity(discordId, organization);
  const service = !identity.manager && identity.active && (!audience || audience.kind==='service') ? await canReadService(discordId, organization) : false;
  if (!audienceMatches(audience, {...identity,service})) throw new CourseError('你不在此課程的開放對象內',403);
  return identity;
}
export async function courseAuth(request) {
  try { return await getAuthUserFromRequest(supabaseAdmin,request); }
  catch { throw new CourseError('請重新登入',401); }
}
export async function courseManager(request, organization) {
  const actor=await courseAuth(request);
  const identity=await courseIdentity(actor.discordId,organization);
  if(!identity.manager) throw new CourseError('僅主管可以管理課程',403);
  return identity;
}
export async function authorizeCourseReader(request) {
  const actor=await courseAuth(request);
  const results=await Promise.all(Object.keys(SERVICE_STORES).map(async key=>({key,identity:await courseIdentity(actor.discordId,key)})));
  const departments=results.filter(({identity})=>identity.active||identity.manager).map(({key})=>({key}));
  if(!departments.length) throw new CourseError('沒有在職員工權限',403);
  return {...actor,departments};
}
export function courseFailure(error) {
  const status=Number(error?.status)||({'42501':403,P0002:404,'40001':409,'22023':400}[error?.code])||503;
  return Response.json({ok:false,message:status>=500?'課程服務暫時無法使用，請稍後重試':error.message},{status,headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
}
