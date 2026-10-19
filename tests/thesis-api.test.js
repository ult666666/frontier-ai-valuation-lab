import test,{describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.js';
import {project} from '../public/lib/model.js';
import {APP_VERSION} from '../public/lib/release.js';
import presets from '../data/presets.json' with {type:'json'};

describe('Thesis Lab over the real HTTP route',()=>{
  let server,base;
  before(async()=>{server=createAppServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}`;});
  after(async()=>{if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
  const post=payload=>fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  async function success(payload){const response=await post(payload);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.appVersion,APP_VERSION);assert.equal(body.modelVersion,'3.0.0');assert.equal(body.valuationDate,'2026-10-18');return body.result;}

  test('attribute explains an isolated discounting change with complete endpoint projections',async()=>{
    const reference=presets.Anthropic.Base,alternative={...reference,wacc:reference.wacc+.02};
    const result=await success({action:'attribute',reference,alternative});
    assert.deepEqual(result.reference,{assumptions:reference,result:project(reference)});
    assert.deepEqual(result.alternative,{assumptions:alternative,result:project(alternative)});
    assert.equal(result.evDelta,project(alternative).ev-project(reference).ev);assert.equal(result.attribution.status,'ok');
    assert.equal(result.attribution.coalitions,64);assert.equal(result.attribution.orderings,720);
    for(const group of result.attribution.groups)assert.ok(Math.abs(group.contribution-(group.key==='continuation'?result.evDelta:0))<1e-8);
  });

  test('landscape returns direct grid values and a constructed target margin',async()=>{
    const assumptions=presets.OpenAI.Base,rates=[.10,.125,.15],margins=[.1,.2,.3,.4],target=project({...assumptions,m36:.27123456789}).ev;
    const result=await success({action:'landscape',assumptions,rates,margins,target});
    assert.deepEqual(result.assumptions,assumptions);assert.deepEqual(result.values,margins.map(m36=>rates.map(wacc=>project({...assumptions,m36,wacc}).ev)));
    const solution=result.frontier.find(point=>point.wacc===assumptions.wacc);assert.equal(solution.status,'solved');assert.ok(Math.abs(solution.margin-.27123456789)<1e-9);
    assert.ok(Math.abs(solution.ev-target)<1e-7);
  });

  test('valid negative values and invalid grid cells have different wire representations',async()=>{
    const assumptions=presets.OpenAI.Bear,result=await success({action:'landscape',assumptions,rates:[0,.16,.2],margins:[0,.12,.2],target:500});
    assert.equal(result.values[1][1],project(assumptions).ev);assert.ok(result.values[1][1]<0);
    assert.equal(result.values[0][1],null);assert.equal(result.values[1][0],null);assert.equal(typeof result.invalidReasons[0][1],'string');
    const comparison=await success({action:'attribute',reference:assumptions,alternative:presets.OpenAI.Base});assert.equal(comparison.evChangeRatio,null);
  });

  test('new envelopes reject extra fields, missing inputs and oversized axes without clipping',async()=>{
    const p=presets.Anthropic.Base,attribute={action:'attribute',reference:p,alternative:p},landscape={action:'landscape',assumptions:p,rates:[.1,.2],margins:[.1,.2],target:500};
    for(const payload of [{action:'attribute',reference:p},{...attribute,extra:true},{...attribute,alternative:{...p,other:1}},{...attribute,reference:{...p,wacc:.03,tg:.03}},{...landscape,extra:true},{...landscape,rates:[.1,.1]},{...landscape,margins:[.2]},{...landscape,target:0},{...landscape,target:'500'},{...landscape,rates:Array.from({length:22},(_,i)=>i/100)}]){
      const response=await post(payload);assert.equal(response.status,400,JSON.stringify(payload));assert.equal(typeof (await response.json()).error,'string');
    }
  });

  test('extreme unrepresentable active cases are rejected rather than serialized as null',async()=>{
    const p={...presets.Anthropic.Base,wacc:Number.MIN_VALUE,tg:0};
    for(const payload of [{action:'attribute',reference:p,alternative:presets.Anthropic.Base},{action:'landscape',assumptions:p,rates:[.1,.2],margins:[.1,.2],target:500}]){
      const response=await post(payload);assert.equal(response.status,400);assert.match((await response.json()).error,/numeric range/);
    }
  });

  test('new actions retain common content-type and request-size protections',async()=>{
    const payload={action:'attribute',reference:presets.Anthropic.Base,alternative:presets.Anthropic.Bull};
    assert.equal((await post({...payload,padding:'x'.repeat(17000)})).status,413);
    const response=await fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});assert.equal(response.status,415);
  });
});
