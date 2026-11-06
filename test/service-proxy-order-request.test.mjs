import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProxyOrderRequest,publicProxyOrder} from '../lib/service/proxyOrderRequest.mjs';

const requestId='PROXY-00000000-0000-4000-8000-000000000001';
test('accepts each supported proxy order kind with a stable idempotency key',()=>{
 for(const kind of ['order','tip','crown','custom-tip','custom-crown'])
  assert.deepEqual(parseProxyOrderRequest({requestId,customerId:'973236155019579442',kind}),{requestId,customerId:'973236155019579442',kind});
});
test('rejects forged fields, invalid customer and invalid request keys',()=>{
 assert.equal(parseProxyOrderRequest({requestId,customerId:'973236155019579442',kind:'order',paid:true}),null);
 assert.equal(parseProxyOrderRequest({requestId,customerId:'bad',kind:'order'}),null);
 assert.equal(parseProxyOrderRequest({requestId:'PROXY-reuse',customerId:'973236155019579442',kind:'order'}),null);
 assert.equal(parseProxyOrderRequest({requestId,customerId:'973236155019579442',kind:'topup'}),null);
});
test('only opened requests return a channel link from the selected store',()=>{
 const row={flow_id:requestId,created_at:'2026-11-04T00:00:00Z',payload:{userId:'973236155019579442',kind:'tip',status:'opened',channelId:'1567208050954211500'}};
 assert.equal(publicProxyOrder(row,'1206138511535898654').channelUrl,'https://discord.com/channels/1206138511535898654/1567208050954211500');
 assert.equal(publicProxyOrder({...row,payload:{...row.payload,status:'queued'}},'1206138511535898654').channelUrl,null);
});
