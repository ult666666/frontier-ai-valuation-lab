import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import {financingLens,FINANCING_VERSION,FINANCING_MAX_AMOUNT} from '../public/lib/financing.js';
import {financingAnalysis,ownershipFrontier,OWNERSHIP_VERSION} from '../public/lib/ownership.js';
import {normalizeFinancing,encodeFinancing,decodeFinancing,financingUrl} from '../public/lib/financing-share.js';
import {encodeScenario} from '../public/lib/share.js';
import {MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {handleRequest} from '../lib/http.js';

const assumptions={...presets.Anthropic.Base};
const bridge={cash:20,debt:5,otherClaims:0};
const round={basis:'pre',quote:250,primaryCapital:25,holderStake:.1};
const constraint={retentionFloor:.9};
const fixture=(roundEdit={},ownershipEdit={})=>ownershipFrontier({...round,...roundEdit},{...constraint,...ownershipEdit});
const near=(actual,expected,relative=1e-12)=>assert.ok(actual===expected||(actual!==0&&expected!==0&&Math.abs(actual-expected)<=relative*Math.max(Math.abs(actual),Math.abs(expected))),`${actual} differs from ${expected}`);
const snapshot=()=>({case:{company:'Anthropic',scenario:'Base',assumptions:{...assumptions},bridge:{...bridge}},round:{...round}});
const pack=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack=token=>JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));
const request=body=>new Request('http://localhost/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const body=(extra={})=>({action:'financing',assumptions,bridge,round,...extra});

test('fixed pre-money quote has the share-count ownership ceiling',()=>{
  const result=fixture();
  assert.equal(result.version,OWNERSHIP_VERSION);assert.deepEqual(result.constraint,constraint);
  // 100 old shares at $2.5B each; at a 90% retention floor there are 100/.9 total shares.
  near(result.ceiling.analyticalCapital,(100/.9-100)*2.5);
  near(result.current.retainedFraction,100/110);
  near(result.current.holderAfter,10/110);
  near(result.current.holderFloor,.09);
  near(result.current.capitalHeadroom,250/9-25);
  assert.equal(result.current.capitalExcess,0);assert.equal(result.current.status,'above-floor');
  assert.equal(result.ceiling.status,'resolved');
});

test('fixed post-money quote lowers pre-money price as primary capital increases',()=>{
  const result=fixture({basis:'post'});
  near(result.ceiling.analyticalCapital,25);
  near(result.current.retainedFraction,.9);near(result.current.holderAfter,.09);
  assert.equal(result.current.status,'at-floor');
  assert.equal(result.current.capitalHeadroom,0);assert.equal(result.current.capitalExcess,0);
  assert.equal(result.method.fixedQuoteBasis,'post');
  near(fixture({}, {retentionFloor:.8}).ceiling.analyticalCapital,62.5);
  near(fixture({basis:'post'}, {retentionFloor:.8}).ceiling.analyticalCapital,50);
});

test('ownership comparison band marks numerical equality without hiding a 100% floor breach',()=>{
  const at=fixture({basis:'post',quote:250,primaryCapital:25});
  assert.equal(at.current.status,'at-floor');assert.equal(at.current.capitalExcess,0);
  const noRaise=fixture({primaryCapital:0},{retentionFloor:1});
  assert.equal(noRaise.current.status,'at-floor');assert.equal(noRaise.ceiling.analyticalCapital,0);
  const tiny=fixture({quote:1e12,primaryCapital:1e-10},{retentionFloor:1});
  assert.equal(tiny.current.retainedFraction,1);
  assert.equal(tiny.current.status,'below-floor');assert.equal(tiny.current.capitalExcess,1e-10);
  assert.equal(tiny.ceiling.analyticalCapital,0);
});

test('current excess remains explicit and constraints do not change round inputs',()=>{
  const input={...round,primaryCapital:50},saved=structuredClone(input),result=ownershipFrontier(input,constraint);
  assert.equal(result.current.status,'below-floor');assert.equal(result.current.capitalHeadroom,0);
  near(result.current.capitalExcess,50-250/9);assert.deepEqual(input,saved);
});

test('cohort floor is independent of tracked holder and current raise size',()=>{
  const zero=fixture({holderStake:0}),whole=fixture({holderStake:1}),raised=fixture({primaryCapital:100});
  assert.deepEqual(zero.ceiling,whole.ceiling);assert.deepEqual(zero.ceiling,raised.ceiling);
  assert.equal(zero.current.holderFloor,0);assert.equal(zero.current.holderAfter,0);
  near(whole.current.holderFloor,.9);near(whole.current.holderAfter,250/275);
});

test('ceilings fall as requested retention rises and retention falls as capital rises',()=>{
  for(const basis of ['pre','post']){
    const floors=[.01,.25,.5,.8,.9,.99,1].map(retentionFloor=>fixture({basis},{retentionFloor}));
    for(let index=1;index<floors.length;index++)assert.ok(floors[index].ceiling.analyticalCapital<floors[index-1].ceiling.analyticalCapital);
    const capitals=[0,1,25,100,200].map(primaryCapital=>fixture({basis,primaryCapital}));
    for(let index=1;index<capitals.length;index++)assert.ok(capitals[index].current.retainedFraction<capitals[index-1].current.retainedFraction);
  }
});

test('graph points reconcile to frozen financing arithmetic and contain current and ceiling points',()=>{
  for(const basis of ['pre','post']){
    const input={...round,basis},result=ownershipFrontier(input,{retentionFloor:.01}),graph=result.graph;
    assert.equal(graph.status,'ready');assert.ok(graph.points.length>=49&&graph.points.length<=51);
    assert.equal(graph.points[0].primaryCapital,0);assert.equal(graph.points.at(-1).primaryCapital,graph.capitalMax);
    assert.equal(graph.currentInDomain,true);assert.equal(graph.ceilingInDomain,true);
    assert.ok(graph.points.some(point=>point.primaryCapital===input.primaryCapital));
    assert.ok(graph.points.some(point=>point.primaryCapital===result.ceiling.analyticalCapital));
    for(let index=0;index<graph.points.length;index++){
      const point=graph.points[index],reference=financingLens(assumptions,{bridge:null,round:{...input,primaryCapital:point.primaryCapital}});
      assert.equal(point.retainedFraction,reference.pricing.existingOwnership);assert.equal(point.holderAfter,reference.pricing.holderAfter);
      if(index>0){assert.ok(point.primaryCapital>graph.points[index-1].primaryCapital);assert.ok(point.retainedFraction<=graph.points[index-1].retainedFraction);}
      if(basis==='post')assert.ok(point.primaryCapital<input.quote);
    }
  }
});

test('a supported input cap does not replace the analytical economic ceiling',()=>{
  const result=fixture({quote:FINANCING_MAX_AMOUNT},{retentionFloor:.01});
  near(result.ceiling.analyticalCapital,99e12);
  assert.equal(result.ceiling.supportedCapital,FINANCING_MAX_AMOUNT);
  assert.equal(result.ceiling.status,'input-cap-limited');
  assert.equal(result.graph.capitalMax,FINANCING_MAX_AMOUNT);assert.equal(result.graph.ceilingInDomain,false);
  assert.ok(result.warnings.some(value=>value.includes('not an economic financing ceiling')));
});

test('an unresolved positive ceiling never becomes an unqualified zero limit',()=>{
  const below=fixture({quote:Number.MIN_VALUE,primaryCapital:0});
  assert.deepEqual(below.ceiling,{analyticalCapital:null,supportedCapital:null,status:'below-resolution'});
  assert.equal(below.current.capitalHeadroom,null);assert.equal(below.current.capitalExcess,null);
  assert.deepEqual(below.graph,{status:'unavailable',capitalMax:null,points:[],ceilingInDomain:false,currentInDomain:false});
  const unresolved=fixture({basis:'post',quote:Number.MIN_VALUE*2,primaryCapital:0},{retentionFloor:.01});
  assert.equal(unresolved.ceiling.status,'unresolved');assert.equal(unresolved.ceiling.analyticalCapital,null);
  assert.equal(unresolved.current.retainedFraction,1);
});

test('dimensionless pre-money factor preserves a representable subnormal ceiling',()=>{
  const result=fixture({quote:Number.MIN_VALUE,primaryCapital:0},{retentionFloor:.5});
  assert.equal(result.ceiling.analyticalCapital,Number.MIN_VALUE);assert.equal(result.ceiling.status,'resolved');
  assert.equal(result.graph.status,'unavailable');
});

test('an unrepresentable positive holder floor is distinct from a zero holder',()=>{
  const result=fixture({holderStake:Number.MIN_VALUE},{retentionFloor:.01});
  assert.equal(result.current.holderFloor,null);assert.equal(result.ceiling.status,'resolved');
  assert.ok(result.warnings.some(value=>value.includes('tracked holder')));
  assert.equal(fixture({holderStake:0},{retentionFloor:.01}).current.holderFloor,0);
});

test('legacy financing results remain exact when ownership is absent',()=>{
  for(const option of [{round},{round,bridge:null},{round,bridge}]){
    const actual=financingAnalysis(assumptions,option),expected=financingLens(assumptions,option);
    assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected));
    assert.equal(Object.hasOwn(actual,'ownership'),false);
  }
});

