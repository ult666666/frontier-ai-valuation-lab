import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {project} from '../public/lib/model.js';
import {THESIS_VERSION,THESIS_GROUPS,compareTheses,valuationLandscape} from '../public/lib/thesis.js';

const fixture={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const edited={rev2026:130,g1:.12,g2:.08,g3:.06,m27:-.08,m30:.28,m36:.35,turns:3.8,wacc:.115,tg:.035,roic:.26,stub:-8,tax:.21};
const expectedGroups=[
  {key:'growth',label:'Revenue scale & growth',keys:['rev2026','g1','g2']},
  {key:'margins',label:'Operating margins',keys:['m27','m30','m36']},
  {key:'capital',label:'Capital efficiency',keys:['turns']},
  {key:'continuation',label:'Long-run economics',keys:['g3','wacc','tg','roic']},
  {key:'tax',label:'Tax rate',keys:['tax']},
  {key:'stub',label:'Remaining-2026 cash flow',keys:['stub']}
];
const presets=Object.values(JSON.parse(readFileSync(new URL('../public/data/presets.json',import.meta.url),'utf8'))).flatMap(Object.values);
function close(actual,expected,{absolute=1e-9,relative=2e-12}={}) {
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=Math.max(absolute,Math.abs(expected)*relative),`${actual} != ${expected}`);
}
function freeze(value) {
  if (value&&typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
function assertFiniteTree(value) {
  if (typeof value==='number') assert.ok(Number.isFinite(value));
  else if (value&&typeof value==='object') Object.values(value).forEach(assertFiniteTree);
}

// Independent scalar FCFF calculation: no production project(), margin helper,
// or thesis code is used. Dates are elapsed calendar days from 18 October 2026.
function independentEv(p) {
  const discount=days=>(1+p.wacc)**(-days/365.25);
  const elapsedDays=[439,805,1170,1535,1900,2266,2631,2996,3361,3727];
  let revenue=p.rev2026,explicit=p.stub*discount(74);
  for(let i=0;i<10;i++) {
    const previous=revenue;
    revenue*=1+(i<4?p.g1:i<7?p.g2:p.g3);
    const margin=i<4?((3-i)*p.m27+i*p.m30)/3:((9-i)*p.m30+(i-3)*p.m36)/6;
    const operating=revenue*margin;
    const afterTax=operating>0?operating*(1-p.tax):operating;
    explicit+=(afterTax-(revenue-previous)/p.turns)*discount(elapsedDays[i]);
  }
  const terminal=revenue*(1+p.tg)*p.m36*(1-p.tax)*(1-p.tg/p.roic)/(p.wacc-p.tg);
  return explicit+terminal*discount(3727);
}
function* permutations(items,prefix=[]) {
  if (!items.length) {yield prefix;return;}
  for(let i=0;i<items.length;i++) yield* permutations([...items.slice(0,i),...items.slice(i+1)],[...prefix,items[i]]);
}
// Average the marginal EV over every ordering, independently of the production
// subset-weight formula. A history actually applies each group in sequence.
function permutationOracle(reference,alternative) {
  const totals=expectedGroups.map(()=>0);
  let orderings=0;
  for(const ordering of permutations([0,1,2,3,4,5])) {
    const assumptions={...reference};
    let previous=independentEv(assumptions);
    for(const index of ordering) {
      for(const key of expectedGroups[index].keys) assumptions[key]=alternative[key];
      const next=independentEv(assumptions);
      totals[index]+=(next-previous)/720;
      previous=next;
    }
    orderings++;
  }
  assert.equal(orderings,720);
  return totals;
}
function hybrid(reference,alternative,mask) {
  const result={...reference};
  expectedGroups.forEach((group,index)=>{
    if(mask&(1<<index)) for(const key of group.keys) result[key]=alternative[key];
  });
  return result;
}
// With fixed growth/capital assumptions, EV is piecewise linear in m36. Split
// at the independently derived loss-to-profit tax kinks and interpolate once.
function independentRequiredMargin(p,wacc,target,lower,upper) {
  const breaks=[lower,upper];
  if(p.m30<0) for(let k=1;k<=5;k++) {
    const kink=-(6-k)*p.m30/k;
    if(kink>lower&&kink<upper) breaks.push(kink);
  }
  breaks.sort((a,b)=>a-b);
  for(let i=1;i<breaks.length;i++) {
    const lo=breaks[i-1],hi=breaks[i];
    const lowEv=independentEv({...p,wacc,m36:lo}),highEv=independentEv({...p,wacc,m36:hi});
    if(target>=lowEv&&target<=highEv) return lo+(target-lowEv)*(hi-lo)/(highEv-lowEv);
  }
  return null;
}

test('thesis version and immutable groups cover each of the 13 inputs once',()=>{
  assert.equal(THESIS_VERSION,'1.0.0');
  assert.deepEqual(THESIS_GROUPS,expectedGroups);
  assert.ok(Object.isFrozen(THESIS_GROUPS));
  for(const group of THESIS_GROUPS) {
    assert.ok(Object.isFrozen(group));
    assert.ok(Object.isFrozen(group.keys));
  }
  assert.deepEqual(THESIS_GROUPS.flatMap(group=>group.keys).sort(),Object.keys(fixture).sort());
  assert.throws(()=>THESIS_GROUPS[3].keys.push('tax'),TypeError);
});

test('exact grouped attribution agrees with an independent 720-ordering oracle on interacting inputs',()=>{
  for(let mask=0;mask<64;mask++) {
    const assumptions=hybrid(fixture,edited,mask);
    close(independentEv(assumptions),project(assumptions).ev);
  }
  const first=independentEv(hybrid(fixture,edited,1))-independentEv(fixture);
  const second=independentEv(hybrid(fixture,edited,2))-independentEv(fixture);
  const together=independentEv(hybrid(fixture,edited,3))-independentEv(fixture);
  assert.ok(Math.abs(together-first-second)>10,'The oracle fixture must exercise group interactions.');
  const expected=permutationOracle(fixture,edited),result=compareTheses(fixture,edited);
  assert.equal(result.version,THESIS_VERSION);
  assert.deepEqual(result.reference,{assumptions:fixture,result:project(fixture)});
  assert.deepEqual(result.alternative,{assumptions:edited,result:project(edited)});
  assert.equal(result.evDelta,project(edited).ev-project(fixture).ev);
  assert.equal(result.evChangeRatio,result.evDelta/project(fixture).ev);
  assert.deepEqual(result.changedInputs,Object.keys(fixture).filter(key=>fixture[key]!==edited[key]).map(key=>({key,reference:fixture[key],alternative:edited[key],delta:edited[key]-fixture[key]})));
  assert.deepEqual({...result.attribution,groups:null,sum:null,residual:null},{status:'ok',method:'exact-grouped-shapley',groupCount:6,coalitions:64,orderings:720,groups:null,sum:null,residual:null,reason:null});
  result.attribution.groups.forEach((group,index)=>{
    assert.deepEqual({...group,contribution:undefined},{...expectedGroups[index],contribution:undefined});
    close(group.contribution,expected[index]);
  });
  close(result.attribution.sum,result.evDelta);
  assert.equal(result.attribution.residual,result.evDelta-result.attribution.sum);
  assertFiniteTree(result);
});

test('swapping cases negates each signed allocation and the EV delta',()=>{
  const forward=compareTheses(fixture,edited),backward=compareTheses(edited,fixture);
  assert.equal(backward.evDelta,-forward.evDelta);
  forward.attribution.groups.forEach((group,index)=>close(backward.attribution.groups[index].contribution,-group.contribution));
  assert.equal(backward.evChangeRatio,backward.evDelta/project(edited).ev);
});

test('identical cases produce zero changes without residual redistribution',()=>{
  const result=compareTheses(fixture,{...fixture});
  assert.deepEqual(result.changedInputs,[]);
  assert.equal(result.evDelta,0);
  assert.equal(result.evChangeRatio,0);
  assert.equal(result.attribution.status,'ok');
  for(const group of result.attribution.groups) assert.equal(group.contribution,0);
  assert.equal(result.attribution.sum,0);
  assert.equal(result.attribution.residual,0);
});

test('changing only one group assigns the complete change to that group',()=>{
  expectedGroups.forEach((changed,index)=>{
    const result=compareTheses(fixture,hybrid(fixture,edited,1<<index));
    result.attribution.groups.forEach((group,i)=>close(group.contribution,i===index?result.evDelta:0));
    assert.deepEqual(result.changedInputs.map(input=>input.key).sort(),[...changed.keys].sort());
  });
});

test('equal endpoint EVs can have nonzero offsetting attribution',()=>{
  const relabeled={...fixture,rev2026:fixture.rev2026*2,turns:fixture.turns*2,m27:fixture.m27/2,m30:fixture.m30/2,m36:fixture.m36/2};
  const result=compareTheses(fixture,relabeled);
  assert.equal(result.evDelta,0);
  assert.ok(result.attribution.groups.some(group=>group.contribution>10));
  assert.ok(result.attribution.groups.some(group=>group.contribution< -10));
  close(result.attribution.sum,0);
  assert.equal(result.attribution.residual,result.evDelta-result.attribution.sum);
});

test('all 36 ordered preset pairs have finite complete and reconciling allocations',()=>{
  for(const reference of presets) for(const alternative of presets) {
    const result=compareTheses(reference,alternative);
    assert.equal(result.attribution.status,'ok');
    close(result.reference.result.ev,independentEv(reference));
    close(result.alternative.result.ev,independentEv(alternative));
    close(result.attribution.sum,result.evDelta);
    const expected=permutationOracle(reference,alternative);
    result.attribution.groups.forEach((group,index)=>close(group.contribution,expected[index]));
    assertFiniteTree(result);
  }
});

test('valid coupled long-run inputs stay together in every hybrid',()=>{
  const reference={...fixture,g3:.02,wacc:.025,tg:.01,roic:.02};
  const alternative={...edited,g3:.08,wacc:.1,tg:.06,roic:.08};
  assert.throws(()=>project({...reference,tg:alternative.tg}),/WACC/);
  const result=compareTheses(reference,alternative);
  assert.equal(result.attribution.status,'ok');
  for(let mask=0;mask<64;mask++) assert.ok(Number.isFinite(project(hybrid(reference,alternative,mask)).ev));
  close(result.attribution.sum,result.evDelta);
});

test('negative and zero reference EV remain signed and have no percentage ratio',()=>{
  const negative={...fixture,stub:-1000};
  const result=compareTheses(negative,{...negative,m36:.3});
  assert.ok(result.reference.result.ev<0);
  assert.ok(result.alternative.result.ev<0);
  assert.ok(result.evDelta>0);
  assert.equal(result.evChangeRatio,null);
  close(result.attribution.sum,result.evDelta);
  const zero={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const fromZero=compareTheses(zero,{...zero,stub:1});
  assert.equal(fromZero.reference.result.ev,0);
  assert.equal(fromZero.evChangeRatio,null);
  assert.ok(fromZero.evDelta>0);
});

test('a tiny positive reference retains a finite ratio without an arbitrary floor',()=>{
  const small={...fixture,rev2026:1e-200,stub:0};
  const result=compareTheses(small,{...small,rev2026:2e-200});
  assert.ok(result.reference.result.ev>0&&result.reference.result.ev<1e-190);
  close(result.evChangeRatio,1);
  close(result.attribution.sum,result.evDelta,{absolute:0,relative:1e-12});
});

test('an overflowing endpoint or relative EV change is rejected before JSON serialization',()=>{
  assert.throws(()=>compareTheses(fixture,{...fixture,wacc:Number.MIN_VALUE,tg:0}),/numeric range/i);
  const tiny={...fixture,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  assert.ok(project(tiny).ev>0);
  assert.throws(()=>compareTheses(tiny,fixture),/numeric range/i);
});

test('finite endpoints with an overflowing hybrid retain comparison and report unavailable attribution',()=>{
  const reference={...fixture,rev2026:1e-300,g1:0,g2:0,g3:0,wacc:Number.MIN_VALUE,tg:0,stub:0};
  const alternative={...fixture,g1:0,g2:0,g3:0,tg:0,stub:0};
  assert.ok(Number.isFinite(project(reference).ev));
  assert.ok(Number.isFinite(project(alternative).ev));
  assert.throws(()=>project({...reference,rev2026:100}),/numeric range/);
  const result=compareTheses(reference,alternative);
  assert.equal(result.attribution.status,'unavailable');
  assert.equal(result.attribution.method,'exact-grouped-shapley');
  assert.equal(result.attribution.groupCount,6);
  assert.equal(result.attribution.coalitions,64);
  assert.equal(result.attribution.orderings,720);
  assert.deepEqual(result.attribution.groups,[]);
  assert.equal(result.attribution.sum,null);
  assert.equal(result.attribution.residual,null);
  assert.match(result.attribution.reason,/numeric range/i);
  assert.equal(result.evDelta,project(alternative).ev-project(reference).ev);
  assertFiniteTree(result);
  const serialized=JSON.parse(JSON.stringify(result));
  assert.equal(serialized.reference.result.ev,result.reference.result.ev);
  assert.equal(serialized.alternative.result.ev,result.alternative.result.ev);
  assert.deepEqual(serialized.attribution,result.attribution);
});

test('comparison makes exact private snapshots and never mutates caller data',()=>{
  const reference=freeze({...fixture,g1:.040000000000000015}),alternative=freeze({...edited});
  const before=[structuredClone(reference),structuredClone(alternative)];
  const result=compareTheses(reference,alternative),again=compareTheses(reference,alternative);
  assert.deepEqual(result,again);
  assert.deepEqual([reference,alternative],before);
  assert.notEqual(result.reference.assumptions,reference);
  assert.notEqual(result.alternative.assumptions,alternative);
  result.reference.assumptions.g1=.7;
  result.attribution.groups[0].keys.push('tax');
  assert.equal(reference.g1,.040000000000000015);
  assert.equal(again.reference.assumptions.g1,.040000000000000015);
  assert.deepEqual(THESIS_GROUPS,expectedGroups);
});

test('assumptions require exactly 13 own enumerable finite numeric fields',()=>{
  const {stub,...missing}=fixture;
  const malformed=[null,[],true,'case',{},missing,{...fixture,extra:1},{...fixture,tax:'0.25'},
    {...fixture,m36:true},{...fixture,g1:NaN},{...fixture,stub:Infinity},Object.create(fixture),
    Object.defineProperty({...fixture},'tax',{value:.25,enumerable:false}),{...fixture,[Symbol('extra')]:1}];
  for(const assumptions of malformed) {
    assert.throws(()=>compareTheses(assumptions,fixture));
    assert.throws(()=>compareTheses(fixture,assumptions));
    assert.throws(()=>valuationLandscape(assumptions,{rates:[.1,.2],margins:[.1,.2],target:100}));
  }
  const nullPrototype=Object.assign(Object.create(null),fixture);
  assert.deepEqual(compareTheses(nullPrototype,fixture).reference.assumptions,fixture);
  const injected=JSON.parse(JSON.stringify(fixture).replace('"rev2026":','"__proto__":{"polluted":true},"rev2026":'));
  assert.throws(()=>compareTheses(injected,fixture),/__proto__/);
  assert.equal({}.polluted,undefined);
});

test('assumption accessors are rejected without executing caller-supplied code',()=>{
  let accesses=0;
  const assumptions=Object.defineProperty({...fixture},'tax',{enumerable:true,get(){accesses++;return .25;}});
  assert.throws(()=>compareTheses(assumptions,fixture),/tax/);
  assert.throws(()=>compareTheses(fixture,assumptions),/tax/);
  assert.throws(()=>valuationLandscape(assumptions,{rates:[.1,.2],margins:[.1,.2],target:100}),/tax/);
  assert.equal(accesses,0);
});

test('landscape rows are margins and columns are rates with direct model parity at every cell',()=>{
  const rates=[.05,.08,.1,.14],margins=[.06,.18,.31];
  const result=valuationLandscape(edited,{rates,margins,target:300});
  assert.equal(result.version,THESIS_VERSION);
  assert.deepEqual(result.assumptions,edited);
  assert.deepEqual(result.rates,rates);
  assert.deepEqual(result.margins,margins);
  assert.equal(result.target,300);
  assert.equal(result.values.length,margins.length);
  assert.equal(result.validCount,rates.length*margins.length);
  margins.forEach((m36,row)=>rates.forEach((wacc,column)=>{
    const assumptions={...edited,wacc,m36};
    assert.equal(result.values[row][column],project(assumptions).ev);
    close(result.values[row][column],independentEv(assumptions));
    assert.equal(result.invalidReasons[row][column],null);
  }));
  assert.equal(result.minEv,Math.min(...result.values.flat()));
  assert.equal(result.maxEv,Math.max(...result.values.flat()));
  assertFiniteTree(result);
});

test('invalid rates and zero margins stay null with reasons instead of becoming zero',()=>{
  const result=valuationLandscape(fixture,{rates:[0,.02,.1],margins:[0,.1,.2],target:200});
  assert.equal(result.validCount,2);
  for(let row=0;row<3;row++) for(let column=0;column<3;column++) {
    const valid=row>0&&column===2;
    if(valid) {
      assert.equal(result.values[row][column],project({...fixture,wacc:.1,m36:result.margins[row]}).ev);
      assert.equal(result.invalidReasons[row][column],null);
    } else {
      assert.equal(result.values[row][column],null);
      assert.equal(typeof result.invalidReasons[row][column],'string');
      assert.ok(result.invalidReasons[row][column].length>10);
    }
  }
  assert.ok(result.frontier.every(point=>point.status==='invalid'));
});

test('numerically overflowing landscape cells are unavailable while ordinary cells remain usable',()=>{
  const result=valuationLandscape({...fixture,tg:0},{rates:[Number.MIN_VALUE,.1],margins:[.1,.2],target:100});
  assert.equal(result.validCount,2);
  for(let row=0;row<2;row++) {
    assert.equal(result.values[row][0],null);
    assert.match(result.invalidReasons[row][0],/numeric range/i);
    assert.ok(Number.isFinite(result.values[row][1]));
  }
  assert.equal(result.frontier[0].status,'invalid');
  assert.match(result.frontier[0].reason,/numeric range/i);
});

test('all-invalid landscape reports null extrema and a reason for each frontier point',()=>{
  const result=valuationLandscape(fixture,{rates:[0,.02],margins:[.1,.2],target:100});
  assert.equal(result.validCount,0);
  assert.equal(result.minEv,null);
  assert.equal(result.maxEv,null);
  assert.deepEqual(result.values,[[null,null],[null,null]]);
  for(const point of result.frontier) {
    assert.equal(point.status,'invalid');
    assert.equal(point.margin,null);
    assert.equal(point.ev,null);
    assert.equal(point.residual,null);
    assert.match(point.reason,/WACC/);
  }
});

test('negative and exact zero landscape values are valid signed model results',()=>{
  const negative=valuationLandscape({...fixture,stub:-1000},{rates:[.1,.2],margins:[.1,.2],target:1});
  assert.equal(negative.validCount,4);
  assert.ok(negative.maxEv<0);
  assert.ok(negative.values.flat().every(value=>value<0));
  assert.ok(negative.invalidReasons.flat().every(reason=>reason===null));
  const zero={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const result=valuationLandscape(zero,{rates:[.1,.2],margins:[Number.MIN_VALUE,.01],target:1});
  assert.equal(result.validCount,4);
  assert.deepEqual(result.values,[[0,0],[0,0]]);
  assert.equal(result.minEv,0);
  assert.equal(result.maxEv,0);
});

test('landscape preserves all eleven non-axis inputs and returns private exact copies',()=>{
  const assumptions=freeze({...fixture,m30:.20000000000000004,g1:.040000000000000015});
  const config=freeze({rates:[.09999999999999999,.11],margins:[.19999999999999998,.3],target:200.00000000000003});
  const before=[structuredClone(assumptions),structuredClone(config)];
  const result=valuationLandscape(assumptions,config);
  assert.deepEqual([assumptions,config],before);
  assert.deepEqual(result.assumptions,assumptions);
  assert.deepEqual(result.rates,config.rates);
  assert.deepEqual(result.margins,config.margins);
  assert.notEqual(result.assumptions,assumptions);
  assert.notEqual(result.rates,config.rates);
  assert.notEqual(result.margins,config.margins);
  result.values.forEach((row,i)=>row.forEach((value,j)=>assert.equal(value,project({...assumptions,wacc:config.rates[j],m36:config.margins[i]}).ev)));
  result.assumptions.tax=.8;result.rates[0]=.5;result.margins[0]=.8;
  assert.deepEqual([assumptions,config],before);
});

test('landscape rejects an unrepresentable base case even if replacement axes would be finite',()=>{
  assert.throws(()=>valuationLandscape({...fixture,wacc:Number.MIN_VALUE,tg:0},{rates:[.1,.2],margins:[.1,.2],target:100}),/numeric range/);
});

test('landscape configuration requires exactly rates, margins, and a bounded positive target',()=>{
  const config={rates:[.1,.2],margins:[.1,.2],target:100};
  for(const invalid of [undefined,null,[],true,'surface',{}, {rates:config.rates,margins:config.margins},
    {...config,extra:1},{...config,[Symbol('extra')]:1},Object.create(config),
    ...[0,-1,1e12+1,NaN,Infinity,'100',true].map(target=>({...config,target}))]) {
    assert.throws(()=>valuationLandscape(fixture,invalid));
  }
  assert.equal(valuationLandscape(fixture,{...config,target:1e12}).target,1e12);
});

test('axes require 2 through 21 strictly increasing finite numbers and are never clipped',()=>{
  const config={rates:[.1,.2],margins:[.1,.2],target:100};
  const invalidAxes=[[],[.1],Array.from({length:22},(_,i)=>.01+i*.01),[.1,.1],[.2,.1],[.1,NaN],[.1,Infinity],[.1,'0.2'],[.1,true],Array(2),[.1,,.3],new Float64Array([.1,.2]),'0.1,0.2'];
  for(const axis of invalidAxes) for(const key of ['rates','margins']) assert.throws(()=>valuationLandscape(fixture,{...config,[key]:axis}),/rates|margins|axis/i);
  const largest=valuationLandscape(fixture,{rates:Array.from({length:21},(_,i)=>.04+i*.02),margins:Array.from({length:21},(_,i)=>.01+i*.045),target:100});
  assert.equal(largest.values.length,21);
  assert.ok(largest.values.every(row=>row.length===21));
  assert.equal(largest.validCount,441);
  const outside=valuationLandscape(fixture,{rates:[-.1,.7],margins:[-.1,1.1],target:100});
  assert.deepEqual(outside.rates,[-.1,.7]);
  assert.deepEqual(outside.margins,[-.1,1.1]);
  assert.equal(outside.validCount,0);
});

test('configuration and axis accessors are rejected without executing them',()=>{
  let accesses=0;
  const config={rates:[.1,.2],margins:[.1,.2],target:100};
  for(const key of ['rates','margins','target']) {
    const supplied=Object.defineProperty({...config},key,{enumerable:true,get(){accesses++;return config[key];}});
    assert.throws(()=>valuationLandscape(fixture,supplied),new RegExp(key));
  }
  const axis=Object.defineProperty([.1,.2],'0',{enumerable:true,get(){accesses++;return .1;}});
  assert.throws(()=>valuationLandscape(fixture,{...config,rates:axis}),/rates/i);
  const hidden=Object.defineProperty([.1,.2],'0',{value:.1,enumerable:false});
  assert.throws(()=>valuationLandscape(fixture,{...config,margins:hidden}),/margins/i);
  const extra=Object.defineProperty([.1,.2],'extra',{enumerable:true,get(){accesses++;return .3;}});
  assert.throws(()=>valuationLandscape(fixture,{...config,rates:extra}),/rates/i);
  assert.equal(accesses,0);
});

test('frontier recovers a constructed target and independent linear margin solution for every rate',()=>{
  const known=.273456789012345,target=project({...fixture,m36:known}).ev;
  const config={rates:[.08,.1,.12],margins:[.01,.2,.6,.95],target};
  const result=valuationLandscape(fixture,config);
  assert.equal(result.frontier.length,config.rates.length);
  result.frontier.forEach((point,index)=>{
    assert.equal(point.wacc,config.rates[index]);
    assert.equal(point.status,'solved');
    assert.equal(point.reason,null);
    close(point.margin,independentRequiredMargin(fixture,point.wacc,target,.01,.95),{absolute:2e-13,relative:0});
    assert.equal(point.ev,project({...fixture,wacc:point.wacc,m36:point.margin}).ev);
    assert.equal(point.residual,point.ev-target);
    close(point.ev,target,{absolute:1e-9,relative:1e-12});
  });
  close(result.frontier[1].margin,known,{absolute:2e-13,relative:0});
});

test('frontier solves through loss-to-profit tax kinks using the complete interpolated margin path',()=>{
  const assumptions={...fixture,m27:-.4,m30:-.12,m36:.41,tax:.49,wacc:.11};
  for(const known of [.31,.41,.6]) {
    const target=project({...assumptions,m36:known}).ev;
    assert.ok(target>0);
    const result=valuationLandscape(assumptions,{rates:[.1,.11,.12],margins:[.005,.12,.24,.6,.95],target});
    result.frontier.forEach(point=>{
      assert.equal(point.status,'solved');
      close(point.margin,independentRequiredMargin(assumptions,point.wacc,target,.005,.95),{absolute:3e-13,relative:0});
      close(point.ev,target,{absolute:1e-9,relative:1e-12});
    });
    close(result.frontier[1].margin,known,{absolute:3e-13,relative:0});
  }
});

test('frontier returns an exact supplied endpoint when its EV is the target',()=>{
  for(const known of [.2,.4]) {
    const target=project({...fixture,m36:known}).ev;
    const point=valuationLandscape(fixture,{rates:[.1,.11],margins:[.2,.3,.4],target}).frontier[0];
    assert.equal(point.status,'solved');
    assert.equal(point.margin,known);
    assert.equal(point.ev,target);
    assert.equal(point.residual,0);
    assert.equal(point.reason,null);
  }
});

test('frontier below and above range describe the required margin direction without inventing a point',()=>{
  const config={rates:[.1,.11],margins:[.2,.4]};
  for(const [target,status] of [[1,'below_range'],[1e12,'above_range']]) {
    const result=valuationLandscape(fixture,{...config,target});
    for(const point of result.frontier) {
      assert.equal(point.status,status);
      assert.equal(point.margin,null);
      assert.equal(point.ev,null);
      assert.equal(point.residual,null);
      assert.equal(typeof point.reason,'string');
      assert.ok(point.reason.length>10);
    }
  }
});

test('frontier rejects invalid endpoint combinations even when interior grid cells are valid',()=>{
  const result=valuationLandscape(fixture,{rates:[.1,.2],margins:[0,.2,.4],target:200});
  assert.equal(result.validCount,4);
  for(const point of result.frontier) {
    assert.equal(point.status,'invalid');
    assert.equal(point.margin,null);
    assert.equal(point.ev,null);
    assert.equal(point.residual,null);
    assert.match(point.reason,/margin/i);
  }
});

test('frontier retains precision when positive target and model values have a very small scale',()=>{
  const assumptions={...fixture,rev2026:1e-120,stub:0};
  const known=.317654321098765,target=project({...assumptions,m36:known}).ev;
  const point=valuationLandscape(assumptions,{rates:[.1,.11],margins:[.001,.99],target}).frontier[0];
  assert.equal(point.status,'solved');
  close(point.margin,known,{absolute:2e-13,relative:0});
  close(point.ev,target,{absolute:0,relative:1e-12});
  assertFiniteTree(point);
});
