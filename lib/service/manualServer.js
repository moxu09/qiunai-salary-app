import 'server-only';
import {serviceAuth,SERVICE_STORES} from './access';
import {SERVICE_GUILDS} from '@/lib/serviceManual.mjs';
export async function manualActor(request,department){const actor=await serviceAuth(request);if(!actor.departments.some(store=>store.key===department))throw Object.assign(Error('沒有此店家的客服權限'),{status:403});return actor;}
export async function verifyDeskChannel(department,channel){
 const config=SERVICE_STORES[department];const response=await fetch(`https://discord.com/api/v10/channels/${channel.channelId}`,{headers:{Authorization:`Bot ${process.env[config.token]}`},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(response.status===404||response.status===403)throw Object.assign(Error('無法讀取這個頻道，請確認連結與機器人的頻道權限'),{status:400});
 if(!response.ok)throw Object.assign(Error('Discord 頻道驗證暫時無法使用'),{status:503});
 const actual=await response.json();if(!SERVICE_GUILDS[department].includes(actual.guild_id)||channel.guildId&&actual.guild_id!==channel.guildId)throw Object.assign(Error('頻道與所選店家不相符'),{status:403});
 return {...channel,guildId:actual.guild_id,url:`https://discord.com/channels/${actual.guild_id}/${channel.channelId}`};
}
export function deskError(error){const status=Number(error.status)||({'P0002':404,'40001':409,'23505':409,'22023':400,'23514':400}[error.code])||503;const message=error.code==='23505'?'已追蹤這個頻道':error.code==='23514'?'工作紀錄不正確':status>=500?'客服工作資料暫時無法使用，請稍後重試':error.message;return Response.json({ok:false,message},{status,headers:{'Cache-Control':'no-store',Vary:'Authorization'}});}
