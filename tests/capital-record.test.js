import test from 'node:test';
import assert from 'node:assert/strict';

let recordApi={};
try{recordApi=await import('../public/lib/capital-record.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const api=name=>{assert.equal(typeof recordApi[name],'function',`${name} is not implemented`);return recordApi[name];};
const assumptions=()=>({rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25});
const snapshot=()=>({company:'Anthropic',scenarios:[{id:'base',label:'Base case',assumptions:assumptions(),continuationYears:null}],plans:[{id:'a',label:'Plan A',basis:'pre',quote:100,primaryCapital:25},{id:'b',label:'Plan B',basis:'pre',quote:120,primaryCapital:30}],policy:{capitalTarget:25,retentionFloor:.8,modelCoverageFloor:1,holderStake:.1},bridge:{cash:20,debt:5,otherClaims:0}});
const decision=()=>({selectedPlanId:'a',rationale:'Prefer the stated capital objective.',tradeoff:'Additional capital changes dilution.',reviewTrigger:'Revisit if the capital objective changes.',informationNeeded:'Confirm balances and economic rights.'});
const create=(s=snapshot(),d=decision())=>api('createCapitalRecord')(s,d);

test('capital records capture a complete detached decision and recalculate the frozen model',()=>{
  const input=snapshot(),notes=decision(),result=create(input,notes);
  assert.equal(result.kind,'frontier-capital-decision');assert.equal(result.schema,1);
  assert.equal(result.modelVersion,'3.0.0');assert.equal(result.valuationDate,'2026-10-18');assert.equal(result.capitalVersion,'1.0.0');
  assert.deepEqual(result.snapshot,input);assert.deepEqual(result.decision,notes);
  assert.ok(Math.abs(result.analysis.scenarios[0].operatingEv-200.31471864537804)<1e-8);
  assert.ok(Math.abs(result.analysis.matrix[0].existingCohortAllocation-192.25177491630244)<1e-8);
  result.snapshot.scenarios[0].assumptions.g1=.09;result.decision.rationale='Changed output';
  assert.equal(input.scenarios[0].assumptions.g1,.04);assert.equal(notes.rationale,'Prefer the stated capital objective.');
  assert.equal(result.analysis.snapshot.scenarios[0].assumptions.g1,.04);
});

test('imported analytical output cannot override calculations or inject a verification claim',()=>{
  const forged=create();forged.analysis={verified:true,scenarios:[{operatingEv:999}],matrix:[],warnings:[]};
  const restored=api('parseCapitalRecord')(JSON.stringify(forged));
  assert.ok(Math.abs(restored.analysis.scenarios[0].operatingEv-200.31471864537804)<1e-8);
  assert.equal(Object.hasOwn(restored.analysis,'verified'),false);assert.equal(restored.analysis.matrix.length,2);
  const changed=create();changed.snapshot.scenarios[0].continuationYears=0;
  const updated=api('parseCapitalRecord')(JSON.stringify(changed));
  assert.equal(updated.snapshot.scenarios[0].continuationYears,0);
  assert.ok(updated.analysis.scenarios[0].operatingEv<updated.analysis.scenarios[0].perpetualEv);
});

test('valid Unicode and HTML-like decision text survive a JSON round trip exactly',()=>{
  const notes={selectedPlanId:'a',rationale:'选择 A 🧭 — 保留弹性\n第二行',tradeoff:'<img src=x onerror="alert(1)"> & "terms"',reviewTrigger:'If price changes ≤ €10 or \u2028a new case arrives.',informationNeeded:'確認資金與權利。'};
  const original=create(snapshot(),notes),restored=api('parseCapitalRecord')(JSON.stringify(original));
  assert.deepEqual(restored.decision,notes);assert.deepEqual(restored.snapshot,original.snapshot);
});

test('blank decision drafts and a selected ineligible plan remain explicit',()=>{
  const empty={selectedPlanId:null,rationale:'',tradeoff:'',reviewTrigger:'',informationNeeded:''};
  assert.deepEqual(create(snapshot(),empty).decision,empty);
  const input=snapshot();input.policy.capitalTarget=100;
  const result=create(input,decision());assert.equal(result.decision.selectedPlanId,'a');assert.equal(result.analysis.plans[0].eligible,false);
});

test('decision text limits count Unicode code points and reject malformed Unicode or controls',()=>{
  const notes=decision();notes.rationale='🧭'.repeat(1500);
  assert.equal(Array.from(create(snapshot(),notes).decision.rationale).length,1500);
  for(const rationale of ['🧭'.repeat(1501),'broken\uD800','broken\uDC00','bad\u0000note','bad\u0085note'])assert.throws(()=>create(snapshot(),{...decision(),rationale}));
});

test('missing, unsupported and accessor decision fields are rejected before execution',()=>{
  api('createCapitalRecord');
  const {tradeoff:omitted,...missing}=decision();
  for(const notes of [missing,{...decision(),selectedPlanId:'missing'},{...decision(),selectedPlanId:7},{...decision(),reviewed:true},null,[],Object.create(decision())])assert.throws(()=>create(snapshot(),notes));
  let invoked=false;const accessor={...decision()};Object.defineProperty(accessor,'rationale',{enumerable:true,get(){invoked=true;return 'unsafe';}});
  assert.throws(()=>create(snapshot(),accessor));assert.equal(invoked,false);
  const hidden={...decision()};Object.defineProperty(hidden,'tradeoff',{value:'hidden',enumerable:false});assert.throws(()=>create(snapshot(),hidden));
  assert.throws(()=>create(snapshot(),{...decision(),[Symbol('extra')]:true}));
});

test('record imports reject incompatible versions, altered envelopes and malformed JSON',()=>{
  const original=create();
  for(const change of [{kind:'other'},{schema:2},{modelVersion:'9.0.0'},{valuationDate:'2027-01-01'},{capitalVersion:'9.0.0'},{apiVerified:true}])assert.throws(()=>api('parseCapitalRecord')(JSON.stringify({...original,...change})));
  const {analysis:omitted,...withoutAnalysis}=original;assert.throws(()=>api('parseCapitalRecord')(JSON.stringify(withoutAnalysis)));
  for(const text of ['{broken','null','[]','"record"',null,42])assert.throws(()=>api('parseCapitalRecord')(text));
});

test('import size limits use UTF-8 bytes before parsing or recalculation',()=>{
  const oversized={...create(),analysis:'🧭'.repeat(66000)};
  assert.ok(JSON.stringify(oversized).length<256*1024);
  assert.throws(()=>api('parseCapitalRecord')(JSON.stringify(oversized)),/256|size|large|KiB/i);
  assert.throws(()=>api('parseCapitalRecord')(' '.repeat(256*1024)+'{}'),/256|size|large|KiB/i);
});

test('the largest documented scenario, plan and Unicode-note counts round trip in compact and pretty JSON',t=>{
  const input=snapshot(),longLabel='🧭'.repeat(60),longNote='🧭'.repeat(1500);
  const precise={rev2026:9876.543210987654,g1:.12345678901234566,g2:.23456789012345678,g3:.3456789012345679,m27:-.9876543210987654,m30:-.12345678901234566,m36:.23456789012345678,turns:.050123456789012345,wacc:.4567890123456789,tg:.012345678901234567,roic:.12345678901234566,stub:-9876.543210987654,tax:.23456789012345678};
  input.scenarios=Array.from({length:9},(_,index)=>({id:`scenario-${index}`,label:longLabel,assumptions:{...precise,rev2026:precise.rev2026-index*.12345678901234566},continuationYears:index%3===0?null:index*11}));
  input.plans=Array.from({length:6},(_,index)=>({id:`plan-${index}`,label:longLabel,basis:index%2?'post':'pre',quote:100000000000.12345*(index+1),primaryCapital:123456789.12345679*(index+1)}));
  input.policy={capitalTarget:.12345678901234566,retentionFloor:.8765432109876543,modelCoverageFloor:1.1234567890123457,holderStake:.12345678901234566};
  input.bridge={cash:1234.5678901234567,debt:2345.678901234567,otherClaims:3456.7890123456787};
  const notes={selectedPlanId:'plan-0',rationale:longNote,tradeoff:longNote,reviewTrigger:longNote,informationNeeded:longNote};
  const original=create(input,notes);
  assert.equal(original.analysis.matrix.length,54);
  assert.ok(original.analysis.scenarios.every(scenario=>scenario.warnings.length>=3));
  const sizes={};
  for(const [format,indent] of [['compact',undefined],['pretty',2]]){
    const serialized=JSON.stringify(original,null,indent),bytes=new TextEncoder().encode(serialized).byteLength;
    sizes[format]=bytes;
    assert.ok(bytes>96*1024,`${format} record exercises the original capacity gap`);
    assert.ok(bytes<=256*1024,`${format} record stays within the approved bounded import`);
    const restored=api('parseCapitalRecord')(serialized);
    assert.deepEqual(restored.snapshot,input);assert.deepEqual(restored.decision,notes);
    assert.deepEqual(restored.analysis,original.analysis);
  }
  t.diagnostic(`Maximum-count precise Unicode record UTF-8 bytes: ${JSON.stringify(sizes)}`);
});

test('normalizing a direct record ignores only its data output and never executes an analysis getter',()=>{
  const original=create();const changed={...original,analysis:null};
  assert.equal(api('normalizeCapitalRecord')(changed).analysis.matrix.length,2);
  let invoked=false;Object.defineProperty(changed,'analysis',{enumerable:true,get(){invoked=true;return original.analysis;}});
  assert.throws(()=>api('normalizeCapitalRecord')(changed));assert.equal(invoked,false);
});
