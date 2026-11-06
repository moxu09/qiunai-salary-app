import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineReferenceTokens, referenceMap, safeReferenceHref } from '../lib/inlineReferences.mjs';

test('chapter and channel links attach to the original words', () => {
  const references = referenceMap([{label:'#交接班',url:'https://discord.com/channels/111/222'}]);
  const tokens = inlineReferenceTokens('看第八節，再到 #交接班。另見[說明](https://example.com/help)。', references,
    n => n === 8 ? '/service/courses/qiunai/example/lessons/8' : undefined);
  assert.deepEqual(tokens.filter(token=>token.href).map(token=>token.text), ['第八節','#交接班','說明']);
  assert.equal(tokens.find(token=>token.text==='第八節').href, '/service/courses/qiunai/example/lessons/8');
  assert.equal(tokens.at(-1).text,'。');
});

test('ambiguous channel names and unsafe targets remain plain text', () => {
  const references = referenceMap([{label:'#付款',url:'https://discord.com/channels/1/2'},{label:'#付款',url:'https://discord.com/channels/3/4'}]);
  assert.ok(inlineReferenceTokens('#付款與第九章 [危險](javascript:bad)', references, ()=>undefined).every(token=>!token.href));
  for (const href of ['//evil.test','/service/../admin','https://user@evil.test','data:text/html,hi','/service/\\evil.test'])
    assert.equal(safeReferenceHref(href),null);
});
