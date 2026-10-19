import test from 'node:test';
import assert from 'node:assert/strict';
import {createBriefing} from '../public/lib/briefing.js';
import {scenarioUrl} from '../public/lib/share.js';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};
const draft={company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,research,bridge:null,shareUrl:'https://example.com/'};

test('briefing recomputes active assumptions and documents all financial bases',()=>{
  const html=createBriefing(draft);
  for(const expected of ['$367.8B','78.4%','2030','$30.5B','2027–2030 annual growth','Terminal ROIC','12.5%','53.3','Remaining-2026','not cash runway','post-money equity']) assert.ok(html.includes(expected),expected);
  const edited=createBriefing({...draft,assumptions:{...draft.assumptions,wacc:.145},edited:true});
  assert.ok(edited.includes('$265.3B'));
  assert.ok(edited.includes('custom assumptions'));
  assert.ok(!edited.includes('$367.8B'));
});

test('bear scenarios keep the negative valuation and undefined terminal share',()=>{
  for(const company of ['Anthropic','OpenAI']){
    const html=createBriefing({...draft,company,scenario:'Bear',assumptions:presets[company].Bear});
    assert.match(html,/−\$/);
    assert.ok(html.includes('Undefined for nonpositive EV'));
    assert.ok(html.includes('does not impose a zero floor'));
  }
});

test('brief is a standalone script-free document with a precise reopening link',()=>{
  const shareUrl=scenarioUrl('https://example.com/',draft);
  const html=createBriefing({...draft,shareUrl});
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<style>'));
  assert.ok(html.includes('@media print'));
  assert.ok(html.includes(shareUrl));
  assert.ok(!/<script|<iframe|onerror=/i.test(html));
  assert.ok(html.includes('Research snapshot'));
  assert.ok(html.includes(research.researchCutoff));
});

test('selected evidence is safely escaped and active hypothetical bridge is explicit',()=>{
  const modified=structuredClone(research);
  modified.sources[0].title='<script>alert(1)</script>';
  modified.sources[0].url='javascript:alert(1)';
  modified.companies.Anthropic.financing.note='<img src=x onerror=alert(1)>';
  const html=createBriefing({...draft,research:modified,bridge:{cash:10,debt:20,otherClaims:1}});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('Optional hypothetical equity bridge'));
  assert.ok(html.includes('$356.8B'));
  assert.ok(!createBriefing(draft).includes('<h2>Optional hypothetical equity bridge'));
});

test('brief refuses invalid assumptions and incompatible research',()=>{
  assert.throws(()=>createBriefing({...draft,assumptions:{...draft.assumptions,turns:-2}}));
  assert.throws(()=>createBriefing({...draft,research:{...research,modelVersion:'9.0.0'}}));
  assert.throws(()=>createBriefing({...draft,company:'Not a supported company'}));
});
