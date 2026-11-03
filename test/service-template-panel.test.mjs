import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceTemplatePanel} from '../lib/serviceTemplatePanel.cjs';
const actor='123456789012345678',other='223456789012345678',id='11111111-1111-4111-8111-111111111111';
const template={id,organization_code:'qiunai',version:1,is_active:true,title:'六欄模板',category:'播報',body:'{{f0}} {{f5}}',fields:Array.from({length:6},(_,i)=>({key:`f${i}`,label:`欄位${i}`,type:'text',required:true}))};
function fixture(tipGifts=[],loadHeartGifts,tipBroadcasts){
 let clock=Date.now();const state={template:structuredClone(template),assignment:null,staff:{discord_id:actor,is_active:true},registry:{message_id:null,guild_id:'1513174069087047731',channel_id:'1566885603637854269'},messages:new Map(),sends:0,edits:0};
 const supabase={from(table){const filters=[];let update=null,selected=false;const query={select(){selected=true;return this;},eq(key,value){filters.push([key,value]);return this;},gt(){return this;},order(){return this;},update(value){update=value;return this;},async maybeSingle(){return {data:table==='erp_role_assignments'?state.assignment:table==='qiunai_staff'?state.staff:state.template,error:null};},then(resolve,reject){return Promise.resolve().then(()=>{if(table==='service_templates')return {data:[state.template],error:null};if(table==='service_panel_registry'){const owner=filters.find(([key])=>key==='lease_owner')?.[1];if(owner&&owner!==state.registry.lease_owner)return {data:[],error:null};Object.assign(state.registry,update);return {data:selected?[{message_id:state.registry.message_id}]:null,error:null};}throw Error('unexpected table');}).then(resolve,reject);}};return query;},async rpc(){state.registry.lease_owner='unused';return {data:{...state.registry},error:null};}};
 // Preserve the owner UUID supplied by the production lease function.
 supabase.rpc=async(_name,args)=>{state.registry.lease_owner=args.p_owner;return {data:{...state.registry},error:null};};
 const channel={guildId:'1513174069087047731',isTextBased:()=>true,messages:{async fetch(key){if(typeof key==='object')return state.messages;if(state.messages.has(key))return state.messages.get(key);throw Object.assign(Error('missing'),{code:10008});}},async send(data){state.sends++;const message={id:String(state.sends),author:{id:'bot'},embeds:data.embeds,components:data.components,async edit(data){state.edits++;message.embeds=data.embeds;message.components=data.components;},async delete(){state.messages.delete(message.id);}};state.messages.set(message.id,message);return message;}};
 const panel=createServiceTemplatePanel({client:{user:{id:'bot'},channels:{fetch:async()=>channel}},supabase,organization:'qiunai',tipGifts,tipBroadcasts,loadHeartGifts,now:()=>clock});
 function interaction(customId,options={}){const calls=[];return {customId,guildId:channel.guildId,channelId:'1566885603637854269',user:{id:actor},member:{roles:['1513203868895412305']},values:[id],calls,...options,async reply(data){calls.push(['reply',data]);this.replied=true;},async deferReply(data){calls.push(['defer',data]);this.deferred=true;},async editReply(data){calls.push(['edit',data]);},async showModal(data){calls.push(['modal',data]);this.replied=true;}};}
 return {state,panel,interaction,advance:()=>{clock+=16*60*1000;}};
}
test('gateway owns only svc prefix and refuses other channels, stores or non-CS employees',async()=>{const f=fixture();assert.equal(await f.panel.handleInteraction(f.interaction('unrelated')),false);for(const patch of [{guildId:'1501836172199202856'},{channelId:'999999999999999999'},{member:{roles:[]}}]){const event=f.interaction('svc:template',patch);assert.equal(await f.panel.handleInteraction(event),true);assert.equal(event.calls[0][0],'reply');assert.equal(event.calls[0][1].flags,64);assert.match(event.calls[0][1].content,/僅本店/);}});
test('six-field wizard saves first page, requires a button before next modal, and returns private text/file only',async()=>{const f=fixture();const first=f.interaction('svc:template');await f.panel.handleInteraction(first);assert.equal(first.calls[0][0],'modal');const modal=first.calls[0][1];assert.equal(modal.components.length,5);const submit=f.interaction(modal.custom_id,{fields:{getTextInputValue:key=>key==='f0'?'@everyone':'已填'}});await f.panel.handleInteraction(submit);assert.equal(submit.calls[0][0],'defer');const button=submit.calls[1][1].components[0].components[0];const stolen=f.interaction(button.custom_id,{user:{id:other}});await f.panel.handleInteraction(stolen);assert.match(stolen.calls[0][1].content,/不屬於你/);
 const next=f.interaction(button.custom_id);await f.panel.handleInteraction(next);assert.equal(next.calls[0][0],'modal');assert.equal(next.calls[0][1].components.length,1);
 const final=f.interaction(next.calls[0][1].custom_id,{fields:{getTextInputValue:()=> '完成'}});await f.panel.handleInteraction(final);const output=final.calls.at(-1)[1];assert.equal(output.files[0].attachment.toString(),'@everyone 完成');assert.deepEqual(output.allowedMentions,{parse:[]});assert.equal(f.state.sends,0);
 const duplicate=f.interaction(modal.custom_id,{fields:{getTextInputValue:()=> '再送'}});await f.panel.handleInteraction(duplicate);assert.match(duplicate.calls[0][1].content,/已過期/);
});
test('expired drafts and templates updated while a modal is open cannot generate stale content',async()=>{for(const stale of ['expiry','version']){const f=fixture();const first=f.interaction('svc:template');await f.panel.handleInteraction(first);if(stale==='expiry')f.advance();else f.state.template.version=2;const event=f.interaction(first.calls[0][1].custom_id,{fields:{getTextInputValue:()=> '內容'}});await f.panel.handleInteraction(event);assert.ok(event.calls.every(([,data])=>!data.files));assert.match(event.calls.at(-1)[1].content,stale==='expiry'?/過期/:/更新/);}});
test('panel creation uses its stored message across restarts and concurrent ensure calls',async()=>{const f=fixture();const [one,two]=await Promise.all([f.panel.ensurePanel(),f.panel.ensurePanel()]);assert.equal(one,two);assert.equal(f.state.sends,1);await f.panel.ensurePanel();assert.equal(f.state.sends,1);assert.equal(f.state.edits,1);assert.equal(f.state.registry.message_id,one);});

