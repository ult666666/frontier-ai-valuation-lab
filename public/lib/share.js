import {project,bridgeEquity,MODEL_VERSION,VALUATION_DATE} from './model.js';

// Schema 1 fixes this order. A different order requires a new share schema.
const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const PAYLOAD_KEYS=['schema','model','date','company','scenario','inputs','bridge'];
const COMPANIES=['Anthropic','OpenAI'];
const SCENARIOS=['Bear','Base','Bull'];
const LIMIT=4096;

function exactKeys(value,keys,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))) throw new Error(label+' has missing or unsupported fields.');
}

function checkedScenario({company,scenario,assumptions,bridge=null}={}) {
  if(!COMPANIES.includes(company)||!SCENARIOS.includes(scenario)) throw new Error('Choose a supported company and scenario.');
  exactKeys(assumptions,INPUT_KEYS,'Assumptions');
  // Valid individual inputs can still overflow together near a terminal singularity.
  project(assumptions);
  if(bridge!==null){
    exactKeys(bridge,['cash','debt','otherClaims'],'Hypothetical bridge');
    bridgeEquity(0,bridge);
  }
  return {company,scenario,assumptions:{...assumptions},bridge:bridge===null?null:{...bridge}};
}

/** A share URL contains only validated numeric assumptions and known identifiers. */
export function encodeScenario(scenario) {
  const item=checkedScenario(scenario);
  const payload={schema:1,model:MODEL_VERSION,date:VALUATION_DATE,company:item.company,scenario:item.scenario,inputs:INPUT_KEYS.map(key=>item.assumptions[key]),bridge:item.bridge};
  return btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

export function decodeScenario(token) {
  if(typeof token!=='string'||token.length<1||token.length>LIMIT||!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('This scenario link is incomplete or malformed.');
  let payload;
  try { payload=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/'))); }
  catch { throw new Error('This scenario link does not contain readable scenario data.'); }
  exactKeys(payload,PAYLOAD_KEYS,'Shared scenario');
  if(payload.schema!==1) throw new Error('This scenario link uses an unsupported sharing format.');
  if(payload.model!==MODEL_VERSION||payload.date!==VALUATION_DATE) throw new Error('This link belongs to a different financial model or research date. Use its matching release to reproduce it.');
  if(!Array.isArray(payload.inputs)||payload.inputs.length!==INPUT_KEYS.length) throw new Error('The scenario link must contain all 13 assumptions.');
  const assumptions=Object.fromEntries(INPUT_KEYS.map((key,index)=>[key,payload.inputs[index]]));
  return checkedScenario({company:payload.company,scenario:payload.scenario,assumptions,bridge:payload.bridge});
}

export function scenarioUrl(base,scenario) {
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Scenario links require an HTTP or HTTPS page.');
  url.search='';
  url.hash='scenario='+encodeScenario(scenario);
  return url.href;
}
