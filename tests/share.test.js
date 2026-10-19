import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import {project,MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {encodeScenario,decodeScenario,scenarioUrl} from '../public/lib/share.js';

const draft={company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null};
const encodeRaw=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const rawPayload=()=>({schema:1,model:MODEL_VERSION,date:VALUATION_DATE,company:'Anthropic',scenario:'Base',inputs:Object.values(presets.Anthropic.Base),bridge:null});

test('all six shared cases round-trip full precision and exact enterprise value',()=>{
  for(const [company,scenarios] of Object.entries(presets)) for(const [scenario,assumptions] of Object.entries(scenarios)){
    const input={company,scenario,assumptions,bridge:null};
    const decoded=decodeScenario(encodeScenario(input));
    assert.deepEqual(decoded,input);
    assert.equal(project(decoded.assumptions).ev,project(assumptions).ev);
  }
  const edited={...draft,assumptions:{...draft.assumptions,g1:.4781234567890123,stub:-.123456789012345}};
  assert.deepEqual(decodeScenario(encodeScenario(edited)),edited);
  const closeSpread={...draft,assumptions:{...draft.assumptions,wacc:.030000000000000002,tg:.03}};
  assert.deepEqual(decodeScenario(encodeScenario(closeSpread)),closeSpread);
});

test('hypothetical bridge is explicitly preserved without changing operating EV',()=>{
  const input={...draft,bridge:{cash:10.5,debt:20,otherClaims:1.25}};
  const decoded=decodeScenario(encodeScenario(input));
  assert.deepEqual(decoded.bridge,input.bridge);
  assert.equal(project(decoded.assumptions).ev,project(draft.assumptions).ev);
  assert.equal(decodeScenario(encodeScenario(draft)).bridge,null);
});

test('link is portable, bounded, fragment-only and removes unrelated query parameters',()=>{
  const url=new URL(scenarioUrl('https://example.com/demo/?tracking=secret#sources',draft));
  assert.equal(url.origin,'https://example.com');
  assert.equal(url.pathname,'/demo/');
  assert.equal(url.search,'');
  assert.ok(url.hash.startsWith('#scenario='));
  assert.ok(url.href.length<1200);
  assert.deepEqual(decodeScenario(url.hash.slice('#scenario='.length)),draft);
  assert.throws(()=>scenarioUrl('javascript:alert(1)',draft),/HTTP/);
});

test('malformed, oversized, incompatible and unknown shared payloads are rejected',()=>{
  for(const token of ['', 'not-base64!', 'a'.repeat(4097), 'e30']) assert.throws(()=>decodeScenario(token));
  for(const alteration of [{schema:2},{model:'999.0.0'},{date:'2027-01-01'},{company:'<img src=x onerror=alert(1)>'},{scenario:'Guaranteed'},{extra:'not allowed'},{inputs:[1,2]}]){
    assert.throws(()=>decodeScenario(encodeRaw({...rawPayload(),...alteration})));
  }
  const bad=rawPayload();bad.inputs[8]=true;
  assert.throws(()=>decodeScenario(encodeRaw(bad)));
});

test('invalid numbers and unsupported bridge fields cannot travel through a share link',()=>{
  for(const assumptions of [{...draft.assumptions,turns:-1},{...draft.assumptions,rev2026:Infinity},{...draft.assumptions,tg:.125},{...draft.assumptions,wacc:Number.MIN_VALUE,tg:0}]) assert.throws(()=>encodeScenario({...draft,assumptions}));
  for(const bridge of [{cash:-1,debt:0,otherClaims:0},{cash:0,debt:0},{cash:0,debt:0,otherClaims:0,extra:1}]) assert.throws(()=>encodeScenario({...draft,bridge}));
  assert.throws(()=>encodeScenario({...draft,company:'constructor'}));
});
