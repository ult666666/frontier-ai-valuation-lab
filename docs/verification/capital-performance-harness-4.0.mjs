/** Bounded local observations only. No network calls, product writes or SLA claims. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const workspace=path.dirname(root);
const rootDir=path.basename(root)==='qa-local'?workspace:root;
const inputPath=process.argv[2];
const outputPath=process.argv[3];
if(!inputPath||!outputPath)throw new Error('Supply fixture JSON and receipt paths.');
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('This observation requires Node.js24.');
const fixtures=JSON.parse(readFileSync(inputPath,'utf8'));
const files=['lib/http.js','public/lib/capital-strategy.js','public/lib/model.js','public/lib/horizon.js',
  'public/lib/financing.js','public/lib/ownership.js','public/lib/analytics.js','public/lib/thesis.js',
  'public/lib/release.js','data/presets.json','data/research.json','vercel.json',
  'scripts/verify_capital_http.py','scripts/check_capital_reference.py'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const sourceHashes=Object.fromEntries(files.map(file=>[file,digest(readFileSync(path.join(rootDir,file)))]));
const importStart=performance.now();
const {handleRequest}=await import(path.join(rootDir,'lib/http.js'));
const moduleImportObservationMs=performance.now()-importStart;
const monotonicStart=performance.now(),initialMemory=process.memoryUsage();
const warmupIterations=10,measuredIterations=40;
const summary=values=>{
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  return {count:n,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,
    p95NearestRank:sorted[Math.ceil(.95*n)-1],max:sorted.at(-1),min:sorted[0]};
};
const summarize=observations=>({elapsedMs:summary(observations.map(o=>o.elapsedMs)),
  processCpuMs:summary(observations.map(o=>o.processCpuMs))});
const observations=[];
for(const fixture of fixtures){
  const serialized=JSON.stringify(fixture.body),requestBytes=Buffer.byteLength(serialized,'utf8');
  const beforeWarmup=process.memoryUsage(),warmup=[],measured=[];
  let firstResponse=null;
  async function invoke(capture=false){
    const cpuStart=process.cpuUsage(),start=performance.now();
    const request=new Request('http://local.invalid/api/valuation',{method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':String(requestBytes)},body:serialized});
    const response=await handleRequest(request);
    const bytes=await response.arrayBuffer();
    const elapsedMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
    if(response.status!==200)throw new Error(`${fixture.name} rejected with ${response.status}: ${Buffer.from(bytes).toString('utf8')}`);
    if(capture){
      const result=JSON.parse(Buffer.from(bytes).toString('utf8'));
      firstResponse={status:response.status,bytes:bytes.byteLength,sha256:digest(Buffer.from(bytes)),
        appVersion:result.appVersion,modelVersion:result.modelVersion,valuationDate:result.valuationDate,
        scenarios:result.result.scenarios.length,plans:result.result.plans.length,
        allocations:result.result.matrix.length,crossovers:result.result.comparison.crossovers.length,
        crossoverStatuses:result.result.comparison.crossovers.reduce((out,c)=>(out[c.status]=(out[c.status]||0)+1,out),{})};
    }
    if(firstResponse&&bytes.byteLength!==firstResponse.bytes)throw new Error('A repeated deterministic response changed serialized length.');
    return {elapsedMs,processCpuMs:(cpu.user+cpu.system)/1000,responseBytes:bytes.byteLength};
  }
  for(let index=0;index<warmupIterations;index++)warmup.push(await invoke(index===0));
  const afterWarmup=process.memoryUsage();
  for(let index=0;index<measuredIterations;index++)measured.push(await invoke());
  const afterMeasured=process.memoryUsage();
  observations.push({name:fixture.name,fixtureSource:fixture.fixtureSource,derivation:fixture.derivation,
    snapshotSha256:digest(JSON.stringify(fixture.body.snapshot)),requestBytes,
    response:firstResponse,warmup:{iterations:warmupIterations,...summarize(warmup),observations:warmup},
    measured:{iterations:measuredIterations,...summarize(measured),observations:measured},
    memoryBytes:{beforeWarmup,afterWarmup,afterMeasured},osProcessHighWaterRssKiB:process.resourceUsage().maxRSS});
}
const endingMemory=process.memoryUsage();
const afterHashes=Object.fromEntries(files.map(file=>[file,digest(readFileSync(path.join(rootDir,file)))]));
const unchanged=JSON.stringify(sourceHashes)===JSON.stringify(afterHashes);
const configuration=JSON.parse(readFileSync(path.join(rootDir,'vercel.json'),'utf8'));
const configuredMaxDurationSeconds=configuration.functions['api/index.js'].maxDuration;
const maxObservedMs=Math.max(...observations.flatMap(c=>c.measured.observations.map(v=>v.elapsedMs)));
const maxRequestBytes=Math.max(...observations.map(c=>c.requestBytes));
const maxResponseBytes=Math.max(...observations.map(c=>c.response.bytes));
const receipt={schema:1,status:unchanged?'passed':'source-changed',generatedAt:new Date().toISOString(),
  purpose:'Bounded local capital API workload cost observations, with no network load or deployment SLA claim.',
  timingMethod:{clock:'node:perf_hooks performance.now() monotonic clock',
    measuredRegion:'In-process Request construction, real shared handleRequest body parsing and validation, capital calculation, Response.json serialization, and response arrayBuffer consumption.',
    excluded:'Module import, fixture loading and request JSON.stringify are outside the per-call measured region. No network, deployment cold start, authentication proxy or concurrent traffic is measured.',
    processCpu:'process.cpuUsage() user+system delta; process-wide CPU can include V8 background activity.',
    schedule:'One Node process; cases in listed order, ten warmup calls then forty measured calls per case. No forced garbage collection.',
    percentile:'p95 is the nearest-rank observation ceil(0.95*n); median is the mean of the middle two for forty observations.',
    memory:'Process snapshots in bytes. These are not per-request peak allocations or a retained-memory/leak test; natural GC and process reuse affect them.'},
  runtime:{node:process.versions.node,v8:process.versions.v8,platform:process.platform,architecture:process.arch,
    osRelease:os.release(),reportedCpuModel:os.cpus()[0]?.model??null,reportedLogicalCpuCount:os.cpus().length,
    availableParallelism:os.availableParallelism(),wordSizeBits:['x64','arm64','ppc64','s390x','riscv64'].includes(process.arch)?64:null},
  moduleImportObservationMs,totalObservationWindowMs:performance.now()-monotonicStart,
  initialMemoryBytes:initialMemory,endingMemoryBytes:endingMemory,osProcessHighWaterRssKiB:process.resourceUsage().maxRSS,
  configuration:{requestByteLimit:16384,requestLimitSource:'lib/http.js MAX_BYTES',configuredMaxDurationSeconds,
    durationSource:'vercel.json functions.api/index.js.maxDuration'},
  observations,assessment:{maxMeasuredElapsedMs:maxObservedMs,maxRequestBytes,maxResponseBytes,
    anyMeasuredDurationAtConfiguredLimit:maxObservedMs>=1000*configuredMaxDurationSeconds,
    anyFixtureExceedsRequestLimit:maxRequestBytes>16384,
    interpretation:'These accepted bounded workloads do not show a local CPU or response-size expansion that threatens the configured stateless request budget. The observation set does not prove a global worst case or a deployed latency, memory or throughput guarantee.'},
  sourceHashes,sourcesUnchangedDuringObservation:unchanged,
  fixtureFileSha256:digest(readFileSync(inputPath)),harnessSha256:digest(readFileSync(fileURLToPath(import.meta.url)))};
writeFileSync(outputPath,JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify({status:receipt.status,runtime:receipt.runtime,configuration:receipt.configuration,
  cases:observations.map(c=>({name:c.name,requestBytes:c.requestBytes,responseBytes:c.response.bytes,
    warmup:c.warmup.elapsedMs,measured:c.measured.elapsedMs,cpu:c.measured.processCpuMs,
    rssAfterBytes:c.memoryBytes.afterMeasured.rss,heapUsedAfterBytes:c.memoryBytes.afterMeasured.heapUsed})),
  assessment:receipt.assessment,receipt:outputPath},null,2)+'\n');
if(!unchanged)process.exitCode=1;
