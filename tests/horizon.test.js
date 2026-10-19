import test from 'node:test';
import assert from 'node:assert/strict';
import {valueHorizon,HORIZON_VERSION,HORIZON_MAX_YEARS,HORIZON_SOLVER_MAX_YEARS} from '../public/lib/horizon.js';
import {project} from '../public/lib/model.js';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};

const fixture={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const close=(a,b,atol=1e-8,rtol=1e-12)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=atol+rtol*Math.abs(b),`${a} != ${b}`);
const snapshot=()=>({case:{company:'Anthropic',scenario:'Base',assumptions:{...fixture},bridge:{cash:2.125,debt:1.05,otherClaims:.0125}},years:10,target:150.12345678901234});

test('horizon curve agrees with separate annual terminal cash-flow summation for all presets',()=>{
  assert.equal(HORIZON_VERSION,'1.0.0');assert.equal(HORIZON_MAX_YEARS,100);assert.equal(HORIZON_SOLVER_MAX_YEARS,10000);
  for(const cases of Object.values(presets))for(const p of Object.values(cases)){
    const r=valueHorizon(p,{years:10,target:null});
    assert.deepEqual(r.baseline,project(p));
    let sum=0,flow=r.baseline.terminal_fcf/(1+p.wacc)*r.baseline.rows.at(-1).df;
    for(let n=0;n<=100;n++){
      const point=r.curve[n];
      if(n>0){sum+=flow;flow*=(1+p.tg)/(1+p.wacc);}
      close(point.retainedTerminalPv,sum);
      close(point.ev,r.baseline.pv_explicit+sum);
      close(point.retainedTerminalPv+point.excludedTerminalPv,r.baseline.pvtv);
      assert.equal(point.throughYear,2036+n);
      if(n>0)assert.ok(point.ev>=r.curve[n-1].ev);
    }
  }
});

