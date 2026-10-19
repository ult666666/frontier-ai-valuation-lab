import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {project} from '../public/lib/model.js';
import {encodeThesis} from '../public/lib/thesis-share.js';
import {defaultLandscape,inspectionUrl,decodeInspection,returnFromInspection,applyRequiredMargin} from '../public/lib/journey.js';

const presets=JSON.parse(readFileSync(new URL('../data/presets.json',import.meta.url),'utf8'));
const pair=()=>({company:'Anthropic',reference:{scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:{cash:12.25,debt:3.125,otherClaims:1.5}},alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull,g1:.6512345678912345},bridge:{cash:24.5,debt:7.25,otherClaims:2.75}},landscape:{rates:[.08123456789,.105,.16666666666666666],margins:[.06,.1234567890123456,.42],target:537.123456789}});

test('Default landscape preserves the established 13 by 13 window and target',()=>{
  const config=defaultLandscape(presets.Anthropic.Bull);
  assert.equal(config.rates.length,13);assert.equal(config.margins.length,13);assert.equal(config.target,500);
  assert.deepEqual([config.rates[0],config.rates.at(-1),config.margins[0],config.margins.at(-1)],[.075,.195,.06,.42]);
});
test('Inspection URLs preserve both exact cases, separate bridges and uneven axes',()=>{
  const draft=pair(),url=new URL(inspectionUrl('https://example.com/index.html?discard=1#old',draft,'alternative'));
  assert.equal(url.search,'');assert.ok(url.hash.startsWith('#inspect=alternative.'));
  const restored=decodeInspection(url.hash);assert.equal(restored.side,'alternative');assert.deepEqual(restored.draft,draft);
  assert.deepEqual(restored.scenario,{company:draft.company,...draft.alternative});
  restored.draft.reference.bridge.cash=100;assert.equal(draft.reference.bridge.cash,12.25);
});
test('Return from inspection replaces only the edited side and retains the complete comparison context',()=>{
  const draft=pair(),before=structuredClone(draft),inspection=decodeInspection(new URL(inspectionUrl('https://example.com/',draft,'alternative')).hash);
  const scenario={company:'Anthropic',scenario:'Bear',assumptions:{...presets.Anthropic.Bear,m30:.07123456789123},bridge:null};
  const returned=returnFromInspection(inspection,scenario);
  assert.deepEqual(returned.reference,draft.reference);assert.deepEqual(returned.alternative,{scenario:scenario.scenario,assumptions:scenario.assumptions,bridge:null});assert.deepEqual(returned.landscape,draft.landscape);assert.deepEqual(draft,before);
  assert.equal(typeof encodeThesis(returned),'string');
});
test('Inspection rejects malformed state, unsafe URLs and cross-company returns without mutation',()=>{
  const draft=pair(),before=structuredClone(draft),context={draft,side:'reference'};
  for(const hash of ['#inspect=other.abc','#inspect=reference.abc','#inspect=alternative.'+'x'.repeat(8193),'#scenario=abc'])assert.throws(()=>decodeInspection(hash));
  assert.throws(()=>inspectionUrl('javascript:alert(1)',draft,'reference'));
  assert.throws(()=>inspectionUrl('https://example.com/',draft,'unknown'));
  assert.throws(()=>returnFromInspection(context,{company:'OpenAI',scenario:'Base',assumptions:presets.OpenAI.Base,bridge:null}));
  assert.throws(()=>returnFromInspection(context,{company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,wacc:0},bridge:null}));
  assert.deepEqual(draft,before);
});
test('Exact required-margin action reaches the target and preserves all other inputs and context',()=>{
  const draft={...pair(),alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull},bridge:{cash:2,debt:1,otherClaims:0}},landscape:{...defaultLandscape(presets.Anthropic.Bull),rates:[.075,.105,.195]}};
  const selected=draft.landscape.rates.findIndex(rate=>Math.abs(rate-.105)<1e-14),applied=applyRequiredMargin(draft,selected);
  assert.ok(Math.abs(applied.alternative.assumptions.m36-.07118481610922621)<3e-17);
  assert.equal(applied.alternative.assumptions.wacc,draft.landscape.rates[selected]);
  assert.ok(Math.abs(project(applied.alternative.assumptions).ev-500)<1e-8);
  for(const [key,value] of Object.entries(draft.alternative.assumptions))if(!['wacc','m36'].includes(key))assert.equal(applied.alternative.assumptions[key],value,key);
  assert.deepEqual(applied.reference,draft.reference);assert.deepEqual(applied.alternative.bridge,draft.alternative.bridge);assert.deepEqual(applied.landscape,draft.landscape);
});
test('Unsolved and invalid frontier selections cannot replace the alternative',()=>{
  const draft=pair(),before=structuredClone(draft);draft.landscape.target=1e12;
  for(const index of [-1,3,.5,NaN])assert.throws(()=>applyRequiredMargin(draft,index));
  assert.throws(()=>applyRequiredMargin(draft,0),/margin|target|solved/i);
  assert.deepEqual(draft.alternative,before.alternative);
});
