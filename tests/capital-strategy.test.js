import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import {project,MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {financingLens,FINANCING_MAX_AMOUNT} from '../public/lib/financing.js';
import {valueHorizon} from '../public/lib/horizon.js';
import {ownershipFrontier} from '../public/lib/ownership.js';
import {CAPITAL_VERSION,capitalStrategy,validateCapitalSnapshot} from '../public/lib/capital-strategy.js';

const clone=value=>structuredClone(value);
const near=(a,b,tolerance=2e-12)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} differs from ${b}`);
const scenario=(id,label,assumptions=presets.Anthropic.Base,continuationYears=null)=>({id,label,assumptions:{...assumptions},continuationYears});
const worked=()=>({
  company:'Anthropic',
  scenarios:['Bear','Base','Bull'].map(name=>scenario(name.toLowerCase(),name,presets.Anthropic[name])),
  plans:[
    {id:'a',label:'Smaller round',basis:'pre',quote:250,primaryCapital:25},
    {id:'b',label:'More capital',basis:'pre',quote:300,primaryCapital:35},
    {id:'c',label:'Higher retention',basis:'pre',quote:300,primaryCapital:20},
  ],
  policy:{capitalTarget:25,retentionFloor:.88,modelCoverageFloor:1,holderStake:.1},
  bridge:{cash:20,debt:5,otherClaims:0},
});
const single=()=>({...worked(),scenarios:[scenario('base','Base')],plans:[worked().plans[0]]});
const cell=(r,s,p)=>r.matrix.find(v=>v.scenarioId===s&&v.planId===p);
function reconcileCrossover(result,cross){
  const a=result.plans.find(p=>p.id===cross.planA),b=result.plans.find(p=>p.id===cross.planB);
  const left=a.retainedFraction*(cross.equityResidual+a.round.primaryCapital);
  const right=b.retainedFraction*(cross.equityResidual+b.round.primaryCapital);
  const scale=Math.max(Math.abs(left),Math.abs(right),Math.abs(a.retainedFraction*cross.equityResidual),
    Math.abs(b.retainedFraction*cross.equityResidual),Math.abs(a.retainedFraction*a.round.primaryCapital),
    Math.abs(b.retainedFraction*b.round.primaryCapital));
  assert.ok(Math.abs(left/scale-right/scale)<=32*Number.EPSILON);
  assert.ok(Math.abs(left/scale-cross.allocation/scale)<=32*Number.EPSILON);
  assert.ok(Math.abs(right/scale-cross.allocation/scale)<=32*Number.EPSILON);
}

test('capital core preserves exact contract order and existing round arithmetic',()=>{
  const input=worked(),original=clone(input),r=capitalStrategy(input);
  assert.equal(CAPITAL_VERSION,'1.0.0');assert.equal(r.version,CAPITAL_VERSION);
  assert.equal(r.modelVersion,MODEL_VERSION);assert.equal(r.valuationDate,VALUATION_DATE);
  assert.deepEqual(r.snapshot,input);assert.deepEqual(input,original);
  assert.deepEqual(r.scenarios.map(v=>v.id),['bear','base','bull']);
  assert.deepEqual(r.plans.map(v=>v.id),['a','b','c']);
  assert.deepEqual(r.matrix.map(v=>`${v.scenarioId}/${v.planId}`),['bear/a','bear/b','bear/c','base/a','base/b','base/c','bull/a','bull/b','bull/c']);
  for(const plan of r.plans){
    const expected=financingLens(input.scenarios[0].assumptions,{round:{...plan.round},bridge:null});
    assert.deepEqual(plan.pricing,expected.pricing);
    assert.deepEqual(plan.ownership,ownershipFrontier(plan.round,{retentionFloor:input.policy.retentionFloor}));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
});

test('only plans meeting the stated capital and retention objectives enter comparison',()=>{
  const input=worked();let r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,['a','b']);
  assert.equal(r.plans[2].capitalGap,-5);assert.equal(r.plans[2].eligible,false);
  assert.equal(cell(r,'base','c').regret,null);
  input.policy.retentionFloor=.9;r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,['a']);
  input.policy.capitalTarget=30;r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,[]);
  assert.equal(r.comparison.minimax.status,'no-eligible-plans');
  assert.equal(r.comparison.minimax.worstRegret,null);
  assert.equal(r.comparison.dominanceStatus,'no-eligible-plans');
  input.policy.retentionFloor=.88;r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,['b']);
  assert.deepEqual(r.comparison.minimax.planIds,['b']);
  assert.equal(r.comparison.minimax.worstRegret,0);
});

test('model coverage is a separate diagnostic and does not silently disqualify plans',()=>{
  const input=worked();input.policy.modelCoverageFloor=10;
  const r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,['a','b']);
  assert.equal(cell(r,'base','a').meetsModelCoverage,false);
  assert.equal(r.comparison.minimax.status,'available');
});

test('signed cohort allocation includes proceeds once and scales the tracked holder separately',()=>{
  const r=capitalStrategy(worked());
  for(const item of r.matrix){
    const s=r.scenarios.find(v=>v.id===item.scenarioId),p=r.plans.find(v=>v.id===item.planId);
    const oldShares=100,sharePrice=p.pricing.preMoney/oldShares,newShares=p.round.primaryCapital/sharePrice;
    const retained=oldShares/(oldShares+newShares);
    near(item.modelPostMoneyEquity,s.modelPreMoneyEquity+p.round.primaryCapital);
    near(item.existingCohortAllocation,retained*item.modelPostMoneyEquity);
    near(item.trackedHolderAllocation,item.existingCohortAllocation*.1);
    near(item.modelToQuote,s.modelPreMoneyEquity/p.pricing.preMoney);
  }
  const input=worked();input.policy.holderStake=0;
  const zero=capitalStrategy(input);
  assert.ok(zero.matrix.every(v=>v.trackedHolderAllocation===0));
  assert.deepEqual(zero.comparison,r.comparison);
});

test('A and B have the independent rational crossover of 635 and cohort allocation 600',()=>{
  const r=capitalStrategy(worked()),cross=r.comparison.crossovers.find(v=>v.planA==='a'&&v.planB==='b');
  assert.equal(cross.status,'finite');assert.equal(cross.eligiblePair,true);
  near(cross.equityResidual,635);near(cross.allocation,600);
  assert.equal(cross.higherResidualPreferred,'a');assert.equal(cross.lowerResidualPreferred,'b');
  assert.equal(cross.inSelectedRange,true);
  // 100 old shares: A issues 10; B issues 35/3. At M=635 both old cohorts receive 600.
  near(100/(100+10)*(635+25),600);near(100/(100+35/3)*(635+35),600);
});

test('crossover range labels do not extrapolate from a single selected residual',()=>{
  const input=single();input.plans=worked().plans.slice(0,2);
  const result=capitalStrategy(input),cross=result.comparison.crossovers[0];
  assert.equal(cross.status,'finite');assert.equal(cross.inSelectedRange,false);
  input.bridge=null;
  const unlocated=capitalStrategy(input).comparison.crossovers[0];
  assert.equal(unlocated.status,'finite');assert.equal(unlocated.inSelectedRange,null);
});

test('parallel and identical plans remain distinct from unresolved near-parallel plans',()=>{
  const input=single();input.policy.capitalTarget=0;input.policy.retentionFloor=.5;
  input.plans=[
    {id:'a',label:'Original',basis:'pre',quote:250,primaryCapital:25},
    {id:'same',label:'Same economic round',basis:'post',quote:275,primaryCapital:25},
    {id:'scale',label:'Same fraction, more cash',basis:'pre',quote:500,primaryCapital:50},
  ];
  let r=capitalStrategy(input);
  assert.equal(r.comparison.crossovers.find(v=>v.planA==='a'&&v.planB==='same').status,'identical');
  assert.equal(r.comparison.crossovers.find(v=>v.planA==='a'&&v.planB==='scale').status,'parallel');
  assert.ok(r.comparison.dominance.some(v=>v.dominatingPlanId==='scale'&&v.dominatedPlanId==='a'));
  input.plans[1]={id:'near',label:'Near-parallel',basis:'pre',quote:250.000000000001,primaryCapital:25};
  r=capitalStrategy(input);
  assert.equal(r.comparison.crossovers[0].status,'unavailable');
  assert.equal(r.comparison.crossovers[0].equityResidual,null);
});

test('a resolved ill-conditioned crossover matches the exact binary share ledger',()=>{
  const input=single();input.policy.capitalTarget=0;input.policy.retentionFloor=.5;
  input.plans=[
    {id:'a',label:'Original',basis:'pre',quote:250,primaryCapital:25},
    {id:'b',label:'Close retention, different cash',basis:'pre',quote:350.0000000001,primaryCapital:35},
  ];
  const result=capitalStrategy(input),cross=result.comparison.crossovers[0];
  assert.equal(cross.status,'finite');
  // Python Fraction.from_float on the exact submitted numbers, with a
  // 100-existing-share ledger, produces these correctly rounded values.
  near(cross.equityResidual,-385047846907477.8,2e-15);
  near(cross.allocation,-350043497188593.44,2e-15);
  reconcileCrossover(result,cross);
});

test('crossover coefficients use exact entered terms before the pre-plus-raise rounding',()=>{
  const input=single();input.policy.capitalTarget=0;input.policy.retentionFloor=.5;
  input.plans=[
    {id:'a',label:'Input addition loses half an ulp',basis:'pre',quote:250.00000000000003,primaryCapital:25},
    {id:'b',label:'Close retention, different cash',basis:'pre',quote:350.0000000001,primaryCapital:35},
  ];
  const result=capitalStrategy(input),cross=result.comparison.crossovers[0];
  assert.equal(result.plans[0].pricing.postMoney,275);
  assert.equal(cross.status,'finite');
  // Exact Fraction.from_float inputs, before any quote+raise rounding.
  assert.equal(cross.equityResidual,-385201139003727.2);
  assert.equal(cross.allocation,-350182853639729.25);
  reconcileCrossover(result,cross);
});

test('binary-representable equivalent pre/post quotes keep crossover coefficients identical',()=>{
  const input=single();input.policy.capitalTarget=0;input.policy.retentionFloor=.5;
  input.plans=[
    {id:'a',label:'Fractional quote',basis:'pre',quote:250.5,primaryCapital:25.25},
    {id:'b',label:'Second quote',basis:'pre',quote:300.75,primaryCapital:35.5},
    {id:'same',label:'Same first quote in post basis',basis:'post',quote:275.75,primaryCapital:25.25},
  ];
  const pre=capitalStrategy(input);
  assert.equal(pre.comparison.crossovers.find(c=>c.planA==='a'&&c.planB==='same').status,'identical');
  for(const cross of pre.comparison.crossovers.filter(c=>c.status==='finite'))reconcileCrossover(pre,cross);
  for(const plan of input.plans)if(plan.basis==='pre'){plan.quote+=plan.primaryCapital;plan.basis='post';}
  const post=capitalStrategy(input);
  assert.deepEqual(pre.comparison,post.comparison);
  for(const cross of post.comparison.crossovers.filter(c=>c.status==='finite'))reconcileCrossover(post,cross);
});

test('zero crossover residual and zero common allocation remain legitimate finite answers',()=>{
  for(const [quoteA,raiseA,quoteB,raiseB,root,allocation] of [[100,100,75,150,0,50],[50,75,150,75,-75,0]]){
    const input=single();input.policy.capitalTarget=0;input.policy.retentionFloor=.01;
    input.plans=[
      {id:'a',label:'First boundary plan',basis:'pre',quote:quoteA,primaryCapital:raiseA},
      {id:'b',label:'Second boundary plan',basis:'pre',quote:quoteB,primaryCapital:raiseB},
    ];
    const result=capitalStrategy(input),cross=result.comparison.crossovers[0];
    assert.equal(cross.status,'finite');assert.equal(cross.equityResidual,root);assert.equal(cross.allocation,allocation);
    reconcileCrossover(result,cross);
  }
});

test('subnormal crossover allocation rounds an exact half tie to the even binary64 value',()=>{
  const input=single(),u=Number.MIN_VALUE;input.policy.capitalTarget=0;input.policy.retentionFloor=.01;
  input.plans=[
    {id:'a',label:'Half retained',basis:'pre',quote:2*u,primaryCapital:2*u},
    {id:'b',label:'Three quarters retained',basis:'pre',quote:3*u,primaryCapital:u},
  ];
  const result=capitalStrategy(input),cross=result.comparison.crossovers[0];
  // A=(M+2u)/2, B=3(M+u)/4. M=u, A=3u/2, rounded once to2u.
  assert.equal(cross.status,'finite');assert.equal(cross.equityResidual,u);assert.equal(cross.allocation,2*u);
  reconcileCrossover(result,cross);
});

test('scenario regrets reconcile to eligible benchmarks and minimax is a declared finite-set rule',()=>{
  const r=capitalStrategy(worked());
  for(const s of r.scenarios){
    const benchmark=Math.max(...r.matrix.filter(v=>v.scenarioId===s.id&&r.comparison.eligiblePlanIds.includes(v.planId)).map(v=>v.existingCohortAllocation));
    const row=r.comparison.perScenario.find(v=>v.scenarioId===s.id);near(row.bestAllocation,benchmark);
    for(const id of r.comparison.eligiblePlanIds)near(cell(r,s.id,id).regret,benchmark-cell(r,s.id,id).existingCohortAllocation);
  }
  assert.deepEqual(r.comparison.minimax.planIds,['a']);
  assert.equal(r.comparison.metric,'existing-cohort-signed-residual');
  assert.equal(r.comparison.dominance.length,0);
  assert.equal(r.comparison.planMetrics.find(v=>v.planId==='c').worstRegret,null);
});

test('economic duplicates preserve ties without arbitrary selected winners',()=>{
  const input=single();input.plans.push({...input.plans[0],id:'duplicate',label:'Equivalent offer'});
  const r=capitalStrategy(input);
  assert.deepEqual(r.comparison.perScenario[0].bestPlanIds,['a','duplicate']);
  assert.deepEqual(r.comparison.minimax.planIds,['a','duplicate']);
  assert.equal(r.comparison.minimax.worstRegret,0);
  assert.deepEqual(r.comparison.dominance,[]);
});

test('missing bridge preserves plan screening and makes residual-based comparisons unavailable',()=>{
  const input=worked();input.bridge=null;const r=capitalStrategy(input);
  assert.deepEqual(r.comparison.eligiblePlanIds,['a','b']);
  assert.ok(r.scenarios.every(v=>v.modelPreMoneyEquity===null));
  assert.ok(r.matrix.every(v=>v.existingCohortAllocation===null&&v.regret===null&&v.meetsModelCoverage===null&&v.warnings.length>0));
  assert.equal(r.comparison.minimax.status,'unavailable');
  assert.equal(r.comparison.dominanceStatus,'unavailable');
  assert.deepEqual(r.comparison.range,{minEquity:null,maxEquity:null});
  assert.equal(r.envelope.status,'unavailable');
  assert.equal(r.envelope.modelQuoteCeiling,null);
  assert.ok(r.envelope.plans.every(v=>v.currentQuoteMeets===null));
});

test('negative residual allocations stay signed and do not become equity floors',()=>{
  const input=worked();input.bridge={cash:0,debt:1000,otherClaims:1000};
  const r=capitalStrategy(input);
  assert.ok(r.matrix.every(v=>v.modelPreMoneyEquity<0&&v.existingCohortAllocation<0&&v.trackedHolderAllocation<0));
  assert.ok(r.matrix.every(v=>v.meetsModelCoverage===false));
  assert.equal(r.comparison.minimax.status,'available');
  assert.equal(r.envelope.status,'no-positive-price');
  assert.ok(r.envelope.modelQuoteCeiling<0);
  assert.equal(r.envelope.maximumPrimaryCapital,null);
});

test('finite continuation flows through all residual and allocation calculations',()=>{
  const input=single();input.scenarios[0].continuationYears=0;
  let r=capitalStrategy(input),s=r.scenarios[0];
  assert.equal(s.operatingEv,project(input.scenarios[0].assumptions).pv_explicit);
  assert.equal(s.perpetualEv,project(input.scenarios[0].assumptions).ev);
  near(cell(r,'base','a').existingCohortAllocation,(s.operatingEv+15+25)*250/275);
  input.scenarios[0].continuationYears=17;r=capitalStrategy(input);s=r.scenarios[0];
  assert.equal(s.operatingEv,valueHorizon(input.scenarios[0].assumptions,{years:17}).selected.ev);
  assert.ok(s.operatingEv<s.perpetualEv);
});

test('an all-scenario envelope intersects the exact ownership lower bound with model coverage',()=>{
  const input=single();
  const ev=project(input.scenarios[0].assumptions).ev;
  input.bridge={cash:0,debt:ev-100,otherClaims:0};
  input.plans[0]={id:'a',label:'Exact illustrative round',basis:'pre',quote:95,primaryCapital:10};
  input.policy={capitalTarget:10,retentionFloor:.9,modelCoverageFloor:1,holderStake:.1};
  let r=capitalStrategy(input),p=r.envelope.plans[0];
  assert.equal(r.envelope.status,'available');near(r.envelope.modelQuoteCeiling,100);
  near(p.lowerPreMoney,90);near(p.upperPreMoney,100);assert.equal(p.status,'compatible');
  assert.equal(p.includesLower,true);assert.equal(p.withinInputRange,true);assert.equal(p.currentQuoteMeets,true);
  near(r.envelope.maximumPrimaryCapital,100/9);
  input.plans[0].primaryCapital=12;r=capitalStrategy(input);p=r.envelope.plans[0];
  near(p.lowerPreMoney,108);assert.equal(p.status,'empty');assert.equal(p.currentQuoteMeets,false);
});

test('strict 100% retention permits only zero issuance and has an open zero quote lower bound',()=>{
  const input=single();input.policy.retentionFloor=1;input.policy.capitalTarget=0;
  input.plans[0].quote=1e12;input.plans[0].primaryCapital=1e-10;
  let r=capitalStrategy(input);
  assert.equal(r.plans[0].retainedFraction,1);assert.equal(r.plans[0].meetsRetention,false);
  assert.equal(r.envelope.plans[0].status,'no-finite-quote');assert.equal(r.envelope.plans[0].lowerPreMoney,null);
  assert.equal(r.envelope.maximumPrimaryCapital,0);
  input.plans[0].primaryCapital=0;r=capitalStrategy(input);
  assert.equal(r.plans[0].meetsRetention,true);
  assert.equal(r.envelope.plans[0].lowerPreMoney,0);assert.equal(r.envelope.plans[0].includesLower,false);
  assert.equal(r.envelope.plans[0].status,'compatible');
});

test('analytical quote bounds are not silently clipped to application input limits',()=>{
  const input=single();input.policy.retentionFloor=.99;
  input.plans[0].quote=1e12;input.plans[0].primaryCapital=1e12;
  input.scenarios[0].assumptions.wacc=.030000001;
  const r=capitalStrategy(input),p=r.envelope.plans[0];
  assert.ok(p.lowerPreMoney>FINANCING_MAX_AMOUNT);
  assert.equal(p.withinInputRange,false);
  near(p.lowerPreMoney,99e12);
});

test('permutation and duplication change neither finite-set envelopes nor comparative metrics',()=>{
  const input=worked(),r=capitalStrategy(input);
  input.scenarios.reverse();input.plans.reverse();const permuted=capitalStrategy(input);
  near(permuted.comparison.minimax.worstRegret,r.comparison.minimax.worstRegret);
  assert.deepEqual(permuted.comparison.minimax.planIds,r.comparison.minimax.planIds);
  assert.equal(permuted.envelope.modelQuoteCeiling,r.envelope.modelQuoteCeiling);
  input.scenarios.push({...clone(input.scenarios[0]),id:'duplicate-state',label:'Duplicate economic state'});
  const duplicate=capitalStrategy(input);
  assert.equal(duplicate.envelope.modelQuoteCeiling,r.envelope.modelQuoteCeiling);
  near(duplicate.comparison.minimax.worstRegret,r.comparison.minimax.worstRegret);
});

test('tighter coverage or retention and adding a worse scenario cannot expand the envelope',()=>{
  const input=single(),a=capitalStrategy(input);
  input.policy.modelCoverageFloor=1.25;const b=capitalStrategy(input);
  assert.ok(b.envelope.modelQuoteCeiling<a.envelope.modelQuoteCeiling);
  assert.ok(b.envelope.maximumPrimaryCapital<a.envelope.maximumPrimaryCapital);
  input.policy.retentionFloor=.95;const c=capitalStrategy(input);
  assert.ok(c.envelope.maximumPrimaryCapital<b.envelope.maximumPrimaryCapital);
  input.scenarios.push(scenario('bear','Bear',presets.Anthropic.Bear));
  const d=capitalStrategy(input);assert.ok(d.envelope.modelQuoteCeiling<c.envelope.modelQuoteCeiling);
});

test('equivalent pre and post quoted rounds produce the same consequences',()=>{
  const input=worked(),a=capitalStrategy(input);
  for(const plan of input.plans){plan.quote+=plan.primaryCapital;plan.basis='post';}
  const b=capitalStrategy(input);
  assert.deepEqual(a.matrix,b.matrix);
  assert.deepEqual(a.comparison,b.comparison);
  assert.deepEqual(a.envelope,b.envelope);
});

test('canonical validation detaches every editable nested object and normalizes negative zero',()=>{
  const input=worked();input.policy.capitalTarget=-0;input.bridge.otherClaims=-0;
  const result=validateCapitalSnapshot(input);
  assert.equal(Object.is(result.policy.capitalTarget,-0),false);assert.equal(Object.is(result.bridge.otherClaims,-0),false);
  result.scenarios[0].assumptions.g1=.123;result.plans[0].quote=999;result.bridge.cash=3;
  assert.equal(input.scenarios[0].assumptions.g1,.25);assert.equal(input.plans[0].quote,250);assert.equal(input.bridge.cash,20);
  const nullRecord=Object.assign(Object.create(null),worked());
  assert.deepEqual(validateCapitalSnapshot(nullRecord),worked());
});

test('strict records reject getters and inherited or unsupported data without invoking accessors',()=>{
  let invoked=0;const input=worked();Object.defineProperty(input.policy,'capitalTarget',{enumerable:true,get(){invoked++;return 25;}});
  assert.throws(()=>validateCapitalSnapshot(input));assert.equal(invoked,0);
  const variations=[
    value=>{value.extra=true;},
    value=>{value.policy.extra=true;},
    value=>{value.scenarios[0].assumptions.extra=true;},
    value=>{value.plans[0].extra=true;},
    value=>{value.bridge.extra=true;},
    value=>{value.scenarios[0].extra=true;},
    value=>{value[Symbol('hidden')]=1;},
    value=>{value.scenarios[0].assumptions=Object.create(value.scenarios[0].assumptions);},
    value=>{Object.defineProperty(value.policy,'retentionFloor',{value:.9,enumerable:false});},
  ];
  for(const mutate of variations){const value=worked();mutate(value);assert.throws(()=>capitalStrategy(value));}
});

test('scenario and plan lists must be bounded dense arrays with no custom properties',()=>{
  for(const key of ['scenarios','plans'])for(const mutation of [
    v=>{v[key]=[];},v=>{v[key]=[...v[key],...v[key],...v[key],...v[key]];},
    v=>{delete v[key][0];},v=>{v[key].extra=true;},v=>{v[key][Symbol('custom')]=1;},
    v=>{Object.defineProperty(v[key],'0',{enumerable:true,get(){throw new Error('getter executed');}});},
  ]){const input=worked();mutation(input);assert.throws(()=>validateCapitalSnapshot(input));}
});

test('identifiers and Unicode labels have explicit bounded inert-text domains',()=>{
  for(const bad of ['', 'A', 'a b','a_1','1a','a'.repeat(25)]){
    const input=worked();input.plans[0].id=bad;assert.throws(()=>validateCapitalSnapshot(input));
  }
  for(const bad of ['', 'a'.repeat(61),'x\n','x\u0000','x\u0085']){
    const input=worked();input.scenarios[0].label=bad;assert.throws(()=>validateCapitalSnapshot(input));
  }
  const input=worked();input.scenarios[0].label='量化研究 📈 <b>inert</b>';input.plans[0].label='📈'.repeat(60);
  assert.equal(validateCapitalSnapshot(input).plans[0].label,[...input.plans[0].label].join(''));
  input.plans[1].id=input.plans[0].id;assert.throws(()=>validateCapitalSnapshot(input));
  input.plans[1].id='unique';input.scenarios[1].id=input.scenarios[0].id;assert.throws(()=>validateCapitalSnapshot(input));
});

test('scenario and plan labels reject lone surrogates while preserving paired emoji and whitespace',()=>{
  for(const collection of ['scenarios','plans']){
    for(const surrogate of ['\uD800','\uDC00']){
      const input=worked();input[collection][0].label=`Label-${surrogate}-end`;
      assert.throws(()=>validateCapitalSnapshot(input),/well-formed Unicode/);
      assert.throws(()=>capitalStrategy(input),/well-formed Unicode/);
    }
    for(const label of ['量化研究 📈','📈'.repeat(60),'   ','\u00a0\u2003']){
      const input=worked();input[collection][0].label=label;
      const checked=validateCapitalSnapshot(input),result=capitalStrategy(input);
      assert.equal(checked[collection][0].label,label);
      assert.equal(result[collection][0].label,label);
      assert.equal(new TextDecoder().decode(new TextEncoder().encode(label)),label);
    }
  }
});

test('all required fields and numeric domains are enforced without dropping a scenario',()=>{
  for(const [key,values] of Object.entries({capitalTarget:[-1,1e12+1,null,'25',true,NaN,Infinity],retentionFloor:[0,.009,1.001,NaN],modelCoverageFloor:[0,.09,10.1,Infinity],holderStake:[-.1,1.1,null]})){
    for(const value of values){const input=worked();input.policy[key]=value;assert.throws(()=>validateCapitalSnapshot(input));}
  }
  for(const years of [-1,.5,101,undefined,'10',NaN]){const input=worked();input.scenarios[0].continuationYears=years;assert.throws(()=>capitalStrategy(input));}
  for(const key of Object.keys(worked())){const input=worked();delete input[key];assert.throws(()=>capitalStrategy(input));}
  const invalidModel=worked();invalidModel.scenarios[1].assumptions.g3=0;assert.throws(()=>capitalStrategy(invalidModel));
  const badRound=worked();badRound.plans[0].basis='post';badRound.plans[0].quote=25;assert.throws(()=>capitalStrategy(badRound));
  const badBridge=worked();badBridge.bridge.cash=10001;assert.throws(()=>capitalStrategy(badBridge));
  const company=worked();company.company='Other';assert.throws(()=>capitalStrategy(company));
});

test('unrepresentable derived ratios remain unavailable while resolvable coverage remains usable',()=>{
  const input=single();input.policy.capitalTarget=0;
  input.plans[0].quote=Number.MIN_VALUE;input.plans[0].primaryCapital=0;
  const r=capitalStrategy(input),item=r.matrix[0];
  assert.equal(item.modelToQuote,null);assert.equal(item.meetsModelCoverage,true);
  assert.ok(item.warnings.some(v=>/ratio|range|precision/i.test(v)));
  assert.equal(r.comparison.minimax.status,'available');
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
});
