import {project,bridgeEquity,MODEL_VERSION,VALUATION_DATE} from './model.js';
import {encodeScenario,decodeScenario} from './share.js';

const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const PAYLOAD_KEYS=['schema','model','date','reference','alternative','landscape'];
const COMPANIES=['Anthropic','OpenAI'],SCENARIOS=['Bear','Base','Bull'];
const LIMIT=8192;

function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw new Error(`${label} has missing or unsupported fields.`);
  const result={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!field||!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    result[key]=field.value;
  }
  return result;
}

function axis(value,label){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<2||value.length>21)throw new Error(`${label} must contain 2–21 increasing numeric values.`);
  const keys=Reflect.ownKeys(value),allowed=['length',...Array.from({length:value.length},(_,i)=>String(i))];
  if(keys.length!==allowed.length||keys.some(key=>!allowed.includes(key)))throw new Error(`${label} contains missing or unsupported array fields.`);
  const result=[];
  for(let i=0;i<value.length;i++){
    const field=Object.getOwnPropertyDescriptor(value,String(i));
    if(!field||!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label} entries must be enumerable data properties.`);
    if(typeof field.value!=='number'||!Number.isFinite(field.value)||(i>0&&field.value<=result[i-1]))throw new Error(`${label} must contain strictly increasing finite numbers.`);
    result.push(field.value);
  }
  return result;
}

function checkedCase(value,label){
  const item=record(value,['scenario','assumptions','bridge'],label);
  if(!SCENARIOS.includes(item.scenario))throw new Error(`${label} has an unsupported originating scenario.`);
  const assumptions=record(item.assumptions,INPUT_KEYS,`${label} assumptions`);
  project(assumptions);
  const bridge=item.bridge===null?null:record(item.bridge,['cash','debt','otherClaims'],`${label} bridge`);
  if(bridge!==null)bridgeEquity(0,bridge);
  return {scenario:item.scenario,assumptions,bridge};
}

/** A detached snapshot of both cases and the exact displayed analysis window. */
export function normalizeThesis(draft){
  const input=record(draft,['company','reference','alternative','landscape'],'Thesis');
  if(!COMPANIES.includes(input.company))throw new Error('Choose Anthropic or OpenAI.');
  const reference=checkedCase(input.reference,'Reference'),alternative=checkedCase(input.alternative,'Alternative');
  const config=record(input.landscape,['rates','margins','target'],'Landscape');
  const rates=axis(config.rates,'Discount rates'),margins=axis(config.margins,'Margins'),target=config.target;
  if(typeof target!=='number'||!Number.isFinite(target)||target<=0||target>1e12)throw new Error('Target enterprise value must be positive, finite and at most $1,000,000,000,000B.');
  return {company:input.company,reference,alternative,landscape:{rates,margins,target}};
}

/** The nested original codec preserves compatibility with the model workbench. */
export function encodeThesis(draft){
  const item=normalizeThesis(draft);
  const payload={schema:1,model:MODEL_VERSION,date:VALUATION_DATE,reference:encodeScenario({company:item.company,...item.reference}),alternative:encodeScenario({company:item.company,...item.alternative}),landscape:item.landscape};
  const token=btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(token.length>LIMIT)throw new Error('This comparison exceeds the share-link size limit.');
  return token;
}

export function decodeThesis(token){
  if(typeof token!=='string'||token.length<1||token.length>LIMIT||!/^[A-Za-z0-9_-]+$/.test(token))throw new Error('This comparison link is incomplete or malformed.');
  let parsed;
  try{parsed=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));}
  catch{throw new Error('This comparison link does not contain readable data.');}
  const payload=record(parsed,PAYLOAD_KEYS,'Shared comparison');
  if(payload.schema!==1)throw new Error('This comparison uses an unsupported sharing format.');
  if(payload.model!==MODEL_VERSION||payload.date!==VALUATION_DATE)throw new Error('This comparison belongs to a different financial model or research date. Use its matching release to reproduce it.');
  const reference=decodeScenario(payload.reference),alternative=decodeScenario(payload.alternative);
  if(reference.company!==alternative.company)throw new Error('Both theses must describe the same company.');
  const company=reference.company;
  const caseOnly=({scenario,assumptions,bridge})=>({scenario,assumptions,bridge});
  return normalizeThesis({company,reference:caseOnly(reference),alternative:caseOnly(alternative),landscape:payload.landscape});
}

export function thesisUrl(base,draft){
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Comparison links require an HTTP or HTTPS page.');
  url.search='';url.hash='thesis='+encodeThesis(draft);
  return url.href;
}
