import test from 'node:test';
import assert from 'node:assert/strict';

let recordApi={},shareApi={};
try{recordApi=await import('../public/lib/capital-record.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
try{shareApi=await import('../public/lib/capital-share.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const api=(name,source=shareApi)=>{assert.equal(typeof source[name],'function',`${name} is not implemented`);return source[name];};
const sample=()=>api('createCapitalRecord',recordApi)({company:'Anthropic',scenarios:[{id:'custom',label:'自定义 🧭',assumptions:{rev2026:100.12345678901235,g1:.12345678901234566,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25},continuationYears:17}],plans:[{id:'a',label:'资本方案 A',basis:'post',quote:300.1234567890123,primaryCapital:25.123456789012344}],policy:{capitalTarget:25.123456789012344,retentionFloor:.8123456789012345,modelCoverageFloor:1.2345678901234567,holderStake:.12345678901234566},bridge:{cash:20.123456789012344,debt:5,otherClaims:0}}, {selectedPlanId:'a',rationale:'选择 A 🧭\n保留所有数字。',tradeoff:'<script>alert("never")</script>',reviewTrigger:'重新审查 ≥ 25。',informationNeeded:'Current terms & rights.'});
const pack=value=>Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
const unpack=token=>JSON.parse(Buffer.from(token,'base64url').toString('utf8'));

test('exact capital sharing preserves every numeric field, finite horizon and Unicode decision',()=>{
  const original=sample(),token=api('encodeCapitalShare')(original),restored=api('decodeCapitalShare')(token);
  assert.match(token,/^[A-Za-z0-9_-]+$/);assert.ok(token.length<32768);
  assert.deepEqual(restored.snapshot,original.snapshot);assert.deepEqual(restored.decision,original.decision);
  assert.equal(restored.analysis.scenarios[0].continuationYears,17);
  assert.ok(restored.analysis.scenarios[0].operatingEv<restored.analysis.scenarios[0].perpetualEv);
  const payload=unpack(token);assert.equal(Object.hasOwn(payload,'analysis'),false);assert.equal(Object.hasOwn(payload,'verified'),false);
});

test('a direct stale analysis is recalculated rather than stored in an exact link',()=>{
  const original=sample();original.analysis={verified:true,scenarios:[{operatingEv:999}]};
  const restored=api('decodeCapitalShare')(api('encodeCapitalShare')(original));
  assert.notEqual(restored.analysis.scenarios[0].operatingEv,999);assert.equal(Object.hasOwn(restored.analysis,'verified'),false);
  assert.deepEqual(restored.decision,original.decision);
});

test('capital URLs have an exact destination and remove unrelated query, fragment and credentials',()=>{
  const original=sample(),url=new URL(api('capitalUrl')(original,'https://example.com/research/horizon.html?unrelated=1#old'));
  assert.equal(url.pathname,'/research/capital.html');assert.equal(url.search,'');assert.ok(url.hash.startsWith('#decision='));
  assert.deepEqual(api('decodeCapitalShare')(url.hash.slice('#decision='.length)).snapshot,original.snapshot);
  assert.equal(new URL(api('capitalUrl')(original,'https://example.com/demo/')).pathname,'/demo/capital.html');
  for(const base of ['javascript:alert(1)','file:///tmp/capital.html','https://user:secret@example.com/capital.html'])assert.throws(()=>api('capitalUrl')(original,base));
});

test('share decoders reject mismatched versions, unknown fields and invalid selections',()=>{
  const payload=unpack(api('encodeCapitalShare')(sample()));
  for(const change of [{kind:'other'},{schema:2},{modelVersion:'9.0.0'},{valuationDate:'2027-01-01'},{capitalVersion:'9.0.0'},{analysis:{verified:true}},{extra:true},{decision:{...payload.decision,selectedPlanId:'missing'}}])assert.throws(()=>api('decodeCapitalShare')(pack({...payload,...change})));
  const {decision:omitted,...missing}=payload;assert.throws(()=>api('decodeCapitalShare')(pack(missing)));
});

test('malformed tokens and invalid UTF-8 never become a default decision',()=>{
  api('decodeCapitalShare');
  for(const token of ['',null,4,'?abc','abc=','x'.repeat(32769),Buffer.from([0xc3,0x28]).toString('base64url'),pack(null),pack([]),pack('text')])assert.throws(()=>api('decodeCapitalShare')(token));
});

test('an oversized valid decision retains its JSON path when link sharing is unavailable',()=>{
  const original=sample();for(const key of ['rationale','tradeoff','reviewTrigger','informationNeeded'])original.decision[key]='🧭'.repeat(1500);
  const canonical=api('createCapitalRecord',recordApi)(original.snapshot,original.decision);
  assert.throws(()=>api('encodeCapitalShare')(canonical),/link|JSON|large|size/i);
  const restored=api('parseCapitalRecord',recordApi)(JSON.stringify(canonical));assert.deepEqual(restored.decision,canonical.decision);assert.deepEqual(restored.snapshot,canonical.snapshot);
});

test('decoding also checks the UTF-8 JSON payload size before accepting a decision',()=>{
  const payload=unpack(api('encodeCapitalShare')(sample()));payload.padding='x'.repeat(25000);
  assert.throws(()=>api('decodeCapitalShare')(pack(payload)),/large|size|limit|format|field/i);
});
