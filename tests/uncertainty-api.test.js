import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleRequest} from '../lib/http.js';
import {createAppServer} from '../server.js';
import {APP_VERSION} from '../public/lib/release.js';
import {project} from '../public/lib/model.js';
import {simulateValuation,UNCERTAINTY_LIMITS} from '../public/lib/uncertainty.js';

const presets=JSON.parse(await readFile(new URL('../data/presets.json',import.meta.url),'utf8'));
const base=presets.OpenAI.Base;
const spec=()=>({assumptions:{...base},bridge:null,drivers:[
  {key:'growth',distribution:{type:'triangular',min:.7,mode:1,max:1.3}},
  {key:'m36',distribution:{type:'triangular',min:.19,mode:.25,max:.31}},
  {key:'wacc',distribution:{type:'normal',mean:.125,sd:.015,min:.095,max:.155}},
  {key:'tg',distribution:{type:'triangular',min:.02,mode:.03,max:.04}}
],correlation:[[1,.4,0,0],[.4,1,0,0],[0,0,1,.3],[0,0,.3,1]],draws:2000,seed:20261018,hurdle:300});
const request=payload=>new Request('http://127.0.0.1/api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
let server,origin;
before(async()=>{server=createAppServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});

test('simulate returns the complete library result in the standard envelope over real HTTP',async()=>{
  const s=spec();
  const response=await fetch(`${origin}/api/valuation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'simulate',...s})});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const text=await response.text(),body=JSON.parse(text);
  assert.deepEqual(Object.keys(body),['appVersion','modelVersion','valuationDate','result']);
  assert.equal(body.appVersion,APP_VERSION);
  // Same seed, same bits: the serialized result equals the in-process library result.
  assert.equal(JSON.stringify(body.result),JSON.stringify(simulateValuation(s)));
  assert.equal(body.result.base.value,project(base).ev);
  assert.ok(!text.includes('Infinity')&&!text.includes('NaN'));
});

test('a repeated request with the same seed is identical and the hurdle is optional',async()=>{
  const s=spec();delete s.hurdle;
  const first=await (await handleRequest(request({action:'simulate',...s}))).json();
  const second=await (await handleRequest(request({action:'simulate',...s}))).json();
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.equal(first.result.hurdle,null);
});

test('simulate enforces draw, matrix and field limits with HTTP 400',async()=>{
  const cases=[
    [s=>{s.draws=UNCERTAINTY_LIMITS.maxDraws+1;},/Draws/],
    [s=>{s.draws=UNCERTAINTY_LIMITS.minDraws-1;},/Draws/],
    [s=>{s.draws='2000';},/Draws/],
    [s=>{s.seed=2**32;},/Seed/],
    [s=>{s.correlation=Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>i===j?1:0));},/exactly 4/],
    [s=>{s.drivers=[...s.drivers,...s.drivers.slice(0,2)];s.correlation=null;},/1–5/],
    [s=>{s.correlation=[[1,.9,-.9,0],[.9,1,.9,0],[-.9,.9,1,0],[0,0,0,1]];},/positive semidefinite/],
    [s=>{s.correlation[1][0]=.5;},/symmetric/],
    [s=>{s.drivers[0].distribution.type='lognormal';},/type/],
    [s=>{s.debug=true;},/Unknown request field: debug/],
    [s=>{delete s.correlation;},/require action, assumptions/],
    [s=>{delete s.bridge;},/require action, assumptions/],
    [s=>{s.drivers=[{key:'dilution',distribution:{type:'uniform',min:0,max:.1}}];s.correlation=null;},/bridge/]
  ];
  for(const [change,pattern] of cases){
    const s=spec();change(s);
    const response=await handleRequest(request({action:'simulate',...s}));
    assert.equal(response.status,400,pattern.source);
    assert.match((await response.json()).error,pattern);
  }
});

test('the 16 KiB streamed body limit still applies to simulation requests',async()=>{
  const s=spec();s.drivers[0].label='x'.repeat(17000);
  const response=await fetch(`${origin}/api/valuation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'simulate',...s})});
  assert.equal(response.status,413);
});

test('the largest permitted simulation completes within the hosting time budget',async()=>{
  const s=spec();s.draws=UNCERTAINTY_LIMITS.maxDraws;
  s.drivers.push({key:'dilution',distribution:{type:'triangular',min:0,mode:.02,max:.08}});
  s.bridge={cash:20,debt:5,otherClaims:0};
  s.correlation=[[1,.4,0,0,0],[.4,1,0,0,0],[0,0,1,.3,0],[0,0,.3,1,0],[0,0,0,0,1]];
  const started=performance.now(),response=await handleRequest(request({action:'simulate',...s})),seconds=(performance.now()-started)/1000;
  assert.equal(response.status,200);
  const {result}=await response.json();
  assert.equal(result.measure,'equity-after-dilution');
  assert.equal(result.convergence.stability.p50.length,5);
  // The deployed function allows 10 s; this bound leaves room for slower hosts.
  assert.ok(seconds<6,`${seconds.toFixed(2)} s`);
});
