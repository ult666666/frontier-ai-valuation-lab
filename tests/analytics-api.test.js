import test, {describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.js';
import {APP_VERSION} from '../public/lib/release.js';

const fixture={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const assumptionsByCompany={Anthropic:{...fixture},OpenAI:{...fixture,rev2026:50,stub:-1.5}};
const shocks={growthPp:5,marginPp:2,waccPp:1,capitalEfficiencyPct:20};
function close(actual,expected) {assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}

describe('analytics over the real HTTP route',()=>{
  let server,base;
  before(async()=>{
    server=createAppServer();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base=`http://127.0.0.1:${server.address().port}`;
  });
  after(async()=>{if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
  async function post(payload) {
    return fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }
  async function success(payload) {
    const response=await post(payload);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    const body=await response.json();
    assert.equal(body.appVersion,APP_VERSION);
    assert.equal(body.modelVersion,'3.0.0');
    assert.equal(body.valuationDate,'2026-10-18');
    return body.result;
  }

  test('compare returns independently verified values, milestones, and signed composition',async()=>{
    const result=await success({action:'compare',assumptionsByCompany});
    close(result.companies.Anthropic.result.ev,200.31471864537804);
    close(result.companies.OpenAI.result.ev,100.15735932268902);
    close(result.companies.Anthropic.valueComposition.explicitForecast,98.2516021928676);
    assert.equal(result.companies.Anthropic.cumulativeBreakEvenYear,2027);
    assert.equal(result.companies.Anthropic.sustainedPositiveFcfYear,2027);
  });

  test('stress calculates the submitted joint transformation on both companies',async()=>{
    const result=await success({action:'stress',assumptionsByCompany,shocks});
    assert.deepEqual(result.shocks,shocks);
    close(result.stressed.companies.Anthropic.result.ev,217.74477181941938);
    close(result.changes.Anthropic.evDelta,17.430053174041348);
    close(result.changes.OpenAI.evChangeRatio,.08701334226417076);
    assert.equal(result.stressed.companies.Anthropic.assumptions.turns,3);
  });

  test('stress omission explicitly means all-zero shocks',async()=>{
    const result=await success({action:'stress',assumptionsByCompany});
    assert.deepEqual(result.shocks,{growthPp:0,marginPp:0,waccPp:0,capitalEfficiencyPct:0});
    assert.deepEqual(result.baseline,result.stressed);
  });

  test('drivers returns isolated fixed-size effects and unavailable boundary points',async()=>{
    const result=await success({action:'drivers',assumptions:fixture});
    assert.deepEqual(result.impacts.map(row=>row.key),['g1','m36','wacc','turns']);
    close(result.impacts[0].evDelta,31.35865384638919);
    close(result.impacts[2].evDelta,-25.746503921086173);
    const boundary=await success({action:'drivers',assumptions:{...fixture,wacc:.6}});
    assert.equal(boundary.impacts[2].result,null);
    assert.match(boundary.impacts[2].reason,/WACC/);
  });

  test('analytics request envelopes and nested inputs reject missing, extra and mistyped fields',async()=>{
    const bad=[
      {action:'compare'},
      {action:'compare',assumptionsByCompany:{Anthropic:fixture}},
      {action:'compare',assumptionsByCompany:{...assumptionsByCompany,Other:fixture}},
      {action:'compare',assumptionsByCompany,shocks},
      {action:'compare',assumptionsByCompany:{...assumptionsByCompany,OpenAI:{...fixture,tax:true}}},
      {action:'compare',assumptionsByCompany:{...assumptionsByCompany,OpenAI:{...fixture,extra:1}}},
      {action:'stress',assumptionsByCompany,shocks:null},
      {action:'stress',assumptionsByCompany,shocks:{growthPp:5}},
      {action:'stress',assumptionsByCompany,shocks:{...shocks,growthPp:'5'}},
      {action:'stress',assumptionsByCompany,shocks:{...shocks,marginPp:false}},
      {action:'stress',assumptionsByCompany,shocks:{...shocks,waccPp:6}},
      {action:'stress',assumptionsByCompany,shocks:{...shocks,extra:1}},
      {action:'stress',assumptionsByCompany,shocks,target:5},
      {action:'drivers',assumptions:fixture,target:5},
      {action:'drivers',assumptions:{...fixture,g1:null}}
    ];
    for (const payload of bad) {
      const response=await post(payload);
      assert.equal(response.status,400,JSON.stringify(payload));
      assert.equal(typeof (await response.json()).error,'string');
    }
    const malicious=JSON.parse(JSON.stringify({action:'compare',assumptionsByCompany}).replace('"Anthropic":','"__proto__":{"polluted":true},"Anthropic":'));
    const response=await post(malicious);assert.equal(response.status,400);
    assert.match((await response.json()).error,/__proto__/);
    assert.equal({}.polluted,undefined);
  });

  test('transformed assumption errors name the affected company without clipping',async()=>{
    const response=await post({action:'stress',assumptionsByCompany,shocks:{...shocks,growthPp:-20}});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/Anthropic:.*growth/);
  });

  test('signed baseline EV is preserved and its relative stress change is null',async()=>{
    const result=await success({action:'stress',assumptionsByCompany:{...assumptionsByCompany,Anthropic:{...fixture,stub:-1000}},shocks});
    close(result.baseline.companies.Anthropic.result.ev,-777.6179641837011);
    assert.ok(result.stressed.companies.Anthropic.result.ev<0);
    assert.equal(result.changes.Anthropic.evChangeRatio,null);
    assert.ok(Number.isFinite(result.changes.Anthropic.evDelta));
  });

  test('projection and analytics overflows are client errors rather than silent JSON nulls',async()=>{
    const overflow={...fixture,wacc:Number.MIN_VALUE,tg:0};
    const tiny={...fixture,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
    for (const payload of [
      {action:'compare',assumptionsByCompany:{Anthropic:overflow,OpenAI:fixture}},
      {action:'stress',assumptionsByCompany:{Anthropic:tiny,OpenAI:fixture},shocks:{growthPp:0,marginPp:2,waccPp:0,capitalEfficiencyPct:0}}
    ]) {
      const response=await post(payload);assert.equal(response.status,400);
      assert.match((await response.json()).error,/Anthropic:.*numeric range/);
    }
  });

  test('separate concurrent requests remain deterministic and stateless',async()=>{
    const values=await Promise.all([1,2,3].map(async factor=>{
      const result=await success({action:'compare',assumptionsByCompany:{Anthropic:{...fixture,rev2026:100*factor,stub:-3*factor},OpenAI:fixture}});
      return result.companies.Anthropic.result.ev;
    }));
    values.forEach((value,i)=>close(value,200.31471864537804*(i+1)));
  });

  test('analytics requests retain the common 16 KiB body limit and JSON media requirement',async()=>{
    let response=await post({action:'compare',assumptionsByCompany,padding:'x'.repeat(20000)});
    assert.equal(response.status,413);
    response=await fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'compare',assumptionsByCompany})});
    assert.equal(response.status,415);
  });
});