test('frontier attaches to the unchanged baseline, signed equity bridge and financing fields',()=>{
  for(const testedBridge of [null,bridge,{cash:0,debt:10000,otherClaims:10000}]){
    const result=financingAnalysis(assumptions,{round,bridge:testedBridge,ownership:constraint});
    const {ownership,...legacy}=result;
    assert.deepEqual(legacy,financingLens(assumptions,{round,bridge:testedBridge}));
    assert.deepEqual(ownership,fixture());assert.equal(result.version,FINANCING_VERSION);
    if(testedBridge?.debt===10000)assert.ok(result.comparison.modelPreMoneyEquity<0);
  }
});

test('ownership inputs are strict records with a finite 1–100% floor',()=>{
  for(const retentionFloor of [0,-0,-1,.009999,1.0001,null,undefined,true,'0.9',NaN,Infinity,-Infinity])assert.throws(()=>ownershipFrontier(round,{retentionFloor}));
  for(const value of [null,undefined,[],{},new Date(),{retentionFloor:.9,other:1},Object.create({retentionFloor:.9})])assert.throws(()=>ownershipFrontier(round,value));
  const ordinary=fixture(),nullRecord=Object.assign(Object.create(null),constraint);
  assert.deepEqual(ownershipFrontier(Object.assign(Object.create(null),round),nullRecord),ordinary);
  for(const brokenRound of [{...round,extra:1},{...round,quote:'250'},{...round,primaryCapital:-1},{...round,holderStake:1.01},{...round,basis:'post',quote:25}])assert.throws(()=>ownershipFrontier(brokenRound,constraint));
});

