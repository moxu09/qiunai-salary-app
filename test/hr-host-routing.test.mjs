import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorTarget} from '../lib/hrHostRouting.mjs';
test('HR and old employee hosts keep their own routing',()=>{for(const host of ['hr.wearestilllhere.com','localhost','qiunai.wearestilllhere.com'])assert.equal(supervisorTarget(host,'/'),null);});
test('EIP root uses the existing manager login and all remaining paths preserve path and query',()=>{assert.equal(supervisorTarget('eip.wearestilllhere.com','/').href,'https://salary.wearestilllhere.com/admin-login');for(const path of ['/admin/salary','/_next/static/runtime.js','/api/deepnight/hr','/auth/callback']){const url=supervisorTarget('eip.wearestilllhere.com',path,'?next=%2Fadmin');assert.equal(url.origin,'https://salary.wearestilllhere.com');assert.equal(url.pathname,path);assert.equal(url.search,'?next=%2Fadmin');}});
test('a double-slash path cannot turn the supervisor gateway into an open proxy',()=>{assert.equal(supervisorTarget('eip.wearestilllhere.com','//evil.example/path').hostname,'salary.wearestilllhere.com');});
test('the supervisor HTTP authority supports a port and case normalization',()=>{assert.equal(supervisorTarget('EIP.wearestilllhere.com:8080','/').href,'https://salary.wearestilllhere.com/admin-login');assert.equal(supervisorTarget('eip.wearestilllhere.com.evil.example','/'),null);});
