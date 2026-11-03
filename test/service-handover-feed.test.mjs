import test from 'node:test';
import assert from 'node:assert/strict';
import {handoverSlot,handoverChannelLinks,handoverMessage} from '../lib/service/handoverFeed.mjs';

test('Taipei handovers are grouped into three-hour slots across midnight',()=>{
 assert.equal(handoverSlot('2026-11-03T15:59:59Z'),'2026-11-03T13:00:00.000Z');
 assert.equal(handoverSlot('2026-11-03T16:00:00Z'),'2026-11-03T16:00:00.000Z');
 assert.equal(handoverSlot('2026-11-03T19:00:00Z'),'2026-11-03T19:00:00.000Z');
 assert.equal(handoverSlot('invalid'),null);
});

test('one handover message yields distinct store channel links and preserves its source',()=>{
 const content=[
  'https://ptb.discord.com/channels/1206138511535898654/1567208050954211500/1567208337265787024 派單',
  'https://discord.com/channels/1206138511535898654/1567208050954211500 進行',
  'https://discord.com/channels/1513174069087047731/1567208009107640371 等回覆',
  'https://discord.com/channels/1501098191813214312/1567207918577655839 不應跨店',
 ].join('\n');
 const links=handoverChannelLinks(content);
 assert.equal(links.length,2);
 assert.equal(links[0].url,'https://discord.com/channels/1206138511535898654/1567208050954211500');
 assert.equal(links[0].messageUrl,'https://discord.com/channels/1206138511535898654/1567208050954211500/1567208337265787024');
 const message=handoverMessage({id:'1567208337265787024',timestamp:'2026-11-03T16:06:24Z',content,
  author:{global_name:'客服'},attachments:[{filename:'圖.png',url:'https://cdn.discordapp.com/attachments/1/2/file.png'}]});
 assert.equal(message.slotStart,'2026-11-03T16:00:00.000Z');
 assert.equal(message.links.length,2);
 assert.equal(message.sourceUrl,'https://discord.com/channels/1513174069087047731/1513247796944179291/1567208337265787024');
 assert.equal(message.attachments.length,1);
});

test('invalid and empty handovers are skipped',()=>{
 assert.equal(handoverMessage({id:'bad',timestamp:'2026-11-03T16:06:24Z',content:'test'}),null);
 assert.equal(handoverMessage({id:'1567208337265787024',timestamp:'2026-11-03T16:06:24Z',content:'',attachments:[]}),null);
});
