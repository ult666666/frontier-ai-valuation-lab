import test from 'node:test';
import assert from 'node:assert/strict';
import {ANALYTICS_VERSION, comparePair, stressPair, driverImpacts} from '../public/lib/analytics.js';

const fixture = {rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const zeroShocks = {growthPp:0,marginPp:0,waccPp:0,capitalEfficiencyPct:0};
const paired = () => ({Anthropic:{...fixture},OpenAI:{...fixture,rev2026:50,stub:-1.5}});
function close(actual, expected, tolerance=1e-8) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual-expected)<=tolerance, `${actual} != ${expected}`);
}
function freeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}

// Monetary expectations were evaluated independently with the Python reference
// model; the first-period cash flow and nonmonotonic milestones are hand-derived.
test('comparison reconciles signed components without counting the stub twice', () => {
  assert.equal(ANALYTICS_VERSION,'1.0.0');
  const {companies} = comparePair(paired());
  assert.deepEqual(Object.keys(companies),['Anthropic','OpenAI']);
  const a=companies.Anthropic;
  close(a.result.ev,200.31471864537804);
  close(a.result.rows[0].fcf,14);
  assert.equal(a.result.rows.length,10);
  close(a.valueComposition.stub,-2.942625926266036);
  close(a.valueComposition.explicitForecast,98.2516021928676);
  close(a.valueComposition.terminal,105.00574237877649);
  close(a.valueComposition.total,200.31471864537804);
  close(a.valueComposition.stub+a.valueComposition.explicitForecast+a.valueComposition.terminal,a.valueComposition.total);
  close(companies.OpenAI.result.ev,100.15735932268902);
  assert.equal(a.firstPositiveFcfYear,2027);
  assert.equal(a.sustainedPositiveFcfYear,2027);
  assert.equal(a.cumulativeBreakEvenYear,2027);
});

test('annual positivity and cumulative recovery require different milestones', () => {
  const p={...fixture,g1:0,g2:2};
  const a=comparePair({Anthropic:p,OpenAI:fixture}).companies.Anthropic;
  assert.equal(a.firstPositiveFcfYear,2027);
  assert.equal(a.sustainedPositiveFcfYear,2034);
  assert.equal(a.cumulativeBreakEvenYear,2035);
  close(a.result.rows[4].cumulative,22);
  close(a.result.rows[5].cumulative,-83);
  close(a.result.rows[7].cumulative,-20);
  close(a.result.rows[8].cumulative,373.12);
});

test('zero annual FCFF is not positive and an unbroken nonnegative stub starts recovery in 2026', () => {
  const p={...fixture,g1:0,g2:0,g3:0,tg:0,m27:0,m30:0,stub:0};
  const a=comparePair({Anthropic:p,OpenAI:fixture}).companies.Anthropic;
  assert.equal(a.result.rows[0].fcf,0);
  assert.equal(a.firstPositiveFcfYear,2031);
  assert.equal(a.sustainedPositiveFcfYear,2031);
  assert.equal(a.cumulativeBreakEvenYear,2026);
});

test('an early positive year does not imply sustained positive annual FCFF', () => {
  const p={...fixture,g1:0,g2:0,g3:.1,m36:.001};
  const a=comparePair({Anthropic:p,OpenAI:fixture}).companies.Anthropic;
  assert.equal(a.firstPositiveFcfYear,2027);
  assert.equal(a.sustainedPositiveFcfYear,null);
  assert.ok(a.result.rows.at(-1).fcf<0);
});

test('unrecovered deficits and never-positive annual FCFF remain unavailable', () => {
  const p={...fixture,m27:0,m30:0,m36:.01,turns:.05,stub:0};
  const a=comparePair({Anthropic:p,OpenAI:fixture}).companies.Anthropic;
  assert.equal(a.firstPositiveFcfYear,null);
  assert.equal(a.sustainedPositiveFcfYear,null);
  assert.equal(a.cumulativeBreakEvenYear,null);
  assert.ok(a.result.ev<0);
  assert.equal(a.result.tv_share,null);
  assert.ok(a.valueComposition.explicitForecast<0);
  assert.ok(a.valueComposition.terminal>0);
});

test('comparison copies exact inputs and leaves caller-owned data unchanged', () => {
  const input=freeze(paired()), before=structuredClone(input);
  const a=comparePair(input), b=comparePair(input);
  assert.deepEqual(a,b);
  assert.deepEqual(input,before);
  assert.notEqual(a.companies.Anthropic.assumptions,input.Anthropic);
  a.companies.Anthropic.assumptions.g1=1;
  assert.equal(input.Anthropic.g1,.04);
  assert.equal(b.companies.Anthropic.assumptions.g1,.04);
});