test('constraint and option accessors, symbols and nonenumerable fields never execute or disappear',()=>{
  let called=false;const getter=()=>{called=true;return .9;};
  const badConstraint={};Object.defineProperty(badConstraint,'retentionFloor',{get:getter,enumerable:true});
  assert.throws(()=>ownershipFrontier(round,badConstraint));assert.equal(called,false);
  const badOption={round};Object.defineProperty(badOption,'ownership',{get:getter,enumerable:true});
  assert.throws(()=>financingAnalysis(assumptions,badOption));assert.equal(called,false);
  const hidden={};Object.defineProperty(hidden,'retentionFloor',{value:.9,enumerable:false});
  assert.throws(()=>ownershipFrontier(round,hidden));
  assert.throws(()=>ownershipFrontier(round,{...constraint,[Symbol('secret')]:1}));
  assert.throws(()=>financingAnalysis(assumptions,{round,ownership:undefined}));
  assert.throws(()=>financingAnalysis(assumptions,{round,ownership:null}));
  assert.throws(()=>financingAnalysis(assumptions,{round,unexpected:true}));
});

test('returned ownership records are detached and every numerical output remains finite',()=>{
  const suppliedRound={...round},suppliedFloor={...constraint},result=ownershipFrontier(suppliedRound,suppliedFloor);
  result.constraint.retentionFloor=.5;result.graph.points[0].primaryCapital=999;
  assert.deepEqual(suppliedRound,round);assert.deepEqual(suppliedFloor,constraint);
  const walk=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const nested of Object.values(value))walk(nested);};
  for(const input of [fixture(),fixture({basis:'post'}),fixture({quote:1e12},{retentionFloor:.01}),fixture({quote:Number.MIN_VALUE,primaryCapital:0})])walk(input);
});

