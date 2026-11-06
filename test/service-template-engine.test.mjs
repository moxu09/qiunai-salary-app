import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../lib/serviceTemplateEngine.cjs';
const template={id:'11111111-1111-4111-8111-111111111111',organization_code:'qiunai',is_active:true,version:2,body:'感謝 {{f0}}\n{{f1}}',fields:[{key:'f0',label:'老闆',type:'text',required:true},{key:'f1',label:'內容',type:'paragraph'}]};
const scope={organization:'qiunai',version:2};
test('templates keep store/version boundaries and substitute values exactly once',()=>{
 assert.equal(engine.compileTemplate(template,{f0:'匿名闆闆',f1:'第一行\n{{f0}}\n<script>不執行</script>'},scope),'感謝 匿名闆闆\n第一行\n{{f0}}\n<script>不執行</script>');
 assert.throws(()=>engine.compileTemplate(template,{f0:'闆闆'},{...scope,organization:'deepnight'}),/此店家/);
 assert.throws(()=>engine.compileTemplate(template,{f0:'闆闆'},{...scope,version:1}),/更新/);
 assert.throws(()=>engine.compileTemplate({...template,is_active:false},{f0:'闆闆'},scope),/停用/);
 assert.equal(engine.compileTemplate({...template,organization_code:'deepnight'},{f0:'深夜闆闆'},{organization:'deepnight',version:2}),'感謝 深夜闆闆\n');
});
test('Discord mentions distinguish users and roles and reject injection or wrong identifiers',()=>{
 const t={...template,fields:[{key:'f0',label:'陪陪',type:'user',required:true},{key:'f1',label:'身分組',type:'role',required:true}]};
 assert.equal(engine.compileTemplate(t,{f0:'123456789012345678',f1:'<@&223456789012345678>'},scope),'感謝 <@123456789012345678>\n<@&223456789012345678>');
 for(const value of ['123','<@&123456789012345678>','@everyone','123456789012345678> bad'])assert.throws(()=>engine.compileTemplate(t,{f0:value,f1:'223456789012345678'},scope),/有效/);
});
test('field validation rejects undefined fields and malformed placeholders, enforces choices and limits',()=>{
 assert.throws(()=>engine.compileTemplate(template,{f0:'okay',organization:'deepnight'},scope),/輸入欄位/);
 assert.throws(()=>engine.compileTemplate(template,{f0:''},scope),/請填寫/);
 assert.throws(()=>engine.compileTemplate(template,{f0:'a'.repeat(501)},scope),/上限/);
 for(const body of ['{{process.exit()}}','{{f0}} {{f9}}','{{f0','{{f0}} }}'])assert.throws(()=>engine.validateTemplate({...template,body},scope),/欄位/);
 const t={...template,body:'{{f0}}',fields:[{key:'f0',label:'打卡類型',type:'choice',required:true,options:['上班','交接✅ 下班']}]};
 assert.equal(engine.compileTemplate(t,{f0:'交接✅ 下班'},scope),'交接✅ 下班');assert.throws(()=>engine.compileTemplate(t,{f0:'other'},scope),/選項/);
 assert.throws(()=>engine.validateTemplate({...t,fields:[t.fields[0],t.fields[0]]},scope),/欄位/);
 assert.throws(()=>engine.compileTemplate({...template,body:'{{f1}}'.repeat(20)},{f0:'闆闆',f1:'中'.repeat(2000)},scope),/上限/);
});
test('native modal pages support six fields and no-field templates without exceeding Discord limits',()=>{
 const fields=Array.from({length:6},(_,index)=>({key:`f${index}`,label:`欄位${index+1}`,type:'text'}));
 const pages=engine.templatePages({...template,fields},scope);assert.deepEqual(pages.map(page=>page.length),[5,1]);
 assert.deepEqual(engine.templatePages({...template,body:'固定文案',fields:[]},scope),[[]]);
 assert.equal(engine.compileTemplate({...template,body:'固定文案',fields:[]},{},scope),'固定文案');
});
