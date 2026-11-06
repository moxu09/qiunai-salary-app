import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),v={};
for(let i=0;i<args.length;i++){
 const key=args[i];
 if(!['--discord-id','--cutoff','--request-id','--plan-file','--apply'].includes(key)||Object.hasOwn(v,key))throw Error('不支援或重複的參數');
 v[key]=key==='--apply'?true:args[++i];
}
if(!/^[0-9]{17,20}$/.test(v['--discord-id']||'')||!v['--cutoff']||(!Number.isFinite(Date.parse(v['--cutoff']))||!/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(v['--cutoff']))||
 !/^[0-9a-f-]{36}$/i.test(v['--request-id']||'')||!v['--plan-file'])throw Error('必須指定員工、截止時間、修正 UUID 與私人試算檔案');
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const params={p_discord_id:v['--discord-id'],p_cutoff:v['--cutoff'],p_request_id:v['--request-id']};
let expected=null;
if(v['--apply']){
 const saved=JSON.parse(await readFile(v['--plan-file'],'utf8'));
 if(JSON.stringify(saved.params)!==JSON.stringify(params)||!Array.isArray(saved.result?.plan))throw Error('試算檔案與修正參數不同');
 expected=saved.result.plan;
}
const {data,error}=await client.rpc('repair_deepnight_commission_95',{...params,p_apply:!!v['--apply'],p_expected_plan:expected});
if(error)throw Error(error.message);
if(!v['--apply']&&!data.alreadyApplied)await writeFile(v['--plan-file'],JSON.stringify({params,result:data},null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({mode:v['--apply']?'apply':'dry-run',...Object.fromEntries(Object.entries(data).filter(([key])=>key!=='plan'))}));
