import {MODEL_VERSION,VALUATION_DATE} from './model.js';
import {encodeScenario,decodeScenario} from './share.js';
import {valueHorizon} from './horizon.js';

const LIMIT=8192;
const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];

function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw new Error(`${label} has missing or unsupported fields.`);
  const copy={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    copy[key]=field.value;
  }
  return copy;
}

/** Strict detached snapshot; the equity bridge travels but never affects the lens. */
export function normalizeHorizon(snapshot){
  const input=record(snapshot,['case','years','target'],'Value Horizon');
  const item=record(input.case,['company','scenario','assumptions','bridge'],'Model case');
  item.assumptions=record(item.assumptions,INPUT_KEYS,'Assumptions');
  if(item.bridge!==null)item.bridge=record(item.bridge,['cash','debt','otherClaims'],'Hypothetical bridge');
  const checked=decodeScenario(encodeScenario(item));
  const result=valueHorizon(checked.assumptions,{years:input.years,target:input.target});
  return {case:checked,years:result.years,target:result.target};
}

export function encodeHorizon(snapshot){
  const item=normalizeHorizon(snapshot);
  const payload={schema:1,model:MODEL_VERSION,date:VALUATION_DATE,case:encodeScenario(item.case),years:item.years,target:item.target};
  const token=btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(token.length>LIMIT)throw new Error('This horizon analysis exceeds the share-link size limit.');
  return token;
}

export function decodeHorizon(token){
  if(typeof token!=='string'||token.length<1||token.length>LIMIT||!/^[A-Za-z0-9_-]+$/.test(token))throw new Error('This horizon link is incomplete or malformed.');
  let parsed;
  try{parsed=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));}
  catch{throw new Error('This horizon link does not contain readable analysis data.');}
  const payload=record(parsed,['schema','model','date','case','years','target'],'Shared horizon');
  if(payload.schema!==1)throw new Error('This horizon link uses an unsupported sharing format.');
  if(payload.model!==MODEL_VERSION||payload.date!==VALUATION_DATE)throw new Error('This horizon link belongs to a different financial model or research date. Use its matching release to reproduce it.');
  return normalizeHorizon({case:decodeScenario(payload.case),years:payload.years,target:payload.target});
}

export function horizonUrl(base,snapshot){
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Horizon links require an HTTP or HTTPS page without embedded credentials.');
  url.search='';url.hash='horizon='+encodeHorizon(snapshot);
  return url.href;
}
