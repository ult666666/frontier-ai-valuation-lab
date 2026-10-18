import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.js';

const assumptions={rev2026:100,g1:.04,g2:.04,g3:.04,m27:.2,m30:.2,m36:.2,turns:2.5,wacc:.1,tg:.03,roic:.2,stub:-3,tax:.25};
let server,base;
before(async()=>{ server=createAppServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}});
async function post(payload){return fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}

test('health identifies the deployed model without a private configuration leak',async()=>{
  const response=await fetch(base+'/api/health'); assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'ok',modelVersion:'3.0.0',valuationDate:'2026-10-18'});
});
test('real HTTP calculation agrees with the independent forecast fixture',async()=>{
  const response=await post({action:'value',assumptions});assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.modelVersion,'3.0.0');
  assert.ok(Math.abs(body.result.ev-200.31471864537804)<1e-8);assert.equal(body.result.rows.length,10);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('public model metadata returns six usable scenarios and dated sources',async()=>{
  const response=await fetch(base+'/api/valuation');assert.equal(response.status,200);
  const body=await response.json();assert.equal(Object.keys(body.presets).length,2);assert.ok(body.sources.length>5);
});
test('invalid inputs and unknown actions return a clear client error',async()=>{
  for(const payload of [{action:'value',assumptions:{...assumptions,turns:-1}},{action:'trade',assumptions},{action:'value',assumptions:{...assumptions,rev2026:null}},null,[]]){
    const response=await post(payload);assert.equal(response.status,400);assert.equal(typeof (await response.json()).error,'string');
  }
});
test('malformed JSON, unsupported media and oversized requests are rejected',async()=>{
  let r=await fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(r.status,400);
  r=await fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(r.status,415);
  r=await fetch(base+'/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'x'.repeat(20000)})});assert.equal(r.status,413);
});
test('method and path boundaries do not expose repository files',async()=>{
  let r=await fetch(base+'/api/valuation',{method:'DELETE'});assert.equal(r.status,405);
  r=await fetch(base+'/api/missing');assert.equal(r.status,404);
  for(const path of ['/package.json','/.env','/data/../../package.json','/%2e%2e%2fpackage.json']){
    r=await fetch(base+path);assert.ok([400,403,404].includes(r.status));
  }
});
test('server inverse calculation and matrix consume submitted assumptions',async()=>{
  const inverse=await (await post({action:'reverse',assumptions,target:200.31471864537804})).json();assert.equal(inverse.result.status,'solved');assert.ok(Math.abs(inverse.result.growth-.04)<1e-7);
  const grid=await (await post({action:'sensitivity',assumptions,rates:[.1,.12],growthRates:[.02,.03]})).json();assert.equal(grid.result.values.length,2);assert.ok(grid.result.values[1][1]<grid.result.values[0][1]);
});
