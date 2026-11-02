import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterShadowedSourceOrders} from '../lib/playOrderDedupe.js';
const code=readFileSync(new URL('../app/api/hr/orders/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/export const dynamic\s*=.*;\n/,'').replace('export async function GET','async function GET');
async function route(departments,rows){
 const queries=[];
 const supabaseAdmin={from(table){const filters=[];const q={};for(const method of ['select','eq','or','gte','lte','order'])q[method]=(...args)=>{filters.push([method,...args]);return q;};q.range=async(from,to)=>{queries.push({table,filters,from,to});return {data:(rows[table]||[]).slice(from,to+1),error:null};};return q;}};
 const allRows=async(query)=>{const all=[];for(let from=0;;from+=1000){const {data,error}=await query().range(from,from+999);if(error)throw error;all.push(...data);if(data.length<1000)return all;}};
 const GET=new Function('hrAuth','hrFail','HR_CONFIG','allRows','supabaseAdmin','monthInputToTaipeiRange','filterShadowedSourceOrders',code+';return GET;')(
  async()=>({discordId:'authenticated-employee',departments}),e=>Response.json({message:e.message},{status:400}),{qiunai:{orders:'qorders',bonuses:'qbonus'},deepnight:{orders:'play_orders',bonuses:'dbonus'}},allRows,supabaseAdmin,()=>({startIso:'start',endIso:'end'}),filterShadowedSourceOrders);
 return {GET,queries};
}
test('single-store employee queries only their own department and authenticated identity',async()=>{
 const {GET,queries}=await route([{key:'qiunai'}],{qorders:[{id:'q',staff_salary:10}]});
 const response=await GET(new Request('https://hr.example/api/hr/orders?month=2026-11&discordId=somebody-else'));
 const body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.departments.map(d=>d.key),['qiunai']);assert.deepEqual(queries.map(q=>q.table),['qorders','qbonus']);
 for(const q of queries)assert.ok(q.filters.some(f=>f[0]==='eq'&&f[1]==='discord_id'&&f[2]==='authenticated-employee'));
});
test('both stores paginate beyond 1000 records and DeepNight preserves guild scoping and WORK deduplication',async()=>{
 const source='12345678-1234-4123-8123-123456789abc';const records=Array.from({length:1001},(_,i)=>({id:String(i),staff_salary:1}));records.push({id:source},{id:'work',order_id:`WORK-${source}-123456789012345678`});
 const {GET,queries}=await route([{key:'qiunai'},{key:'deepnight'}],{qorders:[{id:'q'}],play_orders:records});
 const response=await GET(new Request('https://hr.example/api/hr/orders?month=2026-11'));const body=await response.json();assert.equal(response.status,200);const deep=body.departments.find(d=>d.key==='deepnight');assert.equal(deep.orders.length,1002);assert.ok(!deep.orders.some(o=>o.id===source));assert.ok(queries.filter(q=>q.table==='play_orders').some(q=>q.from===1000));
 for(const q of queries.filter(q=>q.table==='play_orders'))assert.ok(q.filters.some(f=>f[0]==='or'&&f[1]==='guild_id.eq.1501098191813214312,guild_id.is.null'));
});
test('invalid month is rejected before any data query',async()=>{const {GET,queries}=await route([{key:'qiunai'}],{});const response=await GET(new Request('https://hr.example/api/hr/orders?month=2026-13'));assert.equal(response.status,400);assert.equal(queries.length,0);});
