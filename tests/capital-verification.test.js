import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAPITAL_ROUNDING_RELATIVE_LIMIT,compareCapitalAnalysis} from '../public/lib/capital-verification.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/capital-runtime-rounding.json',import.meta.url),'utf8'));
const expected=fixture.expectedAnalysis;
const set=(object,path,value)=>{const keys=path.split('.'),key=keys.pop();keys.reduce((value,key)=>value[key],object)[key]=value;};
const get=(object,path)=>path.split('.').reduce((value,key)=>value[key],object);
const change=path=>{const copy=structuredClone(expected);set(copy,path,get(copy,path)*(1+Number.EPSILON));return copy;};

test('identical finite complete results retain exact verification',()=>{
  const result=compareCapitalAnalysis(expected,structuredClone(expected));
  assert.equal(result.status,'exact');assert.deepEqual(result.differences,[]);assert.equal(result.firstMismatch,null);
});

test('the actual cross-runtime fixture receives qualified rounding comparison, never exact verification',()=>{
  const before=structuredClone(fixture);
  const result=compareCapitalAnalysis(expected,fixture.actualApiPayload.result);
  assert.equal(result.status,'rounding');assert.equal(result.differences.length,34);
  assert.equal(result.firstMismatch,null);
  assert.equal(CAPITAL_ROUNDING_RELATIVE_LIMIT,32*Number.EPSILON);
  assert.ok(result.differences.every(item=>item.relativeDifference>0&&item.relativeDifference<=CAPITAL_ROUNDING_RELATIVE_LIMIT));
  assert.deepEqual(fixture,before);
});

for(const path of [
  'snapshot.policy.capitalTarget','snapshot.scenarios.0.assumptions.g1',
  'scenarios.0.assumptions.g1','scenarios.0.continuationYears',
  'plans.0.pricing.preMoney','plans.0.retainedFraction','plans.0.round.primaryCapital',
  'comparison.planMetrics.0.totalScenarios','comparison.crossovers.0.equityResidual',
  'envelope.plans.0.lowerPreMoney','method.quoteInputLimit'
])test(`even a one-step numeric change stays a mismatch at ${path}`,()=>{
  const actual=change(path);assert.notEqual(get(actual,path),get(expected,path));
  const result=compareCapitalAnalysis(expected,actual);
  assert.equal(result.status,'mismatch');assert.equal(result.firstMismatch,`analysis.${path}`);
});

test('derived drift beyond the relative budget remains a mismatch',()=>{
  const actual=structuredClone(expected);actual.scenarios[0].operatingEv*=1+64*Number.EPSILON;
  assert.equal(compareCapitalAnalysis(expected,actual).status,'mismatch');
});

test('the numerical policy has an explicit relative boundary',()=>{
  const reference=structuredClone(expected);reference.scenarios[0].operatingEv=1;
  for(const [steps,status] of [[32,'rounding'],[33,'mismatch']]){
    const actual=structuredClone(reference);actual.scenarios[0].operatingEv=1+steps*Number.EPSILON;
    assert.equal(compareCapitalAnalysis(reference,actual).status,status);
  }
});

test('small magnitudes have no absolute tolerance floor and sign or zero changes fail',()=>{
  const reference=structuredClone(expected),path='scenarios.0.operatingEv';
  for(const [left,right] of [[1e-20,1.01e-20],[1e-20,-1e-20],[0,Number.MIN_VALUE],[Number.MIN_VALUE,2*Number.MIN_VALUE],[-0,0]]){
    const actual=structuredClone(reference);set(reference,path,left);set(actual,path,right);
    assert.equal(compareCapitalAnalysis(reference,actual).status,'mismatch');
  }
});

test('nonfinite values never pass, including equal nonfinite values',()=>{
  for(const value of [NaN,Infinity,-Infinity]){
    const reference=structuredClone(expected),actual=structuredClone(expected);
    reference.scenarios[0].operatingEv=value;actual.scenarios[0].operatingEv=value;
    assert.equal(compareCapitalAnalysis(reference,actual).status,'mismatch');
  }
});

test('shape, order, metadata, warnings and decision status must match exactly',()=>{
  for(const edit of [
    value=>{value.version='future';},value=>{value.valuationDate='2026-10-19';},
    value=>{value.plans[0].eligible=!value.plans[0].eligible;},
    value=>{value.comparison.minimax.planIds=['unrelated'];},
    value=>{value.comparison.planMetrics[0].worstScenarioIds=['unrelated'];},
    value=>{value.warnings.push('Additional warning');},value=>{value.matrix.reverse();},
    value=>{value.scenarios[0].operatingEv=String(value.scenarios[0].operatingEv);},
    value=>{value.scenarios[0].operatingEv=null;},value=>{delete value.scenarios[0].operatingEv;},
    value=>{value.additionalField=1;},value=>{value.matrix={...value.matrix};}
  ]){const actual=structuredClone(expected);edit(actual);assert.equal(compareCapitalAnalysis(expected,actual).status,'mismatch');}
});

test('an allowed rounding difference cannot hide a later exact-field mismatch',()=>{
  const actual=structuredClone(fixture.actualApiPayload.result);actual.plans[2].eligible=!actual.plans[2].eligible;
  const result=compareCapitalAnalysis(expected,actual);
  assert.equal(result.status,'mismatch');assert.equal(result.firstMismatch,'analysis.plans.2.eligible');
});

test('unknown numerical fields default to exact matching',()=>{
  const reference=structuredClone(expected),actual=structuredClone(expected);
  reference.scenarios[0].newDerivedMetric=1;actual.scenarios[0].newDerivedMetric=1+Number.EPSILON;
  assert.equal(compareCapitalAnalysis(reference,actual).status,'mismatch');
});