test('signed EV, negative explicit PV and a zero numerical terminal PV are preserved',()=>{
  const negative=valueHorizon(presets.OpenAI.Bear,{years:0,target:100});
  assert.ok(negative.selected.ev<0);assert.ok(negative.baseline.ev<0);
  assert.equal(negative.targetRequirement.status,'unreachable');
  const tiny={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const zero=valueHorizon(tiny,{years:100,target:1});
  assert.equal(zero.baseline.pvtv,0);assert.equal(zero.selected.ev,0);
  assert.equal(zero.selected.terminalPvFraction,null);
  assert.ok(zero.capture.every(x=>x.status==='unavailable'&&x.years===null));
  assert.equal(zero.targetRequirement.status,'unreachable');
});

test('capture milestones retain their terminal-PV denominator and verify the preceding year',()=>{
  const r=valueHorizon(presets.OpenAI.Base,{years:10});
  assert.equal(r.capture.find(x=>x.fraction===.9).years,27);
  for(const item of r.capture){
    assert.equal(item.status,'finite');
    assert.ok(r.curve[item.years].remainingTerminalFraction<=1-item.fraction);
    assert.ok(r.curve[item.years-1].remainingTerminalFraction>1-item.fraction);
  }
});

test('target requirements distinguish finite outside-chart, beyond-solver and asymptotic states',()=>{
  const slow={...fixture,wacc:.031,tg:.03};
  const base=project(slow),target=base.pv_explicit+base.pvtv*.5;
  const outside=valueHorizon(slow,{years:100,target});
  assert.equal(outside.targetRequirement.status,'finite');
  assert.ok(outside.targetRequirement.years>100);
  assert.equal(outside.targetRequirement.withinChart,false);
  assert.ok(outside.targetRequirement.previousEv<target&&outside.targetRequirement.ev>=target);
  const verySlow={...fixture,wacc:.030001,tg:.03},slowBase=project(verySlow);
  const beyond=valueHorizon(verySlow,{years:100,target:slowBase.pv_explicit+slowBase.pvtv*.5});
  assert.equal(beyond.targetRequirement.status,'beyond_range');
  assert.equal(beyond.capture[0].status,'beyond_range');
  assert.equal(beyond.targetRequirement.years,null);
  const fast={...fixture,wacc:.6,tg:0};
  const fastBase=project(fast),equal=valueHorizon(fast,{years:100,target:fastBase.ev});
  assert.equal(equal.selected.ev,equal.baseline.ev,'A finite point can round to the baseline.');
  assert.ok(equal.selected.excludedTerminalPv>0);
  assert.equal(equal.targetRequirement.status,'asymptotic');
});

test('adjacent valid WACC and growth rates retain finite positive continuation flows',()=>{
  const near={...fixture,wacc:.03+Number.EPSILON*.03125,tg:.03};
  assert.ok(near.wacc>near.tg);
  const r=valueHorizon(near,{years:1,target:100});
  const first=r.baseline.terminal_fcf/(1+near.wacc)*r.baseline.rows.at(-1).df;
  close(r.selected.retainedTerminalPv,first);
  assert.ok(r.selected.retainedTerminalPv>0);
  assert.ok(r.selected.terminalPvFraction>0);
  assert.equal(r.capture[0].status,'beyond_range');
});

test('targets clearly between ordinary curve points resolve to the first whole year',()=>{
  const r=valueHorizon(fixture,{years:10});
  for(const n of [1,2,10,25,50,75,100]){
    const target=(r.curve[n-1].ev+r.curve[n].ev)/2,solved=valueHorizon(fixture,{years:0,target}).targetRequirement;
    assert.equal(solved.status,'finite');assert.equal(solved.years,n);
    assert.ok(solved.previousEv<target&&solved.ev>=target);
  }
});

test('near-perpetuity targets do not turn rounded EV equality into a false first year',()=>{
  const cases=[
    [presets.Anthropic.Base,367.77129479956005],
    [{...fixture,wacc:.6,tg:0},19.999341593234046]
  ];
  // Decimal.from_float at 100 digits finds 414 and 69 respectively. The
  // original EV comparison falsely reported 407 and 68. These tiny gaps
  // are intentionally unavailable under the documented precision policy.
  for(const [p,target] of cases){
    const r=valueHorizon(p,{years:10,target}).targetRequirement;
    assert.equal(r.status,'precision_limit');
    for(const key of ['years','throughYear','ev','previousEv','withinChart'])assert.equal(r[key],null);
    assert.match(r.reason,/precision/i);
  }
});

test('a target copied from a rounded finite point is guarded instead of asserting its exact year',()=>{
  const r=valueHorizon(fixture,{years:10});
  for(const n of [1,2,10,25,50,75,100]){
    const solved=valueHorizon(fixture,{years:0,target:r.curve[n].ev}).targetRequirement;
    assert.equal(solved.status,'precision_limit');assert.equal(solved.years,null);
  }
});

test('precision guards preserve ordinary targets even when terminal PV is near-singular',()=>{
  assert.equal(valueHorizon(presets.Anthropic.Base,{years:10,target:250}).targetRequirement.years,11);
  const near={...fixture,wacc:.030000000000000002};
  const solved=valueHorizon(near,{years:10,target:250}).targetRequirement;
  assert.equal(solved.status,'finite');assert.ok(solved.previousEv<250&&solved.ev>=250);
});

test('capture does not assert a year when a percentage boundary is within numerical precision',()=>{
  const r=valueHorizon({...fixture,wacc:.5874010519681995,tg:0},{years:10});
  // The exact binary input has q^3 = .25 + 1.10e-18. Rounded exp(log(q)*3)
  // previously claimed 75% capture in year 3; Decimal arithmetic requires 4.
  const capture=r.capture.find(x=>x.fraction===.75);
  assert.equal(capture.status,'precision_limit');assert.equal(capture.years,null);
  assert.match(capture.reason,/precision/i);
  assert.equal(valueHorizon(presets.Anthropic.Base,{years:10}).capture.find(x=>x.fraction===.9).years,27);
});

test('precision policy checks both sides of the search cap before claiming finite or beyond range',()=>{
  // These rates straddle exact 50% capture at year 10,000 by less than one
  // floating-point comparison unit. The cap must not imply a precise side.
  for(const wacc of [.00006931712037656917,.0000693171203765692]){
    const p={...fixture,wacc,tg:0},baseline=project(p);
    const r=valueHorizon(p,{years:100,target:baseline.pv_explicit+baseline.pvtv*.5});
    assert.equal(r.capture[0].status,'precision_limit');
    assert.equal(r.targetRequirement.status,'precision_limit');
    assert.equal(r.capture[0].years,null);assert.equal(r.targetRequirement.years,null);
  }
});

test('target precision policy guards both sides of perpetuity and the first explicit boundary',()=>{
  const baseline=project(fixture),epsilon=Number.EPSILON;
  const above=valueHorizon(fixture,{years:10,target:baseline.ev*(1+2*epsilon)});
  assert.equal(above.targetRequirement.status,'precision_limit');
  assert.equal(valueHorizon(fixture,{years:10,target:baseline.ev*(1+1e-10)}).targetRequirement.status,'unreachable');
  const nearExplicit=valueHorizon(fixture,{years:10,target:baseline.pv_explicit*(1+epsilon)});
  assert.equal(nearExplicit.targetRequirement.status,'precision_limit');
  assert.equal(valueHorizon(fixture,{years:10,target:baseline.pv_explicit}).targetRequirement.status,'explicit');
  assert.equal(valueHorizon(fixture,{years:10,target:baseline.ev}).targetRequirement.status,'asymptotic');
});

test('inputs and options must be exact own data records and outputs do not alias inputs',()=>{
  const p=Object.freeze({...fixture}),config=Object.freeze({years:10,target:null});
  const r=valueHorizon(p,config);r.assumptions.g1=2;r.selected.ev=1;
  assert.equal(p.g1,.04);assert.notEqual(r.curve[10].ev,1);
  assert.deepEqual(valueHorizon(p,config),valueHorizon(p,config));
  let accessed=false;
  const getter=Object.defineProperty({...fixture},'tax',{enumerable:true,get(){accessed=true;return .25;}});
  const hidden=Object.defineProperty({...fixture},'tax',{value:.25,enumerable:false});
  for(const bad of [getter,hidden,Object.create(fixture),{...fixture,[Symbol('x')]:1},null,[]])assert.throws(()=>valueHorizon(bad,config));
  assert.equal(accessed,false);
  for(const bad of [{years:10,target:undefined},{years:10,extra:1},Object.create(config),null,[],{years:Infinity},{years:10,target:NaN}])assert.throws(()=>valueHorizon(fixture,bad));
  const malicious=JSON.parse(JSON.stringify(fixture).replace('"tax":','"__proto__":{"polluted":true},"tax":'));
  assert.throws(()=>valueHorizon(malicious,config));assert.equal({}.polluted,undefined);
});

test('horizon sharing preserves the exact nested model case and both lens parameters',async()=>{
  const codecs=await import('../public/lib/horizon-share.js').catch(()=>({}));
  assert.equal(typeof codecs.encodeHorizon,'function','The new exact horizon codec is required.');
  const input=snapshot(),token=codecs.encodeHorizon(input),output=codecs.decodeHorizon(token);
  assert.deepEqual(output,input);assert.notEqual(output.case.assumptions,input.case.assumptions);
  const url=new URL(codecs.horizonUrl('https://example.test/horizon.html?private=1#old',input));
  assert.equal(url.search,'');assert.equal(url.pathname,'/horizon.html');
  assert.equal(url.hash,'#horizon='+token);
  assert.throws(()=>codecs.horizonUrl('javascript:alert(1)',input));
  assert.throws(()=>codecs.horizonUrl('https://name:password@example.test/horizon.html',input));
});

test('horizon links reject tampering and reject accessors before reading nested assumptions',async()=>{
  const {encodeHorizon,decodeHorizon,normalizeHorizon}=await import('../public/lib/horizon-share.js');
  const original=JSON.parse(atob(encodeHorizon(snapshot()).replaceAll('-','+').replaceAll('_','/')));
  const token=x=>btoa(JSON.stringify(x)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  for(const payload of [{...original,schema:2},{...original,model:'9.9.9'},{...original,date:'2026-10-19'},
    {...original,years:101},{...original,target:0},{...original,extra:1},{...original,case:'malformed'},
    {...original,years:null},{...original,target:[]},Object.fromEntries(Object.entries(original).filter(([k])=>k!=='target'))])assert.throws(()=>decodeHorizon(token(payload)));
  for(const bad of ['',null,'a'.repeat(8193),'a+b','%%%%'])assert.throws(()=>decodeHorizon(bad));
  let accessed=false;
  const bad=snapshot();Object.defineProperty(bad.case.assumptions,'tax',{enumerable:true,get(){accessed=true;return .25;}});
  assert.throws(()=>normalizeHorizon(bad));assert.equal(accessed,false);
  assert.throws(()=>normalizeHorizon({...snapshot(),result:{ev:999}}));
});

test('the standalone export recalculates a complete lens and carries exact reopening/model links',async()=>{
  const brief=await import('../public/lib/horizon-brief.js').catch(()=>({}));
  assert.equal(typeof brief.createHorizonExport,'function','The reproducible export is required.');
  const input=snapshot(),out=brief.createHorizonExport({snapshot:input,research,baseUrl:'https://example.test/horizon.html?private=1'});
  assert.equal(out.schema,1);assert.equal(out.kind,'frontier-value-horizon');
  assert.deepEqual(out.snapshot,input);assert.deepEqual(out.result,valueHorizon(input.case.assumptions,{years:input.years,target:input.target}));
  assert.equal(out.researchCutoff,research.researchCutoff);assert.equal(out.modelVersion,'3.0.0');
  const {decodeHorizon}=await import('../public/lib/horizon-share.js');
  const {decodeScenario}=await import('../public/lib/share.js');
  assert.deepEqual(decodeHorizon(new URL(out.reopenUrl).hash.slice('#horizon='.length)),input);
  assert.deepEqual(decodeScenario(new URL(out.modelUrl).hash.slice('#scenario='.length)),input.case);
  assert.equal(new URL(out.reopenUrl).search,'');
  assert.ok(out.methodology.references.some(x=>x.url.includes('younggrowth.pdf')));
  assert.doesNotThrow(()=>JSON.stringify(out));
  assert.throws(()=>brief.createHorizonExport({snapshot:input,research:{...research,asOf:'2026-10-19'},baseUrl:'https://example.test/horizon.html'}));
});

test('script-free horizon briefing contains exact inputs and states the cutoff and zero residual',async()=>{
  const brief=await import('../public/lib/horizon-brief.js').catch(()=>({}));
  assert.equal(typeof brief.createHorizonBrief,'function','The standalone horizon brief is required.');
  const input=snapshot();input.case.assumptions.m36=.23456789012345678;
  const html=brief.createHorizonBrief({snapshot:input,research,baseUrl:'https://example.test/horizon.html'});
  assert.match(html,/<!doctype html>/i);assert.doesNotMatch(html,/<script|\son\w+\s*=/i);
  const storedMargin=html.match(/2036 EBIT margin · decimal<\/th><td class="exact">([^<]+)<\/td>/)?.[1];
  assert.equal(Number(storedMargin),input.case.assumptions.m36);assert.match(html,/2046/);
  assert.match(html,/zero residual/i);assert.match(html,/hypothetical bridge/i);
  assert.match(html,/horizon=/);assert.match(html,/scenario=/);
  assert.match(html,/2026-10-18/);assert.match(html,/younggrowth\.pdf/);
});
