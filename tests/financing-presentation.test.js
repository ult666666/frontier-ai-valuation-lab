import test from 'node:test';
import assert from 'node:assert/strict';
import {financingMoney,financingPercent,financingPercentagePoints} from '../public/lib/financing-format.js';
import {createFinancingBrief,createFinancingExport} from '../public/lib/financing-brief.js';

const tinyAssumptions={rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,turns:2.5,wacc:.1,tg:0,roic:.2,stub:0,tax:.25};
const snapshot=cash=>({case:{company:'Anthropic',scenario:'Base',assumptions:{...tinyAssumptions},bridge:{cash,debt:0,otherClaims:0}},round:{basis:'pre',quote:150,primaryCapital:30,holderStake:.1}});

test('finite gap ratios display their percentage even when multiplication by 100 would overflow',()=>{
  assert.ok(Number.isFinite(1.5e308));assert.equal(1.5e308*100,Infinity);
  assert.equal(financingPercent(1.5e308),'1.500e+310%');
  assert.equal(financingPercent(-1.5e308),'−1.500e+310%');
  assert.equal(financingPercentagePoints(1.5e308),'1.500e+310 pp');
  assert.equal(financingPercent(null),'—');assert.equal(financingPercent(Infinity),'—');
  assert.equal(financingPercent(0),'0.00%');
});

test('small signed cash amounts stay distinguishable from zero in financing output',()=>{
  assert.equal(financingMoney(.0001),'$1.000e-4B');
  assert.equal(financingMoney(-.0001),'−$1.000e-4B');
  assert.equal(financingMoney(Number.MIN_VALUE),'$4.941e-324B');
  assert.equal(financingMoney(0),'$0.00B');
  assert.equal(financingMoney(-0),'$0.00B');
});

test('a positive equity residual with an overflowing gap ratio receives the numeric-range explanation',()=>{
  const input=snapshot(Number.MIN_VALUE),output=createFinancingExport(input),html=createFinancingBrief(input);
  assert.equal(output.result.comparison.modelPreMoneyEquity,Number.MIN_VALUE);
  assert.equal(output.result.comparison.priceGapPercent,null);
  assert.equal(output.result.comparison.priceGap,150);
  assert.match(html,/<th scope="row">Gap \/ modeled pre-money equity<\/th><td>Unavailable: numerical range<\/td>/);
  assert.match(html,/The price-gap percentage exceeds the supported numeric range and is unavailable\./);
  assert.doesNotMatch(html,/Unavailable: nonpositive modeled equity|The modeled residual is nonpositive\./);
});

test('a finite enormous gap stays numeric in the brief and exact in its companion JSON',()=>{
  const input=snapshot(1e-306),output=createFinancingExport(input),html=createFinancingBrief(input);
  assert.equal(output.result.comparison.modelPreMoneyEquity,1e-306);
  assert.equal(output.result.comparison.priceGapPercent,1.5e308);
  assert.deepEqual(output.result.warnings,[]);
  assert.match(html,/<th scope="row">Gap \/ modeled pre-money equity<\/th><td>1\.500e\+310%<\/td>/);
  assert.doesNotMatch(html,/—%|Unavailable: numerical range/);
  assert.equal(JSON.parse(JSON.stringify(output)).result.comparison.priceGapPercent,1.5e308);
});

test('zero and negative equity retain their distinct nonpositive-residual explanation',()=>{
  for(const debt of [0,5]){
    const input=snapshot(0);input.case.bridge.debt=debt;
    const output=createFinancingExport(input),html=createFinancingBrief(input);
    assert.equal(output.result.comparison.modelPreMoneyEquity,debt===0?0:-debt);
    assert.equal(output.result.comparison.priceGapPercent,null);
    assert.match(html,/<th scope="row">Gap \/ modeled pre-money equity<\/th><td>Unavailable: nonpositive modeled equity<\/td>/);
    assert.match(html,/The modeled pre-money equity residual is nonpositive\./);
    assert.doesNotMatch(html,/Unavailable: numerical range/);
  }
});