test('ownership API is optional and preserves exact legacy response results',async()=>{
  const legacy=await handleRequest(request(body())),extended=await handleRequest(request(body({ownership:constraint})));
  assert.equal(legacy.status,200);assert.equal(extended.status,200);
  const legacyBody=await legacy.json(),extendedBody=await extended.json(),{ownership,...remaining}=extendedBody.result;
  assert.deepEqual(legacyBody.result,financingLens(assumptions,{bridge,round}));assert.deepEqual(remaining,legacyBody.result);
  assert.deepEqual(ownership,fixture());assert.equal(extended.headers.get('cache-control'),'no-store');
});

test('ownership API rejects missing and unsupported fields without stale results',async()=>{
  const {bridge:omitted,...missingBridge}=body({ownership:constraint});
  for(const input of [missingBridge,body({ownership:null}),body({ownership:{retentionFloor:0}}),body({ownership:{retentionFloor:.9,cap:1}}),body({ownership:'0.9'}),body({ownership:constraint,extra:true})]){
    const response=await handleRequest(request(input));assert.equal(response.status,400);
    const result=await response.json();assert.equal(typeof result.error,'string');assert.equal(result.result,undefined);
  }
});

test('legacy schema1 financing tokens preserve their original ordered payload',()=>{
  const input=snapshot(),expected={schema:1,financing:FINANCING_VERSION,model:MODEL_VERSION,date:VALUATION_DATE,case:encodeScenario(input.case),round:input.round};
  const token=encodeFinancing(input);assert.equal(token,pack(expected));assert.deepEqual(decodeFinancing(token),input);
  assert.equal(Object.hasOwn(decodeFinancing(token),'ownership'),false);
});

test('schema2 preserves exact ownership input alongside all legacy fields',()=>{
  const input={...snapshot(),ownership:{retentionFloor:.9123456789012345}},token=encodeFinancing(input),payload=unpack(token);
  assert.equal(payload.schema,2);assert.equal(payload.ownershipVersion,OWNERSHIP_VERSION);
  assert.deepEqual(Object.keys(payload),['schema','financing','model','date','case','round','ownership','ownershipVersion']);
  const restored=decodeFinancing(token);assert.deepEqual(restored,input);
  restored.ownership.retentionFloor=.8;assert.equal(input.ownership.retentionFloor,.9123456789012345);
  const url=new URL(financingUrl('https://example.com/demo/index.html?ignore=1#old',input));
  assert.equal(url.search,'');assert.deepEqual(decodeFinancing(url.hash.slice(11)),input);
});

test('schema2 rejects absent, extra, malformed and mismatched ownership metadata',()=>{
  const input={...snapshot(),ownership:constraint},payload=unpack(encodeFinancing(input));
  const {ownership:omitted,...withoutOwnership}=payload,{ownershipVersion:omittedVersion,...withoutVersion}=payload;
  for(const value of [withoutOwnership,withoutVersion,{...payload,ownership:null},{...payload,ownership:{retentionFloor:.001}},{...payload,ownershipVersion:'2.0.0'},{...payload,financing:'2.0.0'},{...payload,schema:1},{...payload,schema:3},{...payload,extra:true}])assert.throws(()=>decodeFinancing(pack(value)));
  for(const ownership of [null,undefined,[],{},Object.create(constraint)])assert.throws(()=>normalizeFinancing({...snapshot(),ownership}));
  let called=false;const fake={...snapshot()};Object.defineProperty(fake,'ownership',{get(){called=true;return constraint;},enumerable:true});
  assert.throws(()=>normalizeFinancing(fake));assert.equal(called,false);
});
