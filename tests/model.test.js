import test from 'node:test';
import assert from 'node:assert/strict';
import { project, validate, reverseGrowth, sensitivity, bridgeEquity, scaleAccountingBasis } from '../public/lib/model.js';

const fixture = {rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
function close(actual, expected, tolerance=1e-8) { assert.ok(Math.abs(actual-expected)<=tolerance, `${actual} != ${expected}`); }

test('first forecast deducts growth investment and taxes from operating income', () => {
  const r = project(fixture);
  close(r.rows[0].revenue,104); close(r.rows[0].ebit,20.8);
  close(r.rows[0].tax,5.2); close(r.rows[0].reinvestment,1.6); close(r.rows[0].fcf,14);
  assert.equal(r.rows.length,10); assert.equal(r.rows.at(-1).year,2036);
});
test('valuation discounts only the remaining 2026 cash flow from the stated date', () => {
  const r=project(fixture); close(r.stub_t,74/365.25); close(r.terminal_t,3727/365.25);
  assert.equal(r.peak_funding_need,3);
});
test('terminal value funds perpetual growth from terminal return on capital', () => {
  const r=project(fixture);
  close(r.terminal_reinvestment_rate,.15); close(r.terminal_revenue,152.46516134658947);
  close(r.terminal_fcf,19.439308071690157); close(r.ev,200.31471864537804);
});
test('losses do not create an invented immediate tax refund', () => {
  const r=project({...fixture,m27:-.2});
  close(r.rows[0].tax,0); close(r.rows[0].nopat,-20.8); close(r.rows[0].fcf,-22.4);
});
test('invalid numeric values, negative capital turns and singular terminals are rejected', () => {
  for(const patch of [{turns:-1},{turns:0},{rev2026:0},{rev2026:1e308},{g1:'0.4'},{g2:NaN},{stub:Infinity},{tax:true},{tg:.1},{roic:.02},{m36:0},{g3:0}]) assert.throws(()=>validate({...fixture,...patch}));
  assert.throws(()=>project(null)); assert.throws(()=>project([])); assert.throws(()=>project({...fixture,extra:1}));
});
test('negative enterprise value remains visible instead of becoming zero or a floor', () => {
  const r=project({...fixture,stub:-1000}); assert.ok(r.ev<0); assert.equal(r.tv_share,null);
});
test('consistent gross-to-net relabeling preserves operating cash and enterprise value', () => {
  const transformed=scaleAccountingBasis(fixture,.8), a=project(fixture), b=project(transformed);
  close(transformed.rev2026,80); close(transformed.turns,2); close(transformed.m36,.25);
  close(a.ev,b.ev); a.rows.forEach((row,i)=>close(row.fcf,b.rows[i].fcf));
});
test('cash and claims bridge is explicit and does not alter operating value', () => {
  const result=bridgeEquity(100,{cash:20,debt:30,otherClaims:5});
  assert.equal(result.ev,100);assert.equal(result.equityValue,85);assert.equal(result.status,'hypothetical');
  assert.throws(()=>bridgeEquity(100,{cash:20,debt:-30,otherClaims:0}));
});
test('reverse DCF recovers required growth and identifies a target outside the allowed interval', () => {
  const result=reverseGrowth(fixture,200.31471864537804);
  assert.equal(result.status,'solved');close(result.growth,.04,1e-7);close(result.residual,0,1e-5);
  assert.equal(reverseGrowth(fixture,1e12).status,'unreachable');
  assert.throws(()=>reverseGrowth(fixture,Infinity));assert.throws(()=>reverseGrowth(fixture,0));
});
test('sensitivity preserves matrix orientation and marks invalid combinations unavailable', () => {
  const r=sensitivity(fixture,[.10,.12],[.02,.03]);
  assert.deepEqual(r.rates,[.10,.12]);assert.deepEqual(r.growthRates,[.02,.03]);
  close(r.values[0][1],200.31471864537804);assert.ok(r.values[1][1]<r.values[0][1]);
  assert.equal(sensitivity(fixture,[.02],[.03]).values[0][0],null);
  assert.throws(()=>sensitivity(fixture,Array(30).fill(.1),[.03]));
});
test('reverse DCF returns both admissible growth paths when value is nonmonotonic', () => {
  const p={rev2026:53.26,g1:.45,g2:.2,g3:.03,m27:-.2,m30:.05,m36:.12,turns:1.5,wacc:.125,tg:.03,roic:.2,stub:-3,tax:.25};
  const result=reverseGrowth(p,5);
  assert.equal(result.status,'multiple_solutions');assert.equal(result.solutions.length,2);
  assert.ok(result.solutions[0].growth>.14&&result.solutions[0].growth<.16);
  assert.ok(result.solutions[1].growth>.80&&result.solutions[1].growth<.83);
  result.solutions.forEach(s=>close(s.residual,0,1e-6));
});
test('reverse DCF detects a tangent solution without requiring a sign change', () => {
  const p={rev2026:53.26,g1:.45,g2:.2,g3:.03,m27:-.2,m30:.05,m36:.12,turns:1.5,wacc:.125,tg:.03,roic:.2,stub:-3,tax:.25};
  const result=reverseGrowth(p,1.07615063130638);
  assert.equal(result.status,'solved');close(result.growth,.5153890393310554,1e-7);close(result.residual,0,1e-8);
});
