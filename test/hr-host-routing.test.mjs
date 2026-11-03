import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorTarget} from '../lib/hrHostRouting.mjs';
test('HR and old employee hosts keep their own routing',()=>{for(const host of ['hr.wearestilllhere.com','localhost','qiunai.wearestilllhere.com'])assert.equal(supervisorTarget(host,'/'),null);});
test('EIP root uses the existing manager login and all remaining paths preserve path and query',()=>{assert.equal(supervisorTarget('eip.wearestilllhere.com','/').href,'https://salary.wearestilllhere.com/admin-login');for(const path of ['/admin/salary','/_next/static/runtime.js','/api/deepnight/hr','/auth/callback']){const url=supervisorTarget('eip.wearestilllhere.com',path,'?next=%2Fadmin');assert.equal(url.origin,'https://salary.wearestilllhere.com');assert.equal(url.pathname,path);assert.equal(url.search,'?next=%2Fadmin');}});
test('a double-slash path cannot turn the supervisor gateway into an open proxy',()=>{assert.equal(supervisorTarget('eip.wearestilllhere.com','//evil.example/path').hostname,'salary.wearestilllhere.com');});
test('the supervisor HTTP authority supports a port and case normalization',()=>{assert.equal(supervisorTarget('EIP.wearestilllhere.com:8080','/').href,'https://salary.wearestilllhere.com/admin-login');assert.equal(supervisorTarget('eip.wearestilllhere.com.evil.example','/'),null);});

test('service namespace remains local while similarly named supervisor routes still proxy',()=>{for(const path of ['/service','/service/templates','/service/api/catalog','/service/assets/_next/static/chunk.js'])assert.equal(supervisorTarget('eip.wearestilllhere.com',path),null);assert.equal(supervisorTarget('eip.wearestilllhere.com','/service-other').origin,'https://salary.wearestilllhere.com');});

test('EIP workspace pages, data and scoped files resolve locally without forwarding the rest of admin',()=>{
 const host='eip.wearestilllhere.com';
 for(const path of ['/admin/workspace','/admin/department/qiunai/workspace','/api/qiunai/workspace','/api/deepnight/workspace','/api/qiunai/workspace/files','/api/deepnight/workspace/files','/api/qiunai/hr'])
  assert.equal(supervisorTarget(host,path+'/', '?admin=1'),null);
 for(const path of ['/admin','/admin/workspace-other','/admin/department/qiunai/salary','/api/deepnight/hr','/api/qiunai/workspace/other'])
  assert.equal(supervisorTarget(host,path).pathname,path);
});
