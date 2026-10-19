import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../lib/http.js';
import {createAppServer} from '../server.js';
import {APP_VERSION} from '../public/lib/release.js';

const fixture={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
const request=payload=>new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});

test('horizon API retains the complete explicit forecast at zero continuation years',async()=>{
  const response=await handleRequest(request({action:'horizon',assumptions:fixture,years:0,target:null}));
  assert.equal(response.status,200);
  const {result}=await response.json();
  assert.equal(result.curve.length,101);
  assert.equal(result.selected.years,0);
  assert.equal(result.selected.throughYear,2036);
  assert.equal(result.selected.retainedTerminalPv,0);
  assert.ok(Math.abs(result.selected.ev-95.30897626660156)<1e-8);
  assert.equal(result.baseline.rows.length,10);
});

test('horizon API returns a directly summed growing annuity and separate terminal tail',async()=>{
  const response=await handleRequest(request({action:'horizon',assumptions:fixture,years:10,target:150}));
  assert.equal(response.status,200);
  const {result:r}=await response.json();
  let retained=0;
  for(let n=1;n<=10;n++) retained+=r.baseline.terminal_fcf*(1+fixture.tg)**(n-1)/(1+fixture.wacc)**n*r.baseline.rows.at(-1).df;
  assert.ok(Math.abs(r.selected.retainedTerminalPv-retained)<1e-8);
  assert.ok(Math.abs(r.selected.ev-(95.30897626660156+retained))<1e-8);
  assert.ok(Math.abs(r.selected.retainedTerminalPv+r.selected.excludedTerminalPv-r.baseline.pvtv)<1e-8);
  assert.equal(r.capture.length,4);
  assert.equal(r.capture.find(x=>x.fraction===.9).years,36);
  assert.equal(r.targetRequirement.status,'finite');
  assert.ok(r.targetRequirement.previousEv<150);
  assert.ok(r.targetRequirement.ev>=150);
});

test('horizon API distinguishes target absence, explicit, asymptotic and unreachable results',async()=>{
  let response=await handleRequest(request({action:'horizon',assumptions:fixture,years:10}));
  assert.equal(response.status,200);
  const baseline=(await response.json()).result.baseline;
  for(const [target,status] of [[null,null],[50,'explicit'],[baseline.ev,'asymptotic'],[baseline.ev+1,'unreachable']]){
    response=await handleRequest(request({action:'horizon',assumptions:fixture,years:10,target}));
    assert.equal(response.status,200);
    const r=(await response.json()).result;
    assert.equal(r.targetRequirement?.status??null,status);
  }
});

test('horizon API rejects out-of-domain years, targets, unknown fields and invalid assumptions',async()=>{
  const valid={action:'horizon',assumptions:fixture,years:10,target:null};
  const {years,...missing}=valid;
  for(const payload of [missing,{...valid,years:-1},{...valid,years:101},{...valid,years:1.5},
    {...valid,years:'10'},{...valid,years:true},{...valid,years:null},
    {...valid,target:0},{...valid,target:-1},{...valid,target:'150'},{...valid,target:1e12+1},
    {...valid,extra:1},{...valid,assumptions:{...fixture,wacc:.03}},
    {...valid,assumptions:{...fixture,unknown:1}},{...valid,assumptions:{...fixture,tax:null}}]){
    const response=await handleRequest(request(payload));
    assert.equal(response.status,400,JSON.stringify(payload));
    assert.equal(typeof (await response.json()).error,'string');
  }
});

test('horizon requests share the existing 16 KiB, media and malformed-JSON boundaries',async()=>{
  const huge=await handleRequest(request({action:'horizon',assumptions:fixture,years:10,target:null,padding:'x'.repeat(20000)}));
  assert.equal(huge.status,413);
  const media=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}));
  assert.equal(media.status,415);
  for(const body of ['{"action":"horizon","target":NaN}','{"action":"horizon","target":Infinity}','[]','null','{"action":']){
    const response=await handleRequest(new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body}));
    assert.equal(response.status,400);
  }
});

test('horizon API does not serialize nonfinite projections and preserves zero terminal PV',async()=>{
  const overflow=await handleRequest(request({action:'horizon',assumptions:{...fixture,wacc:Number.MIN_VALUE,tg:0},years:100}));
  assert.equal(overflow.status,400);assert.match((await overflow.json()).error,/numeric range/);
  const tiny={...fixture,rev2026:Number.MIN_VALUE,g1:0,g2:0,g3:0,tg:0,m27:Number.MIN_VALUE,m30:Number.MIN_VALUE,m36:Number.MIN_VALUE,stub:0};
  const zero=await handleRequest(request({action:'horizon',assumptions:tiny,years:100,target:1}));
  assert.equal(zero.status,200);
  const result=(await zero.json()).result;
  assert.equal(result.selected.ev,0);assert.equal(result.selected.terminalPvFraction,null);
  assert.ok(result.capture.every(x=>x.status==='unavailable'));
  assert.equal(result.targetRequirement.status,'unreachable');
});

test('precision-limited target and capture boundaries are explicit successful API outcomes',async()=>{
  const response=await handleRequest(request({action:'horizon',assumptions:{...fixture,wacc:.6,tg:0},years:10,target:19.999341593234046}));
  assert.equal(response.status,200);
  const requirement=(await response.json()).result.targetRequirement;
  assert.equal(requirement.status,'precision_limit');assert.equal(requirement.years,null);
  assert.equal(requirement.withinChart,null);assert.match(requirement.reason,/precision/i);
  const captureResponse=await handleRequest(request({action:'horizon',assumptions:{...fixture,wacc:.5874010519681995,tg:0},years:10,target:null}));
  assert.equal(captureResponse.status,200);
  const capture=(await captureResponse.json()).result.capture.find(x=>x.fraction===.75);
  assert.equal(capture.status,'precision_limit');assert.equal(capture.years,null);
});

test('horizon travels through the real HTTP server and concurrent requests remain detached',async()=>{
  const server=createAppServer();
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const url=`http://127.0.0.1:${server.address().port}/api/valuation`;
    const results=await Promise.all([1,2].map(async scale=>{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'horizon',assumptions:{...fixture,rev2026:100*scale,stub:-3*scale},years:10,target:null})});
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      const payload=await response.json();
      assert.equal(payload.appVersion,APP_VERSION);assert.equal(payload.modelVersion,'3.0.0');assert.equal(payload.valuationDate,'2026-10-18');
      assert.equal(payload.result.baseline.rows.length,10);assert.equal(payload.result.curve.length,101);
      return payload.result;
    }));
    assert.ok(Math.abs(results[1].selected.ev/results[0].selected.ev-2)<1e-12);
    assert.equal(results[0].assumptions.rev2026,100);assert.equal(results[1].assumptions.rev2026,200);
  }finally{
    if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
});