test('cancelled second-page modals can reopen and abandoned first pages do not exhaust the per-user limit',async()=>{const f=fixture();let latest;for(let i=0;i<8;i++){latest=f.interaction('svc:template');await f.panel.handleInteraction(latest);assert.equal(latest.calls[0][0],'modal');}const submit=f.interaction(latest.calls[0][1].custom_id,{fields:{getTextInputValue:()=> '已填'}});await f.panel.handleInteraction(submit);const id=submit.calls[1][1].components[0].components[0].custom_id;for(let i=0;i<2;i++){const next=f.interaction(id);await f.panel.handleInteraction(next);assert.equal(next.calls[0][0],'modal');}});

test('one existing panel directly lists shop gifts and templates, and chosen gift names need no typing',async()=>{
 const f=fixture([{key:'shop-gift',name:'現有禮物',price:380},{key:'tip_custom',name:'客製打賞',price:0,customPrice:true}]);
 f.state.template={...template,slug:'gift-broadcast',title:'禮物播報',body:'{{f0}} 送給 {{f1}} {{f2}} {{f3}} {{f4}}',fields:[
  {key:'f0',label:'送禮人',type:'text',required:true},{key:'f1',label:'收禮人',type:'text',required:true},
  {key:'f2',label:'禮物名稱',type:'text',required:true},{key:'f3',label:'禮物的表情符號',type:'text',required:true},
  {key:'f4',label:'禮物的文案',type:'paragraph',required:true},
 ]};
 const panelId=await f.panel.ensurePanel();
 const controls=f.state.messages.get(panelId).components.flatMap(row=>row.components);
 assert.deepEqual(controls.map(component=>component.custom_id),['svc:gift','svc:template:1']);
 assert.deepEqual(controls[0].options[0],{label:'現有禮物',value:'shop-gift',description:'380 ASD'});
 const unknown=f.interaction('svc:gift',{values:['other-shop-gift']});
 await f.panel.handleInteraction(unknown);
 assert.match(unknown.calls[0][1].content,/找不到此店/);
 const select=f.interaction('svc:gift',{values:['shop-gift']});
 await f.panel.handleInteraction(select);
 const dialog=select.calls[0][1];
 assert.match(dialog.title,/現有禮物/);
 const inputs=dialog.components.flatMap(row=>row.components);
 assert.deepEqual(inputs.map(field=>field.custom_id),['f0','f1','f3','f4']);
 const values={f0:'顧客',f1:'員工',...Object.fromEntries(inputs.filter(input=>input.value).map(input=>[input.custom_id,input.value]))};
 const submit=f.interaction(dialog.custom_id,{fields:{getTextInputValue:key=>values[key]}});
 await f.panel.handleInteraction(submit);
 assert.match(submit.calls.at(-1)[1].files[0].attachment.toString(),/顧客 送給 員工 現有禮物/);
 assert.deepEqual(submit.calls.at(-1)[1].allowedMentions,{parse:[]});
 const custom=f.interaction('svc:gift',{values:['tip_custom']});
 await f.panel.handleInteraction(custom);
 assert.ok(custom.calls[0][1].components.flatMap(row=>row.components).some(field=>field.custom_id==='f2'));
});

