import {project,reverseGrowth,sensitivity,MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {comparePair,stressPair,driverImpacts} from '../public/lib/analytics.js';
import {compareTheses,valuationLandscape} from '../public/lib/thesis.js';
import {valueHorizon} from '../public/lib/horizon.js';
import {APP_VERSION} from '../public/lib/release.js';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};

const MAX_BYTES=16384;
function json(body,status=200,extra={}) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
}
class RequestError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function analyticsFields(body,allowed) {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw new Error(`Unknown request field: ${key}.`);
}
async function parseBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new RequestError('Use Content-Type: application/json.',415);
  const length=request.headers.get('content-length');
  if (length && Number(length)>MAX_BYTES) throw new RequestError('Request exceeds the 16 KiB limit.',413);
  if (!request.body) throw new RequestError('A JSON request body is required.');
  const reader=request.body.getReader(),chunks=[];let bytes=0;
  try {
    while(true){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){await reader.cancel();throw new RequestError('Request exceeds the 16 KiB limit.',413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const combined=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}
  let body;
  try {body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(combined));}
  catch {throw new RequestError('Request body must be valid UTF-8 JSON.');}
  if(!body||typeof body!=='object'||Array.isArray(body)) throw new RequestError('Request body must be a JSON object.');
  return body;
}

/** Web-standard handler used unchanged in local Node and Vercel. */
export async function handleRequest(request) {
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(path==='/api/health'){
    if(request.method!=='GET'&&request.method!=='HEAD') return json({error:'Method not allowed.'},405,{Allow:'GET, HEAD'});
    const response=json({status:'ok',appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE});
    return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
  }
  if(path!=='/api/valuation') return json({error:'API route not found.'},404);
  if(request.method==='GET') return json({appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,units:'USD billions',presets,sources:research.sources});
  if(request.method!=='POST') return json({error:'Method not allowed.'},405,{Allow:'GET, POST'});
  try {
    const body=await parseBody(request);let result;
    try {
      if(body.action==='value') result=project(body.assumptions);
      else if(body.action==='reverse') result=reverseGrowth(body.assumptions,body.target);
      else if(body.action==='sensitivity') result=sensitivity(body.assumptions,body.rates,body.growthRates);
      else if(body.action==='compare') {
        analyticsFields(body,['action','assumptionsByCompany']);
        result=comparePair(body.assumptionsByCompany);
      } else if(body.action==='stress') {
        analyticsFields(body,['action','assumptionsByCompany','shocks']);
        result=stressPair(body.assumptionsByCompany,body.shocks);
      } else if(body.action==='drivers') {
        analyticsFields(body,['action','assumptions']);
        result=driverImpacts(body.assumptions);
      } else if(body.action==='attribute') {
        analyticsFields(body,['action','reference','alternative']);
        result=compareTheses(body.reference,body.alternative);
      } else if(body.action==='landscape') {
        analyticsFields(body,['action','assumptions','rates','margins','target']);
        result=valuationLandscape(body.assumptions,{rates:body.rates,margins:body.margins,target:body.target});
      } else if(body.action==='horizon') {
        analyticsFields(body,['action','assumptions','years','target']);
        result=valueHorizon(body.assumptions,{years:body.years,target:Object.hasOwn(body,'target')?body.target:null});
      } else throw new Error('Choose action value, reverse, sensitivity, compare, stress, drivers, attribute, landscape, or horizon.');
    } catch(error) {throw new RequestError(error.message);}
    return json({appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,result});
  } catch(error) {
    if(error instanceof RequestError) return json({error:error.message},error.status);
    console.error('Valuation request failed:',error.name);
    return json({error:'The calculation could not be completed.'},500);
  }
}
