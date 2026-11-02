'use strict';
const {randomUUID}=require('node:crypto');
const engine=require('./serviceTemplateEngine.cjs');
const STORES={qiunai:{name:'秋奈電競',guild:'1513174069087047731',channel:'1566885603637854269',role:'1513203868895412305',staff:'qiunai_staff'},deepnight:{name:'深夜不關燈',guild:'1501836172199202856',channel:'1502053562799362209',role:'1502010574781943989',staff:'players'}};
const row=(component)=>({type:1,components:[component]});
const button=(id,label)=>row({type:2,style:1,custom_id:id,label});
const privateMessage={flags:64,allowedMentions:{parse:[]}};
module.exports.createServiceTemplatePanel=function({client,supabase,organization,now=()=>Date.now()}){
 const store=STORES[organization];if(!store)throw Error('客服面板店家不正確');
 const marker=`service-template-panel:v1:${organization}`,friendlyFooter=`${store.name}客服工具・確認內容後再貼上`,drafts=new Map();let panelPromise=null;
 const scope=(template)=>({organization,version:template.version});
 const checked=async(query)=>{const result=await query;if(result.error)throw result.error;return result.data;};
 async function list(){const templates=await checked(supabase.from('service_templates').select('*').eq('organization_code',organization).eq('is_active',true).order('title'));return templates.filter((template)=>{try{engine.validateTemplate(template,scope(template));return true;}catch{return false;}});}
 async function load(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('請重新選擇模板');const template=await checked(supabase.from('service_templates').select('*').eq('organization_code',organization).eq('id',id).maybeSingle());if(!template)throw Error('模板不存在或已停用');engine.validateTemplate(template,scope(template));return template;}
 async function allowed(interaction){
  if(interaction.guildId!==store.guild||interaction.channelId!==store.channel)return false;
  const actor=String(interaction.user?.id||'');if(!/^\d{15,22}$/.test(actor))return false;
  const assignment=await checked(supabase.from('erp_role_assignments').select('role,is_active').eq('organization_code',organization).eq('discord_id',actor).maybeSingle());
  if(assignment?.is_active===false)return false;
  if(actor==='847840193859682304'||['super_admin','store_manager','customer_service'].includes(assignment?.role))return true;
  const permissions=interaction.memberPermissions;
  if(permissions?.has?.(8n))return true;
  const roles=Array.isArray(interaction.member?.roles)?interaction.member.roles:[...interaction.member?.roles?.cache?.keys?.()||[]];
  if(!roles.includes(store.role))return false;
  const staff=await checked(supabase.from(store.staff).select('discord_id,is_active').eq('discord_id',actor).maybeSingle());
  return Boolean(staff&&staff.is_active!==false);
 }
 function sweep(){for(const [id,draft] of drafts)if(draft.expires<=now())drafts.delete(id);}
 function draftFor(interaction,id){sweep();const draft=drafts.get(id);if(!draft||draft.actor!==interaction.user.id)throw Error('這份表單已過期或不屬於你，請重新選擇模板');return draft;}
 function modal(id,draft){const fields=draft.pages[draft.page];return {custom_id:`svc:submit:${id}:${draft.page}`,title:`${draft.title.slice(0,30)} ${draft.page+1}/${draft.pages.length}`,components:fields.map((field)=>row({type:4,custom_id:field.key,label:field.label,style:field.type==='paragraph'?2:1,required:field.required===true,max_length:Math.min(field.maxLength||(field.type==='paragraph'?2000:500),4000),...(field.type==='choice'?{placeholder:field.options.join('／').slice(0,100)}:{})}))};}
 async function output(interaction,template,values){const text=engine.compileTemplate(template,values,scope(template));const preview=text.replace(/```/g,'`\u200b``');const title=String(template.title).slice(0,100);const content=preview.length<=1750?`已產生 ${store.name}「${title}」。確認後自行複製貼上：\n\n\`\`\`\n${preview}\n\`\`\``:`已產生 ${store.name}「${title}」。內容較長，請開啟下方文字檔複製。`;
  const payload={content,components:[],allowedMentions:{parse:[]},files:[{attachment:Buffer.from(text,'utf8'),name:'客服模板.txt'}]};
  if(interaction.deferred||interaction.replied)await interaction.editReply(payload);else await interaction.reply({...privateMessage,...payload});
 }
 async function handleInteraction(interaction){
  const customId=interaction.customId;if(typeof customId!=='string'||!customId.startsWith('svc:'))return false;
  try{
   sweep();
   if(!await allowed(interaction)){await interaction.reply({...privateMessage,content:'僅本店客服與主管可以在指定頻道使用此面板。'});return true;}
   const [,action,id,pageText]=customId.split(':');
   if(action==='category'){
    await interaction.deferReply({flags:64});
    const templates=(await list()).filter((template)=>template.category===interaction.values?.[0]);
    if(!templates.length){await interaction.editReply({content:'這個分類目前沒有可用模板，請重新選擇。',allowedMentions:{parse:[]}});return true;}
    await interaction.editReply({content:`${store.name}｜選擇模板（只產生文字，不會自動發布）：`,components:[row({type:3,custom_id:'svc:template',placeholder:'選擇話術模板',options:templates.slice(0,25).map((template)=>({label:template.title.slice(0,100),value:template.id,description:(template.description||template.category).slice(0,100)}))})],allowedMentions:{parse:[]}});
   }else if(action==='template'){
    const template=await load(interaction.values?.[0]);
    const pages=engine.templatePages(template,scope(template));
    if(!template.fields.length){await output(interaction,template,{});return true;}
    for(const [existingId,existing] of drafts)if(existing.actor===interaction.user.id&&existing.templateId===template.id)drafts.delete(existingId);
    if(drafts.size>=500||[...drafts.values()].filter((draft)=>draft.actor===interaction.user.id).length>=5)throw Error('未完成的表單太多，請完成後再試，或等待十五分鐘');
    const draftId=randomUUID(),draft={actor:interaction.user.id,templateId:template.id,version:template.version,title:template.title,pages,page:0,state:'editing',values:{},expires:now()+15*60*1000};
    drafts.set(draftId,draft);try{await interaction.showModal(modal(draftId,draft));}catch(error){drafts.delete(draftId);throw error;}
   }else if(action==='continue'){
    const draft=draftFor(interaction,id);if(!['ready','editing'].includes(draft.state))throw Error('這一頁已開啟，請完成目前的表單');
    const template=await load(draft.templateId);engine.validateTemplate(template,{organization,version:draft.version});
    draft.state='editing';try{await interaction.showModal(modal(id,draft));}catch(error){draft.state='ready';throw error;}
   }else if(action==='submit'){
    const draft=draftFor(interaction,id);
    if(draft.state!=='editing'||String(draft.page)!==pageText)throw Error('這一頁已送出，請勿重複提交');
    draft.state='processing';
    await interaction.deferReply({flags:64});
    try{
     const template=await load(draft.templateId);engine.validateTemplate(template,{organization,version:draft.version});
     const values=Object.fromEntries(draft.pages[draft.page].map((field)=>[field.key,interaction.fields.getTextInputValue(field.key)]));
     Object.assign(draft.values,engine.normalizeValues({fields:draft.pages[draft.page]},values));
     if(draft.page+1<draft.pages.length){draft.page++;draft.state='ready';await interaction.editReply({content:`已保存第 ${draft.page} 頁，請繼續填寫第 ${draft.page+1} 頁。`,components:[button(`svc:continue:${id}`,'繼續填寫')],allowedMentions:{parse:[]}});}
     else{await output(interaction,template,draft.values);drafts.delete(id);}
    }catch(error){drafts.delete(id);throw error;}
   }else{await interaction.reply({...privateMessage,content:'這個操作已失效，請從客服面板重新選擇。'});}
  }catch(error){
   const safe=error instanceof engine.ServiceTemplateError||error instanceof Error&&/請|模板|表單|欄位|頁|這份/.test(error.message)?error.message:'客服模板暫時無法使用，請稍後重試。';
   try{if(interaction.deferred||interaction.replied)await interaction.editReply({content:safe,components:[],allowedMentions:{parse:[]}});else await interaction.reply({...privateMessage,content:safe});}catch{console.warn('[客服模板] 無法回覆此互動，請重新操作');}
  }
  return true;
 }
 async function ensurePanel(){
  if(panelPromise)return panelPromise;
  panelPromise=(async()=>{
   const owner=randomUUID();const lease=await checked(supabase.rpc('lease_service_panel',{p_organization:organization,p_owner:owner}));if(!lease)return null;
   try{
    const channel=await client.channels.fetch(store.channel);if(!channel||channel.guildId!==store.guild||!channel.isTextBased())throw Error('客服面板頻道不正確');
    const categories=[...new Set((await list()).map((template)=>template.category))].sort();if(!categories.length)throw Error('客服模板尚未匯入');
    let message=null;
    const isOurs=(item)=>item?.author?.id===client.user.id&&item.embeds?.some((embed)=>[marker,friendlyFooter].includes(embed.footer?.text));
    if(lease.message_id){try{message=await channel.messages.fetch(lease.message_id);}catch(error){if(error.code!==10008)throw error;}if(message&&!isOurs(message))throw Error('客服面板紀錄不符合本機器人');}
    if(!message){const recent=await channel.messages.fetch({limit:100});message=[...recent.values()].find(isOurs)||null;}
    const data={embeds:[{title:`${store.name}｜客服套模板`,description:'選擇分類與模板，填寫欄位即可取得可複製文字。\n只有本店客服與主管可以操作；產生內容只會私下回覆給你。',color:organization==='qiunai'?0x7287df:0x68579c,footer:{text:friendlyFooter}}],components:[row({type:3,custom_id:'svc:category',placeholder:'選擇模板分類',options:categories.slice(0,25).map((category)=>({label:category.slice(0,100),value:category}))})],allowedMentions:{parse:[]}};
    // Renew ownership immediately before touching Discord, then fence the DB save.
    const renewed=await checked(supabase.rpc('lease_service_panel',{p_organization:organization,p_owner:owner}));if(!renewed)return null;
    const created=!message;if(message)await message.edit(data);else message=await channel.send(data);
    const saved=await checked(supabase.from('service_panel_registry').update({message_id:message.id,updated_at:new Date(now()).toISOString()}).eq('organization_code',organization).eq('lease_owner',owner).gt('lease_until',new Date(now()).toISOString()).select('message_id'));
    if(!saved.length){if(created&&isOurs(message))await message.delete();throw Error('客服面板租約已失效');}
    return message.id;
   }finally{await checked(supabase.from('service_panel_registry').update({lease_owner:null,lease_until:null}).eq('organization_code',organization).eq('lease_owner',owner));}
  })();
  try{return await panelPromise;}finally{panelPromise=null;}
 }
 return {ensurePanel,handleInteraction};
};
