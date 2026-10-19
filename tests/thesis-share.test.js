import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import {MODEL_VERSION,VALUATION_DATE,project} from '../public/lib/model.js';
import {encodeScenario} from '../public/lib/share.js';
import {normalizeThesis,encodeThesis,decodeThesis,thesisUrl} from '../public/lib/thesis-share.js';

const item=(company='Anthropic')=>({company,reference:{scenario:'Base',assumptions:{...presets[company].Base},bridge:null},alternative:{scenario:'Bull',assumptions:{...presets[company].Bull},bridge:{cash:15.125,debt:3.25,otherClaims:1.0625}},landscape:{rates:[.085,.105,.125,.145],margins:[.08,.16,.24,.32,.40],target:500}});
const tokenFor=payload=>btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack=token=>JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));

test('two-case links preserve full precision, every bridge and the exact landscape window',()=>{
  for(const company of ['Anthropic','OpenAI']){
    const draft=item(company);draft.reference.assumptions.g1=.12345678912345678;draft.alternative.assumptions.turns=2.1234567891234567;
    draft.reference.bridge={cash:1,debt:2,otherClaims:0};
    const restored=decodeThesis(encodeThesis(draft));assert.deepEqual(restored,draft);
    assert.equal(project(restored.reference.assumptions).ev,project(draft.reference.assumptions).ev);
    assert.equal(project(restored.alternative.assumptions).ev,project(draft.alternative.assumptions).ev);
    assert.notEqual(restored.reference.assumptions,draft.reference.assumptions);
  }
});

test('original one-case codec remains compatible with either side of a thesis',()=>{
  const draft=item('OpenAI'),payload=unpack(encodeThesis(draft));
  assert.equal(payload.reference,encodeScenario({company:draft.company,...draft.reference}));
  assert.equal(payload.alternative,encodeScenario({company:draft.company,...draft.alternative}));
  assert.equal(payload.model,MODEL_VERSION);assert.equal(payload.date,VALUATION_DATE);
});

test('thesis links are bounded versioned fragments with no inherited URL query',()=>{
  const url=new URL(thesisUrl('https://example.test/project/thesis.html?old=case#old',item()));
  assert.equal(url.pathname,'/project/thesis.html');assert.equal(url.search,'');assert.ok(url.hash.startsWith('#thesis='));
  assert.ok(url.hash.length<8192);assert.deepEqual(decodeThesis(url.hash.slice(8)),item());
  for(const scheme of ['javascript:alert(1)','data:text/html,x','file:///thesis.html'])assert.throws(()=>thesisUrl(scheme,item()),/HTTP/);
});

test('same-company, version, research date and exact payload shape are mandatory',()=>{
  const base=unpack(encodeThesis(item()));
  for(const change of [{schema:2},{model:'9.0.0'},{date:'2099-01-01'},{extra:1}])assert.throws(()=>decodeThesis(tokenFor({...base,...change})));
  const other=encodeScenario({company:'OpenAI',scenario:'Base',assumptions:presets.OpenAI.Base,bridge:null});
  assert.throws(()=>decodeThesis(tokenFor({...base,alternative:other})),/same company/);
  const missing={...base};delete missing.reference;assert.throws(()=>decodeThesis(tokenFor(missing)));
  for(const token of ['',null,'x'.repeat(8193),'a!b','A','e30'])assert.throws(()=>decodeThesis(token));
});

test('normalization rejects malformed records and accessors without evaluating them',()=>{
  let reads=0;const draft=item();Object.defineProperty(draft.reference.assumptions,'g1',{enumerable:true,get(){reads++;return .5;}});
  assert.throws(()=>normalizeThesis(draft),/data property/);assert.equal(reads,0);
  const inherited=item();inherited.reference=Object.create(inherited.reference);assert.throws(()=>normalizeThesis(inherited),/plain object/);
  const extra=item();extra.reference.assumptions.other=1;assert.throws(()=>normalizeThesis(extra),/unsupported/);
  const nested=item();Object.defineProperty(nested,'alternative',{enumerable:true,get(){reads++;return item().alternative;}});assert.throws(()=>normalizeThesis(nested));assert.equal(reads,0);
  const bridge=item();bridge.reference.bridge={cash:1,debt:2,otherClaims:0,secret:3};assert.throws(()=>normalizeThesis(bridge));
});

test('axis records reject sparse arrays, accessors, duplicate order and unsupported configuration',()=>{
  const cases=[{rates:[.1,.1]},{rates:[.2,.1]},{margins:[.2]},{margins:[.2,Infinity]},{target:0},{target:1e12+1},{unexpected:true}];
  for(const config of cases){const draft=item();Object.assign(draft.landscape,config);assert.throws(()=>normalizeThesis(draft));}
  const sparse=item();sparse.landscape.rates=Array(2);assert.throws(()=>normalizeThesis(sparse));
  let reads=0;const accessor=item();Object.defineProperty(accessor.landscape.rates,'0',{get(){reads++;return .1;},enumerable:true});assert.throws(()=>normalizeThesis(accessor));assert.equal(reads,0);
  const extra=item();extra.landscape.rates.extra='no';assert.throws(()=>normalizeThesis(extra));
  const long=item();long.landscape.rates=Array.from({length:22},(_,i)=>i/100);assert.throws(()=>normalizeThesis(long));
});

test('valid negative cases and invalid grid coordinates remain shareable; invalid cases do not',()=>{
  const draft=item();draft.reference={scenario:'Bear',assumptions:{...presets.Anthropic.Bear},bridge:null};
  draft.landscape.rates=[0,.01,.02];draft.landscape.margins=[0,.2,.4];
  assert.ok(project(draft.reference.assumptions).ev<0);assert.deepEqual(decodeThesis(encodeThesis(draft)),draft);
  for(const change of [{wacc:.03,tg:.03},{g1:NaN},{wacc:Number.MIN_VALUE,tg:0}]){
    const bad=item();Object.assign(bad.reference.assumptions,change);assert.throws(()=>normalizeThesis(bad));
  }
  const near=item();near.reference.assumptions.wacc=.030000000000000002;
  assert.deepEqual(decodeThesis(encodeThesis(near)),near);
});

test('normalization creates detached snapshots and never mutates source drafts',()=>{
  const draft=item(),before=structuredClone(draft),copy=normalizeThesis(draft);
  copy.reference.assumptions.g1=.2;copy.landscape.rates[0]=.01;copy.alternative.bridge.cash=1;
  assert.deepEqual(draft,before);
});
