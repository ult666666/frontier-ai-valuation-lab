import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import {encodeFinancing,decodeFinancing,normalizeFinancing,financingUrl} from '../public/lib/financing-share.js';

const sample=()=>({case:{company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.4123456789012345},bridge:{cash:20,debt:5,otherClaims:0}},round:{basis:'pre',quote:250.1234567890123,primaryCapital:25.9876543210987,holderStake:.1234567890123456}});
const pack=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
test('financing snapshot preserves all exact model, bridge, quote and ownership inputs',()=>{
  const input=sample(),roundTrip=decodeFinancing(encodeFinancing(input));assert.deepEqual(roundTrip,input);
  roundTrip.case.assumptions.g1=.2;roundTrip.case.bridge.cash=1;roundTrip.round.quote=1;
  assert.equal(input.case.assumptions.g1,.4123456789012345);assert.equal(input.case.bridge.cash,20);assert.equal(input.round.quote,250.1234567890123);
});
test('financing post-money interpretation and absent bridge survive sharing',()=>{
  const item=sample();item.round.basis='post';item.case.bridge=null;assert.deepEqual(decodeFinancing(encodeFinancing(item)),item);
});
test('financing links use the Model route and exclude unrelated query and fragment',()=>{
  const url=new URL(financingUrl('https://example.com/demo/horizon.html?token=unrelated#horizon=old',sample()));
  assert.equal(url.pathname,'/demo/index.html');assert.equal(url.search,'');assert.deepEqual(decodeFinancing(url.hash.slice(11)),sample());
  for(const base of ['javascript:alert(1)','https://user:password@example.com/'])assert.throws(()=>financingUrl(base,sample()));
});
test('financing transport rejects unsupported versions, dates, fields and malformed tokens',()=>{
  const token=encodeFinancing(sample()),raw=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));
  for(const edit of [{schema:2},{financing:'9.0.0'},{model:'9.0.0'},{date:'2025-01-01'},{extra:true}])assert.throws(()=>decodeFinancing(pack({...raw,...edit})));
  for(const bad of ['',null,'a'.repeat(8193),'#scenario=test','!!!'])assert.throws(()=>decodeFinancing(bad));
});
test('financing snapshots reject extra, inherited and accessor data without executing getters',()=>{
  const item=sample();assert.throws(()=>normalizeFinancing({...item,other:'ignored'}));
  const inherited=Object.create(item);assert.throws(()=>normalizeFinancing(inherited));
  let called=false;const round={...item.round};Object.defineProperty(round,'quote',{get(){called=true;return 1;},enumerable:true});
  assert.throws(()=>normalizeFinancing({...item,round}));assert.equal(called,false);
  assert.throws(()=>normalizeFinancing({...item,case:{...item.case,bridge:{...item.case.bridge,primaryCapital:25}}}));
});