test('comparison requires both and only the two named companies', () => {
  for (const input of [undefined,null,[],true,'pair',{}, {Anthropic:fixture}, {...paired(),Other:fixture}]) {
    assert.throws(()=>comparePair(input),/company|companies|object|field/i);
  }
  const injected=JSON.parse(JSON.stringify(paired()).replace('"Anthropic":','"__proto__":{"polluted":true},"Anthropic":'));
  assert.throws(()=>comparePair(injected),/__proto__/);
  assert.equal({}.polluted,undefined);
});

test('comparison rejects malformed assumption records with the company in the error', () => {
  const {tax,...missing}=fixture;
  const invalid=[null,[],missing,{...fixture,extra:1},{...fixture,g1:'0.04'},
    {...fixture,tax:true},{...fixture,g2:NaN},{...fixture,stub:Infinity},
    {...fixture,rev2026:1e308},Object.create(fixture),
    Object.defineProperty({...fixture},'tax',{value:.25,enumerable:false})];
  for (const p of invalid) assert.throws(()=>comparePair({Anthropic:fixture,OpenAI:p}),/^Error: OpenAI:/);
  const injection=JSON.parse(JSON.stringify(fixture).replace('"rev2026":','"constructor":{},"rev2026":'));
  assert.throws(()=>comparePair({Anthropic:injection,OpenAI:fixture}),/Anthropic:.*constructor/);
  assert.throws(()=>comparePair({Anthropic:{...fixture,[Symbol('extra')]:1},OpenAI:fixture}),/Anthropic:/);
});

test('assumption accessors are rejected without executing their code', () => {
  let accessed=false;
  const p=Object.defineProperty({...fixture},'tax',{enumerable:true,get(){accessed=true;return .25;}});
  assert.throws(()=>comparePair({Anthropic:p,OpenAI:fixture}),/Anthropic:.*tax/);
  assert.equal(accessed,false);
});

test('overflowing projections fail explicitly rather than returning a nonfinite value', () => {
  const p={...fixture,wacc:Number.MIN_VALUE,tg:0};
  assert.throws(()=>comparePair({Anthropic:fixture,OpenAI:p}),/OpenAI:.*numeric range/);
});

test('omitting the entire shock object gives an unchanged independent comparison', () => {
  const result=stressPair(paired());
  assert.deepEqual(result.shocks,zeroShocks);
  assert.deepEqual(result.baseline,result.stressed);
  assert.notEqual(result.baseline,result.stressed);
  assert.deepEqual(result.changes,{Anthropic:{evDelta:0,evChangeRatio:0},OpenAI:{evDelta:0,evChangeRatio:0}});
});

test('joint stress uses percentage-point shifts and multiplicative capital efficiency', () => {
  const input=freeze(paired()),shocks=freeze({growthPp:5,marginPp:2,waccPp:1,capitalEfficiencyPct:20});
  const result=stressPair(input,shocks),a=result.stressed.companies.Anthropic;
  close(a.assumptions.g1,.09);
  close(a.assumptions.m36,.22);
  close(a.assumptions.wacc,.11);
  close(a.assumptions.turns,3);
  close(a.result.ev,217.74477181941938);
  close(result.changes.Anthropic.evDelta,17.430053174041348);
  close(result.changes.Anthropic.evChangeRatio,.08701334226417076);
  close(result.changes.OpenAI.evDelta,8.715026587020674);
  assert.deepEqual(input,paired());
  assert.deepEqual(shocks,{growthPp:5,marginPp:2,waccPp:1,capitalEfficiencyPct:20});
});

test('supplied shocks require exactly four finite numeric fields within their bounds', () => {
  for (const value of [null,[],true,'5',{}, {growthPp:5}, {...zeroShocks,extra:1},
    {...zeroShocks,growthPp:'5'}, {...zeroShocks,marginPp:true}, {...zeroShocks,waccPp:Infinity},
    {...zeroShocks,capitalEfficiencyPct:NaN}, {...zeroShocks,growthPp:20.001},
    {...zeroShocks,growthPp:-20.001}, {...zeroShocks,marginPp:10.001},
    {...zeroShocks,marginPp:-10.001}, {...zeroShocks,waccPp:5.001},
    {...zeroShocks,waccPp:-5.001}, {...zeroShocks,capitalEfficiencyPct:50.001},
    {...zeroShocks,capitalEfficiencyPct:-50.001}]) {
    assert.throws(()=>stressPair(paired(),value),/shock|growthPp|marginPp|waccPp|capitalEfficiencyPct/i);
  }
});

test('shock bounds are inclusive and valid transformed assumptions are not clipped', () => {
  const upper=stressPair(paired(),{growthPp:20,marginPp:10,waccPp:5,capitalEfficiencyPct:50});
  close(upper.stressed.companies.Anthropic.assumptions.g1,.24);
  close(upper.stressed.companies.Anthropic.assumptions.turns,3.75);
  const p={...fixture,g1:.5,wacc:.15};
  const lower=stressPair({Anthropic:p,OpenAI:p},{growthPp:-20,marginPp:-10,waccPp:-5,capitalEfficiencyPct:-50});
  close(lower.stressed.companies.OpenAI.assumptions.g1,.3);
  close(lower.stressed.companies.OpenAI.assumptions.turns,1.25);
});

