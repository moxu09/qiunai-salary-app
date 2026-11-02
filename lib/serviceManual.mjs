export const SERVICE_GUILDS={qiunai:['1206138511535898654','1513174069087047731'],deepnight:['1501098191813214312','1501836172199202856']};
export const MANUAL_KINDS=['flow','scene','phrase','rule','resource','command','price','campaign'];
export const normalizeSearch=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('zh-TW').trim();
export function manualHref(kind,slug,department){const route={flow:'flows',scene:'phrases',phrase:'phrases',rule:'rules',resource:'resources',command:'resources',price:'prices',campaign:'flows'}[kind];if(!route||!['qiunai','deepnight'].includes(department))throw Error('手冊網址不正確');return `/service/${route}${['flow','campaign'].includes(kind)?'/'+slug:''}?department=${department}${['scene','phrase','rule','resource','command','price'].includes(kind)?'&item='+encodeURIComponent(slug):''}`;}
export function discordChannel(value,organization){
 const allowed=SERVICE_GUILDS[organization];if(!allowed)throw Object.assign(Error('店家不正確'),{status:400});
 const raw=String(value||'').trim();let guild=null,channel;
 if(/^\d{15,22}$/.test(raw))channel=raw;
 else {let url;try{url=new URL(raw);}catch{throw Object.assign(Error('請填入 Discord 頻道連結或頻道 ID'),{status:400});}const match=url.pathname.match(/^\/channels\/(\d{15,22})\/(\d{15,22})(?:\/\d{15,22})?\/?$/);if(url.protocol!=='https:'||!['discord.com','www.discord.com'].includes(url.hostname)||url.username||url.password||!match)throw Object.assign(Error('請使用有效的 Discord 頻道連結'),{status:400});[,guild,channel]=match;}
 if(guild&&!allowed.includes(guild))throw Object.assign(Error('這個頻道不屬於目前店家，請先切換店家'),{status:403});
 return {guildId:guild,channelId:channel,url:guild?`https://discord.com/channels/${guild}/${channel}`:null};
}
export function validateDesk(input){
 const fail=message=>{throw Object.assign(Error(message),{status:400});};
 if(!input||!['note','track','broadcast'].includes(input.kind)||typeof input.label!=='string'||!input.label.trim()||input.label.trim().length>100||typeof input.body!=='string'||input.body.length>(input.kind==='broadcast'?10000:2000)||typeof input.priority!=='boolean')fail('請填寫名稱（最多 100 字）及備註（最多 2,000 字）');
 if(input.customerId&&(!/^\d{15,22}$/.test(input.customerId)||typeof input.customerId!=='string'))fail('老闆 Discord ID 不正確');
 return {kind:input.kind,label:input.label.trim(),body:input.body.trim(),priority:input.priority,customerId:input.kind==='note'?input.customerId||'':''};
}
