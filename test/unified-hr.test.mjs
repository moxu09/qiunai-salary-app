import test from 'node:test';
import assert from 'node:assert/strict';
import {HR_ROUTES,hrTabForPath,allocateWithdrawal,canonicalJson} from '../lib/hrRoutes.mjs';
import {existsSync} from 'node:fs';
test('every staff item has a concrete deep link, including the requested dot paths',()=>{
 assert.equal(HR_ROUTES.profile,'/personal/data');assert.equal(HR_ROUTES.orders,'/order/order.details');assert.equal(HR_ROUTES.tips,'/order/reward.details');
 assert.equal(new Set(Object.values(HR_ROUTES)).size,Object.keys(HR_ROUTES).length);
 for(const [tab,path] of Object.entries(HR_ROUTES)){assert.equal(hrTabForPath(path),tab);assert.ok(existsSync(new URL(`../app${path}/page.tsx`,import.meta.url)));}
 for(const path of ['https://evil.example','//evil.example','/personal/unknown','/admin'])assert.equal(hrTabForPath(path),null);
});
test('combined withdrawal uses available balances and preserves the integer total',()=>{
 assert.deepEqual(allocateWithdrawal(1500,{qiunai:1000,deepnight:2000}),{qiunai:500,deepnight:1000});
 assert.deepEqual(allocateWithdrawal(1001,{qiunai:2000,deepnight:1000}),{qiunai:667,deepnight:334});
 assert.deepEqual(allocateWithdrawal(1500,{deepnight:2000}),{deepnight:1500});
 assert.deepEqual(allocateWithdrawal(1234,{qiunai:0,deepnight:1234}),{qiunai:0,deepnight:1234});
 assert.deepEqual(allocateWithdrawal(10,{qiunai:-100,deepnight:10}),{qiunai:0,deepnight:10});
 for(let a=0;a<40;a++)for(let b=0;b<40;b++)for(const total of [1,a+b,Math.floor((a+b)/2)]){if(total<1||total>a+b)continue;const split=allocateWithdrawal(total,{qiunai:a,deepnight:b});assert.equal(split.qiunai+split.deepnight,total);assert.ok(split.qiunai<=a&&split.deepnight<=b);}
});
test('invalid or overdrawn requests are rejected before any write',()=>{
 for(const total of [-1,0,1.5,NaN,Infinity,3001])assert.throws(()=>allocateWithdrawal(total,{qiunai:1000,deepnight:2000}));
 assert.throws(()=>allocateWithdrawal(1,{}));
});
test('idempotency compares nested allocation values independently of JSONB key order',()=>{
 const a={mode:'separate',amounts:{qiunai:1001,deepnight:2002}};
 assert.equal(canonicalJson(a),canonicalJson({amounts:{deepnight:2002,qiunai:1001},mode:'separate'}));
 assert.notEqual(canonicalJson(a),canonicalJson({mode:'separate',amounts:{qiunai:2002,deepnight:1001}}));
});