test('a permitted shock that violates model limits raises a company-specific error', () => {
  assert.throws(()=>stressPair(paired(),{...zeroShocks,growthPp:-20}),/Anthropic:.*growth/);
  assert.throws(()=>stressPair({...paired(),OpenAI:{...fixture,m36:.02}},{...zeroShocks,marginPp:-10}),/OpenAI:.*margin/i);
  assert.throws(()=>stressPair({...paired(),OpenAI:{...fixture,wacc:.05}},{...zeroShocks,waccPp:-5}),/OpenAI:.*WACC/);
  assert.throws(()=>stressPair({...paired(),OpenAI:{...fixture,turns:100}},{...zeroShocks,capitalEfficiencyPct:20}),/OpenAI:.*capital/);
});

test('stress preserves negative and zero EV and suppresses their relative changes', () => {
  const zero={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const input={Anthropic:{...fixture,stub:-1000},OpenAI:zero};
  const result=stressPair(input,{...zeroShocks,marginPp:2});
  close(result.baseline.companies.Anthropic.result.ev,-777.6179641837011);
  assert.equal(result.baseline.companies.OpenAI.result.ev,0);
  assert.ok(result.stressed.companies.Anthropic.result.ev<0);
  close(result.changes.Anthropic.evDelta,13.73877334996024);
  assert.equal(result.changes.Anthropic.evChangeRatio,null);
  assert.equal(result.changes.OpenAI.evChangeRatio,null);
});

test('relative-change overflow is rejected rather than serialized as an unexplained null', () => {
  const tiny={...fixture,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  assert.ok(comparePair({Anthropic:tiny,OpenAI:fixture}).companies.Anthropic.result.ev>0);
  assert.throws(()=>stressPair({Anthropic:tiny,OpenAI:fixture},{...zeroShocks,marginPp:2}),/Anthropic:.*numeric range/);
});

test('driver impacts are independent, fixed-unit one-at-a-time calculations', () => {
  const input=freeze({...fixture}),result=driverImpacts(input);
  close(result.baseline.ev,200.31471864537804);
  const expected=[
    ['g1','Early growth +5 pp','change',.05,231.67337249176722,31.35865384638919],
    ['m36','Terminal margin +2 pp','change',.02,214.05349199533828,13.73877334996024],
    ['wacc','Cost of capital +1 pp','change',.01,174.56821472429186,-25.746503921086173],
    ['turns','Capital efficiency +20%','factor',1.2,202.18617773476598,1.8714590893879404]
  ];
  assert.equal(result.impacts.length,4);
  result.impacts.forEach((impact,i)=>{
    const [key,label,unit,size,ev,delta]=expected[i];
    assert.equal(impact.key,key);assert.equal(impact.label,label);assert.equal(impact[unit],size);
    close(impact.result.ev,ev);close(impact.evDelta,delta);close(impact.evChangeRatio,delta/200.31471864537804);
    assert.equal(impact.reason,null);
    assert.deepEqual(Object.keys(fixture).filter(k=>impact.assumptions[k]!==fixture[k]),[key]);
  });
  assert.deepEqual(input,fixture);
  assert.deepEqual(result.assumptions,fixture);
  assert.notEqual(result.assumptions,input);
});

test('invalid driver points return null outputs and actionable validation reasons', () => {
  const p={...fixture,g1:2,m36:1,wacc:.6,turns:100};
  const result=driverImpacts(p);
  assert.ok(Number.isFinite(result.baseline.ev));
  for (const impact of result.impacts) {
    assert.equal(impact.result,null);assert.equal(impact.evDelta,null);assert.equal(impact.evChangeRatio,null);
    assert.equal(typeof impact.reason,'string');assert.ok(impact.reason.length>10);
  }
  assert.throws(()=>driverImpacts({...fixture,tax:false}),/tax/);
  assert.throws(()=>driverImpacts({...fixture,hidden:1}),/hidden/);
});

test('driver relative changes remain undefined for nonpositive baselines', () => {
  const result=driverImpacts({...fixture,stub:-1000});
  assert.ok(result.baseline.ev<0);
  for (const impact of result.impacts) {
    assert.ok(Number.isFinite(impact.evDelta));
    assert.equal(impact.evChangeRatio,null);
    assert.equal(impact.reason,null);
  }
});

test('a driver ratio outside numeric range is unavailable with a reason', () => {
  const tiny={...fixture,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const margin=driverImpacts(tiny).impacts.find(impact=>impact.key==='m36');
  assert.equal(margin.result,null);assert.equal(margin.evDelta,null);assert.equal(margin.evChangeRatio,null);
  assert.match(margin.reason,/numeric range/);
});
