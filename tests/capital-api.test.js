import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../lib/http.js';
import {createAppServer} from '../server.js';
import {APP_VERSION} from '../public/lib/release.js';
import {capitalStrategy} from '../public/lib/capital-strategy.js';

const assumptions={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const snapshot=()=>({company:'Anthropic',scenarios:[
  {id:'perpetual',label:'Perpetual case',assumptions:{...assumptions},continuationYears:null},
  {id:'finite',label:'Ten years · 有限',assumptions:{...assumptions},continuationYears:10}
],plans:[{id:'a',label:'Smaller round',basis:'pre',quote:250,primaryCapital:25},{id:'b',label:'More capital',basis:'pre',quote:300,primaryCapital:35}],policy:{capitalTarget:25,retentionFloor:.88,modelCoverageFloor:1,holderStake:.1},bridge:{cash:20,debt:5,otherClaims:0}});
const request=payload=>new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});

test('capital API carries the complete exact submitted decision calculation and finite continuation',async()=>{
  const s=snapshot();
  const response=await handleRequest(request({action:'capital',snapshot:s}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(await response.json(),{appVersion:APP_VERSION,modelVersion:'3.0.0',valuationDate:'2026-10-18',result:capitalStrategy(s)});
});

test('capital API preserves absent bridge, negative residual and no-eligible-plan outcomes',async()=>{
  const absent=snapshot();absent.bridge=null;
  const negative=snapshot();negative.bridge.debt=1000;
  const noPlan=snapshot();noPlan.policy.capitalTarget=30;noPlan.policy.retentionFloor=.9;
  for(const s of [absent,negative,noPlan]){
    const response=await handleRequest(request({action:'capital',snapshot:s}));
    assert.equal(response.status,200);
    const {result}=await response.json();
    assert.deepEqual(result,capitalStrategy(s));
    assert.ok(!JSON.stringify(result).includes('Infinity'));
    if(s.bridge===null)assert.equal(result.comparison.minimax.status,'unavailable');
    if(s.bridge?.debt===1000)assert.ok(result.matrix.every(cell=>cell.existingCohortAllocation<0));
    if(s.policy.retentionFloor===.9)assert.equal(result.comparison.minimax.status,'no-eligible-plans');
  }
});

test('capital API rejects unexpected envelope fields and incomplete or invalid snapshots',async()=>{
  const s=snapshot();
  const invalid=[
    {action:'capital'}, {action:'capital',snapshot:null},
    {action:'capital',snapshot:s,decision:{rationale:'Do not submit analyst prose.'}},
    {action:'capital',snapshot:s,assumptions},
    {action:'capital',snapshot:{...s,probabilities:[.5,.5]}},
    {action:'capital',snapshot:{...s,scenarios:[]}},
    {action:'capital',snapshot:{...s,plans:[]}},
    {action:'capital',snapshot:{...s,policy:{...s.policy,retentionFloor:'0.9'}}},
    {action:'capital',snapshot:{...s,bridge:{cash:20,debt:5}}},
    {action:'capital',snapshot:{...s,scenarios:[{...s.scenarios[0],continuationYears:1.5}]}},
    {action:'capital',snapshot:{...s,scenarios:[{...s.scenarios[0],assumptions:{...assumptions,wacc:.03}}]}},
    JSON.parse(JSON.stringify({action:'capital',snapshot:s}).replace('"company":','"__proto__":{"polluted":true},"company":'))
  ];
  for(const payload of invalid){
    const response=await handleRequest(request(payload));
    assert.equal(response.status,400,JSON.stringify(payload));
    assert.equal(typeof (await response.json()).error,'string');
  }
  assert.equal({}.polluted,undefined);
});

test('capital rejects malformed UTF-8 and streamed bodies above the existing byte limit',async()=>{
  const invalidUtf8=new Uint8Array([123,34,97,34,58,34,0xc3,0x28,34,125]);
  const bad=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:invalidUtf8}));
  assert.equal(bad.status,400);
  const chunks=[new TextEncoder().encode('{"action":"capital","padding":"'),new Uint8Array(16384).fill(97),new TextEncoder().encode('"}')];
  let cancelled=false;
  const stream=new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift());else controller.close();},cancel(){cancelled=true;}});
  const large=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'}));
  assert.equal(large.status,413);assert.equal(cancelled,true);
  const media=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'capital',snapshot:snapshot()})}));
  assert.equal(media.status,415);
});

test('capital maximum case and plan counts fit the bounded API and preserve all 54 cells',async()=>{
  const s=snapshot();
  s.scenarios=Array.from({length:9},(_,i)=>({...s.scenarios[0],id:`case-${i}`,label:`Case ${i}`,assumptions:{...assumptions,g1:.04+i*.001},continuationYears:i%2?i:null}));
  s.plans=Array.from({length:6},(_,i)=>({...s.plans[0],id:`plan-${i}`,label:`Plan ${i}`,quote:250+i*10,primaryCapital:25+i}));
  const payload={action:'capital',snapshot:s};
  assert.ok(new TextEncoder().encode(JSON.stringify(payload)).length<16384);
  const response=await handleRequest(request(payload));assert.equal(response.status,200);
  const {result}=await response.json();assert.equal(result.matrix.length,54);
  assert.equal(result.comparison.crossovers.length,15);
  assert.deepEqual(result,capitalStrategy(s));
});

test('capital travels through real concurrent HTTP requests without mixing input snapshots',async()=>{
  const server=createAppServer();
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint=`http://127.0.0.1:${server.address().port}/api/valuation`;
    const inputs=[snapshot(),snapshot()];inputs[1].company='OpenAI';inputs[1].policy.retentionFloor=.95;inputs[1].bridge=null;
    const outputs=await Promise.all(inputs.map(async s=>{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'capital',snapshot:s})});
      assert.equal(response.status,200);return response.json();
    }));
    for(let i=0;i<inputs.length;i++)assert.deepEqual(outputs[i].result,capitalStrategy(inputs[i]));
    assert.equal(outputs[0].result.snapshot.company,'Anthropic');assert.equal(outputs[1].result.snapshot.bridge,null);
  }finally{if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});
