import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../public/lib/model.js';
import {handleRequest} from '../lib/http.js';
import {createAppServer} from '../server.js';
import {APP_VERSION} from '../public/lib/release.js';
import presets from '../data/presets.json' with {type:'json'};

// Import dynamically so the first red run explains the absent contract.
const financing=await import('../public/lib/financing.js').catch(()=>({}));
const lens=(...args)=>{
  assert.equal(typeof financing.financingLens,'function','The shared Financing Lens calculation is required.');
  return financing.financingLens(...args);
};
const fixture={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const round={basis:'pre',quote:150,primaryCapital:30,holderStake:.1};
const bridge={cash:20,debt:5,otherClaims:3};
const close=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=1e-10+1e-12*Math.abs(expected),`${actual} != ${expected}`);
const payload=(overrides={})=>({action:'financing',assumptions:fixture,bridge,round,...overrides});
const request=body=>new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('priced primary round matches independent issued-share arithmetic',()=>{
  const r=lens(fixture,{bridge,round}),p=r.pricing;
  assert.equal(financing.FINANCING_VERSION,'1.0.0');
  assert.equal(financing.FINANCING_MAX_AMOUNT,1e12);
  assert.equal(r.version,'1.0.0');assert.deepEqual(r.baseline,project(fixture));
  // With 100 old shares priced at 1.5, 30 buys 20 new shares.
  assert.equal(p.preMoney,150);assert.equal(p.postMoney,180);
  assert.equal(p.primaryCapital,30);
  close(p.existingOwnership,100/120);close(p.newOwnership,20/120);
  close(p.holderBefore,10/100);close(p.holderAfter,10/120);
  close(p.otherExistingAfter,90/120);close(p.holderDilution,1/60);
  close(p.relativeDilution,1/6);
  close(p.holderValueBefore,15);close(p.holderValueAfter,15);
  assert.equal(p.holderValueBefore,p.holderValueAfter,'The same-price paper mark is algebraically unchanged.');
});

test('cash and ownership reconcile without making primary capital operating value',()=>{
  const r=lens(fixture,{bridge,round}),c=r.comparison,v=project(fixture).ev;
  close(r.bridge.equityValue,v+12);close(c.modelPreMoneyEquity,v+12);
  close(c.modelPostMoneyEquity,v+42);
  assert.equal(c.cashBefore,20);assert.equal(c.cashAfter,50);
  assert.equal(c.operatingEvBefore,v);assert.equal(c.operatingEvAfter,v);
  assert.equal(c.roundImpliedOperatingEv,138);
  close(c.roundImpliedOperatingEv,r.pricing.postMoney-c.cashAfter+bridge.debt+bridge.otherClaims);
  close(c.priceGap,150-(v+12));close(c.priceGapPercent,(150-(v+12))/(v+12));
  close(r.pricing.holderAfter+r.pricing.otherExistingAfter+r.pricing.newOwnership,1);
  assert.deepEqual(r.method,{basis:'simple-primary-equity-round',operatingValue:'perpetual-fcff',proceeds:'retained-as-cash',fees:0,rights:'equal-participating',bridgeStatus:'hypothetical'});
  assert.deepEqual(r.warnings,[]);
});

test('equivalent pre-money and post-money entries produce the same economic result',()=>{
  const pre=lens(fixture,{bridge,round});
  const post=lens(fixture,{bridge,round:{...round,basis:'post',quote:180}});
  assert.deepEqual(pre.pricing,post.pricing);assert.deepEqual(pre.comparison,post.comparison);
  assert.equal(pre.round.basis,'pre');assert.equal(post.round.basis,'post');
  assert.equal(post.round.quote,180);
});

test('no supplied bridge leaves model equity and quoted-round comparison unavailable',()=>{
  for(const options of [{round},{round,bridge:null}]){
    const r=lens(fixture,options);
    assert.equal(r.bridge,null);assert.equal(r.comparison,null);
    assert.equal(r.method.bridgeStatus,'not-supplied');assert.deepEqual(r.warnings,[]);
    assert.equal(r.pricing.postMoney,180);assert.deepEqual(r.baseline,project(fixture));
  }
  const zero=lens(fixture,{round,bridge:{cash:0,debt:0,otherClaims:0}});
  assert.equal(zero.comparison.modelPreMoneyEquity,zero.baseline.ev);
  assert.equal(zero.method.bridgeStatus,'hypothetical');
});

