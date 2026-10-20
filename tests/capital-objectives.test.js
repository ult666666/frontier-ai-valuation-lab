import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCapitalExample} from '../public/lib/capital-example.js';
import {createCapitalRecord} from '../public/lib/capital-record.js';
import {CAPITAL_OBJECTIVE_OPTIONS,previewCapitalObjectives} from '../public/lib/capital-objectives.js';

const presets=JSON.parse(readFileSync(new URL('../data/presets.json',import.meta.url),'utf8'));
const example=()=>createCapitalExample(presets);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('objective choices are immutable, explicit hypothetical pairs',()=>{
  assert.deepEqual(CAPITAL_OBJECTIVE_OPTIONS.map(({id,capitalTarget,retentionFloor})=>[id,capitalTarget,retentionFloor]),[
    ['25-88',25,.88],['25-90',25,.9],['30-90',30,.9],['30-88',30,.88]
  ]);
  assert.ok(Object.isFrozen(CAPITAL_OBJECTIVE_OPTIONS));
  assert.ok(CAPITAL_OBJECTIVE_OPTIONS.every(Object.isFrozen));
});

for(const [id,capitalTarget,retentionFloor,eligible] of [
  ['25-88',25,.88,['a','b']],['25-90',25,.9,['a']],
  ['30-90',30,.9,[]],['30-88',30,.88,['b']]
])test(`preview ${id} uses current terms and the declared eligibility rule`,()=>{
  const source=freeze(example()),before=structuredClone(source);
  const result=previewCapitalObjectives(source,id);
  assert.deepEqual(result.analysis.comparison.eligiblePlanIds,eligible);
  const expected=structuredClone(source.snapshot);
  expected.policy.capitalTarget=capitalTarget;expected.policy.retentionFloor=retentionFloor;
  assert.deepEqual(result,createCapitalRecord(expected,source.decision));
  assert.deepEqual(source,before);
  assert.notEqual(result,source);assert.notEqual(result.snapshot.plans,source.snapshot.plans);
  assert.notEqual(result.decision,source.decision);
});

test('custom company, terms, scenarios, holder, coverage, bridge and Unicode reasoning survive preview',()=>{
  const draft=createCapitalExample(presets,'OpenAI');
  draft.snapshot.plans[0].label='Custom α <plan> 🧭';
  draft.snapshot.plans[0].quote=100;
  draft.snapshot.plans[1].quote=500;
  draft.snapshot.plans[1].basis='post';
  draft.snapshot.scenarios[0].label='Edited finite case';
  draft.snapshot.scenarios[0].continuationYears=7;
  draft.snapshot.scenarios[0].assumptions.g1=.3;
  draft.snapshot.policy.holderStake=.075;
  draft.snapshot.policy.modelCoverageFloor=1.25;
  draft.snapshot.bridge={cash:7,debt:2,otherClaims:1};
  draft.decision={selectedPlanId:'c',rationale:'Keep\nexact α 🧭 prose',tradeoff:'Capital & ownership',reviewTrigger:'Review <90%',informationNeeded:'Verify terms\tand cash'};
  const source=freeze(createCapitalRecord(draft.snapshot,draft.decision));
  const result=previewCapitalObjectives(source,'25-90');
  assert.deepEqual(result.analysis.comparison.eligiblePlanIds,['b']);
  assert.equal(result.snapshot.company,'OpenAI');
  assert.deepEqual(result.snapshot.plans,source.snapshot.plans);
  assert.deepEqual(result.snapshot.scenarios,source.snapshot.scenarios);
  assert.deepEqual(result.snapshot.bridge,source.snapshot.bridge);
  assert.equal(result.snapshot.policy.holderStake,.075);
  assert.equal(result.snapshot.policy.modelCoverageFloor,1.25);
  assert.deepEqual(result.decision,source.decision);
  assert.equal(result.decision.selectedPlanId,'c');
});

test('a missing bridge permits objective screening without inventing allocations',()=>{
  const draft=example();draft.snapshot.bridge=null;draft.decision.selectedPlanId=null;
  const result=previewCapitalObjectives(createCapitalRecord(draft.snapshot,draft.decision),'30-88');
  assert.deepEqual(result.analysis.comparison.eligiblePlanIds,['b']);
  assert.equal(result.snapshot.bridge,null);
  assert.equal(result.decision.selectedPlanId,null);
  assert.ok(result.analysis.matrix.every(cell=>cell.existingCohortAllocation===null));
});

test('stored analytical output cannot supply a preview result',()=>{
  const source=example();source.analysis={comparison:{eligiblePlanIds:['forged']}};
  const result=previewCapitalObjectives(source,'25-90');
  assert.deepEqual(result.analysis.comparison.eligiblePlanIds,['a']);
  assert.equal(result.analysis.plans.length,3);
});

test('near-threshold eligibility uses full precision even when display rounding hides a gap',()=>{
  const ownership=example();ownership.snapshot.plans[0].quote=224.99;
  const retained=previewCapitalObjectives(createCapitalRecord(ownership.snapshot,ownership.decision),'25-90').analysis.plans[0];
  assert.equal((retained.retainedFraction*100).toFixed(2),'90.00');
  assert.equal(retained.meetsRetention,false);assert.equal(retained.eligible,false);
  const capital=example();capital.snapshot.plans[0].primaryCapital=24.999;
  const raised=previewCapitalObjectives(createCapitalRecord(capital.snapshot,capital.decision),'25-90').analysis.plans[0];
  assert.equal((-raised.capitalGap).toFixed(2),'0.00');
  assert.equal(raised.meetsCapital,false);assert.equal(raised.eligible,false);
});

test('preview validates the current objectives before replacing them',()=>{
  for(const [key,value] of [['capitalTarget',NaN],['capitalTarget',-1],['retentionFloor',0],['retentionFloor',Infinity]]){
    const source=example();source.snapshot.policy[key]=value;
    assert.throws(()=>previewCapitalObjectives(source,'25-88'));
  }
});

test('invalid current terms, prose, selection or metadata cannot be repaired by a preview',()=>{
  for(const edit of [
    record=>{record.snapshot.plans[0].quote=NaN;},
    record=>{record.decision.rationale='x'.repeat(1501);},
    record=>{record.decision.selectedPlanId='missing';},
    record=>{record.valuationDate='2000-01-01';}
  ]){const source=example();edit(source);assert.throws(()=>previewCapitalObjectives(source,'25-88'));}
});

test('unsupported objective choices fail without changing the supplied record',()=>{
  const source=freeze(example()),before=structuredClone(source);
  for(const id of ['',null,25,'__proto__','35-90',{capitalTarget:25,retentionFloor:.9}]){
    assert.throws(()=>previewCapitalObjectives(source,id),/objective pair/i);
  }
  assert.deepEqual(source,before);
});

test('independent previews cannot alter each other or their source',()=>{
  const source=example(),before=structuredClone(source);
  const first=previewCapitalObjectives(source,'25-90'),second=previewCapitalObjectives(source,'30-88');
  first.snapshot.plans[0].label='Changed preview';first.decision.rationale='Changed preview';
  assert.deepEqual(source,before);
  assert.deepEqual(second.snapshot.plans,source.snapshot.plans);
  assert.deepEqual(second.decision,source.decision);
  assert.deepEqual(second.analysis.comparison.eligiblePlanIds,['b']);
});