test('heart broadcast lists official heart gifts and prefills the heart-specific name field',async()=>{
 const heart=[{key:'心動測試禮物',name:'心動測試禮物',price:520}];
 const f=fixture([],async()=>heart);
 f.state.template={...template,slug:'heart-gift-broadcast',title:'心動禮物播報',
  fields:template.fields.map((field,index)=>index===2?{...field,label:'心動禮物名稱'}:field)};
 const choose=f.interaction('svc:template');
 await f.panel.handleInteraction(choose);
 const picker=choose.calls.at(-1)[1].components[0].components[0];
 assert.equal(picker.custom_id,'svc:heart');
 assert.equal(picker.options[0].label,heart[0].name);
 const gift=f.interaction(picker.custom_id,{values:[heart[0].key]});
 await f.panel.handleInteraction(gift);
 const modal=gift.calls[0][1];
 assert.match(modal.title,/心動測試禮物/);
 assert.deepEqual(modal.components.map(row=>row.components[0].custom_id),['f0','f1','f3','f4','f5']);
});

test('Qiunai gift preview includes the exact live copy and optional emoji without pinging anyone',async()=>{
 const f=fixture([
  {key:'cookie',name:'小熊餅乾',price:33},
  {key:'fireworks',name:'煙火',price:99},
 ],undefined,{
  cookie:{description:'第一行\n第二行',emoji:'<:bear:123456789012345678>'},
  fireworks:{description:'想看有你的每場煙火'},
 });
 f.state.template={...template,slug:'gift-broadcast',body:'**感謝 {{f0}} 送給 {{f1}}\n\n{{f2}}\n\n{{f4}}**',fields:[
  {key:'f0',label:'送禮人',type:'text',required:true},
  {key:'f1',label:'收禮人',type:'text',required:true},
  {key:'f2',label:'禮物名稱',type:'text',required:true},
  {key:'f4',label:'禮物的文案',type:'paragraph',required:true},
 ]};
 for(const [key,line,copy] of [
  ['cookie','小熊餅乾 <:bear:123456789012345678>','第一行\n第二行'],
  ['fireworks','煙火','想看有你的每場煙火'],
 ]){
  const selected=f.interaction('svc:gift',{values:[key]});
  await f.panel.handleInteraction(selected);
  const dialog=selected.calls[0][1];
  assert.deepEqual(dialog.components.map(row=>row.components[0].custom_id),['f0','f1']);
  const submit=f.interaction(dialog.custom_id,{fields:{getTextInputValue:key=>key==='f0'?'測試老闆':'測試陪陪'}});
  await f.panel.handleInteraction(submit);
  const result=submit.calls.at(-1)[1];
  assert.equal(result.files[0].attachment.toString(),`**感謝 測試老闆 送給 測試陪陪\n\n${line}\n\n${copy}**`);
  assert.deepEqual(result.allowedMentions,{parse:[]});
 }
});