test('zero primary capital and endpoint ownership preserve holders exactly',()=>{
  for(const basis of ['pre','post'])for(const holderStake of [0,.1,1]){
    const r=lens(fixture,{bridge,round:{basis,quote:150,primaryCapital:0,holderStake}});
    assert.equal(r.pricing.preMoney,150);assert.equal(r.pricing.postMoney,150);
    assert.equal(r.pricing.existingOwnership,1);assert.equal(r.pricing.newOwnership,0);
    assert.equal(r.pricing.holderAfter,holderStake);assert.equal(r.pricing.holderDilution,0);
    assert.equal(r.pricing.relativeDilution,0);assert.equal(r.comparison.cashAfter,bridge.cash);
    assert.equal(r.comparison.modelPostMoneyEquity,r.comparison.modelPreMoneyEquity);
  }
});

test('signed model equity is retained without a misleading price-gap percentage',()=>{
  const r=lens(presets.OpenAI.Bear,{bridge:{cash:0,debt:20,otherClaims:5},round});
  assert.ok(r.baseline.ev<0);assert.ok(r.comparison.modelPreMoneyEquity<0);
  assert.equal(r.comparison.priceGapPercent,null);
  assert.ok(r.comparison.modelPostMoneyEquity<r.comparison.modelPreMoneyEquity+30.000000001);
  assert.match(r.warnings.join(' '),/nonpositive.*not a share price/i);
  close(r.pricing.newOwnership,1/6);
  const exactZero={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const zero=lens(exactZero,{bridge:{cash:0,debt:0,otherClaims:0},round});
  assert.equal(zero.comparison.modelPreMoneyEquity,0);
  assert.equal(zero.comparison.priceGapPercent,null);
});

test('an overflowing price-gap percentage remains unavailable without erasing the dollar gap',()=>{
  const tiny={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const r=lens(tiny,{bridge:{cash:Number.MIN_VALUE,debt:0,otherClaims:0},round});
  assert.equal(r.comparison.modelPreMoneyEquity,Number.MIN_VALUE);
  assert.equal(r.comparison.priceGap,150);
  assert.equal(r.comparison.priceGapPercent,null);
  assert.match(r.warnings.join(' '),/percentage exceeds the supported numeric range/i);
});

test('changing the primary raise alone preserves operating EV and quoted pre-money gap',()=>{
  const small=lens(fixture,{bridge,round:{...round,primaryCapital:5}});
  const large=lens(fixture,{bridge,round:{...round,primaryCapital:75}});
  assert.equal(small.comparison.operatingEvAfter,large.comparison.operatingEvAfter);
  assert.equal(small.comparison.roundImpliedOperatingEv,large.comparison.roundImpliedOperatingEv);
  assert.equal(small.comparison.priceGap,large.comparison.priceGap);
  close(large.comparison.modelPostMoneyEquity-small.comparison.modelPostMoneyEquity,70);
  close(large.comparison.cashAfter-small.comparison.cashAfter,70);
  assert.ok(large.pricing.holderAfter<small.pricing.holderAfter);
  assert.equal(large.pricing.holderValueAfter,small.pricing.holderValueAfter);
});

test('scaling every dollar amount preserves ownership and scales values consistently',()=>{
  const base=lens(fixture,{bridge,round}),scale=2.5;
  const scaled=lens({...fixture,rev2026:fixture.rev2026*scale,stub:fixture.stub*scale},{
    bridge:Object.fromEntries(Object.entries(bridge).map(([key,value])=>[key,value*scale])),
    round:{...round,quote:round.quote*scale,primaryCapital:round.primaryCapital*scale}
  });
  for(const key of ['existingOwnership','newOwnership','holderBefore','holderAfter','otherExistingAfter','holderDilution','relativeDilution'])close(scaled.pricing[key],base.pricing[key]);
  for(const key of ['modelPreMoneyEquity','modelPostMoneyEquity','cashBefore','cashAfter','operatingEvBefore','operatingEvAfter','roundImpliedOperatingEv','priceGap'])close(scaled.comparison[key],base.comparison[key]*scale);
  close(scaled.comparison.priceGapPercent,base.comparison.priceGapPercent);
});

test('tiny ownership and dilution use direct fractions without subtractive cancellation',()=>{
  const r=lens(fixture,{round:{...round,quote:1e12,primaryCapital:.0001,holderStake:.2}});
  assert.ok(r.pricing.newOwnership>0);assert.ok(r.pricing.holderDilution>0);
  assert.equal(r.pricing.holderDilution,.2*r.pricing.newOwnership);
  const tinyOld=lens(fixture,{round:{...round,quote:.0001,primaryCapital:1e12,holderStake:.2}});
  assert.ok(tinyOld.pricing.existingOwnership>0);assert.ok(tinyOld.pricing.holderAfter>0);
});

test('round fields reject invalid domains and precision-limited post-money residuals',()=>{
  const invalid=[
    {...round,basis:'equity'}, {...round,quote:0}, {...round,quote:-1},
    {...round,quote:1e12+1}, {...round,quote:'150'}, {...round,quote:Infinity},
    {...round,primaryCapital:-1}, {...round,primaryCapital:1e12+1},
    {...round,primaryCapital:NaN}, {...round,primaryCapital:null},
    {...round,holderStake:-.1}, {...round,holderStake:1.01}, {...round,holderStake:undefined},
    {...round,holderStake:'0.1'}, {...round,basis:'post',quote:30},
    {...round,basis:'post',quote:20}, {...round,extra:1}
  ];
  for(const bad of invalid)assert.throws(()=>lens(fixture,{bridge,round:bad}));
  assert.throws(()=>lens(fixture,{round:{...round,basis:'post',quote:1e12,primaryCapital:1e12-.001}}),/precision/i);
  assert.throws(()=>lens(fixture,{round:{...round,quote:Number.MIN_VALUE,primaryCapital:1e12}}),/precision/i);
  assert.throws(()=>lens(fixture,{round:{...round,quote:1e12,primaryCapital:Number.MIN_VALUE}}),/precision/i);
  const max=lens(fixture,{round:{...round,quote:1e12,primaryCapital:1e12}});
  assert.equal(max.pricing.postMoney,2e12);assert.equal(max.pricing.newOwnership,.5);
});

test('plain records are exact own enumerable data without invoking accessors',()=>{
  let accessed=false;
  const get=(record,key)=>Object.defineProperty({...record},key,{enumerable:true,get(){accessed=true;throw new Error('Getter must not run.');}});
  const hidden=(record,key)=>Object.defineProperty({...record},key,{value:record[key],enumerable:false});
  for(const bad of [get(fixture,'tax'),hidden(fixture,'tax'),Object.create(fixture),{...fixture,[Symbol('x')]:1},{...fixture,unknown:1},null,[]])assert.throws(()=>lens(bad,{round}));
  for(const bad of [get(round,'quote'),hidden(round,'quote'),Object.create(round),{...round,[Symbol('x')]:1},null,[]])assert.throws(()=>lens(fixture,{round:bad}));
  for(const bad of [get(bridge,'cash'),hidden(bridge,'cash'),Object.create(bridge),{...bridge,[Symbol('x')]:1},{...bridge,extra:1},[],undefined])assert.throws(()=>lens(fixture,{bridge:bad,round}));
  for(const bad of [get({bridge,round},'round'),Object.create({round}),{round,[Symbol('x')]:1},{round,extra:1},{},null,[]])assert.throws(()=>lens(fixture,bad));
  assert.equal(accessed,false);
  const polluted=JSON.parse('{"cash":0,"debt":0,"otherClaims":0,"__proto__":{"polluted":true}}');
  assert.throws(()=>lens(fixture,{bridge:polluted,round}));assert.equal({}.polluted,undefined);
});

test('inputs are detached, immutable callers work, and zeroes retain JSON parity',()=>{
  const a=Object.freeze({...fixture}),b=Object.freeze({...bridge}),r=Object.freeze({...round});
  const one=lens(a,Object.freeze({bridge:b,round:r})),two=lens(a,{bridge:b,round:r});
  assert.deepEqual(one,two);one.assumptions.g1=2;one.round.quote=1;one.bridge.cash=1;
  assert.equal(a.g1,.04);assert.equal(r.quote,150);assert.equal(b.cash,20);
  assert.deepEqual(two,lens(a,{bridge:b,round:r}));
  const nullRecord=Object.assign(Object.create(null),fixture);
  assert.deepEqual(lens(nullRecord,{round}),lens(fixture,{round}));
  const negativeZero=lens(fixture,{bridge:{cash:-0,debt:-0,otherClaims:-0},round:{...round,primaryCapital:-0,holderStake:-0}});
  assert.deepEqual(JSON.parse(JSON.stringify(negativeZero)),negativeZero);
});

test('invalid bridge values and nonfinite model results are rejected',()=>{
  for(const bad of [{...bridge,cash:-1},{...bridge,cash:10001},{...bridge,debt:'5'},{...bridge,otherClaims:null},{cash:0,debt:0}])assert.throws(()=>lens(fixture,{bridge:bad,round}));
  assert.throws(()=>lens({...fixture,wacc:Number.MIN_VALUE,tg:0},{round}),/numeric range/);
});

test('financing API preserves full deterministic results and release metadata',async()=>{
  const response=await handleRequest(request(payload()));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const body=await response.json();
  assert.equal(body.appVersion,APP_VERSION);assert.equal(body.modelVersion,'3.0.0');assert.equal(body.valuationDate,'2026-10-18');
  assert.deepEqual(body.result,lens(fixture,{bridge,round}));
  const noBridge=await handleRequest(request(payload({bridge:null})));
  assert.equal(noBridge.status,200);assert.equal((await noBridge.json()).result.comparison,null);
});

test('financing API requires exact fields and returns domain errors without results',async()=>{
  const {bridge:omitted,...missingBridge}=payload(),{round:omittedRound,...missingRound}=payload();
  const invalid=[missingBridge,missingRound,payload({extra:1}),payload({round:{...round,basis:'post',quote:25}}),payload({round:{...round,basis:'post',quote:1e12,primaryCapital:1e12-.001}}),payload({bridge:{...bridge,extra:1}}),payload({assumptions:{...fixture,unknown:1}})];
  for(const item of invalid){
    const response=await handleRequest(request(item));assert.equal(response.status,400);
    const body=await response.json();assert.equal(typeof body.error,'string');assert.equal(body.result,undefined);
  }
});

test('financing retains bounded JSON media and malformed-body protections',async()=>{
  const huge=await handleRequest(request(payload({padding:'x'.repeat(20000)})));assert.equal(huge.status,413);
  const wrongMedia=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload())}));assert.equal(wrongMedia.status,415);
  const malformed=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"financing",'}));assert.equal(malformed.status,400);
});

test('real HTTP financing requests stay detached across simultaneous rounds',async()=>{
  const server=createAppServer();
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint=`http://127.0.0.1:${server.address().port}/api/valuation`;
    const results=await Promise.all([10,75].map(async primaryCapital=>{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload({round:{...round,primaryCapital}}))});
      assert.equal(response.status,200);return(await response.json()).result;
    }));
    assert.equal(results[0].round.primaryCapital,10);assert.equal(results[1].round.primaryCapital,75);
    assert.equal(results[0].comparison.operatingEvAfter,results[1].comparison.operatingEvAfter);
    assert.equal(results[0].comparison.roundImpliedOperatingEv,results[1].comparison.roundImpliedOperatingEv);
    assert.notEqual(results[0].pricing.holderAfter,results[1].pricing.holderAfter);
  }finally{
    if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
});
